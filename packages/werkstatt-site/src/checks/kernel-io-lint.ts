/*
<MODULE_CONTRACT>
<purpose>
RFC-0267: static lint (IO-01) forbidding direct node:fs / node:fs/promises /
node:child_process imports in command-implementing modules. Kernel commands
must receive filesystem/process-execution capability from
KernelRuntimeContext.io (the WorkspaceIO port) instead of reaching for
ambient fs — the port is what makes mutatesState trustworthy and enables a
universal --dry-run. Adoption is ratcheted: a shrink-only baseline of current
offenders keeps the workspace buildable while migration proceeds file by
file; new command modules must be clean from day one.
</purpose>
<non-goals>
  <item>Do not parse a real AST — an import-statement regex scan is sufficient for this static check.</item>
  <item>Do not enforce the port at runtime here — that is the executor's adapter selection (workspace-io.ts).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0267: initial implementation.</item>
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
} from "@warpgogol/werkstatt/kernel";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { diagnosticsResult } from "./result-helpers.ts";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";

const SCAN_ROOT = join("packages", "werkstatt-site", "src", "checks", "src");
const BASELINE_PATH = join(
  "packages",
  "os",
  "site-kernel-checks",
  "src",
  "kernel-io-lint.baseline.generated.yaml",
);
const FORBIDDEN_MODULES = ["node:fs/promises", "node:fs", "node:child_process"];

interface KernelIoLintBaseline {
  meta: { schemaVersion: 1 };
  /** Workspace-relative file paths accepted as pre-existing ambient-IO offenders. */
  files: string[];
}

async function collectSourceFiles(rootDir: string): Promise<string[]> {
  const files = await collectFiles(rootDir, {
    extensions: [".ts"],
    ignore: (name) => name === "tests", // test fixtures legitimately use real fs for temp dirs
  });
  return files.filter((full) => !full.endsWith(".test.ts"));
}

/** Pure scan: which of FORBIDDEN_MODULES does this source import from? */
export function findForbiddenIoImports(source: string): string[] {
  const found: string[] = [];
  for (const moduleName of FORBIDDEN_MODULES) {
    const re = new RegExp(`from\\s+["']${moduleName.replace("/", "\\/")}["']`);
    if (re.test(source)) found.push(moduleName);
  }
  return found;
}

async function readBaseline(workspaceRoot: string): Promise<KernelIoLintBaseline | undefined> {
  try {
    return yamlParse(
      await readFile(join(workspaceRoot, BASELINE_PATH), "utf8"),
    ) as KernelIoLintBaseline;
  } catch {
    return undefined;
  }
}

function renderBaseline(files: string[]): string {
  const baseline: KernelIoLintBaseline = {
    meta: { schemaVersion: 1 },
    files: [...new Set(files)].sort(),
  };
  return `${yamlStringify(baseline)}`;
}

async function findOffenders(workspaceRoot: string): Promise<Map<string, string[]>> {
  const files = await collectSourceFiles(join(workspaceRoot, SCAN_ROOT));
  const offenders = new Map<string, string[]>();
  for (const filePath of files) {
    let source: string;
    try {
      source = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const forbidden = findForbiddenIoImports(source);
    if (forbidden.length > 0) {
      const relFile = relative(workspaceRoot, filePath).replace(/\\/g, "/");
      offenders.set(relFile, forbidden);
    }
  }
  return offenders;
}

export async function runKernelIoLint(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult | { file: string; files: number }>> {
  const { workspaceRoot } = context;
  const offenders = await findOffenders(workspaceRoot);

  if (input.flags["write-baseline"] === true) {
    const fileNames = [...offenders.keys()];
    await writeFile(join(workspaceRoot, BASELINE_PATH), renderBaseline(fileNames), "utf8");
    return {
      data: { file: BASELINE_PATH.replace(/\\/g, "/"), files: fileNames.length },
      exitCode: 0,
      summary: `kernel.io.lint: wrote ${fileNames.length} offender file(s) to ${BASELINE_PATH.replace(/\\/g, "/")}`,
    };
  }

  const baseline = await readBaseline(workspaceRoot);
  const baselineSet = new Set(baseline?.files ?? []);
  const diagnostics: Diagnostic[] = [];

  for (const [file, forbidden] of offenders) {
    if (baselineSet.has(file)) continue; // pre-existing, ratcheted debt
    diagnostics.push({
      ruleId: "IO-01",
      severity: "error",
      file,
      message: `Imports ${forbidden.join(", ")} directly — new/migrated command modules must receive IO from KernelRuntimeContext.io instead.`,
      fixHint: "Receive io from KernelRuntimeContext instead of importing node:fs (RFC-0267).",
      data: { forbidden },
    });
  }

  return diagnosticsResult("kernel.io.lint", diagnostics);
}
