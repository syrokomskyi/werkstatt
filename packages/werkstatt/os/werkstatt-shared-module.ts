/*
<MODULE_CONTRACT>
<purpose>Register werkstatt.shared.validate command with the kernel registry (RFC-0868).</purpose>
<keywords>shared, validate, RFC-0868, module</keywords>
<non-goals>
  <item>Do not implement validation logic — delegate to plugin/shared-validate.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0868: initial werkstatt-shared module registering werkstatt.shared.validate.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelModule,
  KernelRuntimeContext,
} from "../src/kernel/types.ts";
import {
  runSharedValidate,
  type SharedValidateResult,
} from "../src/plugin/shared-validate.ts";

export const werkstattSharedModule: KernelModule = {
  name: "werkstatt-shared",
  version: "0.1.0",
  register(registry) {
    registry.registerCommand({
      name: "werkstatt.shared.validate",
      description:
        "Scan packages/werkstatt-shared/src/** for forbidden @warpgogol/werkstatt-site imports. Enforces RFC-0868 shared/site boundary.",
      scope: "workspace",
      supportsAllSites: false,
      flags: {},
      reads: ["packages/werkstatt-shared/src/**"],
      cacheable: false,
      async execute(
        _input: KernelCommandInput,
        context: KernelRuntimeContext,
      ): Promise<KernelCommandResult<SharedValidateResult>> {
        const result = await runSharedValidate(context.workspaceRoot);
        return {
          exitCode: result.status === "pass" ? 0 : 1,
          data: result,
          summary:
            result.status === "pass"
              ? `Shared boundary guard passed — ${result.scannedFiles} files scanned, zero violations`
              : `Shared boundary guard failed — ${result.violations.length} violation(s) in ${result.scannedFiles} files`,
        };
      },
    });
  },
};
