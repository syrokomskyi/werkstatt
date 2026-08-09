/*
<MODULE_CONTRACT>
<purpose>Section defaults, semantic targets, runtime warnings, visual background contract, workspace write boundary, root canonical, Cloudflare residency, HDRI firewall, agent surface/knowledge/capability/openapi, and generated-artifact gitattributes governance diagnostic rule descriptors.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from diagnostics/rules.ts as part of the domain split.</item>
  <item>Register Agent Knowledge hardening plus canonical URL and update-stamp rule ids.</item>
</CHANGE_SUMMARY>
*/

import type { RuleDescriptor } from "./types.ts";
import { rule } from "./types.ts";

/** Section defaults, semantic targets, runtime warnings, visual background
 * contract, workspace write boundary, root canonical, Cloudflare residency,
 * HDRI firewall, agent surface/knowledge/capability/openapi, and
 * generated-artifact gitattributes governance. */
export const SECTION_AGENT_RULES: Record<string, RuleDescriptor> = {
  // RFC-0250 — runtime section fallback and semantic-target diagnostics.
  "SECTION-DEFAULT-01": rule(
    "SECTION-DEFAULT-01",
    "Shared section uses an app-specific asset fallback",
    "section.defaults.validate",
  ),
  "SECTION-DEFAULT-02": rule(
    "SECTION-DEFAULT-02",
    "Shared section uses an app-specific pageId fallback",
    "section.defaults.validate",
  ),
  "SECTION-DEFAULT-03": rule(
    "SECTION-DEFAULT-03",
    "Fallback registry entry cannot be validated by any app",
    "section.defaults.validate",
  ),
  "SECTION-DEFAULT-04": rule(
    "SECTION-DEFAULT-04",
    "Legacy fallback comment has no migration path",
    "section.defaults.validate",
  ),
  "SEM-TARGET-01": rule(
    "SEM-TARGET-01",
    "Content-authored pageId target does not exist",
    "semantic.targets.validate",
  ),
  "SEM-TARGET-02": rule(
    "SEM-TARGET-02",
    "Section default pageId target does not exist for this app",
    "semantic.targets.validate",
  ),
  "SEM-TARGET-03": rule(
    "SEM-TARGET-03",
    "pageId target has no route for the requested language",
    "semantic.targets.validate",
  ),
  "SEM-TARGET-04": rule(
    "SEM-TARGET-04",
    "Generated surface page contains an invalid CTA target",
    "semantic.targets.validate",
  ),
  "RUNTIME-WARN-01": rule(
    "RUNTIME-WARN-01",
    "Missing asset runtime warning lacks static diagnostic coverage",
    "runtime.warnings.lint",
  ),
  "RUNTIME-WARN-02": rule(
    "RUNTIME-WARN-02",
    "Missing route runtime warning lacks static diagnostic coverage",
    "runtime.warnings.lint",
  ),
  "RUNTIME-WARN-03": rule(
    "RUNTIME-WARN-03",
    "Actionable runtime warning lacks rule-id documentation",
    "runtime.warnings.lint",
  ),

  // visual.contract.validate (RFC-0233) — Visual Control System, Tier 1.
  "VIS-BG-01": rule(
    "VIS-BG-01",
    "End-edge fade background is not on the last rendered block",
    "visual.contract.validate",
    "error",
    { domain: "visual", tier: 1, severityClass: "deterministic" },
  ),
  "VIS-BG-02": rule(
    "VIS-BG-02",
    "Start-edge fade background is not on the first rendered block",
    "visual.contract.validate",
    "error",
    { domain: "visual", tier: 1, severityClass: "deterministic" },
  ),
  "VIS-BG-03": rule(
    "VIS-BG-03",
    "Adjacent blocks declare an identical non-transparent background",
    "visual.contract.validate",
    "warning",
    { domain: "visual", tier: 1, severityClass: "heuristic" },
  ),
  "VIS-BG-04": rule(
    "VIS-BG-04",
    "More than one site-background declared on a page (federated to site.background.contract.validate)",
    "site.background.contract.validate",
    "error",
    { domain: "visual", tier: 1, severityClass: "deterministic" },
  ),

  // workspace.write.boundary.lint (RFC-0258) — atomic + allowlisted workspace-shared writes.
  "WS-WRITE-01": rule(
    "WS-WRITE-01",
    "Undeclared workspace-shared write reachable from an APPS_* pipeline",
    "workspace.write.boundary.lint",
  ),
  "WS-WRITE-02": rule(
    "WS-WRITE-02",
    "Allowlisted shared-write module bypasses writeFileAtomic",
    "workspace.write.boundary.lint",
  ),

  // RFC-0261 first migration batch: fine-grained ruleIds replacing the coarse
  // command-name-as-ruleId shim.
  "RC-00": rule("RC-00", "Root entry page (index.astro) is missing", "root.canonical.validate"),
  "RC-01": rule(
    "RC-01",
    'Root page emits a <meta http-equiv="refresh"> stub instead of rendering content',
    "root.canonical.validate",
  ),
  "RC-02": rule("RC-02", "Root page does not call resolvePageRoute()", "root.canonical.validate"),
  "RC-03": rule(
    "RC-03",
    'Root page passes a canonicalUrl override (RFC-0160: "/" is self-canonical)',
    "root.canonical.validate",
  ),
  "CF-RESIDENCY-01": rule(
    "CF-RESIDENCY-01",
    "wrangler config declares kv_namespaces (forbidden, RFC-0181)",
    "cloudflare.residency.validate",
  ),
  "CF-RESIDENCY-02": rule(
    "CF-RESIDENCY-02",
    "wrangler config declares queues (forbidden, RFC-0181)",
    "cloudflare.residency.validate",
  ),
  "HDRI-01": rule(
    "HDRI-01",
    "Content contains an HDRI ownership/branding signal (RFC-0241)",
    "hdri.firewall.validate",
  ),
  "HDRI-02": rule(
    "HDRI-02",
    "HDRI-sourced claim lacks provenance: external + a validity window (RFC-0241)",
    "hdri.firewall.validate",
  ),

  // agent.surface.validate — Agent Surface Manifest invariants (RFC-0286).
  "AGS-01": rule(
    "AGS-01",
    "Knowledge ref domain violates BUSINESS_DOMAIN_VISIBILITY (not public)",
    "agent.surface.validate",
  ),
  "AGS-02": rule(
    "AGS-02",
    "Manifest references a knowledge/OpenAPI file that does not exist",
    "agent.surface.validate",
  ),
  "AGS-03": rule(
    "AGS-03",
    "A generated agent artifact exists that the manifest does not reference",
    "agent.surface.validate",
  ),
  "AGS-04": rule(
    "AGS-04",
    "Manifest advertises an action while agent.actions is not a resolved entitlement",
    "agent.surface.validate",
  ),
  "AGS-05": rule(
    "AGS-05",
    "Manifest contentHash mismatch, or public mirror diverges from the internal manifest",
    "agent.surface.validate",
  ),
  "AGS-06": rule(
    "AGS-06",
    "agent.enabled is false but agent surface artifacts still exist on disk",
    "agent.surface.validate",
    "warning",
  ),
  "AGS-07": rule(
    "AGS-07",
    "Manifest and generated Agent Gate route files (MCP/action) are out of sync",
    "agent.surface.validate",
  ),

  // agent.knowledge.validate — Agent Surface knowledge tier (RFC-0287).
  "AGK-01": rule(
    "AGK-01",
    "Knowledge file leaks a non-public business value",
    "agent.knowledge.validate",
  ),
  "AGK-02": rule(
    "AGK-02",
    "Knowledge envelope is invalid (bad schema tag, missing/malformed contentHash)",
    "agent.knowledge.validate",
  ),
  "AGK-03": rule(
    "AGK-03",
    "Knowledge file set has drifted from the populated/disabled domain set",
    "agent.knowledge.validate",
  ),
  "AGK-04": rule(
    "AGK-04",
    "Knowledge file data has drifted from what the projectors currently produce",
    "agent.knowledge.validate",
  ),
  "AGK-05": rule(
    "AGK-05",
    "Freshness ledger covers this domain but the file predates it",
    "agent.knowledge.validate",
    "warning",
  ),
  "AGK-06": rule(
    "AGK-06",
    "Knowledge payload contains an empty string value",
    "agent.knowledge.validate",
  ),
  "AGK-07": rule(
    "AGK-07",
    "Knowledge payload contains an empty skeleton object or array",
    "agent.knowledge.validate",
  ),
  "AGK-08": rule(
    "AGK-08",
    "Knowledge payload freshness metadata is missing or not source-backed",
    "agent.knowledge.validate",
  ),
  "AGK-09": rule(
    "AGK-09",
    "Knowledge payload URL does not resolve to a generated static output",
    "agent.knowledge.validate",
  ),
  "AGK-10": rule(
    "AGK-10",
    "Knowledge payload shape changed without a schema tag bump",
    "agent.knowledge.validate",
  ),

  // agent.capability.validate — closed capability catalog (RFC-0288).
  "AGC-01": rule(
    "AGC-01",
    "Capability catalog record invalid (schema, id/filename mismatch, duplicate id)",
    "agent.capability.validate",
  ),
  "AGC-02": rule(
    "AGC-02",
    "Capability integration.eventKind/source is invalid",
    "agent.capability.validate",
  ),
  "AGC-03": rule(
    "AGC-03",
    "Active capability's humanEquivalent section does not render anywhere (AS-2)",
    "agent.capability.validate",
  ),
  "AGC-04": rule(
    "AGC-04",
    "Active capability requires a section that does not render",
    "agent.capability.validate",
  ),
  "AGC-05": rule(
    "AGC-05",
    "agent.actionsDisabled names an unknown capability id",
    "agent.capability.validate",
  ),

  // agent.openapi.validate — OpenAPI projection of the Agent Surface (RFC-0289).
  "AGO-01": rule(
    "AGO-01",
    "OpenAPI document missing, unparseable, or wrong openapi version",
    "agent.openapi.validate",
  ),
  "AGO-02": rule(
    "AGO-02",
    "OpenAPI document path/manifest ref bijection broken",
    "agent.openapi.validate",
  ),
  "AGO-03": rule(
    "AGO-03",
    "OpenAPI info.version/x-gogol-content-hash disagrees with the manifest",
    "agent.openapi.validate",
  ),
  "AGO-04": rule(
    "AGO-04",
    "Action request/response schema diverges from the capability record",
    "agent.openapi.validate",
  ),

  // canonical.url.validate / content.update-stamps.validate (RFC-0317).
  "CANON-01": rule(
    "CANON-01",
    "Sitemap URL is absent from the expected canonical URL set",
    "canonical.url.validate",
    "warning",
  ),
  "CANON-02": rule(
    "CANON-02",
    "Feed URL is absent from the expected canonical URL set",
    "canonical.url.validate",
    "warning",
  ),
  "CANON-03": rule(
    "CANON-03",
    "llms.txt URL is absent from the expected canonical URL set",
    "canonical.url.validate",
    "warning",
  ),
  "STAMP-01": rule(
    "STAMP-01",
    "Sitemap lastmod is missing its source-backed update stamp",
    "content.update-stamps.validate",
  ),
  "STAMP-02": rule(
    "STAMP-02",
    "Sitemap lastmod is not a valid ISO date",
    "content.update-stamps.validate",
  ),
  "STAMP-03": rule(
    "STAMP-03",
    "Sitemap lastmod drifts from the source-backed update stamp",
    "content.update-stamps.validate",
  ),
  "STAMP-04": rule(
    "STAMP-04",
    "Sitemap lastmod exists for a page that declares no source-backed update stamp",
    "content.update-stamps.validate",
  ),

  // RFC-0336: generated-artifact .gitattributes governance + hand-edit guard.
  "GITATTR-01": rule(
    "GITATTR-01",
    "Managed generated-artifacts block in .gitattributes is missing or stale vs the live registries",
    "gitattributes.validate",
  ),
  "GITATTR-02": rule(
    "GITATTR-02",
    "Managed generated-artifacts block contains the right patterns but is unsorted/non-normalized",
    "gitattributes.validate",
  ),
  "GITATTR-03": rule(
    "GITATTR-03",
    "Tracked file carries GENERATED_MARKER but is not covered by any managed .gitattributes pattern",
    "gitattributes.validate",
    "warning",
  ),
  "GEN-EDIT-01": rule(
    "GEN-EDIT-01",
    "Generated file carrying GENERATED_MARKER was edited without its owning generator/template changing in the same range",
    "generated.edit.guard",
  ),
  "GEN-EDIT-02": rule(
    "GEN-EDIT-02",
    "GENERATED_MARKER removed from a still-generator-owned file without a documented conversion",
    "generated.edit.guard",
  ),
};
