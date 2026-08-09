/*
<MODULE_CONTRACT>
<purpose>Target validation, safety validation, and runner info command handlers for check-warpgogol.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from commands.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { getCheckRunnerInfo } from "@warpgogol/werkstatt-site/check-runner";
import { validateTargetSafety } from "@warpgogol/werkstatt-site/check-core";
import type {
  CheckResult,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { diagnosticsResult } from "../result.ts";
import { readTargetFromFlag } from "../target-io.ts";

export async function runCheckTargetValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { diagnostics } = await readTargetFromFlag(input, context);
  return diagnosticsResult("check.target.validate", diagnostics);
}

export async function runCheckSafetyValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { target, diagnostics } = await readTargetFromFlag(input, context);
  if (!target) return diagnosticsResult("check.safety.validate", diagnostics);
  return diagnosticsResult("check.safety.validate", [
    ...diagnostics,
    ...validateTargetSafety(target),
  ]);
}

export function runCheckRunnerInfo(): KernelCommandResult {
  return {
    exitCode: 0,
    summary: "check.runner.info: pass",
    data: getCheckRunnerInfo(),
  };
}
