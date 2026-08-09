/*
<MODULE_CONTRACT>
<purpose>
fs.walk.lint — RFC-0303: fails when a source file under packages/** declares
its own nested recursive `readdir` walker instead of importing the canonical
`collectFiles` from @warpgogol/werkstatt-site/share/fs. Prevents the ~52-copy duplication class
RFC-0303 cleaned up from silently regenerating.
</purpose>
<non-goals>
  <item>Do not parse a real AST — a regex scan over the declaration line is sufficient.</item>
  <item>Do not flag differently-named recursive helpers with a materially different contract (e.g. depth-aware business validators) — those are judged case by case with an inline suppression, not a blanket exemption.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: initial implementation, Phase 2.</item>
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
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import { diagnosticsResult } from "./result-helpers.ts";

const SCAN_ROOT = join("packages");
const CANONICAL_ALLOWLIST = new Set([
  "packages/share/src/fs/index.ts",
  // This file's own docstring/regex source necessarily mentions the pattern it scans for.
  "packages/os/site-kernel-checks/src/fs-walk-lint.ts",
]);
const WALK_DECLARATION_RE = /\bfunction\s+walk\s*\(/;
const SUPPRESSION_RE = /fs\.walk\.lint:\s*allow/;

/** Pure scan: does this source declare a nested `function walk(...)`, unsuppressed? */
export function findUnsuppressedWalkDeclarations(source: string): number[] {
  const lines = source.split("\n");
  const hits: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!WALK_DECLARATION_RE.test(lines[i]!)) continue;
    const precedingLines = lines.slice(Math.max(0, i - 3), i).join("\n");
    if (SUPPRESSION_RE.test(precedingLines)) continue;
    hits.push(i + 1);
  }
  return hits;
}

export async function runFsWalkLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { workspaceRoot } = context;
  const files = await collectFiles(join(workspaceRoot, SCAN_ROOT), {
    extensions: [".ts", ".tsx"],
    ignore: (name) => name === "tests" || name.endsWith(".generated.yaml"),
  });

  const diagnostics: Diagnostic[] = [];
  for (const filePath of files) {
    const relFile = relative(workspaceRoot, filePath).replace(/\\/g, "/");
    if (CANONICAL_ALLOWLIST.has(relFile)) continue;

    let source: string;
    try {
      source = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    for (const line of findUnsuppressedWalkDeclarations(source)) {
      diagnostics.push({
        ruleId: "WALK-01",
        severity: "error",
        file: relFile,
        line,
        message:
          "Nested recursive readdir walker declared outside the canonical @warpgogol/werkstatt-site/share/fs module.",
        fixHint:
          'Import { collectFiles } from "@warpgogol/werkstatt-site/share/fs" instead of declaring a local walk() function. If this walker has a genuinely different contract, add a "fs.walk.lint: allow — <reason>" comment directly above the declaration.',
      });
    }
  }

  return diagnosticsResult("fs.walk.lint", diagnostics);
}
