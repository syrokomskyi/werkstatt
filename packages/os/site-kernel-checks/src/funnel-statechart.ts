/*
<MODULE_CONTRACT>
<purpose>RFC-0219: Visitor funnel + subscription lifecycle state-chart generator and drift-validator.
`funnel.statechart.generate` emits a GENERATED Mermaid stateDiagram-v2 document derived purely from
the canonical transition + trigger maps in @warpgogol/integration. `funnel.statechart.validate`
regenerates the document in memory and asserts byte-equality with the committed artifact, plus the
trigger↔graph bijection invariant for both layers. Node-safe: file I/O + pure contracts only.</purpose>
<non-goals>
  <item>Do not hand-author the generated document — it is a projection of the code maps.</item>
  <item>Do not let the diagram define transitions — FUNNEL_TRANSITIONS / SUBSCRIPTION_TRANSITIONS
  remain the sole authority (RFC-0188/0191).</item>
  <item>Do not run the funnel or call Stripe — static contracts only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0219: initial implementation — statechart generator + drift-validator.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { writeFileAtomic, buildGeneratedHeader } from "@warpgogol/site-kernel";
import type { KernelCommandInput, KernelCommandResult } from "@warpgogol/site-kernel";
import {
  FUNNEL_SYSTEM_TRIGGERS,
  FUNNEL_TRANSITION_TRIGGERS,
  FUNNEL_TRANSITIONS,
  LIFECYCLE_EVENT_KINDS,
  SUBSCRIPTION_TRANSITION_TRIGGERS,
  SUBSCRIPTION_TRANSITIONS,
  VISITOR_FUNNEL_STAGES,
  isValidFunnelStage,
} from "@warpgogol/integration";
import type { VisitorFunnelStage } from "@warpgogol/integration";
import type { SubscriptionStatus } from "@warpgogol/integration";
import { SUBSCRIPTION_STATUSES } from "@warpgogol/integration";
import { passResult, resultFromViolations } from "./result-helpers.ts";

/** Workspace-relative path to the committed generated document (RFC-0219). */
const STATECHART_PATH = join("docs", "specs", "visitor-funnel", "state-chart.generated.md");

// ---------------------------------------------------------------------------
// Bijection validators (pure — used by both validate and the test suite)
// ---------------------------------------------------------------------------

/**
 * Assert FUNNEL_TRANSITION_TRIGGERS ↔ FUNNEL_TRANSITIONS bijection.
 * Returns an array of violation strings (empty = OK).
 */
export function checkFunnelTriggerBijection(): string[] {
  const violations: string[] = [];

  // Build the authoritative edge set from FUNNEL_TRANSITIONS.
  const authEdges = new Set<string>();
  for (const [from, tos] of Object.entries(FUNNEL_TRANSITIONS)) {
    for (const to of tos) {
      authEdges.add(`${from}→${to}`);
    }
  }

  // Build the trigger edge set and check for unknown / duplicate entries.
  const triggerEdges = new Set<string>();
  const allTriggers = new Set<string>([
    ...FUNNEL_SYSTEM_TRIGGERS,
    // VisitorFunnelEventKind values are not imported directly — extract from the triggers.
  ]);

  for (const entry of FUNNEL_TRANSITION_TRIGGERS) {
    const key = `${entry.from}→${entry.to}`;

    if (!isValidFunnelStage(entry.from)) {
      violations.push(
        `[trigger-unknown-stage] FUNNEL_TRANSITION_TRIGGERS entry { from: "${entry.from}" } is not a canonical stage`,
      );
    }
    if (!isValidFunnelStage(entry.to)) {
      violations.push(
        `[trigger-unknown-stage] FUNNEL_TRANSITION_TRIGGERS entry { to: "${entry.to}" } is not a canonical stage`,
      );
    }
    if (triggerEdges.has(key)) {
      violations.push(
        `[trigger-duplicate-edge] FUNNEL_TRANSITION_TRIGGERS has a duplicate entry for (${entry.from} → ${entry.to})`,
      );
    }
    triggerEdges.add(key);
  }

  // Check that every auth edge has a trigger.
  for (const edge of authEdges) {
    if (!triggerEdges.has(edge)) {
      violations.push(
        `[trigger-missing-edge] FUNNEL_TRANSITIONS edge (${edge.replace("→", " → ")}) has no entry in FUNNEL_TRANSITION_TRIGGERS`,
      );
    }
  }

  // Check that every trigger edge is in the auth graph.
  for (const edge of triggerEdges) {
    if (!authEdges.has(edge)) {
      violations.push(
        `[trigger-extra-edge] FUNNEL_TRANSITION_TRIGGERS has edge (${edge.replace("→", " → ")}) not present in FUNNEL_TRANSITIONS`,
      );
    }
  }

  return violations;
}

