/*
<MODULE_CONTRACT>
<purpose>hooks.checkGate — runs the complete knowledge check gate.</purpose>
<keywords>hook, checkGate, validators, knowledge</keywords>
<responsibilities>
  <item>Runs source, canonical, evidence, governance, and boundary checks.</item>
  <item>Aggregates results from all validators into a single HookResult.</item>
</responsibilities>
<non-goals>
  <item>Does not implement individual validator logic — orchestrates validators only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial check gate hook per SPEC-v1.0 section 6.</item>
</CHANGE_SUMMARY>
*/

import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";
import { runSourceVerify } from "../source/verify.ts";
import { runSourceStatus } from "../source/status.ts";
import { runKnowledgeVerify } from "../core/verify.ts";
import { runKnowledgeAudit } from "../core/audit.ts";
import { runKnowledgeCoverage } from "../core/coverage.ts";
import { runMaterializeVerify } from "../materialize/materialize-verify.ts";
import { runReleaseCheck } from "../release/check.ts";

export async function runKnowledgeCheckGate(ctx: PluginHookContext): Promise<HookResult> {
  const projectRoot = ctx.workpiecePath ?? ctx.workspaceRoot;
  const errors: string[] = [];

  const sourceStatus = await runSourceStatus(projectRoot);
  if (sourceStatus.exitCode !== 0) {
    errors.push(`knowledge.source.status: ${sourceStatus.summary}`);
  }

  const sourceVerify = await runSourceVerify(projectRoot);
  if (sourceVerify.exitCode !== 0) {
    errors.push(`knowledge.source.verify: ${sourceVerify.summary}`);
  }

  const knowledgeVerify = await runKnowledgeVerify(projectRoot);
  if (knowledgeVerify.exitCode !== 0) {
    errors.push(`knowledge.verify: ${knowledgeVerify.summary}`);
  }

  const audit = await runKnowledgeAudit(projectRoot);
  if (audit.exitCode !== 0) {
    errors.push(`knowledge.audit: ${audit.summary}`);
  }

  const coverage = await runKnowledgeCoverage(projectRoot);
  if (coverage.exitCode !== 0) {
    errors.push(`knowledge.coverage: ${coverage.summary}`);
  }

  const materializeVerify = await runMaterializeVerify(projectRoot);
  if (materializeVerify.exitCode !== 0) {
    errors.push(`knowledge.materialize.verify: ${materializeVerify.summary}`);
  }

  const releaseCheck = await runReleaseCheck(projectRoot);
  if (releaseCheck.exitCode !== 0) {
    errors.push(`knowledge.release.check: ${releaseCheck.summary}`);
  }

  ctx.logger.info(
    `checkGate: source=${sourceVerify.data?.status}, verify=${knowledgeVerify.data?.status}, audit=${audit.data?.status}, coverage=${coverage.data?.status}, materialize=${materializeVerify.data?.status}, release=${releaseCheck.data?.status}`,
  );

  return {
    success: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}
