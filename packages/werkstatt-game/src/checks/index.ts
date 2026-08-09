/*
<MODULE_CONTRACT>
<purpose>Check gate composition for the game plugin (RFC-0777).</purpose>
<keywords>checkgate, validators, game</keywords>
<responsibilities>
  <item>Defines which validators run in checkGate: all 4 (assets, scenes, bundle, secret-scan).</item>
  <item>Aggregates results from each validator into a single HookResult.</item>
</responsibilities>
<non-goals>
  <item>Do not implement validator logic — orchestrate validators only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0777: check gate composition running assets, scenes, bundle, and secret-scan validators.</item>
</CHANGE_SUMMARY>
*/

import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";
import { validateAssets } from "./assets-validate.ts";
import { validateScenes } from "./scenes-validate.ts";
import { validateBundle } from "./bundle-validate.ts";
import { scanSecrets } from "./secret-scan.ts";

export async function runGameCheckGate(ctx: PluginHookContext): Promise<HookResult> {
  const projectRoot = ctx.workpiecePath ?? ctx.workspaceRoot;
  const errors: string[] = [];

  const assetsResult = await validateAssets(projectRoot);
  if (assetsResult.exitCode !== 0) {
    errors.push(`game.assets.validate: ${assetsResult.data?.violations.length ?? 0} violations`);
  }

  const scenesResult = await validateScenes(projectRoot);
  if (scenesResult.exitCode !== 0) {
    errors.push(`game.scenes.validate: ${scenesResult.data?.violations.length ?? 0} violations`);
  }

  const bundleResult = await validateBundle(projectRoot);
  if (bundleResult.exitCode !== 0) {
    errors.push(`game.bundle.validate: bundle exceeds budget`);
  }

  const secretResult = await scanSecrets(projectRoot);
  if (secretResult.exitCode !== 0) {
    errors.push(`game.secret.scan: ${secretResult.data?.violations.length ?? 0} violations`);
  }

  ctx.logger.info(
    `checkGate: assets=${assetsResult.data?.status}, scenes=${scenesResult.data?.status}, bundle=${bundleResult.data?.status}, secrets=${secretResult.data?.status}`,
  );

  return {
    success: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

export { validateAssets } from "./assets-validate.ts";
export { validateScenes } from "./scenes-validate.ts";
export { validateBundle } from "./bundle-validate.ts";
export { scanSecrets } from "./secret-scan.ts";
