/*
<MODULE_CONTRACT>
<purpose>Check gate composition for the Godot plugin — runs all 12 validators.</purpose>
<keywords>checkgate, validators, godot</keywords>
<responsibilities>
  <item>Defines which validators run in checkGate: all 12 (scene, gitignore, secret-scan, project-config, scene-reference, csproj, resource, script, uid, export-presets, nuget, addon).</item>
  <item>Aggregates results from each validator into a single HookResult.</item>
  <item>Treats project-config (GODOT-04) as non-blocking warnings.</item>
</responsibilities>
<non-goals>
  <item>Do not implement validator logic — orchestrate validators only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial check gate composition running scene, gitignore, secret-scan, and project-config validators.</item>
  <item>Fix: treat GODOT-04 config validator as non-blocking (warnings only, not errors).</item>
  <item>Enhancement: add scene-reference (GODOT-05), csproj (GODOT-06), and resource (GODOT-07) validators to check gate.</item>
  <item>Enhancement: add script (GODOT-08), export-presets (GODOT-09), uid (GODOT-10), and nuget (GODOT-11) validators to check gate.</item>
  <item>Enhancement: add addon (GODOT-12) validator to check gate.</item>
</CHANGE_SUMMARY>
*/

import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";
import { validateSceneStructure } from "./scene-validate.ts";
import { validateGitignore } from "./gitignore-validate.ts";
import { scanSecrets } from "./secret-scan.ts";
import { validateProjectConfig } from "./project-config-validate.ts";
import { validateSceneReferences } from "./scene-reference-validate.ts";
import { validateCsproj } from "./csproj-validate.ts";
import { validateResources } from "./resource-validate.ts";
import { validateScripts } from "./script-validate.ts";
import { validateUids } from "./uid-validate.ts";
import { validateExportPresets } from "./export-presets-validate.ts";
import { validateNuget } from "./nuget-validate.ts";
import { validateAddons } from "./addon-validate.ts";

export async function runGodotCheckGate(ctx: PluginHookContext): Promise<HookResult> {
  const projectRoot = ctx.workpiecePath ?? ctx.workspaceRoot;
  const errors: string[] = [];

  const sceneResult = await validateSceneStructure(projectRoot);
  if (sceneResult.exitCode !== 0) {
    errors.push(`godot.scene.validate: ${sceneResult.data?.violations.length ?? 0} violations`);
  }

  const gitignoreResult = await validateGitignore(projectRoot);
  if (gitignoreResult.exitCode !== 0) {
    errors.push(
      `godot.gitignore.validate: ${gitignoreResult.data?.violations.length ?? 0} violations`,
    );
  }

  const secretResult = await scanSecrets(projectRoot);
  if (secretResult.exitCode !== 0) {
    errors.push(`godot.secret.scan: ${secretResult.data?.violations.length ?? 0} violations`);
  }

  const configResult = await validateProjectConfig(projectRoot);
  const configWarnings = configResult.data?.violations.length ?? 0;
  if (configWarnings > 0) {
    ctx.logger.warn(`godot.project.config.validate: ${configWarnings} warnings (non-blocking)`);
  }

  const sceneRefResult = await validateSceneReferences(projectRoot);
  if (sceneRefResult.exitCode !== 0) {
    errors.push(
      `godot.scene.reference.validate: ${sceneRefResult.data?.violations.length ?? 0} violations`,
    );
  }

  const csprojResult = await validateCsproj(projectRoot);
  if (csprojResult.exitCode !== 0) {
    errors.push(`godot.csproj.validate: ${csprojResult.data?.violations.length ?? 0} violations`);
  }

  const resourceResult = await validateResources(projectRoot);
  if (resourceResult.exitCode !== 0) {
    errors.push(
      `godot.resource.validate: ${resourceResult.data?.violations.length ?? 0} violations`,
    );
  }

  const scriptResult = await validateScripts(projectRoot);
  if (scriptResult.exitCode !== 0) {
    errors.push(`godot.script.validate: ${scriptResult.data?.violations.length ?? 0} violations`);
  }

  const uidResult = await validateUids(projectRoot);
  if (uidResult.exitCode !== 0) {
    errors.push(`godot.uid.validate: ${uidResult.data?.violations.length ?? 0} violations`);
  }

  const exportPresetsResult = await validateExportPresets(projectRoot);
  if (exportPresetsResult.exitCode !== 0) {
    errors.push(
      `godot.export.presets.validate: ${exportPresetsResult.data?.violations.length ?? 0} violations`,
    );
  }

  const nugetResult = await validateNuget(projectRoot);
  if (nugetResult.exitCode !== 0) {
    errors.push(`godot.nuget.validate: ${nugetResult.data?.violations.length ?? 0} violations`);
  }

  const addonResult = await validateAddons(projectRoot);
  if (addonResult.exitCode !== 0) {
    errors.push(`godot.addon.validate: ${addonResult.data?.violations.length ?? 0} violations`);
  }

  ctx.logger.info(
    `checkGate: scene=${sceneResult.data?.status}, gitignore=${gitignoreResult.data?.status}, secrets=${secretResult.data?.status}, config=${configResult.data?.status}, scene-ref=${sceneRefResult.data?.status}, csproj=${csprojResult.data?.status}, resource=${resourceResult.data?.status}, script=${scriptResult.data?.status}, uid=${uidResult.data?.status}, export-presets=${exportPresetsResult.data?.status}, nuget=${nugetResult.data?.status}, addon=${addonResult.data?.status}`,
  );

  return {
    success: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

export { validateSceneStructure } from "./scene-validate.ts";
export { validateGitignore } from "./gitignore-validate.ts";
export { scanSecrets } from "./secret-scan.ts";
export { validateProjectConfig } from "./project-config-validate.ts";
export { validateSceneReferences } from "./scene-reference-validate.ts";
export { validateCsproj } from "./csproj-validate.ts";
export { validateResources } from "./resource-validate.ts";
export { validateScripts } from "./script-validate.ts";
export { validateUids } from "./uid-validate.ts";
export { validateExportPresets } from "./export-presets-validate.ts";
export { validateNuget } from "./nuget-validate.ts";
export { validateAddons } from "./addon-validate.ts";
