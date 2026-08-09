/*
<MODULE_CONTRACT>
<purpose>
barrel.size.lint — RFC-0264: guards the end state of the @warpgogol/werkstatt-site/share barrel
split. BARREL-01 fails (error for @warpgogol/werkstatt-site/share, warning for every other
workspace package) when a root `src/index.ts` exceeds the export-line
threshold (default 120) — the root barrel must stay a thin, deprecated
compatibility surface, not the package's real entry point. BARREL-02 fails
(error, any package) when a symbol is exported from BOTH the root barrel and
a declared subpath — the root barrel must only re-export subpath modules
unchanged, never duplicate a symbol under two ownership paths.
</purpose>
<non-goals>
  <item>Do not rewrite or migrate barrels — this is a read-only lint.</item>
  <item>Do not resolve `export *` re-exports transitively for BARREL-02 — only direct named-export duplication is checked.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0264: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { discoverWorkspacePackages } from "@warpgogol/werkstatt/kernel";
import { fileExists } from "@warpgogol/werkstatt-site/share/fs";
import { diagnosticsResult } from "./result-helpers.ts";

const DEFAULT_THRESHOLD = 120;
const ERROR_PACKAGE = "@warpgogol/werkstatt-site/share";

/**
 * Count physical lines that are part of an `export` statement, ignoring
 * comments/blank lines. A multi-line `export { a, b, c } from "...";` block
 * counts every one of its lines; brace depth tracks when the statement ends.
 */
export function countExportLines(text: string): number {
  const withoutBlockComments = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const lines = withoutBlockComments.split("\n");
  let count = 0;
  let inExportStatement = false;
  let depth = 0;
  for (const rawLine of lines) {
    const commentIndex = rawLine.indexOf("//");
    const line = (commentIndex >= 0 ? rawLine.slice(0, commentIndex) : rawLine).trim();
    if (!line) continue;

    if (!inExportStatement) {
      if (!/^export\b/.test(line)) continue;
      inExportStatement = true;
    }

    count++;
    depth += (line.match(/[{(]/g) ?? []).length;
    depth -= (line.match(/[})]/g) ?? []).length;
    if (depth <= 0) {
      inExportStatement = false;
      depth = 0;
    }
  }
  return count;
}

/** Extract top-level named export identifiers from `export { a, b }` / `export const x` style statements (best-effort, no `export *`). */
function extractNamedExports(text: string): Set<string> {
  const withoutBlockComments = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const names = new Set<string>();

  for (const m of withoutBlockComments.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1]!.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const asMatch = trimmed.split(/\s+as\s+/);
      const name = (asMatch[1] ?? asMatch[0]).replace(/^type\s+/, "").trim();
      if (name) names.add(name);
    }
  }
  for (const m of withoutBlockComments.matchAll(
    /export\s+(?:async\s+)?(?:function|class|const|let|var|interface|type)\s+([A-Za-z0-9_$]+)/g,
  )) {
    names.add(m[1]!);
  }
  return names;
}

/**
 * RFC-0264: domains whose migration wave is complete, per package — the
 * root barrel must never re-export a symbol that belongs to one of these
 * files again (BARREL-02). Update this map only when a wave's root
 * re-export block is deleted for good.
 */
const COMPLETED_WAVE_SUBPATHS: Record<string, string[]> = {
  "@warpgogol/werkstatt-site/share": ["src/page.ts", "src/i18n/localization.ts"],
};

export async function runBarrelSizeLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { packages: workspacePackages } = await discoverWorkspacePackages(context.workspaceRoot);
  const diagnostics: Diagnostic[] = [];

  for (const { absoluteDirectory: dir, name } of workspacePackages) {
    const indexPath = join(dir, "src", "index.ts");
    if (!(await fileExists(indexPath))) continue;

    const relIndex = relative(context.workspaceRoot, indexPath).replace(/\\/g, "/");
    const content = await readFile(indexPath, "utf8");
    const exportLineCount = countExportLines(content);

    if (exportLineCount > DEFAULT_THRESHOLD) {
      diagnostics.push({
        ruleId: "BARREL-01",
        severity: name === ERROR_PACKAGE ? "error" : "warning",
        file: relIndex,
        message: `${name}: root barrel has ${exportLineCount} export line(s), exceeding the ${DEFAULT_THRESHOLD}-line threshold.`,
        fixHint:
          "Split the barrel into domain subpath entry points (RFC-0264) and shrink the root barrel to a thin re-export layer.",
        data: { package: name, exportLineCount, threshold: DEFAULT_THRESHOLD },
      });
    }

    // BARREL-02: a symbol re-appears in the root barrel for a domain whose
    // migration wave is already marked complete (RFC-0264 §Failure modes —
    // "error from the first completed wave"). This is a regression guard, not
    // a general barrel/subpath overlap detector: packages are free to keep a
    // deprecated compatibility barrel that re-exports its own subpath modules
    // unchanged (Decision item 2) — that is the intended end state, not a
    // violation. Only domains this RFC explicitly completed the wave for are
    // checked.
    const completedWaveFiles = COMPLETED_WAVE_SUBPATHS[name] ?? [];
    if (completedWaveFiles.length === 0) continue;

    const rootNames = extractNamedExports(content);
    if (rootNames.size === 0) continue;

    for (const relWaveFile of completedWaveFiles) {
      const waveFilePath = join(dir, relWaveFile);
      if (!(await fileExists(waveFilePath))) continue;
      const waveContent = await readFile(waveFilePath, "utf8");
      const waveNames = extractNamedExports(waveContent);
      for (const shared of rootNames) {
        if (waveNames.has(shared)) {
          const relWave = relative(context.workspaceRoot, waveFilePath).replace(/\\/g, "/");
          diagnostics.push({
            ruleId: "BARREL-02",
            severity: "error",
            file: relIndex,
            message: `${name}: "${shared}" reappeared in the root barrel — its domain (${relWave}) already completed its RFC-0264 migration wave.`,
            fixHint: `Remove the re-export from the root barrel — import "${shared}" from its subpath instead.`,
            data: { package: name, symbol: shared, subpath: relWave },
          });
        }
      }
    }
  }

  return diagnosticsResult("barrel.size.lint", diagnostics);
}
