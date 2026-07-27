/*
<MODULE_CONTRACT>
<purpose>Master concatenation of all data-driven command tables into a single ALL_COMMANDS array.</purpose>
<non-goals>
  <item>Do not define new commands; only aggregate existing tables.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0348: updated header to v2 two-block contract.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import { CODEGEN_COMMANDS } from "./01-codegen.ts";
import { LAYOUT_COSMIC_COMMANDS } from "./02-layout-cosmic.ts";
import { PAGE_RUNTIME_COMMANDS } from "./03-page-runtime.ts";
import { CONTENT_QUALITY_COMMANDS } from "./04-content-quality.ts";
import { SEO_AUDIT_COMMANDS } from "./05-seo-audit.ts";
import { GROWTH_PASSPORT_COMMANDS } from "./06-growth-passport.ts";
import { STRUCTURE_NAMING_COMMANDS } from "./07-structure-naming.ts";
import { SECTION_FRAMEWORK_COMMANDS } from "./08-section-framework.ts";
import { BUILD_ARTIFACT_COMMANDS } from "./09-build-artifacts.ts";
import { INTEGRATION_FUNNEL_COMMANDS } from "./10-integration-funnel.ts";
import { COMPOSITE_COMMANDS } from "./11-pipeline-composite.ts";
import { VISUAL_CONTROL_COMMANDS } from "./12-visual-control.ts";
import { TEXT_NORMALIZE_COMMANDS } from "./13-text-normalize.ts";
import { GEO_COMMANDS } from "./14-geo.ts";
import { DEMAND_COMMANDS } from "./15-demand.ts";
import { OFFER_COMMANDS } from "./16-offer.ts";
import { GOVERNANCE_CHECKS_COMMANDS } from "./governance-checks.ts";
import { ECOSYSTEM_COMMANDS } from "./20-ecosystem.ts";
import { BUILD_INFRA_COMMANDS } from "./build-infra.ts";
import { PRINT_COMMANDS } from "./22-print.ts";
import { FLEET_BORDBUCH_COMMANDS } from "./fleet-bordbuch.ts";
import { PSEO_GOVERNANCE_COMMANDS } from "./26-pseo-governance.ts";
import { PSEO_VISIBILITY_BREAKER_COMMANDS } from "./27-pseo-visibility-breaker.ts";
import { AGENT_SURFACE_COMMANDS } from "./29-agent-surface.ts";
import { CHECK_WEBGOGOL_COMMANDS } from "./30-check-warpgogol.ts";
import { PUBLIC_SURFACE_COMMANDS } from "./31-public-surface.ts";
import { ANALYTICS_MATOMO_COMMANDS } from "./32-analytics-matomo.ts";
import { INFRA_CONTRACTS_COMMANDS } from "./infra-contracts.ts";

export const ALL_COMMANDS: CheckCommandEntry[] = [
  ...CODEGEN_COMMANDS,
  ...LAYOUT_COSMIC_COMMANDS,
  ...PAGE_RUNTIME_COMMANDS,
  ...CONTENT_QUALITY_COMMANDS,
  ...SEO_AUDIT_COMMANDS,
  ...GROWTH_PASSPORT_COMMANDS,
  ...STRUCTURE_NAMING_COMMANDS,
  ...SECTION_FRAMEWORK_COMMANDS,
  ...BUILD_ARTIFACT_COMMANDS,
  ...INTEGRATION_FUNNEL_COMMANDS,
  ...COMPOSITE_COMMANDS,
  ...VISUAL_CONTROL_COMMANDS,
  ...TEXT_NORMALIZE_COMMANDS,
  ...GEO_COMMANDS,
  ...DEMAND_COMMANDS,
  ...OFFER_COMMANDS,
  ...GOVERNANCE_CHECKS_COMMANDS,
  ...ECOSYSTEM_COMMANDS,
  ...BUILD_INFRA_COMMANDS,
  ...PRINT_COMMANDS,
  ...FLEET_BORDBUCH_COMMANDS,
  ...PSEO_GOVERNANCE_COMMANDS,
  ...PSEO_VISIBILITY_BREAKER_COMMANDS,
  ...AGENT_SURFACE_COMMANDS,
  ...CHECK_WEBGOGOL_COMMANDS,
  ...PUBLIC_SURFACE_COMMANDS,
  ...ANALYTICS_MATOMO_COMMANDS,
  ...INFRA_CONTRACTS_COMMANDS,
];
