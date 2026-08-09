/*
<MODULE_CONTRACT>
<purpose>Check gate composition for the video plugin (RFC-0778).</purpose>
<keywords>checkgate, validators, video, editframe</keywords>
<responsibilities>
  <item>Defines which validators run in checkGate: all 4 (composition, assets, render, secret-scan).</item>
  <item>Aggregates results from each validator into a single HookResult.</item>
</responsibilities>
<non-goals>
  <item>Do not implement validator logic — orchestrate validators only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0778: check gate composition running composition, assets, render, and secret-scan validators.</item>
</CHANGE_SUMMARY>
*/

import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";
import { validateComposition } from "./composition-validate.ts";
import { validateAssets } from "./assets-validate.ts";
import { validateRender } from "./render-validate.ts";
import { scanSecrets } from "./secret-scan.ts";

export async function runVideoCheckGate(ctx: PluginHookContext): Promise<HookResult> {
  const projectRoot = ctx.workpiecePath ?? ctx.workspaceRoot;
  const errors: string[] = [];

  const compositionResult = await validateComposition(projectRoot);
  if (compositionResult.exitCode !== 0) {
    errors.push(
      `video.composition.validate: ${compositionResult.data?.violations.length ?? 0} violations`,
    );
  }

  const assetsResult = await validateAssets(projectRoot);
  if (assetsResult.exitCode !== 0) {
    errors.push(`video.assets.validate: ${assetsResult.data?.violations.length ?? 0} violations`);
  }

  const renderResult = await validateRender(projectRoot);
  if (renderResult.exitCode !== 0) {
    errors.push(`video.render.validate: ${renderResult.data?.violations.length ?? 0} violations`);
  }

  const secretResult = await scanSecrets(projectRoot);
  if (secretResult.exitCode !== 0) {
    errors.push(`video.secret.scan: ${secretResult.data?.violations.length ?? 0} violations`);
  }

  ctx.logger.info(
    `checkGate: composition=${compositionResult.data?.status}, assets=${assetsResult.data?.status}, render=${renderResult.data?.status}, secrets=${secretResult.data?.status}`,
  );

  return {
    success: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

export { validateComposition } from "./composition-validate.ts";
export { validateAssets } from "./assets-validate.ts";
export { validateRender } from "./render-validate.ts";
export { scanSecrets } from "./secret-scan.ts";
