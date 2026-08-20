/*
<MODULE_CONTRACT>
<purpose>hooks.releaseEvidence — emits knowledge-specific evidence packet.</purpose>
<keywords>hook, release, evidence, knowledge</keywords>
<responsibilities>
  <item>Runs knowledge.release.evidence command.</item>
  <item>Returns evidence with dataset id, model version, canonical hash, counts.</item>
</responsibilities>
<non-goals>
  <item>Does not verify hashes — that is the integrity module's job.</item>
  <item>Does not modify canonical data.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial release evidence hook per SPEC-v1.0 section 6.</item>
</CHANGE_SUMMARY>
*/

import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";
import { runReleaseEvidence } from "../release/evidence.ts";

export async function runKnowledgeReleaseEvidenceHook(ctx: PluginHookContext): Promise<HookResult> {
  const projectRoot = ctx.workpiecePath ?? ctx.workspaceRoot;

  try {
    const result = await runReleaseEvidence(projectRoot);

    if (result.exitCode !== 0) {
      return {
        success: false,
        errors: [`knowledge.release.evidence: ${result.summary}`],
      };
    }

    ctx.logger.info(`release-evidence hook: ${result.summary}`);
    return { success: true, data: result.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error(`release-evidence hook failed: ${message}`);
    return {
      success: false,
      errors: [`release-evidence hook failed: ${message}`],
    };
  }
}
