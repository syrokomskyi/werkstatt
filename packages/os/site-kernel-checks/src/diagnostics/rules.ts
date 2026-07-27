/*
<MODULE_CONTRACT>
<purpose>
RFC-0203 rule-id registry. The flat source of truth for every stable Diagnostic
`ruleId` the ecosystem may emit from a migrated check. diagnostic.shape.lint
(DSL-02) fails when a migrated check emits a ruleId that is not registered here.

Split (RFC-0303 Phase 3) into a folder-of-files under `rules/` by domain.
This file is the thin assembly shim that re-exports the merged registry and
the helper functions; the individual rule descriptors live in:
  rules/types.ts          — shared types + the `rule()` factory
  rules/core-infra.ts     — DSL, KEL, pipeline, kernel, registry, biome, props
  rules/check-warpgogol.ts — CW-*, SERVICES-*, CW-RUNNER-*
  rules/content-surface.ts — CKL, PSEO, DEM, WERK, VIS, surface
  rules/ops-fleet.ts      — AUTO, REV, ESC, BRK, FLEET, BB, material
  rules/governance.ts     — ecosystem, workspace, test.signal, MDQ, CI
  rules/section-agent.ts  — section defaults, VIS-BG, WS-WRITE, RC, HDRI, AGS/AGK/AGC/AGO, GITATTR
</purpose>
<non-goals>
  <item>Do not enumerate ids for unmigrated checks still on the resultFromViolations shim.</item>
  <item>Do not encode rule logic — only identity and metadata.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0203: introduce the rule-id registry seeded with DSL, KEL, registry, and biome-token ids.</item>
  <item>RFC-0233: add domain/tier/severityClass facets + the VIS-BG-* visual-control rules and listVisualRules().</item>
  <item>RFC-0246: Register Agent Control Plane drift and workspace surface rule ids.</item>
  <item>RFC-0249: Register autonomous CI gate and test signal rule ids.</item>
  <item>RFC-0251: Register test signal policy and maintenance debt baseline rule ids.</item>
  <item>RFC-0256: Register advisory maintenance debt queue validation rule ids.</item>
  <item>Register TEXT-NORM-01 because maintenance planning now references the deferred text-normalization class directly.</item>
  <item>RFC-0258: register WS-WRITE-01/WS-WRITE-02 for workspace.write.boundary.lint.</item>
  <item>RFC-0260: register KERNEL-FLAG-01..05 for typed kernel command flag schemas.</item>
  <item>RFC-0261: register DSL-04, CHECK-FIX-01..03, and the first shim-migration batch (RC-*, CF-RESIDENCY-*, HDRI-*).</item>
  <item>RFC-0259: register CACHE-PARITY-01/02 for pipeline.cache.parity.</item>
  <item>RFC-0262: register PROPS-01/02 for props.contract.validate and PAGE-PROPS-01 for the buildPage dev-time validateProps hook.</item>
  <item>RFC-0263: register COSMIC-LIT-01 for cosmic.literals.lint.</item>
  <item>RFC-0264: register BARREL-01/02 for barrel.size.lint.</item>
  <item>RFC-0265: register COMMIT-01..04 for commit.message.lint (implemented in @warpgogol/site-kernel, not scanned by diagnostic.shape.lint's checksDir — registered here for the canonical rule-id catalog only).</item>
  <item>RFC-0270: register TIME-01/TIME-02 for pipeline.timeout.validate's telemetry-derived budget comparison.</item>
  <item>RFC-0268: register RFC-ACC-01/RFC-ACC-02 for rfc.acceptance.run.</item>
  <item>RFC-0269: register SNAP-01/SNAP-02 for behavior.snapshot.validate.</item>
  <item>RFC-0266: register CMD-MAN-01/02/03 for command.manifest.validate.</item>
  <item>RFC-0267: register IO-01 for kernel.io.lint and KERNEL-META-01 for the executor's read-only WorkspaceIO adapter.</item>
  <item>RFC-0286: register AGS-01..06 for agent.surface.validate.</item>
  <item>RFC-0287: register AGK-01..05 for agent.knowledge.validate.</item>
  <item>RFC-0288: register AGC-01..05 for agent.capability.validate (AGC-06 field-level check deferred — no field-mapping data available yet, noted in RFC-0288 Risks).</item>
  <item>RFC-0289: register AGO-01..04 for agent.openapi.validate.</item>
  <item>RFC-0303: register WALK-01/DEDUP-01/SIZE-01 for fs.walk.lint/dedup.helper.lint/file.size.lint.</item>
  <item>RFC-0303 Phase 3: split the flat registry into domain sub-modules under rules/; this file is now the assembly shim.</item>
</CHANGE_SUMMARY>
*/

export type { RuleDomain, RuleSeverityClass, RuleDescriptor } from "./rules/types.ts";

import { CORE_INFRA_RULES } from "./rules/core-infra.ts";
import { CHECK_WEBGOGOL_RULES } from "./rules/check-warpgogol.ts";
import { CONTENT_SURFACE_RULES } from "./rules/content-surface.ts";
import { OPS_FLEET_RULES } from "./rules/ops-fleet.ts";
import { GOVERNANCE_RULES } from "./rules/governance.ts";
import { SECTION_AGENT_RULES } from "./rules/section-agent.ts";
import type { RuleDescriptor } from "./rules/types.ts";

/**
 * The canonical rule-id registry. Add an entry in the relevant domain sub-module
 * when a migrated check emits a new ruleId. Unmigrated checks on the
 * resultFromViolations shim do NOT need entries — they emit the command name as
 * a coarse id (RFC-0203).
 */
export const DIAGNOSTIC_RULES: Record<string, RuleDescriptor> = {
  ...CORE_INFRA_RULES,
  ...CHECK_WEBGOGOL_RULES,
  ...CONTENT_SURFACE_RULES,
  ...OPS_FLEET_RULES,
  ...GOVERNANCE_RULES,
  ...SECTION_AGENT_RULES,
};

/** RFC-0233: every rule tagged into a visual-control domain, sorted by id. */
export function listVisualRules(): RuleDescriptor[] {
  return Object.values(DIAGNOSTIC_RULES)
    .filter((r) => r.domain === "visual")
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function isRegisteredRuleId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(DIAGNOSTIC_RULES, id);
}

export function listRuleIds(): string[] {
  return Object.keys(DIAGNOSTIC_RULES).sort();
}
