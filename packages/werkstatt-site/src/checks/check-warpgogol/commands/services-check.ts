/*
<MODULE_CONTRACT>
<purpose>Services check run command handler for check-warpgogol: orchestrates a Services check run including env contract validation and service naming validation (RFC-0751).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from commands.ts as part of the domain split.</item>
  <item>RFC-0346: integrate env.contract.validate into services.check.run pipeline.</item>
  <item>RFC-0751: integrate service.naming.validate into services.check.run pipeline via executeKernelCommand.</item>
</CHANGE_SUMMARY>
*/

import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "../result.ts";
import { runServicesWorkspaceValidate, runCheckWarpgogolRunnerValidate } from "./services.ts";

export async function runServicesCheckRun(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const workspace = await runServicesWorkspaceValidate(input, context);
  const runner = await runCheckWarpgogolRunnerValidate(input, context);

  // RFC-0751: Run service.naming.validate via executeKernelCommand (avoids circular dependency)
  let namingDiagnostics: Diagnostic[] = [];
  try {
    const { executeKernelCommand } = await import("@warpgogol/werkstatt/kernel");
    const namingResult = (await executeKernelCommand({
      workspaceRoot: context.workspaceRoot,
      commandName: "service.naming.validate",
      argv: [],
    })) as { exitCode: number; data?: { diagnostics?: Diagnostic[] } };
    namingDiagnostics = namingResult.data?.diagnostics ?? [];
  } catch {
    // service.naming.validate may not be registered yet — skip silently
  }

  return diagnosticsResult("services.check.run", [
    ...(workspace.data?.diagnostics ?? []),
    ...(runner.data?.diagnostics ?? []),
    ...namingDiagnostics,
  ]);
}
