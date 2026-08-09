/*
<MODULE_CONTRACT>
<purpose>Check Warpgogol URL-first product checks (RFC-0293..0302) plus services workspace and runner rule descriptors.</purpose>
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

/** Check Warpgogol URL-first product checks (RFC-0293..0302) + services + runner. */
export const CHECK_WEBGOGOL_RULES: Record<string, RuleDescriptor> = {
  "CW-TARGET-01": rule(
    "CW-TARGET-01",
    "CheckTarget file is missing or malformed",
    "check.target.validate",
  ),
  "CW-SAFE-01": rule(
    "CW-SAFE-01",
    "CheckTarget base host is outside allowedHosts",
    "check.safety.validate",
  ),
  "CW-SAFE-02": rule(
    "CW-SAFE-02",
    "CheckTarget auth secret is not referenced indirectly",
    "check.safety.validate",
  ),
  "CW-SAFE-03": rule(
    "CW-SAFE-03",
    "AI review is enabled outside a public target policy",
    "check.safety.validate",
  ),
  "CW-ART-01": rule(
    "CW-ART-01",
    "Check run artifact is missing or malformed",
    "check.artifact.validate",
  ),
  "CW-ART-02": rule(
    "CW-ART-02",
    "Check run declares a missing artifact path",
    "check.artifact.validate",
  ),
  "CW-ART-03": rule(
    "CW-ART-03",
    "Check run artifact is outside the canonical run layout",
    "check.artifact.validate",
    "warning",
  ),
  "CW-EVID-01": rule(
    "CW-EVID-01",
    "Evidence graph or screenshot artifact is missing or malformed",
    "check.evidence.validate",
  ),
  "CW-EVID-02": rule(
    "CW-EVID-02",
    "Evidence graph hash does not match its content",
    "check.evidence.validate",
  ),
  "CW-EVID-03": rule(
    "CW-EVID-03",
    "Evidence graph contains a secret-like token",
    "check.evidence.validate",
  ),
  "CW-EVID-04": rule(
    "CW-EVID-04",
    "Evidence capture completed with an incomplete phase set",
    "check.evidence.capture",
    "warning",
  ),
  "CW-TECH-01": rule(
    "CW-TECH-01",
    "Rendered page is missing a document title",
    "check.technical.validate",
  ),
  "CW-TECH-02": rule(
    "CW-TECH-02",
    "Rendered page is missing a meta description",
    "check.technical.validate",
    "warning",
  ),
  "CW-TECH-03": rule(
    "CW-TECH-03",
    "Rendered page is missing a canonical link",
    "check.technical.validate",
    "warning",
  ),
  "CW-L10N-01": rule(
    "CW-L10N-01",
    "Rendered page is missing html lang",
    "check.localization.validate",
  ),
  "CW-A11Y-01": rule(
    "CW-A11Y-01",
    "Rendered page lacks a first-section heading",
    "check.accessibility.validate",
    "warning",
  ),
  "CW-CONTENT-01": rule(
    "CW-CONTENT-01",
    "Rendered page has very little text",
    "check.content-surface.validate",
    "warning",
  ),
  "CW-CONTENT-02": rule(
    "CW-CONTENT-02",
    "Rendered section has very little text",
    "check.content-surface.validate",
    "warning",
  ),
  "CW-REPORT-01": rule(
    "CW-REPORT-01",
    "Check report input is missing or malformed",
    "check.report.generate",
  ),
  "CW-REPORT-02": rule("CW-REPORT-02", "Check report comparison regressed", "check.compare"),
  "CW-HINT-01": rule(
    "CW-HINT-01",
    "Warpgogol check hints are missing or malformed",
    "warpgogol.check-hints.validate",
  ),
  "CW-HINT-02": rule(
    "CW-HINT-02",
    "Warpgogol check hints contain secret-like data",
    "warpgogol.check-hints.validate",
  ),
  "CW-AUD-01": rule(
    "CW-AUD-01",
    "Audience profile is missing or malformed",
    "check.audience.profile.validate",
  ),
  "CW-AUD-02": rule(
    "CW-AUD-02",
    "Audience review artifact is missing or malformed",
    "check.audience.review.validate",
  ),
  "CW-GATE-01": rule(
    "CW-GATE-01",
    "Deploy-main gate input report is missing or malformed",
    "check.deploy-main.gate",
  ),
  "CW-GATE-02": rule(
    "CW-GATE-02",
    "Deploy-main gate report error threshold failed",
    "check.deploy-main.gate",
  ),
  "CW-GATE-03": rule(
    "CW-GATE-03",
    "Deploy-main gate report warning threshold failed",
    "check.deploy-main.gate",
  ),
  "CW-APP-01": rule(
    "CW-APP-01",
    "Check Warpgogol operator app is missing a required scaffold file",
    "check-warpgogol.app.validate",
  ),
  "CW-APP-02": rule(
    "CW-APP-02",
    "Check Warpgogol operator app home copy is incomplete",
    "check-warpgogol.app.validate",
    "warning",
  ),
  "SERVICES-01": rule(
    "SERVICES-01",
    "Workspace is missing services/* glob",
    "services.workspace.validate",
  ),
  "SERVICES-02": rule(
    "SERVICES-02",
    "services/AGENTS.md is missing",
    "services.workspace.validate",
  ),
  "SERVICES-03": rule(
    "SERVICES-03",
    "Service workspace package is not private",
    "services.workspace.validate",
  ),
  "SERVICES-04": rule(
    "SERVICES-04",
    "Service workspace lacks build:check",
    "services.workspace.validate",
  ),
  "SERVICES-05": rule(
    "SERVICES-05",
    "Service workspace lacks service.config.yaml",
    "services.workspace.validate",
  ),
  "SERVICES-06": rule(
    "SERVICES-06",
    "Service workspace kind is invalid",
    "services.workspace.validate",
  ),
  "SERVICES-07": rule(
    "SERVICES-07",
    "Service workspace entry is missing",
    "services.workspace.validate",
  ),
  "SERVICES-08": rule(
    "SERVICES-08",
    "Service workspace imports apps/*",
    "services.workspace.validate",
  ),
  "SERVICES-09": rule(
    "SERVICES-09",
    "App source imports services/*",
    "services.workspace.validate",
  ),
  "SERVICES-10": rule(
    "SERVICES-10",
    "Service workspace id does not match directory",
    "services.workspace.validate",
  ),
  "SERVICES-PROJ-01": rule(
    "SERVICES-PROJ-01",
    "Business service entry is missing a display name",
    "services.projection.validate",
  ),
  "SERVICES-PROJ-02": rule(
    "SERVICES-PROJ-02",
    "Business service slug is duplicated within one language",
    "services.projection.validate",
  ),
  "SERVICES-PROJ-03": rule(
    "SERVICES-PROJ-03",
    "Business service source has both single-file and directory forms",
    "services.projection.validate",
    "warning",
  ),
  "SERVICES-PROJ-04": rule(
    "SERVICES-PROJ-04",
    "Projected semantic service id is duplicated",
    "services.projection.validate",
  ),
  "CW-RUNNER-01": rule(
    "CW-RUNNER-01",
    "Check Warpgogol runner required file is missing",
    "check-warpgogol.runner.validate",
  ),
  "CW-RUNNER-02": rule(
    "CW-RUNNER-02",
    "Check Warpgogol runner dependency is missing",
    "check-warpgogol.runner.validate",
  ),
  "CW-RUNNER-03": rule(
    "CW-RUNNER-03",
    "Check Warpgogol runner imports app code",
    "check-warpgogol.runner.validate",
  ),
  "CW-RUNNER-04": rule(
    "CW-RUNNER-04",
    "Check Warpgogol runner does not use shared run contracts",
    "check-warpgogol.runner.validate",
  ),
  "CW-RUNNER-05": rule(
    "CW-RUNNER-05",
    "Check Warpgogol app API imports runner-only code",
    "check-warpgogol.runner.validate",
  ),
  "CW-RUN-01": rule(
    "CW-RUN-01",
    "Check run completed with an incomplete phase set",
    "check.run",
    "warning",
  ),
};
