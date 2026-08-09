/*
<MODULE_CONTRACT>
  <purpose>RFC-0750: bordbuch.commit.parity.lint — scans site-kernel-handoff source for direct appendBordbuchEntry calls outside the whitelist. Ensures all bordbuch append operations use appendAndCommitBordbuch or appendBatchAndCommitBordbuch helpers.</purpose>
  <non-goals>
    <item>Does not check test files — tests may call appendBordbuchEntry directly for unit testing.</item>
    <item>Does not check bordbuch-io.ts, bordbuch-append.ts, or bordbuch-commit-helper.ts — these are the whitelisted internal implementation files.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0750: initial bordbuch.commit.parity.lint command.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
  Diagnostic,
  CheckResult,
} from "@warpgogol/site-kernel";
import { collectFiles } from "@warpgogol/share/fs";
import { diagnosticsResult } from "./result-helpers.ts";

const WHITELISTED_FILES = new Set([
  "packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts",
  "packages/os/site-kernel-handoff/src/bordbuch/bordbuch-append.ts",
  "packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit-helper.ts",
]);

const APPEND_CALL_PATTERN = /\bappendBordbuchEntry\s*\(/;

export async function runBordbuchCommitParityLint(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const mode = (input.flags["mode"] as string | undefined) ?? "warning";
  const diagnostics: Diagnostic[] = [];

  const packagesDir = path.join(context.workspaceRoot, "packages");
  const files = await collectFiles(packagesDir, {
    extensions: [".ts", ".tsx"],
  });

  for (const file of files) {
    const relPath = path.relative(context.workspaceRoot, file).replace(/\\/g, "/");

    if (WHITELISTED_FILES.has(relPath)) continue;
    if (relPath.includes("/tests/") || relPath.includes(".test.")) continue;

    const content = await context.io.readFile(file);
    if (APPEND_CALL_PATTERN.test(content)) {
      diagnostics.push({
        ruleId: "BB-PARITY-01",
        severity: "error",
        file: relPath,
        message:
          "Direct appendBordbuchEntry call detected outside whitelist. Use appendAndCommitBordbuch or appendBatchAndCommitBordbuch from bordbuch-commit-helper.ts instead (RFC-0750).",
        fixHint:
          "Import appendAndCommitBordbuch from bordbuch-commit-helper.ts and replace the append+commit pattern with a single helper call.",
      });
    }
  }

  if (mode === "warning") {
    const warnings = diagnostics.map((d) => ({ ...d, severity: "warning" as const }));
    return diagnosticsResult("bordbuch.commit.parity.lint", warnings);
  }

  return diagnosticsResult("bordbuch.commit.parity.lint", diagnostics);
}
