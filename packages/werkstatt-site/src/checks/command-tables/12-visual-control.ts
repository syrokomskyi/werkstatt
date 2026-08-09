/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/12-visual-control.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0233: introduce the visual-control command table.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import { runVisualContractValidate, runVisualReport, runVisualRulesList } from "../visual/index.ts";

export const VISUAL_CONTROL_COMMANDS: CheckCommandEntry[] = [
  /* RFC-0233: Tier-1 positional visual invariants — gates build.check. */
  {
    name: "visual.contract.validate",
    description:
      "Per-app: enforce Tier-1 positional visual invariants over authored pages in page context. VIS-BG-01/02 (edge-merge fade must be on the last/first block) gate the build; VIS-BG-03 (adjacent duplicate background) warns. Federates RFC-0203 Diagnostics under the `visual` domain (RFC-0233).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/system.md",
      "<app>/src/content/**/*.md",
      "<app>/src/content/**/*.yaml",
    ],
    execute: runVisualContractValidate,
    gate: {
      severity: "mixed",
      phase: "author",
      conditional: {
        kind: "config",
        ref: "system.md visual.gate",
        description: "VIS-BG-01/02 error, VIS-BG-03 warning",
      },
    },
  },
  {
    name: "visual.report",
    description:
      "Per-app: report the full visual posture (all visual findings incl. warnings) without gating the build. Advisory — always exits 0 (RFC-0233).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/system.md",
      "<app>/src/content/**/*.md",
      "<app>/src/content/**/*.yaml",
    ],
    execute: runVisualReport,
  },
  {
    name: "visual.rules.list",
    description:
      "Enumerate the visual rule registry (id, tier, severity-class, default gating) so an agent discovers the visual contract without reading source. Advisory — always exits 0 (RFC-0233).",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runVisualRulesList,
  },
];
