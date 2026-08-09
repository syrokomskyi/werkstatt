/*
<MODULE_CONTRACT>
<purpose>Consolidated command table for governance checks: entitlement, HDRI firewall, and Bodenstation voice validation.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Merged 17-entitlement.ts, 18-hdri.ts, 19-bodenstation.ts into governance-checks.ts.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import { runEntitlementModuleValidate } from "../entitlement-module.ts";
import { runTrustRatingValidate } from "../trust-rating.ts";
import { runHdriFirewallValidate } from "../hdri-firewall.ts";
import { runBodenstationVoiceValidate } from "../bodenstation-voice.ts";

export const GOVERNANCE_CHECKS_COMMANDS: CheckCommandEntry[] = [
  {
    name: "entitlement.module.validate",
    description:
      "Validate that compiled blueprints/modules are covered by resolved entitlements. RFC-0240.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/**/*.md"],
    execute: runEntitlementModuleValidate,
  },
  {
    name: "trust.rating.validate",
    description:
      "Forbid aggregateRating on Bodenstation; require provenance-backed reviews on Sternsystem. RFC-0240.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/**/*.md"],
    execute: runTrustRatingValidate,
  },
  {
    name: "hdri.firewall.validate",
    description:
      "Forbid HDRI ownership/branding signals on the site; HDRI must be cited as external, never presented as a studio project. RFC-0241.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/**/*.md"],
    execute: runHdriFirewallValidate,
  },
  {
    name: "bodenstation.voice.validate",
    description:
      "Enforce Bodenstation voice rules: no LocalBusiness, no aggregateRating, no impersonation. RFC-0242.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/content/**/*.md"],
    execute: runBodenstationVoiceValidate,
  },
];
