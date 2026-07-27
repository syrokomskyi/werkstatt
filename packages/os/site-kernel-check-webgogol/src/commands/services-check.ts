/*
<MODULE_CONTRACT>
<purpose>Services check run command handler for check-webgogol: orchestrates a Services check run including env contract validation.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from commands.ts as part of the domain split.</item>
  <item>RFC-0346: integrate env.contract.validate into services.check.run pipeline.</item>
</CHANGE_SUMMARY>
*/

import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { diagnosticsResult } from "../result.ts";
import { runServicesWorkspaceValidate, runCheckWebgogolRunnerValidate } from "./services.ts";

export async function runServicesCheckRun(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const workspace = await runServicesWorkspaceValidate(input, context);
  const runner = await runCheckWebgogolRunnerValidate(input, context);
  return diagnosticsResult("services.check.run", [
    ...(workspace.data?.diagnostics ?? []),
    ...(runner.data?.diagnostics ?? []),
  ]);
}
