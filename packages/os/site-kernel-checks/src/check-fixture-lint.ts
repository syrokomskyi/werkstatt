/*
<MODULE_CONTRACT>
<purpose>
check.fixture.lint — RFC-0261: every `*.validate`/`*.lint` command registered
by @gogol/site-kernel-checks must have a test file that exercises at least one
failing fixture and one passing fixture. A check without fixtures has its
specification only in its author's head.
</purpose>
<non-goals>
  <item>Do not parse TypeScript ASTs — regex-based detection mirrors diagnostic.shape.lint and KEL.</item>
  <item>Do not measure line coverage — a check can be 100% covered by tests that never assert a failure; this lint proves red+green behavior instead.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0261: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { GENERATED_MARKER } from "@gogol/site-kernel";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { ALL_COMMANDS } from "./command-tables/index.ts";
import { diagnosticsResult } from "./result-helpers.ts";

const CHECKS_SRC = ["packages", "os", "site-kernel-checks", "src"];
const COMMAND_TABLES_DIR = [...CHECKS_SRC, "command-tables"];
const TESTS_DIR = [...CHECKS_SRC, "tests"];

const BASELINE_PATH =
  "packages/os/site-kernel-checks/src/check-fixture-lint.baseline.generated.yaml";

interface CheckFixtureLintBaseline {
  rule: "CHECK-FIX";
  /** Command names accepted as uncovered/under-covered. Shrink-only. */
  commands: string[];
}

/** RFC-0261 fixture-coverage projection for one command (exported for tests). */
export interface FixtureCoverageEntry {
  command: string;
  module: string | null;
  testFile: string | null;
  hasFailFixture: boolean;
  hasPassFixture: boolean;
}

const IMPORT_BLOCK_PATTERN = /import\s*\{([\s\S]*?)\}\s*from\s*"([^"]+)"/g;
const ENTRY_PATTERN = /name:\s*"([^"]+)"[\s\S]*?execute:\s*(\w+)(?=[\s,])/g;

function toPosixPath(value: string): string {
  return value.split("\\").join("/");
}

/**
 * Parse every packages/os/site-kernel-checks/src/command-tables/*.ts file into a
 * command-name -> implementing-module-path map. A command is only resolved when
 * its `execute:` value can be traced to an import from another module (an
 * inline arrow-function `execute` cannot be traced this way and resolves to null).
 */
export async function resolveCommandModules(
  workspaceRoot: string,
): Promise<Map<string, string | null>> {
  const commandTablesDir = join(workspaceRoot, ...COMMAND_TABLES_DIR);
  const resolved = new Map<string, string | null>();

  let fileNames: string[];
  try {
    fileNames = (await readdir(commandTablesDir))
      .filter((name) => name.endsWith(".ts") && name !== "index.ts" && name !== "types.ts")
      .sort();
  } catch {
    return resolved;
  }

  for (const fileName of fileNames) {
    const content = await readFile(join(commandTablesDir, fileName), "utf8");

    const funcToModule = new Map<string, string>();
    for (const match of content.matchAll(IMPORT_BLOCK_PATTERN)) {
      const names = match[1]!
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const specifier = match[2]!;
      if (!specifier.startsWith(".")) continue; // skip @gogol/* and node: imports
      const modulePath = toPosixPath(relative(workspaceRoot, join(commandTablesDir, specifier)));
      for (const name of names) funcToModule.set(name, modulePath);
    }

    for (const match of content.matchAll(ENTRY_PATTERN)) {
      const commandName = match[1]!;
      const funcName = match[2]!;
      resolved.set(commandName, funcToModule.get(funcName) ?? null);
    }
  }

  return resolved;
}

// Heuristic, not an AST match: proximity-based so it tolerates both node:assert
// tuple style (`exitCode, 1`) and vitest chain style (`exitCode).toBe(1)`).
const FAIL_FIXTURE_PATTERN =
  /exitCode[\s\S]{0,15}\b1\b|\.ok[\s\S]{0,15}\bfalse\b|"fail"|status[\s\S]{0,15}"fail"/;
const PASS_FIXTURE_PATTERN =
  /exitCode[\s\S]{0,15}\b0\b|\.ok[\s\S]{0,15}\btrue\b|"pass"|status[\s\S]{0,15}"pass"|\.length[\s\S]{0,10}\b0\b\)/;

/** Which of `testFiles` (if any) imports `modulePath`. */
function findCoveringTestFile(
  modulePath: string,
  testFiles: Array<{ name: string; content: string }>,
): { name: string; content: string } | undefined {
  const moduleBasename = modulePath.split("/").pop()!.replace(/\.ts$/, "");
  const importPattern = new RegExp(`from\\s*"[^"]*${moduleBasename}\\.ts"`);
  return testFiles.find((f) => importPattern.test(f.content));
}

