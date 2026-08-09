/*
<MODULE_CONTRACT>
<purpose>Game check module — registers game validators as kernel commands (RFC-0777).</purpose>
<keywords>checks, validators, game, phaser</keywords>
<non-goals>
  <item>Do not implement validator logic here — delegate to individual validator files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0777: initial game check module — registers game.assets.validate, game.scenes.validate, game.bundle.validate, game.secret.scan.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/werkstatt/kernel/types";
import { createAssetsValidateCommand } from "./assets-validate.ts";
import { createScenesValidateCommand } from "./scenes-validate.ts";
import { createBundleValidateCommand } from "./bundle-validate.ts";
import { createSecretScanCommand } from "./secret-scan.ts";

export function createGameCheckModule(): KernelModule {
  return {
    name: "game-checks",
    version: "0.1.0",
    register(registry) {
      registry.registerCommand(createAssetsValidateCommand());
      registry.registerCommand(createScenesValidateCommand());
      registry.registerCommand(createBundleValidateCommand());
      registry.registerCommand(createSecretScanCommand());
    },
  };
}
