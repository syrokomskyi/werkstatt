/*
<MODULE_CONTRACT>
<purpose>
RFC-0233 Visual Control System — Tier-1 rule evaluation. Pure functions that turn
ordered page blocks into canonical RFC-0203 Diagnostics. These are the
deterministic, positional invariants the isolated section-background schema
(packages/share/src/schemas/section-background.ts) cannot express because it
validates each section out of page context.
</purpose>
<non-goals>
  <item>Do not read the filesystem; callers pass loaded VisualPages.</item>
  <item>Do not implement Tier 2/3 (rendered-DOM / LLM) rules.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0233: initial VIS-BG-01..03 evaluation.</item>
</CHANGE_SUMMARY>
*/

import type { Diagnostic, DiagnosticSeverity } from "@warpgogol/werkstatt/kernel";
import { DIAGNOSTIC_RULES } from "../diagnostics/rules.ts";
import type { VisualBackground, VisualBlock, VisualPage } from "./page-context.ts";

/** A site's `visual.gate` map: ruleId → forced severity. */
export type VisualGateOverrides = Record<string, DiagnosticSeverity>;

/** Resolve a rule's effective severity: a site override wins over the registry default. */
export function resolveSeverity(
  ruleId: string,
  overrides: VisualGateOverrides = {},
): DiagnosticSeverity {
  const override = overrides[ruleId];
  if (override === "error" || override === "warning" || override === "info") return override;
  return DIAGNOSTIC_RULES[ruleId]?.severityDefault ?? "error";
}

function bgKind(bg: VisualBackground | undefined): string | undefined {
  return typeof bg?.kind === "string" ? (bg.kind as string) : undefined;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function isTruthy(value: unknown): boolean {
  return value === true;
}

/** A vertical fade whose END edge merges into fully-opaque background (no fade-out). */
function isEndEdgeMergeFade(bg: VisualBackground): boolean {
  return (
    bgKind(bg) === "fade" &&
    bg.direction === "vertical" &&
    isTruthy(bg.noEndFade) &&
    num(bg.endOpacity, 1) === 1
  );
}

/** A vertical fade whose START edge merges into fully-opaque background (no fade-in). */
function isStartEdgeMergeFade(bg: VisualBackground): boolean {
  return (
    bgKind(bg) === "fade" &&
    bg.direction === "vertical" &&
    isTruthy(bg.noStartFade) &&
    num(bg.startOpacity, 1) === 1
  );
}

/** Stable deep-equality for two background descriptors (sorted-key JSON). */
function sameBackground(a: VisualBackground, b: VisualBackground): boolean {
  const norm = (o: VisualBackground): string => JSON.stringify(o, Object.keys(o).sort());
  return norm(a) === norm(b);
}

function locator(page: VisualPage, block: VisualBlock): Pick<Diagnostic, "file" | "line"> {
  return block.backgroundLine !== undefined
    ? { file: page.relFile, line: block.backgroundLine }
    : { file: page.relFile };
}

function where(block: VisualBlock): string {
  return block.id ? `block "${block.id}"` : `blocks[${block.index}]`;
}

/**
 * Run every Tier-1 visual rule over one page. `overrides` lets a site escalate or
 * relax a rule's severity (RFC-0233 gating policy).
 */
export function evaluateVisualPage(
  page: VisualPage,
  overrides: VisualGateOverrides = {},
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const blocks = page.blocks;
  if (blocks.length === 0) return diagnostics;

  const firstIndex = 0;
  const lastIndex = blocks.length - 1;

  for (const block of blocks) {
    const bg = block.background;
    if (!bg) continue;

    // VIS-BG-01 — end-edge merge fade must be last.
    if (isEndEdgeMergeFade(bg) && block.index !== lastIndex) {
      diagnostics.push({
        ruleId: "VIS-BG-01",
        severity: resolveSeverity("VIS-BG-01", overrides),
        message: `${where(block)} fades into the page bottom edge (fade + noEndFade at full opacity) but is not the last block; a section renders below it, so the fade lands mid-page.`,
        ...locator(page, block),
        fixHint: `Move this end-edge fade to the last block of the page, or drop noEndFade / lower endOpacity so it reads as a mid-page transition.`,
        data: { ruleId: "VIS-BG-01", blockId: block.id, index: block.index, lastIndex },
      });
    }

    // VIS-BG-02 — start-edge merge fade must be first.
    if (isStartEdgeMergeFade(bg) && block.index !== firstIndex) {
      diagnostics.push({
        ruleId: "VIS-BG-02",
        severity: resolveSeverity("VIS-BG-02", overrides),
        message: `${where(block)} fades into the page top edge (fade + noStartFade at full opacity) but is not the first block; the merge target is wrong.`,
        ...locator(page, block),
        fixHint: `Move this start-edge fade to the first block of the page, or drop noStartFade / lower startOpacity so it reads as a mid-page transition.`,
        data: { ruleId: "VIS-BG-02", blockId: block.id, index: block.index, firstIndex },
      });
    }
  }

  // VIS-BG-03 — adjacent identical non-transparent backgrounds (suspected leftover).
  for (let i = 1; i < blocks.length; i += 1) {
    const prev = blocks[i - 1]!;
    const cur = blocks[i]!;
    if (!prev.background || !cur.background) continue;
    const prevKind = bgKind(prev.background);
    const curKind = bgKind(cur.background);
    if (!prevKind || prevKind === "transparent") continue;
    if (prevKind !== curKind) continue;
    if (!sameBackground(prev.background, cur.background)) continue;
    diagnostics.push({
      ruleId: "VIS-BG-03",
      severity: resolveSeverity("VIS-BG-03", overrides),
      message: `${where(cur)} repeats the exact ${curKind} background of the preceding ${where(prev)}; likely a duplicate or leftover after a reorder.`,
      ...locator(page, cur),
      fixHint: `Confirm the repeat is intentional; otherwise vary or remove one background. Suppress per-site via visual.gate if intended.`,
      data: { ruleId: "VIS-BG-03", blockId: cur.id, index: cur.index },
    });
  }

  return diagnostics;
}