/**
 * Pure projection: for each target command, resolve its fixture-coverage shape
 * from a command->module map and the set of test files. No file I/O — fully
 * unit-testable with fixture data (RFC-0261).
 */
export function computeFixtureCoverage(
  targetCommands: string[],
  commandModules: Map<string, string | null>,
  testFiles: Array<{ name: string; content: string }>,
): FixtureCoverageEntry[] {
  return targetCommands.map((command) => {
    const module = commandModules.get(command) ?? null;
    if (!module) {
      return {
        command,
        module: null,
        testFile: null,
        hasFailFixture: false,
        hasPassFixture: false,
      };
    }
    const covering = findCoveringTestFile(module, testFiles);
    return {
      command,
      module,
      testFile: covering?.name ?? null,
      hasFailFixture: covering ? FAIL_FIXTURE_PATTERN.test(covering.content) : false,
      hasPassFixture: covering ? PASS_FIXTURE_PATTERN.test(covering.content) : false,
    };
  });
}

/**
 * Pure projection: turn fixture-coverage entries into Diagnostic[], honoring
 * the shrink-only baseline. No file I/O — fully unit-testable (RFC-0261).
 */
export function buildFixtureCoverageDiagnostics(
  entries: FixtureCoverageEntry[],
  baselineCommands: Set<string>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const entry of entries) {
    if (entry.testFile && entry.hasFailFixture && entry.hasPassFixture) continue; // fully covered

    if (baselineCommands.has(entry.command)) continue; // pre-existing debt, ratcheted

    if (!entry.module) {
      diagnostics.push({
        ruleId: "CHECK-FIX-03",
        severity: "warning",
        message: `${entry.command}: implementing module undecidable by heuristics (inline execute or unresolved import).`,
        fixHint:
          "Register the command with execute: <importedFunctionName> from a dedicated module so fixture coverage can be resolved statically.",
        data: { command: entry.command },
      });
    } else if (!entry.testFile) {
      diagnostics.push({
        ruleId: "CHECK-FIX-01",
        severity: "error",
        file: entry.module,
        message: `${entry.command} has no covering test file under packages/os/site-kernel-checks/src/tests/.`,
        fixHint: `Add a test file importing ${entry.module} with at least one failing fixture and one passing fixture.`,
        data: { command: entry.command },
      });
    } else {
      diagnostics.push({
        ruleId: "CHECK-FIX-02",
        severity: "error",
        file: entry.module,
        message: `${entry.command}: covering test "${entry.testFile}" lacks a ${!entry.hasFailFixture ? "fail" : "pass"} fixture.`,
        fixHint: `Add a ${!entry.hasFailFixture ? "failing" : "passing"} fixture case to packages/os/site-kernel-checks/src/tests/${entry.testFile}.`,
        data: { command: entry.command, testFile: entry.testFile },
      });
    }
  }
  return diagnostics;
}

export async function runCheckFixtureLint(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult | { file: string; commands: number }>> {
  const { workspaceRoot } = context;
  const commandModules = await resolveCommandModules(workspaceRoot);

  const testsDir = join(workspaceRoot, ...TESTS_DIR);
  let testFileNames: string[] = [];
  try {
    testFileNames = (await readdir(testsDir)).filter((name) => name.endsWith(".test.ts"));
  } catch {
    // No tests directory — every command below is uncovered.
  }
  const testFiles = await Promise.all(
    testFileNames.map(async (name) => ({
      name,
      content: await readFile(join(testsDir, name), "utf8"),
    })),
  );

  const targetCommands = [...new Set(ALL_COMMANDS.map((c) => c.name))]
    .filter((name) => /\.(validate|lint)$/.test(name))
    .sort();

  const entries = computeFixtureCoverage(targetCommands, commandModules, testFiles);

  if (input.flags["write-baseline"] === true) {
    const uncovered = entries.filter((e) => !(e.testFile && e.hasFailFixture && e.hasPassFixture));
    const file = join(workspaceRoot, BASELINE_PATH);
    const baseline: CheckFixtureLintBaseline = {
      rule: "CHECK-FIX",
      commands: [...new Set(uncovered.map((e) => e.command))].sort(),
    };
    await writeFile(file, `${yamlStringify(baseline)}`, "utf8");
    return {
      data: { file: BASELINE_PATH, commands: baseline.commands.length },
      exitCode: 0,
      summary: `check.fixture.lint: wrote ${baseline.commands.length} baseline entr(y/ies) to ${BASELINE_PATH}`,
    };
  }

  let baseline: CheckFixtureLintBaseline | undefined;
  try {
    baseline = yamlParse(
      await readFile(join(workspaceRoot, BASELINE_PATH), "utf8"),
    ) as CheckFixtureLintBaseline;
  } catch {
    baseline = undefined;
  }

  const diagnostics = buildFixtureCoverageDiagnostics(entries, new Set(baseline?.commands ?? []));
  return diagnosticsResult("check.fixture.lint", diagnostics);
}
