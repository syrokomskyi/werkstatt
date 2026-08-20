/*
<MODULE_CONTRACT>
<purpose>Godot check module — registers Godot validators as kernel commands.</purpose>
<keywords>checks, validators, godot</keywords>
<non-goals>
  <item>Do not implement validator logic here — delegate to individual validator files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial Godot check module — registers godot.scene.validate, godot.gitignore.validate, godot.secret.scan, godot.project.config.validate.</item>
  <item>Enhancement: register godot.scene.reference.validate, godot.csproj.validate, godot.resource.validate.</item>
  <item>Enhancement: register godot.script.validate, godot.export.presets.validate, godot.uid.validate, godot.nuget.validate.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/werkstatt/kernel/types";
import { createSceneValidateCommand } from "./scene-validate.ts";
import { createGitignoreValidateCommand } from "./gitignore-validate.ts";
import { createSecretScanCommand } from "./secret-scan.ts";
import { createProjectConfigValidateCommand } from "./project-config-validate.ts";
import { createSceneReferenceValidateCommand } from "./scene-reference-validate.ts";
import { createCsprojValidateCommand } from "./csproj-validate.ts";
import { createResourceValidateCommand } from "./resource-validate.ts";
import { createScriptValidateCommand } from "./script-validate.ts";
import { createUidValidateCommand } from "./uid-validate.ts";
import { createExportPresetsValidateCommand } from "./export-presets-validate.ts";
import { createNugetValidateCommand } from "./nuget-validate.ts";
import { createAddonValidateCommand } from "./addon-validate.ts";

export function createGodotCheckModule(): KernelModule {
  return {
    name: "godot-checks",
    version: "0.4.0",
    register(registry) {
      registry.registerCommand(createSceneValidateCommand());
      registry.registerCommand(createGitignoreValidateCommand());
      registry.registerCommand(createSecretScanCommand());
      registry.registerCommand(createProjectConfigValidateCommand());
      registry.registerCommand(createSceneReferenceValidateCommand());
      registry.registerCommand(createCsprojValidateCommand());
      registry.registerCommand(createResourceValidateCommand());
      registry.registerCommand(createScriptValidateCommand());
      registry.registerCommand(createUidValidateCommand());
      registry.registerCommand(createExportPresetsValidateCommand());
      registry.registerCommand(createNugetValidateCommand());
      registry.registerCommand(createAddonValidateCommand());
    },
  };
}
