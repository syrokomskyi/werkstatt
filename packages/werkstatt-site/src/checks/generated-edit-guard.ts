/*
<MODULE_CONTRACT>
<purpose>
  RFC-0336 / RFC-0375: generated.edit.guard — fails when a generated file
  was hand-edited instead of its owning generator/template. Covers both
  Category A (embedded marker) and Category B (registry-only) files.
  Complements the RFC-0081 prose rule ("AI agents must never edit a file that
  carries this marker") with an actual VCS-aware check.
</purpose>
<non-goals>
  <item>Do not rewrite or restore the offending file — this is a read-only lint.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0336: initial implementation.</item>
  <item>RFC-0375: extend to Category B (registry-only) files; add binary regeneration exemption.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import {
  GENERATED_MARKER,
  hasGeneratedMarker,
  isGeneratedMarkerTextCandidate,
  type CheckResult,
  type Diagnostic,
  type KernelCommandInput,
  type KernelCommandResult,
  type KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "./result-helpers.ts";
import { GENERATOR_OWNERSHIP_MAP, type OwnershipEntry } from "./generator-ownership.ts";

/**
 * Files allowed to drop GENERATED_MARKER without tripping GEN-EDIT-02 — for a
 * deliberate, reviewed conversion from generator-owned to hand-maintained
 * (RFC-0081). Ships empty; add an entry only with a code-review-visible reason.
 */
export const GENERATED_EDIT_EXEMPTIONS: string[] = [];

const EDIT_INSTEAD_PATTERN = /Edit instead: (\S+)/;
const GENERATOR_SOURCE_ROOTS = ["packages/werkstatt/src/", "packages/werkstatt-site/src/domain/ui/"];

function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}

function segmentToRegexSource(segment: string): string {
  return segment
    .split("*")
    .map((literal) => literal.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
}

function ownPatternToExactRegex(pattern: string): RegExp {
  const segments = pattern.split("/").filter((s) => s.length > 0);
  const pieces: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    pieces.push(
      seg === "**" ? (i === segments.length - 1 ? ".*" : "(?:[^/]+/)*") : segmentToRegexSource(seg),
    );
  }
  let source = "^";
  for (let i = 0; i < pieces.length; i++) {
    source += pieces[i];
    const isRecursiveNonLast = segments[i] === "**" && i !== segments.length - 1;
    if (i < pieces.length - 1 && !isRecursiveNonLast) source += "/";
  }
  return new RegExp(`${source}$`);
}

function normalizeOwnershipPath(rawPath: string): string {
  const pattern = rawPath.replace(/\\/g, "/");
  if (
    pattern.startsWith("packages/") ||
    pattern.startsWith("docs/") ||
    pattern.startsWith("apps/")
  ) {
    return pattern;
  }
  return `apps/*/${pattern}`;
}

function expandPlaceholderVariants(pattern: string): string[] {
  const segments = pattern.split("/");
  const wholeSegmentPlaceholder = (seg: string): boolean => /^\{[a-zA-Z0-9_]+\}$/.test(seg);
  const embeddedPlaceholder = (seg: string): boolean =>
    /\{[a-zA-Z0-9_]+\}/.test(seg) && !wholeSegmentPlaceholder(seg);

  const direct = segments
    .map((seg) => (wholeSegmentPlaceholder(seg) ? "**" : seg.replace(/\{[a-zA-Z0-9_]+\}/g, "*")))
    .join("/");

  const hasEmbedded = segments.some(embeddedPlaceholder);
  if (!hasEmbedded) return [direct];

  const recursive = segments
    .map((seg) => (wholeSegmentPlaceholder(seg) ? "**" : seg.replace(/\{[a-zA-Z0-9_]+\}/g, "**")))
    .join("/");
  return [direct, recursive];
}

function matchOwnershipEntry(relPath: string): OwnershipEntry | null {
  const posixPath = toPosix(relPath);
  for (const entry of GENERATOR_OWNERSHIP_MAP) {
    const normalized = normalizeOwnershipPath(entry.path);
    const variants = expandPlaceholderVariants(normalized);
    for (const variant of variants) {
      const regex = ownPatternToExactRegex(variant);
      if (regex.test(posixPath)) return entry;
    }
  }
  return null;
}

async function resolveChangedFiles(
  context: Pick<KernelRuntimeContext, "workspaceRoot" | "io">,
  range: string | undefined,
): Promise<string[]> {
  const args = range ? ["diff", "--name-only", range] : ["diff", "--name-only", "HEAD"];
  const result = await context.io.exec("git", args, { cwd: context.workspaceRoot });
  if (result.exitCode !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => toPosix(line.trim()))
    .filter(Boolean);
}

/** Reads a file's content at the range's "before" endpoint (or HEAD when no range). */
async function readBeforeContent(
  context: Pick<KernelRuntimeContext, "workspaceRoot" | "io">,
  range: string | undefined,
  relPath: string,
): Promise<string | null> {
  const beforeRef = range ? range.split("..")[0] : "HEAD";
  const result = await context.io.exec("git", ["show", `${beforeRef}:${relPath}`], {
    cwd: context.workspaceRoot,
  });
  if (result.exitCode !== 0) return null;
  return result.stdout;
}

