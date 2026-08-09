/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/command-tables/16-offer.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0239: add offer.provider.validate command registration.</item>
  <item>RFC-0373: add services.projection.validate command registration.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import { runOfferCapacityValidate } from "../offer-capacity.ts";
import { runOfferProviderValidate } from "../offer-provider.ts";
import { runServicesProjectionValidate } from "../services-projection.ts";

export const OFFER_COMMANDS: CheckCommandEntry[] = [
  {
    name: "offer.capacity.validate",
    description:
      "Validate structured offer capacity waves and frozen public availability safety. RFC-0322.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/offers/**/*.md", "<app>/src/content/system.md"],
    execute: runOfferCapacityValidate,
  },
  {
    name: "offer.provider.validate",
    description:
      "Ensure every offer page provider equals the site's own business profile. RFC-0239.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/offers/**/*.md", "<app>/src/content/system.md"],
    execute: runOfferProviderValidate,
  },
  {
    name: "services.projection.validate",
    description:
      "Validate business services projection: schema compliance, slug uniqueness, no orphan files. RFC-0373.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/services/**/*.md", "<app>/src/content/system.md"],
    execute: runServicesProjectionValidate,
  },
];
