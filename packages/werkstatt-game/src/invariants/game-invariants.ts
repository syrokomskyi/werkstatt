/*
<MODULE_CONTRACT>
<purpose>Game stack invariants GAME-01..04 surfaced to agents (RFC-0777).</purpose>
<keywords>invariants, game, phaser</keywords>
<non-goals>
  <item>Do not enforce invariants here — enforcement lives in validators.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0777: initial game stack invariants GAME-01..04.</item>
</CHANGE_SUMMARY>
*/

import type { StackInvariant } from "@warpgogol/werkstatt/plugin";

export const GAME_INVARIANTS: StackInvariant[] = [
  {
    id: "GAME-01",
    description:
      "Every scene in src/scenes/ must be registered in phaser.config.ts",
    check: "game.scenes.validate",
  },
  {
    id: "GAME-02",
    description:
      "Every asset referenced by a scene must exist in src/assets/ and be listed in the asset manifest",
    check: "game.assets.validate",
  },
  {
    id: "GAME-03",
    description:
      "Bundle size must not exceed the declared budget (default 5 MB gzipped)",
    check: "game.bundle.validate",
  },
  {
    id: "GAME-04",
    description:
      "No hardcoded API keys or secrets in game source — enforced by secret scan in checkGate",
    check: "game.secret.scan",
  },
];
