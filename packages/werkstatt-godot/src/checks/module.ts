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
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/werkstatt/kernel/types";
import { createSceneValidateCommand } from "./scene-validate.ts";
import { createGitignoreValidateCommand } from "./gitignore-validate.ts";
import { createSecretScanCommand } from "./secret-scan.ts";
import { createProjectConfigValidateCommand } from "./project-config-validate.ts";

export function createGodotCheckModule(): KernelModule {
  return {
    name: "godot-checks",
    version: "0.1.0",
    register(registry) {
      registry.registerCommand(createSceneValidateCommand());
      registry.registerCommand(createGitignoreValidateCommand());
      registry.registerCommand(createSecretScanCommand());
      registry.registerCommand(createProjectConfigValidateCommand());
    },
  };
}
