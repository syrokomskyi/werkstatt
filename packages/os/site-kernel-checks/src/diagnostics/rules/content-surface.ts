/*
<MODULE_CONTRACT>
<purpose>Content Knowledge Lifecycle, programmatic surface, PSEO, demand, Werk, visibility, and content-asset diagnostic rule descriptors.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from diagnostics/rules.ts as part of the domain split.</item>
  <item>Register comparative commercial claim rule ids.</item>
  <item>Register article depth rule ids.</item>
  <item>RFC-0576: Register LINK-01..03, MIRROR-MISSING, MIRROR-01..03 for content.links.validate, mirroring.validate, page.blocks.mirror.validate.</item>
  <item>RFC-0576 review fix: Register MIRROR-CONFIG for config/setup errors in page.blocks.mirror.validate.</item>
  <item>RFC-0690: register HEADING-UNIQ-01 for surface.heading-uniqueness.validate.</item>
  <item>RFC-0696: update HEADING-UNIQ-01 description from section to block heading.</item>
</CHANGE_SUMMARY>
*/

import type { RuleDescriptor } from "./types.ts";
import { rule } from "./types.ts";

/** Content Knowledge Lifecycle, programmatic surface, PSEO, demand, Werk,
 * visibility, and content-asset rules. */
export const CONTENT_SURFACE_RULES: Record<string, RuleDescriptor> = {
  // content.claim.validate (RFC-0212) — Content Knowledge Lifecycle claim sidecar.
  "CKL-CLAIM-01": rule(
    "CKL-CLAIM-01",
    "Claim sidecar fails the recordClaims schema",
    "content.claim.validate",
  ),
  "CKL-CLAIM-02": rule(
    "CKL-CLAIM-02",
    "Annotated field path does not resolve in its record",
    "content.claim.validate",
  ),
  "CKL-CLAIM-03": rule(
    "CKL-CLAIM-03",
    "External-provenance claim has no sourceRef",
    "content.claim.validate",
    "warning",
  ),

  // content.freshness.validate (RFC-0213) — authored-content Freshness Ledger.
  "CKL-FRESH-01": rule(
    "CKL-FRESH-01",
    "Claim due for review",
    "content.freshness.validate",
    "info",
  ),
  "CKL-FRESH-02": rule(
    "CKL-FRESH-02",
    "Claim expiring soon",
    "content.freshness.validate",
    "warning",
  ),
  "CKL-FRESH-03": rule(
    "CKL-FRESH-03",
    "Claim expired (advisory)",
    "content.freshness.validate",
    "warning",
  ),
  "CKL-FRESH-04": rule(
    "CKL-FRESH-04",
    "Claim expired (blocking criticality)",
    "content.freshness.validate",
  ),
  "CKL-FRESH-05": rule(
    "CKL-FRESH-05",
    "Claim unsourced (NEED_THIS value)",
    "content.freshness.validate",
    "info",
  ),

  // content.derived.validate (RFC-0215) — derived-content staleness.
  "CKL-DERIV-01": rule(
    "CKL-DERIV-01",
    "Derived claim is outdated vs its source",
    "content.derived.validate",
    "warning",
  ),
  "CKL-DERIV-02": rule(
    "CKL-DERIV-02",
    "Derived claim has a missing/malformed source",
    "content.derived.validate",
  ),

  // content.claim.ledger.project (RFC-0217) — claim ledger integrity.
  "CKL-LEDG-01": rule(
    "CKL-LEDG-01",
    "Subject has events in the ledger but no genesis event",
    "content.claim.ledger.project",
    "warning",
  ),
  "CKL-LEDG-02": rule(
    "CKL-LEDG-02",
    "Event supersedes a non-existent event id",
    "content.claim.ledger.project",
    "warning",
  ),

  // source.binding.validate (RFC-0214) — external source binding + Truth Monitor.
  "CKL-SRC-01": rule("CKL-SRC-01", "Source descriptor fails schema", "source.binding.validate"),
  "CKL-SRC-02": rule(
    "CKL-SRC-02",
    "Claim sourceRef does not resolve to a descriptor",
    "source.binding.validate",
  ),
  "CKL-SRC-03": rule(
    "CKL-SRC-03",
    "Truth Monitor observed a divergence for a bound claim",
    "source.binding.validate",
    "warning",
  ),
  "CKL-SRC-04": rule(
    "CKL-SRC-04",
    "Source was unreachable at last monitor run",
    "source.binding.validate",
    "info",
  ),

  // comparative.claim.validate (RFC-0323) — deploy-blocking comparative commercial claims.
  "CMP-01": rule(
    "CMP-01",
    "Comparative claim sidecar or required value shape is invalid",
    "comparative.claim.validate",
  ),
  "CMP-02": rule(
    "CMP-02",
    "Comparative claim sourceRef does not resolve",
    "comparative.claim.validate",
  ),
  "CMP-03": rule(
    "CMP-03",
    "Comparative claim disclosure does not show a Stand date",
    "comparative.claim.validate",
  ),
  "CMP-04": rule(
    "CMP-04",
    "Comparative claim policy invariant failed",
    "comparative.claim.validate",
  ),
  "CMP-05": rule(
    "CMP-05",
    "Comparative claim review is due without a current verification ledger event",
    "comparative.claim.validate",
  ),
  "CMP-06": rule(
    "CMP-06",
    "Comparative claim uses broad absolute wording",
    "comparative.claim.validate",
    "warning",
  ),

  // article.depth.validate (RFC-0325) — substantive dated editorial content.
  "ART-DEPTH-01": rule(
    "ART-DEPTH-01",
    "Article date metadata is missing, invalid, or unordered",
    "article.depth.validate",
  ),
  "ART-DEPTH-02": rule(
    "ART-DEPTH-02",
    "Article body is below the normalized word-count floor",
    "article.depth.validate",
  ),
  "ART-DEPTH-03": rule(
    "ART-DEPTH-03",
    "Article H2 section lacks substantive content beneath it",
    "article.depth.validate",
  ),
  "ART-DEPTH-04": rule(
    "ART-DEPTH-04",
    "Dated article canonical URL is absent from feed.xml",
    "article.depth.validate",
  ),
  "ART-DEPTH-05": rule(
    "ART-DEPTH-05",
    "Article Markdown twin is missing lastModified provenance",
    "article.depth.validate",
  ),

  // demands.hierarchy.validate (RFC-0244) — demand folder hierarchy and slug derivation.
  "demands.hierarchy.validate": rule(
    "demands.hierarchy.validate",
    "Demand record hierarchy or derived slug mismatch",
    "demands.hierarchy.validate",
    "warning",
  ),

  // RFC-0247 app-author advisory command coverage.
  "asset.reference.validate": rule(
    "asset.reference.validate",
    "Content asset token did not resolve",
    "asset.reference.validate",
    "warning",
  ),
  "content.asset.contract.validate": rule(
    "content.asset.contract.validate",
    "Content asset token violates or misses the shared resolution contract",
    "content.asset.contract.validate",
    "warning",
  ),
  "content.surface.validate": rule(
    "content.surface.validate",
    "CMS-friendly content surface issue",
    "content.surface.validate",
    "warning",
  ),
  "surface.validate": rule(
    "surface.validate",
    "Programmatic Surface integrity or advisory issue",
    "surface.validate",
    "warning",
  ),
  "PSEO-CTX-01": rule(
    "PSEO-CTX-01",
    "PSEO module context schema is malformed",
    "surface.context.validate",
  ),
  "PSEO-CTX-02": rule(
    "PSEO-CTX-02",
    "PSEO Blueprints are declared without module contexts",
    "surface.context.validate",
  ),
  "PSEO-CTX-03": rule(
    "PSEO-CTX-03",
    "Blueprint is claimed by multiple module contexts",
    "surface.context.validate",
  ),
  "PSEO-CTX-04": rule(
    "PSEO-CTX-04",
    "Module context locale is unsupported",
    "surface.context.validate",
  ),
  "PSEO-CTX-05": rule(
    "PSEO-CTX-05",
    "Module target locale has no glossary reference",
    "surface.context.validate",
    "warning",
  ),
  "PSEO-CTX-06": rule(
    "PSEO-CTX-06",
    "Module target locale has no translator-note reference",
    "surface.context.validate",
    "warning",
  ),
  "PSEO-CTX-07": rule(
    "PSEO-CTX-07",
    "Module context would allow LLM calls during deterministic build",
    "surface.context.validate",
  ),
  "PSEO-CTX-08": rule(
    "PSEO-CTX-08",
    "Declared Blueprint has no owning module context",
    "surface.context.validate",
  ),
  "PSEO-CTX-09": rule(
    "PSEO-CTX-09",
    "PSEO module context is missing a stage declaration (RFC-0277)",
    "surface.context.validate",
  ),
  "PSEO-CTX-10": rule(
    "PSEO-CTX-10",
    "PSEO module context is missing a urlPolicy declaration (RFC-0277)",
    "surface.context.validate",
  ),
  "PSEO-EVID-01": rule(
    "PSEO-EVID-01",
    "Indexable surface page is missing required evidence",
    "surface.evidence.validate",
  ),
  "PSEO-EVID-02": rule(
    "PSEO-EVID-02",
    "Surface decision lacks evidenceGate provenance",
    "surface.evidence.validate",
    "warning",
  ),
  "PSEO-EVID-03": rule(
    "PSEO-EVID-03",
    "Surface freshness evidence is invalid",
    "surface.evidence.validate",
  ),
  "PSEO-EVID-04": rule(
    "PSEO-EVID-04",
    "Surface artifact contains a depth without a Blueprint level",
    "surface.evidence.validate",
  ),
  "PSEO-DUP-01": rule(
    "PSEO-DUP-01",
    "Surface pages are near duplicates within a comparison cluster",
    "surface.duplicate.validate",
    "warning",
  ),
  "PSEO-ART-01": rule(
    "PSEO-ART-01",
    "Ready artifact is not approved",
    "surface.translation.validate",
  ),
  "PSEO-ART-02": rule(
    "PSEO-ART-02",
    "Translated artifact lacks derived lineage",
    "surface.translation.validate",
  ),
  "PSEO-ART-03": rule(
    "PSEO-ART-03",
    "Translated artifact is outdated",
    "surface.translation.validate",
    "warning",
  ),
  "PSEO-ART-04": rule(
    "PSEO-ART-04",
    "Translation approval gate is incomplete",
    "surface.translation.validate",
  ),
  "PSEO-ART-05": rule(
    "PSEO-ART-05",
    "Translation lacks required translator note id",
    "surface.translation.validate",
  ),
  "PSEO-ART-06": rule(
    "PSEO-ART-06",
    "Translation lacks required glossary id",
    "surface.translation.validate",
  ),
  "PSEO-ART-07": rule(
    "PSEO-ART-07",
    "Claims translation lacks required human review",
    "surface.translation.qa.validate",
  ),
  "PSEO-ART-08": rule(
    "PSEO-ART-08",
    "Target-locale human review quota is not met",
    "surface.translation.qa.validate",
  ),
  "PSEO-NOTE-01": rule(
    "PSEO-NOTE-01",
    "Translator note is missing",
    "surface.translation.notes.validate",
  ),
  "PSEO-NOTE-02": rule(
    "PSEO-NOTE-02",
    "Translator note is not approved",
    "surface.translation.notes.validate",
  ),
  "PSEO-NOTE-03": rule(
    "PSEO-NOTE-03",
    "Translator note is stale",
    "surface.translation.notes.validate",
    "warning",
  ),
  "PSEO-NOTE-04": rule(
    "PSEO-NOTE-04",
    "Translator note required section is missing",
    "surface.translation.notes.validate",
  ),
  "PSEO-NOTE-05": rule(
    "PSEO-NOTE-05",
    "Translator note has no approved examples yet",
    "surface.translation.notes.validate",
    "warning",
  ),
  "PSEO-GLOSS-01": rule(
    "PSEO-GLOSS-01",
    "Required translation glossary is missing, unapproved, or stale",
    "surface.translation.glossary.validate",
  ),
  "PSEO-GLOSS-02": rule(
    "PSEO-GLOSS-02",
    "Translation glossary entry is malformed",
    "surface.translation.glossary.validate",
  ),
  "PSEO-GLOSS-03": rule(
    "PSEO-GLOSS-03",
    "Translation glossary term has no examples",
    "surface.translation.glossary.validate",
    "warning",
  ),
  "PSEO-QA-01": rule(
    "PSEO-QA-01",
    "Translated artifact dropped a required echo invariant",
    "surface.translation.qa.validate",
  ),
  "DEM-01": rule(
    "DEM-01",
    "Demand signal schema or axis resolution failed",
    "demand.signal.validate",
  ),
  "DEM-02": rule(
    "DEM-02",
    "Demand signal is stale beyond its freshness SLA",
    "demand.signal.validate",
    "warning",
  ),
  "DEM-03": rule(
    "DEM-03",
    "Demand-gated tuple has no qualifying demand signal",
    "surface.generate",
  ),
  "DEM-04": rule(
    "DEM-04",
    "Duplicate demand query binding detected",
    "demand.signal.validate",
    "warning",
  ),
  "DEM-05": rule(
    "DEM-05",
    "Demand signal contains PII-like or per-user analytics data",
    "demand.signal.validate",
  ),
  "WERK-01": rule(
    "WERK-01",
    "Werk record schema or anchored provenance failed",
    "werk.record.validate",
  ),
  "WERK-02": rule(
    "WERK-02",
    "Werk evidence lacks publish and client consent",
    "werk.record.validate",
  ),
  "WERK-03": rule(
    "WERK-03",
    "Evidence-driven tuple lacks qualifying Werk evidence",
    "surface.evidence.validate",
  ),
  "WERK-04": rule(
    "WERK-04",
    "Werk media lacks an RFC-0220 credit reference",
    "werk.record.validate",
    "warning",
  ),
  "WERK-05": rule(
    "WERK-05",
    "Werk axes do not resolve against known surface universes",
    "werk.record.validate",
    "warning",
  ),
  "PSEO-PROOF-01": rule(
    "PSEO-PROOF-01",
    "Demand-map proof input is missing or empty",
    "pseo.proof.validate",
    "warning",
  ),
  "PSEO-PROOF-02": rule(
    "PSEO-PROOF-02",
    "Demand-map proof input is malformed or mismatched",
    "pseo.proof.validate",
  ),
  "PSEO-PROOF-03": rule(
    "PSEO-PROOF-03",
    "Evidence-join proof input is missing or empty",
    "pseo.proof.validate",
    "warning",
  ),
  "PSEO-PROOF-04": rule(
    "PSEO-PROOF-04",
    "Evidence-join proof input is malformed or mismatched",
    "pseo.proof.validate",
  ),
  "PSEO-PROOF-05": rule(
    "PSEO-PROOF-05",
    "Visibility outcome proof input is missing or not enough data",
    "pseo.proof.validate",
    "warning",
  ),
  "PSEO-PROD-01": rule(
    "PSEO-PROD-01",
    "Customer-facing copy contains forbidden PSEO promise language (guaranteed indexation, index budget as SKU, destructive downgrade)",
    "pseo.product.validate",
  ),
  "PSEO-PROD-02": rule(
    "PSEO-PROD-02",
    "PSEO-related copy is missing a Notausgang/export statement for PSEO records, glossary, briefs, and reports",
    "pseo.product.validate",
  ),
  "VIS-01": rule(
    "VIS-01",
    "Visibility snapshot cannot be reconciled to generated clusters",
    "visibility.reconcile",
  ),
  "VIS-02": rule(
    "VIS-02",
    "Cluster is indexed but has zero impressions past the observation window",
    "visibility.reconcile",
    "warning",
  ),
  "VIS-03": rule(
    "VIS-03",
    "Enrich action proposed without positive demand signal",
    "visibility.action.plan",
  ),
  "VIS-04": rule(
    "VIS-04",
    "Query cannibalization detected across sibling pages",
    "visibility.reconcile",
    "warning",
  ),
  "VIS-05": rule(
    "VIS-05",
    "Visibility import contains PII or per-user analytics rows",
    "visibility.import",
  ),

  // content.links.validate (RFC-0576) — internal link and anchor validation.
  "LINK-01": rule("LINK-01", "Anchor link target not found on page", "content.links.validate"),
  "LINK-02": rule(
    "LINK-02",
    "Same-page anchor must not carry path prefix",
    "content.links.validate",
  ),
  "LINK-03": rule(
    "LINK-03",
    "Internal path does not resolve to a known route",
    "content.links.validate",
  ),

  // mirroring.validate (RFC-0576) — language mirroring enforcement (DNA-11).
  "MIRROR-MISSING": rule(
    "MIRROR-MISSING",
    "Page missing in a declared language",
    "mirroring.validate",
  ),

  // page.blocks.mirror.validate (RFC-0576) — localized block structure comparison.
  "MIRROR-01": rule(
    "MIRROR-01",
    "Localized page block missing or type mismatch vs default-language twin",
    "page.blocks.mirror.validate",
  ),
  "MIRROR-02": rule(
    "MIRROR-02",
    "Localized block missing prop vs default-language twin",
    "page.blocks.mirror.validate",
  ),
  "MIRROR-03": rule(
    "MIRROR-03",
    "Localized block labels missing key vs default-language twin",
    "page.blocks.mirror.validate",
  ),
  "MIRROR-CONFIG": rule(
    "MIRROR-CONFIG",
    "Page blocks mirror validator could not resolve site paths (missing astro config)",
    "page.blocks.mirror.validate",
  ),
  // surface.heading-uniqueness.validate (RFC-0690, RFC-0696) — duplicate block heading text on surface pages.
  "HEADING-UNIQ-01": rule(
    "HEADING-UNIQ-01",
    "Duplicate block heading text on the same surface page",
    "surface.heading-uniqueness.validate",
  ),
};
