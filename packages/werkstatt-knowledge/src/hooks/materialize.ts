/*
<MODULE_CONTRACT>
<purpose>hooks.materialize — compiles verified canonical knowledge into materialized dataset.</purpose>
<keywords>hook, materialize, knowledge</keywords>
<responsibilities>
  <item>Orchestrates knowledge.materialize command.</item>
  <item>Produces materialization manifest with canonical hash and model version.</item>
</responsibilities>
<non-goals>
  <item>Does not write canonical data — writes only .generated/ outputs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial materialize hook per SPEC-v1.0 section 6.</item>
</CHANGE_SUMMARY>
*/

import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";
import { runMaterialize } from "../materialize/materialize.ts";

export async function runKnowledgeMaterializeHook(ctx: PluginHookContext): Promise<HookResult> {
  const projectRoot = ctx.workpiecePath ?? ctx.workspaceRoot;

  try {
    const result = await runMaterialize(projectRoot);

    if (result.exitCode !== 0) {
      return {
        success: false,
        errors: [`knowledge.materialize: ${result.summary}`],
      };
    }

    ctx.logger.info(`materialize hook: ${result.summary}`);
    return { success: true, data: result.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error(`materialize hook failed: ${message}`);
    return {
      success: false,
      errors: [`materialize hook failed: ${message}`],
    };
  }
}
