/*
<MODULE_CONTRACT>
<purpose>Check gate composition for the Godot plugin — runs all 7 validators.</purpose>
<keywords>checkgate, validators, godot</keywords>
<responsibilities>
  <item>Defines which validators run in checkGate: all 7 (scene, gitignore, secret-scan, project-config, scene-reference, csproj, resource).</item>
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

  ctx.logger.info(
    `checkGate: scene=${sceneResult.data?.status}, gitignore=${gitignoreResult.data?.status}, secrets=${secretResult.data?.status}, config=${configResult.data?.status}, scene-ref=${sceneRefResult.data?.status}, csproj=${csprojResult.data?.status}, resource=${resourceResult.data?.status}`,
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
