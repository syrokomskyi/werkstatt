/*
<MODULE_CONTRACT>
<purpose>
diagnostic.shape.lint — RFC-0203 inner-shape governance, the analogue of
kernel.result.envelope.lint one layer deeper. KEL guards the outer envelope;
this guards that checks emitting canonical Diagnostics use registered rule ids.

  DSL-01 (error) — the lint could not read the checks source directory.
  DSL-02 (error) — a check using diagnosticsResult emits a ruleId literal that
                   is not in the rule registry (diagnostics/rules.ts).
  DSL-03 (error) — a check using diagnosticsResult emits an empty ruleId literal.
  DSL-04 (error) — a check calls resultFromViolations/failResult (the coarse
                   string shim) from a module not listed in the shrink-only
                   dsl04-baseline.generated.yaml (RFC-0261).

Note: the string builders (resultFromViolations / failResult / passResult) are
canonical (ruleId = command) as of RFC-0203, so there is no bare-string shim to
flag — the migration is structural. DSL-02/03 carry shape enforcement. DSL-04
(RFC-0261) ratchets the shim itself down to zero over time.
</purpose>
<non-goals>
  <item>Do not parse TypeScript ASTs — regex-based detection mirrors KEL (RFC-0030).</item>
  <item>Do not flag the result-helpers shim definitions or this lint file itself.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0203: initial creation — DSL-01/02/03.</item>
  <item>RFC-0261: add DSL-04 shim-usage ratchet + --write-baseline flag.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { GENERATED_MARKER } from "@warpgogol/site-kernel";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { diagnosticsResult } from "./result-helpers.ts";
import { isRegisteredRuleId } from "./diagnostics/rules.ts";

const MIGRATED_PATTERN = /\bdiagnosticsResult\s*\(/;
const RULE_ID_LITERAL = /ruleId:\s*"([^"]*)"/g;
/** RFC-0261: a real call to the coarse string shim (not a re-export or a comment mention). */
const SHIM_CALL_PATTERN = /\b(resultFromViolations|failResult)\s*\(/;

// Files that define the canonical builders or reference ruleId tokens for
// tooling and must not be linted as producers.
const EXEMPT_FILES = new Set(["result-helpers.ts", "diagnostic-shape-lint.ts", "diagnostics"]);

const DSL04_BASELINE_PATH =
  "packages/os/site-kernel-checks/src/diagnostics/dsl04-baseline.generated.yaml";

interface Dsl04Baseline {
  rule: "DSL-04";
  /** Repo-relative module paths still using resultFromViolations/failResult. Shrink-only. */
  files: string[];
}

async function readDsl04Baseline(workspaceRoot: string): Promise<Dsl04Baseline | undefined> {
  try {
    const raw = await readFile(join(workspaceRoot, DSL04_BASELINE_PATH), "utf8");
    return yamlParse(raw) as Dsl04Baseline;
  } catch {
    return undefined;
  }
}

function renderDsl04Baseline(files: string[]): string {
  const baseline: Dsl04Baseline = {
    rule: "DSL-04",
    files: [...new Set(files)].sort(),
  };
  return `${yamlStringify(baseline)}`;
}

export async function runDiagnosticShapeLint(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult | { file: string; files: number }>> {
  const checksDir = join(context.workspaceRoot, "packages", "os", "site-kernel-checks", "src");

  let files: string[];
  try {
    const entries = await readdir(checksDir, { withFileTypes: true });
    files = entries
      .filter((e) => e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".test.ts"))
      .map((e) => e.name)
      .sort();
  } catch (err) {
    return diagnosticsResult("diagnostic.shape.lint", [
      {
        ruleId: "DSL-01",
        severity: "error",
        message: `Could not read site-kernel-checks/src/: ${(err as Error).message}`,
        fixHint: "Ensure packages/os/site-kernel-checks/src/ exists and is readable.",
      },
    ]);
  }

  const shimUsers: string[] = [];

  for (const name of files) {
    if (EXEMPT_FILES.has(name)) continue;
    if (SHIM_CALL_PATTERN.test(await readFile(join(checksDir, name), "utf8").catch(() => ""))) {
      shimUsers.push(`packages/os/site-kernel-checks/src/${name}`);
    }
  }

  if (input.flags["write-baseline"] === true) {
    await writeFile(
      join(context.workspaceRoot, DSL04_BASELINE_PATH),
      renderDsl04Baseline(shimUsers),
      "utf8",
    );
    return {
      data: { file: DSL04_BASELINE_PATH, files: shimUsers.length },
      exitCode: 0,
      summary: `diagnostic.shape.lint: wrote ${shimUsers.length} DSL-04 baseline entr(y/ies) to ${DSL04_BASELINE_PATH}`,
    };
  }

  const diagnostics: Diagnostic[] = [];
  const baseline = await readDsl04Baseline(context.workspaceRoot);
  const baselineSet = new Set(baseline?.files ?? []);

  for (const relName of shimUsers) {
    if (baselineSet.has(relName)) continue;
    diagnostics.push({
      ruleId: "DSL-04",
      severity: "error",
      file: relName,
      message:
        "resultFromViolations/failResult (string shim) used outside the shrink-only baseline.",
      fixHint: `Migrate ${relName} to diagnosticsResult with registered, fine-grained ruleIds and locators, or (if this is a pre-existing module) run diagnostic.shape.lint --write-baseline after confirming the migration queue accepted it.`,
      data: { file: relName },
    });
  }

  for (const name of files) {
    if (EXEMPT_FILES.has(name)) continue;
    const relName = `site-kernel-checks/src/${name}`;

    let content: string;
    try {
      content = await readFile(join(checksDir, name), "utf8");
    } catch {
      continue;
    }

    // DSL-02 / DSL-03: checks emitting canonical Diagnostics must use registered,
    // non-empty ruleIds.
    if (MIGRATED_PATTERN.test(content)) {
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        for (const match of lines[i]!.matchAll(RULE_ID_LITERAL)) {
          const id = match[1]!;
          if (id.length === 0) {
            diagnostics.push({
              ruleId: "DSL-03",
              severity: "error",
              message: `Empty ruleId literal in a migrated check.`,
              file: relName,
              line: i + 1,
              fixHint: "Provide a non-empty, registered ruleId from diagnostics/rules.ts.",
            });
          } else if (!isRegisteredRuleId(id)) {
            diagnostics.push({
              ruleId: "DSL-02",
              severity: "error",
              message: `ruleId "${id}" is not registered in diagnostics/rules.ts.`,
              file: relName,
              line: i + 1,
              fixHint: `Add "${id}" to DIAGNOSTIC_RULES in packages/os/site-kernel-checks/src/diagnostics/rules.ts.`,
              data: { ruleId: id },
            });
          }
        }
      }
    }
  }

  return diagnosticsResult("diagnostic.shape.lint", diagnostics);
}
