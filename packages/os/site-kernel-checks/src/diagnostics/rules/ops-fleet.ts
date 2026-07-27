/*
<MODULE_CONTRACT>
<purpose>Autonomy, review, escalation, breaker, fleet, Bordbuch, material, and text-norm diagnostic rule descriptors.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from diagnostics/rules.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import type { RuleDescriptor } from "./types.ts";
import { rule } from "./types.ts";

/** Autonomy, review, escalation, breaker, fleet, Bordbuch, material, text-norm. */
export const OPS_FLEET_RULES: Record<string, RuleDescriptor> = {
  "AUTO-01": rule(
    "AUTO-01",
    "Agent approval exceeds sanctioned autonomy level",
    "autonomy.level.validate",
  ),
  "AUTO-02": rule("AUTO-02", "Autonomy level exceeds policy ceiling", "autonomy.level.validate"),
  "AUTO-03": rule(
    "AUTO-03",
    "Autonomy promotion or level lacks calibration evidence",
    "autonomy.level.validate",
  ),
  "AUTO-04": rule(
    "AUTO-04",
    "Scope is eligible for promotion but remains lower",
    "autonomy.level.report",
    "warning",
  ),
  "AUTO-05": rule("AUTO-05", "Approval or autonomy record is malformed", "autonomy.level.validate"),
  "AUTO-06": rule(
    "AUTO-06",
    "Demotion trigger fired without lowering scope level",
    "autonomy.level.validate",
  ),
  "REV-01": rule(
    "REV-01",
    "Reviewer model/prompt equals generator model/prompt",
    "surface.review.validate",
  ),
  "REV-02": rule(
    "REV-02",
    "Reviewer approval exceeds autonomy authority",
    "surface.review.validate",
  ),
  "REV-03": rule(
    "REV-03",
    "Claims or grounded artifact approved with grounding violations",
    "surface.review.validate",
  ),
  "REV-04": rule(
    "REV-04",
    "Low-confidence review verdict was approved instead of escalated",
    "surface.review.validate",
    "warning",
  ),
  "REV-05": rule(
    "REV-05",
    "Golden set is missing or too small for calibrated status",
    "surface.review.calibrate",
  ),
  "REV-06": rule(
    "REV-06",
    "Reviewer prompt/verdict is unapproved, unpinned, or malformed",
    "surface.review.validate",
  ),
  "ESC-01": rule("ESC-01", "Escalation budget exhausted or bypassed", "escalation.budget.validate"),
  "ESC-02": rule(
    "ESC-02",
    "Resolved escalation produced no feedback",
    "escalation.budget.validate",
  ),
  "ESC-03": rule(
    "ESC-03",
    "Escalation queue is not shrinking",
    "escalation.budget.validate",
    "warning",
  ),
  "ESC-04": rule(
    "ESC-04",
    "Scope claims L4 while human-minute KPI is above threshold",
    "escalation.budget.validate",
  ),
  "ESC-05": rule(
    "ESC-05",
    "Escalation contains raw log or PII-like payload",
    "escalation.budget.validate",
  ),
  "BRK-01": rule(
    "BRK-01",
    "Expansion shipped without a reversible surface state",
    "surface.breaker.evaluate",
  ),
  "BRK-02": rule(
    "BRK-02",
    "Tripped tripwire did not freeze the affected scope",
    "surface.breaker.evaluate",
  ),
  "BRK-03": rule("BRK-03", "Rollback plan would delete a published URL", "surface.rollback.apply"),
  "BRK-04": rule(
    "BRK-04",
    "No lastKnownGood state exists for a rollback-capable scope",
    "surface.rollback.plan",
    "warning",
  ),
  "BRK-05": rule(
    "BRK-05",
    "Autonomy scope at L2 or higher has no armed breaker",
    "surface.breaker.evaluate",
  ),
  "FLEET-01": rule(
    "FLEET-01",
    "Fleet site status source is missing or unreachable",
    "fleet.status.collect",
    "warning",
  ),
  "FLEET-02": rule(
    "FLEET-02",
    "Fleet site status source is stale",
    "fleet.status.collect",
    "warning",
  ),
  "FLEET-03": rule(
    "FLEET-03",
    "Fleet scheduler clipped non-safety work by budget or fairness",
    "fleet.schedule.plan",
    "warning",
  ),
  "FLEET-04": rule("FLEET-04", "Fleet kill-switch is engaged or malformed", "fleet.killswitch"),
  "FLEET-05": rule(
    "FLEET-05",
    "Fleet membership file is missing or malformed",
    "fleet.status.collect",
  ),
  "BB-01": rule("BB-01", "Bordbuch event schema or id is invalid", "bordbuch.validate"),
  "BB-02": rule("BB-02", "Bordbuch hash-chain integrity failed", "bordbuch.validate"),
  "BB-03": rule("BB-03", "Bordbuch event contains sensitive data", "bordbuch.validate"),
  "BB-04": rule("BB-04", "Bordbuch erratum reference is invalid", "bordbuch.validate"),
  "BB-05": rule("BB-05", "Bordbuch generated projection is missing or stale", "bordbuch.validate"),
  "BB-06": rule("BB-06", "Bordbuch HTML projection is indexable", "bordbuch.validate"),
  "material.credits.missing-prose-credit": rule(
    "material.credits.missing-prose-credit",
    "Prose record has no authorship credit sidecar",
    "material.credits.validate",
    "warning",
  ),
  "material.credits.attribution-policy-lang-skew": rule(
    "material.credits.attribution-policy-lang-skew",
    "Attribution policy differs across languages",
    "material.credits.validate",
    "warning",
  ),
  "material.metadata.validate": rule(
    "material.metadata.validate",
    "Material metadata mismatch",
    "material.metadata.validate",
  ),
  "material.metadata.toolchain-missing": rule(
    "material.metadata.toolchain-missing",
    "Material metadata validation toolchain unavailable",
    "material.metadata.validate",
    "info",
  ),
  "META-01": rule(
    "META-01",
    "Missing copyright metadata in embedded IPTC/XMP fields",
    "material.metadata.validate",
  ),
  "META-02": rule(
    "META-02",
    "Credit record has a creator party but no Creator field is embedded",
    "material.metadata.validate",
  ),
  "META-03": rule(
    "META-03",
    "Embedded copyright does not match credit notice",
    "material.metadata.validate",
  ),
  "META-04": rule(
    "META-04",
    "Credit record has a license URL but no WebStatement field is embedded",
    "material.metadata.validate",
  ),
  "TEXT-NORM-01": rule(
    "TEXT-NORM-01",
    "Authored source contains text-normalization signals",
    "text.normalize.report",
    "info",
  ),

  // fleet.agent.catalog.validate — fleet agent catalog drift and integrity.
  "FAC-01": rule(
    "FAC-01",
    "Fleet agent catalog is missing, malformed, or stale",
    "fleet.agent.catalog.validate",
  ),
  "FAC-02": rule(
    "FAC-02",
    "Fleet agent catalog entry or agent.json is malformed or missing required fields",
    "fleet.agent.catalog.validate",
  ),
  "FAC-03": rule("FAC-03", "Duplicate baseUrl across fleet sites", "fleet.agent.catalog.validate"),
  "FAC-04": rule(
    "FAC-04",
    "Enabled fleet site surface is unsigned while others are signed",
    "fleet.agent.catalog.validate",
    "warning",
  ),
  "FAC-05": rule(
    "FAC-05",
    "Capability present on sites with different surfaceVersions",
    "fleet.agent.catalog.validate",
    "warning",
  ),
};
