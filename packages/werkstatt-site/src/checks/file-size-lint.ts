/*
<MODULE_CONTRACT>
<purpose>
file.size.lint — RFC-0303: two-tier severity for .ts/.tsx source files under
packages/** exceeding a line-count threshold. 601–1200 lines → warning (SIZE-01);
above 1200 lines → error (SIZE-01). A large file forces an agent to
load unrelated command logic to touch one validator and invites merge
collisions. Adoption is ratcheted: a shrink-only baseline accepts pre-existing
debt while any new file above threshold is flagged from day one.
</purpose>
<non-goals>
  <item>Do not parse a real AST — a physical line count is sufficient.</item>
  <item>Do not split files — that is Phase 3 of RFC-0303, one file per commit.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: initial implementation, Phase 2.</item>
</CHANGE_SUMMARY>
*/

import { readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { collectFiles } from "@warpgogol/share/fs";
import { diagnosticsResult } from "./result-helpers.ts";

const SCAN_ROOT = join("packages");
const BASELINE_PATH = join(
  "packages",
  "os",
  "site-kernel-checks",
  "src",
  "file-size-lint.baseline.generated.yaml",
);
const WARNING_THRESHOLD = 600;
const ERROR_THRESHOLD = 1200;

interface FileSizeLintBaseline {
  meta: { schemaVersion: 1; threshold: 600 };
  /** Workspace-relative file path → accepted line-count ceiling (shrink-only). */
  ceilings: Record<string, number>;
}

/** Pure: physical line count of a source string. */
export function countLines(source: string): number {
  if (source.length === 0) return 0;
  return source.split("\n").length;
}

async function collectSourceFiles(root: string): Promise<string[]> {
  return collectFiles(root, {
    extensions: [".ts", ".tsx"],
    ignore: (name) => name === "tests" || name.endsWith(".generated.yaml"),
  });
}

async function readBaseline(workspaceRoot: string): Promise<FileSizeLintBaseline | undefined> {
  try {
    return yamlParse(
      await readFile(join(workspaceRoot, BASELINE_PATH), "utf8"),
    ) as FileSizeLintBaseline;
  } catch {
    return undefined;
  }
}

function renderBaseline(ceilings: Record<string, number>): string {
  const baseline: FileSizeLintBaseline = {
    meta: { schemaVersion: 1, threshold: WARNING_THRESHOLD },
    ceilings,
  };
  return `${yamlStringify(baseline)}`;
}

async function findOversizedFiles(workspaceRoot: string): Promise<Map<string, number>> {
  const files = await collectSourceFiles(join(workspaceRoot, SCAN_ROOT));
  const oversized = new Map<string, number>();
  for (const filePath of files) {
    let source: string;
    try {
      source = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = countLines(source);
    if (lines > WARNING_THRESHOLD) {
      const relFile = relative(workspaceRoot, filePath).replace(/\\/g, "/");
      oversized.set(relFile, lines);
    }
  }
  return oversized;
}

export async function runFileSizeLint(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult | { file: string; files: number }>> {
  const { workspaceRoot } = context;
  const oversized = await findOversizedFiles(workspaceRoot);

  if (input.flags["write-baseline"] === true) {
    const ceilings: Record<string, number> = {};
    for (const [file, lines] of oversized) ceilings[file] = lines;
    await writeFile(join(workspaceRoot, BASELINE_PATH), renderBaseline(ceilings), "utf8");
    return {
      data: { file: BASELINE_PATH.replace(/\\/g, "/"), files: oversized.size },
      exitCode: 0,
      summary: `file.size.lint: wrote ${oversized.size} oversized file(s) to ${BASELINE_PATH.replace(/\\/g, "/")}`,
    };
  }

  const baseline = await readBaseline(workspaceRoot);
  const ceilings = baseline?.ceilings ?? {};
  const diagnostics: Diagnostic[] = [];

  for (const [file, lines] of oversized) {
    const ceiling = ceilings[file];
    if (ceiling !== undefined && lines <= ceiling) continue; // pre-existing, ratcheted debt within its ceiling

    const severity: "warning" | "error" = lines > ERROR_THRESHOLD ? "error" : "warning";

    diagnostics.push({
      ruleId: "SIZE-01",
      severity,
      file,
      message:
        ceiling !== undefined
          ? `File grew from the baselined ${ceiling} to ${lines} lines, exceeding the ${WARNING_THRESHOLD}-line threshold.`
          : `New file has ${lines} lines, exceeding the ${WARNING_THRESHOLD}-line threshold.`,
      fixHint:
        "Split the file by its MODULE_MAP seam into a sibling folder-of-files with a thin re-export shim (RFC-0303), or shrink the baseline ceiling after review.",
      data: { lines, threshold: WARNING_THRESHOLD, ceiling: ceiling ?? null },
    });
  }

  return diagnosticsResult("file.size.lint", diagnostics);
}