/** Extracts the "Edit instead: <path>" advisory line, when the file adopted buildGeneratedHeader. */
function extractEditInsteadPath(content: string): string | null {
  const match = content.match(EDIT_INSTEAD_PATTERN);
  if (!match) return null;
  const candidate = match[1]!;
  // The no-template form reads "the <command> generator source (not this file)." — its first
  // (whitespace-delimited) word is always "the", which no real repo-relative path can equal.
  if (candidate === "the") return null;
  return candidate;
}

export async function runGeneratedEditGuard(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const base = input.flags.base as string | undefined;
  const range = (input.flags.range as string | undefined) ?? (base ? `${base}..HEAD` : undefined);
  const diagnostics: Diagnostic[] = [];

  let changedFiles: string[];
  try {
    changedFiles = await resolveChangedFiles(context, range);
  } catch {
    return diagnosticsResult("generated.edit.guard", [
      {
        ruleId: "GEN-EDIT-01",
        severity: "info",
        message: "git is not available — nothing to check.",
      },
    ]);
  }

  if (changedFiles.length === 0) {
    return diagnosticsResult("generated.edit.guard", []);
  }

  const changedSet = new Set(changedFiles);
  const touchesGeneratorSource = changedFiles.some((f) =>
    GENERATOR_SOURCE_ROOTS.some((root) => f.startsWith(root)),
  );

  for (const relPath of changedFiles) {
    if (GENERATED_EDIT_EXEMPTIONS.includes(relPath)) continue;

    const entry = matchOwnershipEntry(relPath);
    const isCategoryB = entry?.markerPolicy === "registry-only";
    const isCategoryA = !entry || entry.markerPolicy !== "registry-only";

    if (isCategoryB) {
      if (!entry) continue;
      if (!entry.module) {
        diagnostics.push({
          ruleId: "GEN-EDIT-01",
          severity: "warning",
          file: relPath,
          message: `Category B file "${relPath}" has no module field in GENERATOR_OWNERSHIP_MAP — cannot resolve owner.`,
          fixHint: `Add a module field to the entry for command "${entry.command}" in packages/os/site-kernel-checks/src/generator-ownership.ts.`,
        });
        continue;
      }

      const ownerChanged = changedSet.has(entry.module);
      if (ownerChanged) continue;

      const isBinary = !isGeneratedMarkerTextCandidate(relPath);
      if (isBinary) {
        const beforeRef = range ? range.split("..")[0] : "HEAD";
        const statusResult = await context.io.exec(
          "git",
          ["diff", "--name-status", beforeRef ?? "HEAD", "--", relPath],
          { cwd: context.workspaceRoot },
        );
        if (statusResult.exitCode === 0) {
          const status = statusResult.stdout.trim().split(/\s+/)[0];
          if (status === "A" || status === "D") continue;
        }
      }

      diagnostics.push({
        ruleId: "GEN-EDIT-01",
        severity: "error",
        file: relPath,
        message: `Category B generated file "${relPath}" changed, but its owning module "${entry.module}" did not change in this range.`,
        fixHint: `Edit the owning generator at ${entry.module}, then run \`pnpm exec werkstatt run ${entry.command}\` to regenerate. Never hand-edit generated files.`,
      });
      continue;
    }

    if (isCategoryA && !isGeneratedMarkerTextCandidate(relPath)) continue;

    let currentContent: string | null;
    try {
      currentContent = await context.io.readFile(join(context.workspaceRoot, relPath));
    } catch {
      continue;
    }

    const beforeContent = await readBeforeContent(context, range, relPath);
    const hadMarkerBefore = beforeContent !== null && hasGeneratedMarker(beforeContent);
    const hasMarkerNow = hasGeneratedMarker(currentContent);

    if (hadMarkerBefore && !hasMarkerNow) {
      diagnostics.push({
        ruleId: "GEN-EDIT-02",
        severity: "error",
        file: relPath,
        message: `GENERATED_MARKER was removed from "${relPath}" without a documented exemption.`,
        fixHint:
          "If this is a deliberate conversion to hand-maintained ownership (RFC-0081), add the path " +
          "to GENERATED_EDIT_EXEMPTIONS in packages/os/site-kernel-checks/src/generated-edit-guard.ts " +
          "in the same change. Otherwise restore the marker and edit the generator instead.",
      });
      continue;
    }

    if (!hadMarkerBefore || !hasMarkerNow) continue;

    const editInsteadPath = extractEditInsteadPath(currentContent);
    const ownerChanged = editInsteadPath ? changedSet.has(editInsteadPath) : touchesGeneratorSource;

    if (!ownerChanged) {
      diagnostics.push({
        ruleId: "GEN-EDIT-01",
        severity: "error",
        file: relPath,
        message: editInsteadPath
          ? `"${relPath}" carries ${JSON.stringify(GENERATED_MARKER)} and changed, but its owning ` +
            `template/generator "${editInsteadPath}" did not change in this range.`
          : `"${relPath}" carries the generated-file marker and changed, but no source under ` +
            `packages/os/** or packages/ui/** changed in this range.`,
        fixHint:
          "Edit the owning generator/template, then regenerate. Never hand-edit generated files.",
      });
    }
  }

  return diagnosticsResult("generated.edit.guard", diagnostics);
}
