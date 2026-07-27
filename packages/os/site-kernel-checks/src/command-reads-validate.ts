/*
<MODULE_CONTRACT>
<purpose>
  command.reads.validate — RFC-0390: enforce that every registered kernel command
  declares either `reads` (non-empty glob array) or `cacheable: false`. Also
  validates that `reads` patterns are valid picomatch syntax.
</purpose>
<non-goals>
  <item>Do not execute commands — this is a static metadata check.</item>
  <item>Do not validate glob matches against the filesystem — only syntax.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0390: initial implementation — CRC-01 (reads or cacheable:false) and CRC-02 (valid picomatch syntax).</item>
</CHANGE_SUMMARY>
*/

import picomatch from "picomatch";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { listRegisteredKernelCommands } from "@gogol/site-kernel";
import { diagnosticsResult } from "./result-helpers.ts";

export async function runCommandReadsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "command.reads.validate";
  const diagnostics: Diagnostic[] = [];

  const commands = await listRegisteredKernelCommands(context.workspaceRoot);

  for (const cmd of commands) {
    const reads = cmd.reads ?? [];
    const cacheable = cmd.cacheable ?? true;

    // CRC-01: each command must have non-empty `reads` OR `cacheable: false`
    if (reads.length === 0 && cacheable !== false) {
      diagnostics.push({
        ruleId: "CRC-01",
        severity: "error",
        message: `Command \`${cmd.name}\` has no \`reads\` declaration and \`cacheable\` is not false. Every command MUST declare \`reads\` or set \`cacheable: false\` (RFC-0390).`,
        fixHint: `Add \`reads: [...]\` with the file globs this command reads, or add \`cacheable: false\` if the command depends on external state.`,
      });
    }

    // CRC-02: each `reads` pattern must be valid picomatch syntax
    for (const pattern of reads) {
      try {
        picomatch(pattern, { dot: true });
      } catch {
        diagnostics.push({
          ruleId: "CRC-02",
          severity: "error",
          message: `Command \`${cmd.name}\` has invalid glob pattern in \`reads\`: \`${pattern}\`.`,
          fixHint: `Fix the glob pattern to be valid picomatch syntax.`,
        });
      }
    }
  }

  return diagnosticsResult(command, diagnostics);
}