/**
 * Assert SUBSCRIPTION_TRANSITION_TRIGGERS ↔ SUBSCRIPTION_TRANSITIONS bijection.
 * Returns an array of violation strings (empty = OK).
 */
export function checkSubscriptionTriggerBijection(): string[] {
  const violations: string[] = [];
  const statusSet = new Set<string>(SUBSCRIPTION_STATUSES);
  const lifecycleKindSet = new Set<string>(LIFECYCLE_EVENT_KINDS);

  // Build the authoritative edge set from SUBSCRIPTION_TRANSITIONS.
  const authEdges = new Set<string>();
  for (const [from, tos] of Object.entries(SUBSCRIPTION_TRANSITIONS)) {
    for (const to of tos) {
      authEdges.add(`${from}→${to}`);
    }
  }

  const triggerEdges = new Set<string>();

  for (const entry of SUBSCRIPTION_TRANSITION_TRIGGERS) {
    const key = `${entry.from}→${entry.to}`;

    if (!statusSet.has(entry.from)) {
      violations.push(
        `[sub-trigger-unknown-status] SUBSCRIPTION_TRANSITION_TRIGGERS entry { from: "${entry.from}" } is not a canonical subscription status`,
      );
    }
    if (!statusSet.has(entry.to)) {
      violations.push(
        `[sub-trigger-unknown-status] SUBSCRIPTION_TRANSITION_TRIGGERS entry { to: "${entry.to}" } is not a canonical subscription status`,
      );
    }
    if (!lifecycleKindSet.has(entry.on)) {
      violations.push(
        `[sub-trigger-unknown-event] SUBSCRIPTION_TRANSITION_TRIGGERS entry { on: "${entry.on}" } is not a known LifecycleEventKind`,
      );
    }
    if (triggerEdges.has(key)) {
      violations.push(
        `[sub-trigger-duplicate-edge] SUBSCRIPTION_TRANSITION_TRIGGERS has a duplicate entry for (${entry.from} → ${entry.to})`,
      );
    }
    triggerEdges.add(key);
  }

  for (const edge of authEdges) {
    if (!triggerEdges.has(edge)) {
      violations.push(
        `[sub-trigger-missing-edge] SUBSCRIPTION_TRANSITIONS edge (${edge.replace("→", " → ")}) has no entry in SUBSCRIPTION_TRANSITION_TRIGGERS`,
      );
    }
  }

  for (const edge of triggerEdges) {
    if (!authEdges.has(edge)) {
      violations.push(
        `[sub-trigger-extra-edge] SUBSCRIPTION_TRANSITION_TRIGGERS has edge (${edge.replace("→", " → ")}) not present in SUBSCRIPTION_TRANSITIONS`,
      );
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Generator (pure, deterministic)
// ---------------------------------------------------------------------------

/**
 * Generate the Mermaid stateDiagram-v2 document string deterministically from the
 * canonical trigger maps. The output is byte-stable for a given version of the
 * trigger arrays — the drift-validator exploits this. `system.timeout` abandon edges
 * are omitted from the diagram for legibility (23 near-identical edges); they are
 * preserved in the trigger array and validated there.
 */
export function generateFunnelStatechartDocument(): string {
  const lines: string[] = [];

  const header = buildGeneratedHeader({
    ownerCommand: "funnel.statechart.generate",
    filePath: STATECHART_PATH,
  });
  lines.push(
    header.trimEnd(),
    "",
    "# Deal Lifecycle State Chart",
    "",
    "> Generated from `FUNNEL_TRANSITIONS` + `FUNNEL_TRANSITION_TRIGGERS` (Layer 1) and",
    "> `SUBSCRIPTION_TRANSITIONS` + `SUBSCRIPTION_TRANSITION_TRIGGERS` (Layer 2) in",
    "> `@warpgogol/integration`. Do not edit — run `funnel.statechart.generate` to regenerate.",
    "",
    "## Layer 1 — Visitor Sales Funnel",
    "",
    "```mermaid",
    "stateDiagram-v2",
    "    [*] --> new_session",
  );

  // Emit all funnel trigger edges except system.timeout (collapse for legibility).
  for (const entry of FUNNEL_TRANSITION_TRIGGERS) {
    if (entry.on === "system.timeout") continue;
    lines.push(`    ${entry.from} --> ${entry.to} : ${entry.on}`);
  }

  // Terminal stage connectors.
  lines.push("    won --> [*]", "    lost --> [*]");

  // Count timeout edges for the annotation.
  const timeoutCount = FUNNEL_TRANSITION_TRIGGERS.filter((e) => e.on === "system.timeout").length;

  lines.push(
    "    note right of lost",
    `        All non-terminal stages reach lost via system.timeout (abandon).`,
    `        The ${timeoutCount} timeout edges are recorded in FUNNEL_TRANSITION_TRIGGERS and`,
    `        verified by funnel.statechart.validate — omitted here for legibility.`,
    "    end note",
    "```",
    "",
    "## Layer 2 — Subscription Lifecycle",
    "",
    "```mermaid",
    "stateDiagram-v2",
    "    [*] --> active",
  );

  for (const entry of SUBSCRIPTION_TRANSITION_TRIGGERS) {
    lines.push(`    ${entry.from} --> ${entry.to} : ${entry.on}`);
  }

  lines.push("    canceled --> [*]", "```", "");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// funnel.statechart.generate
// ---------------------------------------------------------------------------

export async function runFunnelStatechartGenerate(
  _input: KernelCommandInput,
): Promise<KernelCommandResult> {
  const doc = generateFunnelStatechartDocument();
  const outPath = join(process.cwd(), STATECHART_PATH);
  // RFC-0258: docs/ output is workspace-shared — must be atomic.
  await writeFileAtomic(outPath, doc);
  return passResult(
    "funnel.statechart.generate",
    `funnel.statechart.generate: OK — wrote ${STATECHART_PATH}`,
  );
}

// ---------------------------------------------------------------------------
// funnel.statechart.validate
// ---------------------------------------------------------------------------

export async function runFunnelStatechartValidate(
  _input: KernelCommandInput,
): Promise<KernelCommandResult> {
  const violations: string[] = [];

  // 1) Bijection checks (both layers).
  violations.push(...checkFunnelTriggerBijection());
  violations.push(...checkSubscriptionTriggerBijection());

  // 2) Trigger completeness: every stage in VISITOR_FUNNEL_STAGES (non-terminal)
  //    must appear in at least one FUNNEL_TRANSITION_TRIGGERS entry.
  const coveredFroms = new Set(FUNNEL_TRANSITION_TRIGGERS.map((e) => e.from));
  for (const stage of VISITOR_FUNNEL_STAGES) {
    if (
      (FUNNEL_TRANSITIONS[stage as VisitorFunnelStage] ?? []).length > 0 &&
      !coveredFroms.has(stage as VisitorFunnelStage)
    ) {
      violations.push(
        `[trigger-incomplete] stage "${stage}" has outbound transitions in FUNNEL_TRANSITIONS but no trigger in FUNNEL_TRANSITION_TRIGGERS`,
      );
    }
  }

  // 3) Byte-equality drift guard.
  const committed = await readFile(join(process.cwd(), STATECHART_PATH), "utf-8").catch(() => null);
  if (committed === null) {
    violations.push(
      `[statechart-missing] ${STATECHART_PATH} does not exist — run funnel.statechart.generate to create it`,
    );
  } else {
    const generated = generateFunnelStatechartDocument();
    if (committed !== generated) {
      violations.push(
        `[statechart-drift] ${STATECHART_PATH} does not match what funnel.statechart.generate would emit — run funnel.statechart.generate to regenerate`,
      );
    }
  }

  if (violations.length === 0) {
    return passResult(
      "funnel.statechart.validate",
      `funnel.statechart.validate: OK — bijection valid for both layers, document matches code`,
    );
  }
  return resultFromViolations("funnel.statechart.validate", violations);
}
