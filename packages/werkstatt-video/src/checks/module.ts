/*
<MODULE_CONTRACT>
<purpose>Video check module — registers video validators as kernel commands (RFC-0778).</purpose>
<keywords>checks, validators, video, editframe</keywords>
<non-goals>
  <item>Do not implement validator logic here — delegate to individual validator files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0778: initial video check module — registers video.composition.validate, video.assets.validate, video.render.validate, video.secret.scan.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "@warpgogol/werkstatt/kernel/types";
import { createCompositionValidateCommand } from "./composition-validate.ts";
import { createAssetsValidateCommand } from "./assets-validate.ts";
import { createRenderValidateCommand } from "./render-validate.ts";
import { createSecretScanCommand } from "./secret-scan.ts";

export function createVideoCheckModule(): KernelModule {
  return {
    name: "video-checks",
    version: "0.1.0",
    register(registry) {
      registry.registerCommand(createCompositionValidateCommand());
      registry.registerCommand(createAssetsValidateCommand());
      registry.registerCommand(createRenderValidateCommand());
      registry.registerCommand(createSecretScanCommand());
    },
  };
}
