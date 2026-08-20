/*
<MODULE_CONTRACT>
<purpose>hooks.build — builds configured projection packages from current materialization.</purpose>
<keywords>hook, build, projections, knowledge</keywords>
<responsibilities>
  <item>Runs knowledge.projection.build command.</item>
  <item>May invoke Turborepo tasks for apps/web, apps/mcp, and other projections.</item>
</responsibilities>
<non-goals>
  <item>Does not register a second stack plugin for projection apps.</item>
  <item>Does not write canonical data.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial build hook per SPEC-v1.0 section 6.</item>
</CHANGE_SUMMARY>
*/

import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";
import { runProjectionBuild } from "../materialize/projection-build.ts";

export async function runKnowledgeBuildHook(ctx: PluginHookContext): Promise<HookResult> {
  const projectRoot = ctx.workpiecePath ?? ctx.workspaceRoot;

  try {
    const result = await runProjectionBuild(projectRoot);

    if (result.exitCode !== 0) {
      return {
        success: false,
        errors: [`knowledge.projection.build: ${result.summary}`],
      };
    }

    ctx.logger.info(`build hook: ${result.summary}`);
    return { success: true, data: result.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error(`build hook failed: ${message}`);
    return {
      success: false,
      errors: [`build hook failed: ${message}`],
    };
  }
}
