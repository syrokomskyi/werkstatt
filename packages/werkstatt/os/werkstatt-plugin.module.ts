/*
<MODULE_CONTRACT>
<purpose>Register werkstatt.plugin.validate command with the kernel registry (RFC-0770).</purpose>
<non-goals>
  <item>Do not implement validation logic — delegate to validate/plugin-validate.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0770: initial werkstatt-plugin module registering werkstatt.plugin.validate.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelModule,
  KernelRuntimeContext,
} from "../src/kernel/types.ts";
import { validatePlugin, type PluginValidateData } from "../src/validate/plugin-validate.ts";

export const forgeWerkstattPluginModule: KernelModule = {
  name: "werkstatt-plugin",
  version: "0.1.0",
  register(registry) {
    registry.registerCommand({
      name: "werkstatt.plugin.validate",
      description:
        "Validate that exactly one stack plugin is registered, profile binding matches, module loaders resolve, and deploy adapters are present (RFC-0770).",
      scope: "workspace",
      supportsAllSites: false,
      flags: {},
      reads: ["tools/kernel.config.ts", "forge.yaml", "systems/registry.yaml"],
      cacheable: false,
      async execute(
        _input: KernelCommandInput,
        context: KernelRuntimeContext,
      ): Promise<KernelCommandResult<PluginValidateData>> {
        const result = await validatePlugin(context.workspaceRoot, context.logger);
        return result;
      },
    });
  },
};
