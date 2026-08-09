/*
<MODULE_CONTRACT>
<purpose>
kernel.result.envelope.lint — workspace-wide lint that prevents regression to the
legacy flat KernelCommandResult shape { command, status, violations } which bypasses
kernel exit-code propagation.

Every check command must return { data, exitCode, summary } via the canonical helpers
passResult / failResult / resultFromViolations from result-helpers.ts.

If a command file contains `return { command:` not immediately wrapped in
`{ data: { command:` it is considered a KEL (Kernel Envelope Lint) violation.

[DNA-35][RFC-0030]
</purpose>
<non-goals>
  <item>Do not enforce at the TypeScript type level — lint-based enforcement is sufficient (RFC-0030 § Decision).</item>
  <item>Do not scan packages outside site-kernel-checks unless explicitly configured.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Phase A.3 (RFC-0030): Initial creation.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { diagnosticsResult } from "./result-helpers.ts";

// ---------------------------------------------------------------------------
// Detection patterns
// ---------------------------------------------------------------------------

// Matches `return { command:` — the flat result shape that bypasses exitCode.
// A line is a violation if it contains this pattern AND is NOT already wrapped in
// `data: {` AND does NOT have the // envelope-ok suppression comment.
const FLAT_RETURN_PATTERN = /return\s*\{[^}]*\bcommand\s*:/;
const ENVELOPE_OK_COMMENT = /\/\/\s*envelope-ok/i;
// Exclusion: passResult/failResult/resultFromViolations helper definitions themselves
// use `command` in parameter position, not as a flat return key.
const HELPER_DEFINITION_PATTERN = /function\s+(passResult|failResult|resultFromViolations)\s*\(/;

// ---------------------------------------------------------------------------
// runKernelResultEnvelopeLint
// ---------------------------------------------------------------------------

export async function runKernelResultEnvelopeLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];

  const checksDir = join(context.workspaceRoot, "packages", "os", "site-kernel-checks", "src");

  let files: string[];
  try {
    const entries = await readdir(checksDir, { withFileTypes: true });
    files = entries
      .filter((e) => e.isFile() && e.name.endsWith(".ts"))
      .map((e) => join(checksDir, e.name));
  } catch (err) {
    return diagnosticsResult("kernel.result.envelope.lint", [
      {
        ruleId: "KEL-00",
        severity: "error",
        message: `Could not read site-kernel-checks/src/: ${(err as Error).message}`,
        fixHint: "Ensure packages/os/site-kernel-checks/src/ exists and is readable.",
      },
    ]);
  }

  for (const filePath of files) {
    const relName = filePath.replace(/\\/g, "/").split("/").slice(-2).join("/");

    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    let inHelperDef = false;
    let inBlockComment = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNo = i + 1;

      // Track multi-line /* ... */ comment state. The lint targets executable
      // code only, not docstrings that may contain literal `return { command:`
      // examples (this very file does, in its module contract).
      const hasBlockOpen = /\/\*/.test(line) && !/\/\*[\s\S]*\*\//.test(line);
      const hasBlockClose = /\*\//.test(line) && !/\/\*[\s\S]*\*\//.test(line);
      const wasInBlockComment = inBlockComment;
      if (hasBlockOpen) inBlockComment = true;
      if (hasBlockClose) inBlockComment = false;
      if (wasInBlockComment || hasBlockOpen) continue;

      // Track whether we're inside a helper definition body (skip those lines)
      if (HELPER_DEFINITION_PATTERN.test(line)) {
        inHelperDef = true;
      }
      // A closing brace at col 0 ends a top-level function
      if (inHelperDef && /^\}/.test(line)) {
        inHelperDef = false;
        continue;
      }
      if (inHelperDef) continue;

      // Skip lines with suppression comment
      if (ENVELOPE_OK_COMMENT.test(line)) continue;

      // Skip single-line comments and JSDoc continuations
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

      // Flag flat return shape
      if (FLAT_RETURN_PATTERN.test(line)) {
        diagnostics.push({
          ruleId: "KEL-01",
          severity: "error",
          message:
            "Flat result shape detected — `return { command, status, violations }` bypasses kernel exit-code propagation.", // envelope-ok
          file: relName,
          line: lineNo,
          fixHint:
            "Wrap the return using passResult / failResult / resultFromViolations — or diagnosticsResult. Add `// envelope-ok` to suppress an intentional exception.",
        });
      }
    }
  }

  return diagnosticsResult("kernel.result.envelope.lint", diagnostics);
}
