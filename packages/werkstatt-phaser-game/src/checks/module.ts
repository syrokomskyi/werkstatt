/*
<MODULE_CONTRACT>
<purpose>Phaser check module — registers Phaser validators as kernel commands.</purpose>
<keywords>checks, validators, phaser</keywords>
<non-goals>
  <item>Do not implement validator logic here — delegate to individual validator files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial Phaser check module — registers phaser.assets.validate, phaser.scenes.validate, phaser.bundle.validate, phaser.secret.scan.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/werkstatt/kernel/types";
import { createAssetsValidateCommand } from "./assets-validate.ts";
import { createScenesValidateCommand } from "./scenes-validate.ts";
import { createBundleValidateCommand } from "./bundle-validate.ts";
import { createSecretScanCommand } from "./secret-scan.ts";

export function createPhaserCheckModule(): KernelModule {
  return {
    name: "phaser-checks",
    version: "0.1.0",
    register(registry) {
      registry.registerCommand(createAssetsValidateCommand());
      registry.registerCommand(createScenesValidateCommand());
      registry.registerCommand(createBundleValidateCommand());
      registry.registerCommand(createSecretScanCommand());
    },
  };
}
