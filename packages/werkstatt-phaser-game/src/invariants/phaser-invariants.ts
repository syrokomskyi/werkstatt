/*
<MODULE_CONTRACT>
<purpose>Phaser stack invariants PHASER-01..04 surfaced to agents.</purpose>
<keywords>invariants, phaser, game</keywords>
<non-goals>
  <item>Do not enforce invariants here — enforcement lives in validators.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial Phaser stack invariants PHASER-01..04.</item>
</CHANGE_SUMMARY>
*/

import type { StackInvariant } from "@warpgogol/werkstatt/plugin";

export const PHASER_INVARIANTS: StackInvariant[] = [
  {
    id: "PHASER-01",
    description:
      "Every scene in src/scenes/ must be registered in phaser.config.ts",
    check: "phaser.scenes.validate",
  },
  {
    id: "PHASER-02",
    description:
      "Every asset referenced by a scene must exist in src/assets/ and be listed in the asset manifest",
    check: "phaser.assets.validate",
  },
  {
    id: "PHASER-03",
    description:
      "Bundle size must not exceed the declared budget (default 5 MB gzipped)",
    check: "phaser.bundle.validate",
  },
  {
    id: "PHASER-04",
    description:
      "No hardcoded API keys or secrets in game source — enforced by secret scan in checkGate",
    check: "phaser.secret.scan",
  },
];
