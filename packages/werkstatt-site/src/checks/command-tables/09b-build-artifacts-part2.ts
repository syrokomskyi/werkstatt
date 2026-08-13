/*
<MODULE_CONTRACT>
<purpose>Second half of the build-artifact command table — surface, PSEO, enrich, feed, CMS, AI, robots, env commands.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split second half of BUILD_ARTIFACT_COMMANDS from 09-build-artifacts.ts into 09b-build-artifacts-part2.ts.</item>
</CHANGE_SUMMARY>
*/

import type { CheckCommandEntry } from "./types.ts";
import {
  runSurfaceGenerate,
  runSurfaceValidate,
  runSurfaceFreshness,
  runSurfaceStarmap,
} from "../surface.ts";
import { runSurfaceHubValidate } from "../surface-hub-validate.ts";
import { runSurfaceIndustryValidate } from "../surface-industry-validate.ts";
import { runSurfaceServiceValidate } from "../surface-service-validate.ts";
import { runSurfaceIntersectionValidate } from "../surface-intersection-validate.ts";
import { runSurfaceIntersectionReport } from "../surface-intersection-report.ts";
import { runSurfaceMediaLeakageValidate } from "../surface-media-leakage-validate.ts";
import { runSurfaceHeadingUniquenessValidate } from "../surface-heading-uniqueness.ts";
import { runA11yLabelInNameValidate } from "../a11y-label-in-name.ts";
import { runRatgeberHubValidate } from "../ratgeber-hub-validate.ts";
import { runRatgeberArticleValidate } from "../ratgeber-article-validate.ts";
import { runRatgeberProvenanceValidate } from "../ratgeber-provenance-validate.ts";
import { runRatgeberClaimValidate } from "../ratgeber-claim-validate.ts";
import { runRatgeberPolicyValidate } from "../ratgeber-policy-validate.ts";
import { runSurfaceDoorwayRiskReport } from "../surface-doorway-risk.ts";
import { runSurfaceDuplicateContentReport } from "../surface-duplicate-content.ts";
import { runSurfaceContextValidate } from "../pseo/pseo-module-context.ts";
import { runBlueprintValidate } from "../blueprint.ts";
import { runPseoValidate } from "../pseo/pseo.ts";
import { runPseoProofValidate } from "../pseo/pseo-proof.ts";
import { runPseoExperimentPlan, runPseoProductValidate } from "../pseo/pseo-product.ts";
import { runSurfaceDuplicateValidate, runSurfaceEvidenceValidate } from "../surface-quality.ts";
import {
  runSurfaceArtifactReady,
  runSurfaceTranslationGenerate,
  runSurfaceTranslationGlossaryGenerate,
  runSurfaceTranslationGlossaryValidate,
  runSurfaceTranslationNotesGenerate,
  runSurfaceTranslationNotesReview,
  runSurfaceTranslationNotesValidate,
  runSurfaceTranslationQaValidate,
  runSurfaceTranslationValidate,
} from "../surface-translation.ts";
import { runBreadcrumbTrailValidate } from "../breadcrumb.ts";
import { runSurfaceEnrich, runSurfaceEnrichReview, runEnrichValidate } from "../surface-enrich.ts";
import { runFeedGenerate, runFeedValidate } from "../feed.ts";
import { runCanonicalUrlValidate, runContentUpdateStampsValidate } from "../canonical-url.ts";
import { runContentSourceValidate } from "../content-source-adapter.ts";
import { runCmsSchemaGenerate, runCmsSchemaParity } from "../cms.ts";
import { runAiGenerate, runAiValidate } from "../ai.ts";
import { runRobotsGenerate, runRobotsValidate } from "../robots.ts";
import { runEnvExampleGenerate, runEnvExampleValidate } from "../env/env-example.ts";

export const BUILD_ARTIFACT_COMMANDS_PART2: CheckCommandEntry[] = [
  /* RFC-0192 */
  {
    name: "surface.generate",
    description:
      "Expand every entitled Programmatic Surface Blueprint into virtual route entries and write src/surface.generated.yaml + public/.well-known/pseo-manifest.json (RFC-0192).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: [
      "<app>/src/surface.generated.yaml",
      "<app>/public/.well-known/pseo-manifest.json",
      "<app>/src/surface/states/*.state.yaml",
      "<app>/src/surface/states/pointer.yaml",
      "<app>/public/**/*.md",
      "<app>/.surface-cache/**",
    ],
    reads: ["<app>/src/content/system.md", "<app>/src/surface/**/*.yaml"],
    modulePaths: [
      "surface.ts",
      "surface/generate.ts",
      "surface/shared.ts",
      "surface-expand.ts",
      "surface-expand/blueprints.ts",
      "surface-expand/expand.ts",
      "surface/service-catalog-links.ts",
      "pseo/pseo-module-context.ts",
      "result-helpers.ts",
    ],
    execute: runSurfaceGenerate,
  },
  {
    name: "surface.validate",
    description:
      "Validate src/surface.generated.yaml: unique pageIds, no collision with authored slugs, and every redirect stub targets a live entry (RFC-0192).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/surface.generated.yaml", "<app>/src/content/system.md"],
    modulePaths: [
      "surface.ts",
      "surface/validate.ts",
      "surface/shared.ts",
      "surface-expand.ts",
      "surface-enrich.ts",
      "result-helpers.ts",
    ],
    execute: runSurfaceValidate,
  },
  {
    name: "surface.hub.validate",
    description:
      "RFC-0490: validate depth-0 pillar hub configuration — hero CTA anchoring, title template, published industries, commercial promise phrases, priceRef syntax.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/surface.generated.yaml",
      "packages/werkstatt-site/src/domain/ontology/blueprints/*.yaml",
    ],
    modulePaths: ["surface-hub-validate.ts"],
    execute: runSurfaceHubValidate,
    gate: {
      severity: "error",
      phase: "author",
      conditional: {
        kind: "entitlement",
        ref: "pseo",
        description: "Only runs when pseo entitlement is active",
      },
    },
  },
  {
    name: "surface.industry.validate",
    description:
      "RFC-0492: validate depth-1 industry dossier records — publication gate (minimum field counts), claim policy (prohibited result-claim phrases), and deprecated field usage warnings.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/surface/industries/**/*.md",
      "packages/werkstatt-site/src/domain/ontology/blueprints/*.yaml",
    ],
    modulePaths: ["surface-industry-validate.ts"],
    execute: runSurfaceIndustryValidate,
    gate: {
      severity: "warning",
      phase: "author",
      conditional: {
        kind: "entitlement",
        ref: "pseo",
        description: "Only runs when pseo entitlement is active",
      },
    },
  },
  {
    name: "surface.service.validate",
    description:
      "RFC-0496: validate depth-1 service dossier records — publication gate (minimum field counts), claim policy (prohibited result-claim phrases), and review/publication status checks.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/surface/services/**/*.md",
      "packages/werkstatt-site/src/domain/ontology/blueprints/*.yaml",
    ],
    modulePaths: ["surface-service-validate.ts"],
    execute: runSurfaceServiceValidate,
  },
  {
    name: "surface.intersection.validate",
    description:
      "RFC-0497: validate depth-5 intersection records — minimum gate (field counts), similarity thresholds (shingle-based pairwise), and substance independence test (token-count delta vs parent pages).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/surface/intersections/**/*.md",
      "packages/werkstatt-site/src/domain/ontology/blueprints/*.yaml",
    ],
    modulePaths: ["surface-intersection-validate.ts"],
    execute: runSurfaceIntersectionValidate,
  },
  {
    name: "surface.intersection.report",
    description:
      "RFC-0497: advisory diagnostic report listing depth-5 intersection records, their publication status, and empty gate fields. Always exits 0.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/surface/intersections/**/*.md",
      "packages/werkstatt-site/src/domain/ontology/blueprints/*.yaml",
    ],
    execute: runSurfaceIntersectionReport,
  },
  {
    name: "surface.media-leakage.validate",
    description:
      "RFC-0499: scan rendered surface page HTML for prohibited media metadata strings using context-aware matching. Verifies AI-generated images carry Konzeptillustration label and /bildnachweise/ link.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html", "<app>/src/surface.generated.yaml"],
    modulePaths: ["surface-media-leakage-validate.ts"],
    execute: runSurfaceMediaLeakageValidate,
  },
  {
    name: "surface.heading-uniqueness.validate",
    description:
      "RFC-0690, RFC-0696: scan rendered surface page HTML for duplicate block heading text (first <h2>/<h3> of each <section> or <div>/<article>/<aside> with aria-labelledby). Fails on duplicates to catch bake function label reuse before the Axiom gate.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html", "<app>/src/surface.generated.yaml"],
    modulePaths: ["surface-heading-uniqueness.ts"],
    execute: runSurfaceHeadingUniquenessValidate,
  },
  {
    name: "a11y.label-in-name.validate",
    description:
      "RFC-0832: scan rendered HTML in dist/client/ for interactive elements with aria-label and check that the accessible name includes the visible text (WCAG 2.5.3 Label in Name). Checks <a>, <button>, <input>, <select>, <textarea> and elements with interactive ARIA roles. Skips landmark elements like <nav aria-label>.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html"],
    modulePaths: ["a11y-label-in-name.ts"],
    execute: runA11yLabelInNameValidate,
  },
  {
    name: "ratgeber.hub.validate",
    description:
      "RFC-0500: validate the ratgeber editorial knowledge hub — JSON-LD type policy, hub layout structure, article card fields, category coverage, reserved slug collisions, publication status, commercial claim restrictions, and required article fields.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/surface.generated.yaml",
      "<app>/src/content/surface/articles/**/*.md",
      "<app>/src/content/surface/article-categories/**/*.md",
      "packages/werkstatt-site/src/domain/ontology/blueprints/ratgeber.yaml",
    ],
    execute: runRatgeberHubValidate,
  },
  {
    name: "ratgeber.article.validate",
    description:
      "RFC-0501: validate ratgeber article types, mandatory 10-section prose structure, type-specific requirements, and publication gate. Checks articleType enum, word count floor, H2 section presence/order, and per-type content requirements (decision tables, checklists, comparison tables, calculation examples, step-by-step guides, bold definitions).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/surface/articles/**/*.md",
      "<app>/src/content/prose/**/ratgeber-*.md",
    ],
    execute: runRatgeberArticleValidate,
  },
  {
    name: "ratgeber.provenance.validate",
    description:
      "RFC-0502: validate ratgeber editorial provenance — author IDs, source IDs, claim IDs, and Quellen section coverage. Checks that every article's authorId resolves to an author record, every sourceId resolves to a source descriptor, every claimId exists in the article's claim sidecar, and every sourceId appears in the Quellen section.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/surface/articles/**/*.md",
      "<app>/src/content/surface/authors/**/*.md",
      "<app>/src/content/surface/claims/**/*.md",
      "<app>/src/content/prose/**/ratgeber-*.md",
      "integrations/truth-sources/*.yaml",
    ],
    execute: runRatgeberProvenanceValidate,
  },
  {
    name: "ratgeber.claim.validate",
    description:
      "RFC-0505: validate ratgeber claim records — schema, claimId uniqueness, articleId resolution, source binding for factual/regulatory claims, calculationInputs for calculation claims, URL validity, expiry warnings, disputed status warnings, and PBP value drift warnings.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/surface/claims/**/*.md",
      "<app>/src/content/surface/articles/**/*.md",
      "integrations/truth-sources/*.yaml",
    ],
    execute: runRatgeberClaimValidate,
  },
  {
    name: "ratgeber.policy.validate",
    description:
      "RFC-0503: validate ratgeber editorial policy page existence, required H2 sections, review cadence, and article status workflow. Checks policy page exists in all supported languages with 5 required sections, published articles are not stale (reviewedAt > 3 months warning), published articles have required fields, and no review-required article appears in the surface artifact.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/prose/**/ratgeber-redaktion.md",
      "<app>/src/content/surface/articles/**/*.md",
      "<app>/src/surface.generated.yaml",
    ],
    execute: runRatgeberPolicyValidate,
  },
  {
    name: "surface.doorway-risk.report",
    description:
      "RFC-0492: diagnostic report flagging depth-4 city pages on the website-local surface that lack unique local context fields (localDemandContext, uniqueIntro, uniqueFaq, localEvidence). Fails surface.validate when the flagged share exceeds the blueprint's doorwayMaxFlaggedShare threshold.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/surface.generated.yaml",
      "<app>/src/content/surface/cities/**/*.md",
      "<app>/src/content/surface/demands/**/*.md",
      "packages/werkstatt-site/src/domain/ontology/blueprints/*.yaml",
    ],
    execute: runSurfaceDoorwayRiskReport,
  },
  {
    name: "surface.duplicate-content.report",
    description:
      "RFC-0492: detect depth-1 industry pages on the website-local surface with prose similarity > duplicateMaxSimilarity (default 0.70) to another depth-1 industry page. Blocks surface.validate when any pair exceeds the threshold.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/surface.generated.yaml",
      "packages/werkstatt-site/src/domain/ontology/blueprints/*.yaml",
    ],
    execute: runSurfaceDuplicateContentReport,
  },
  /* RFC-0271 */
  {
    name: "surface.context.validate",
    description:
      "Validate Programmatic Surface module contexts: master locale, published locales, module entitlements, and Blueprint ownership (RFC-0271).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/surface/**/*.yaml"],
    modulePaths: ["pseo/pseo-module-context.ts", "result-helpers.ts"],
    execute: runSurfaceContextValidate,
  },
  /* RFC-0193 */
  {
    name: "blueprint.validate",
    description:
      "Validate Programmatic Surface Blueprints against the schema and the app's datasets (RFC-0193). No-op when `pseo` is not entitled.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/surface/**/*.yaml", "<app>/src/content/system.md"],
    modulePaths: ["blueprint.ts"],
    execute: runBlueprintValidate,
  },
  /* RFC-0198 */
  {
    name: "surface.starmap",
    description:
      "Project the Programmatic Surface manifest into a standalone cosmic star-map SVG (RFC-0198).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/public/.well-known/pseo-star-map.svg"],
    reads: ["<app>/src/surface.generated.yaml"],
    modulePaths: ["surface.ts", "surface/starmap.ts"],
    execute: runSurfaceStarmap,
  },
  /* RFC-0196 */
  {
    name: "surface.freshness",
    description:
      "Report Programmatic Surface freshness (RFC-0196): summarize pages decayed to noindex by the Freshness Ledger. Never fails.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    cacheable: false,
    execute: runSurfaceFreshness,
  },
  /* RFC-0274 */
  {
    name: "surface.evidence.validate",
    description:
      "Validate per-depth Programmatic Surface evidence policy: approved narrative, required record fields, freshness validity, and phantom levels (RFC-0274).",
    scope: "app",
    supportsAllSites: true,
    flags: {
      blueprint: {
        kind: "string",
        description: "Limit validation to one Blueprint id.",
      },
    },
    reads: ["<app>/src/surface.generated.yaml", "<app>/src/surface/**/*.yaml"],
    modulePaths: ["surface-quality.ts"],
    execute: runSurfaceEvidenceValidate,
  },
  {
    name: "surface.duplicate.validate",
    description:
      "Compare generated Programmatic Surface pages by deterministic semantic-text shingles and report near-duplicate clusters (RFC-0274).",
    scope: "app",
    supportsAllSites: true,
    flags: {
      blueprint: {
        kind: "string",
        description: "Limit validation to one Blueprint id.",
      },
    },
    reads: ["<app>/src/surface.generated.yaml"],
    modulePaths: ["surface-quality.ts"],
    execute: runSurfaceDuplicateValidate,
  },
  /* RFC-0194 */
  {
    name: "pseo.validate",
    description:
      "Programmatic Surface quality gate (RFC-0194): per surface, fail when the thin-page share exceeds maxThinShare, the indexable count exceeds the sitemap budget, or a generated slug collides with an authored page. Skips when the artifact is absent.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/surface.generated.yaml", "<app>/src/content/system.md"],
    modulePaths: ["pseo/pseo.ts"],
    execute: runPseoValidate,
    gate: {
      severity: "error",
      phase: "author",
      conditional: {
        kind: "entitlement",
        ref: "pseo",
        description: "Only runs when pseo entitlement is active",
      },
    },
  },
  {
    name: "pseo.proof.validate",
    description:
      "Validate managed PSEO proof inputs by reading generated demand-map and evidence-join artifacts; reports explicit not-enough-data instead of guessing (RFC-0277/RFC-0280).",
    scope: "app",
    supportsAllSites: true,
    flags: {
      blueprint: {
        kind: "string",
        description: "Limit proof input validation to one Blueprint id.",
      },
    },
    reads: ["<app>/src/surface.generated.yaml", "<app>/src/surface/**/*.yaml"],
    modulePaths: ["pseo/pseo-proof.ts"],
    execute: runPseoProofValidate,
  },
  /* RFC-0277 */
  {
    name: "pseo.experiment.plan",
    description:
      "Read PSEO module context and declared experiments from system.md; emit a structured experiment plan with proof-gate thresholds (RFC-0277). Offline, read-only — the plan is a proposal, not auto-execution.",
    scope: "app",
    flags: {
      module: {
        kind: "string",
        description: "Programmatic Surface module id (default: pseo).",
      },
    },
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/surface/**/*.yaml"],
    modulePaths: ["pseo/pseo-product.ts"],
    execute: runPseoExperimentPlan,
  },
  {
    name: "pseo.product.validate",
    description:
      "Validate customer-facing copy for forbidden PSEO promises: index budget as SKU, guaranteed indexation/rankings/leads, destructive downgrade policy, and missing Notausgang/export statements for PSEO records (RFC-0277).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/surface/**/*.yaml"],
    modulePaths: ["pseo/pseo-product.ts"],
    execute: runPseoProductValidate,
  },
  /* RFC-0229 */
  {
    name: "breadcrumb.trail.validate",
    description:
      "Breadcrumb hierarchy integrity (RFC-0229): fail on an unknown/cyclic authored parentPageId, or a live Programmatic Surface page whose surviving ancestor has no resolvable route. Skips the surface checks when the artifact is absent.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md", "<app>/src/surface.generated.yaml"],
    modulePaths: ["breadcrumb.ts"],
    execute: runBreadcrumbTrailValidate,
  },
  /* RFC-0197 */
  {
    name: "surface.enrich",
    description:
      "Generate a Blueprint's enrichedFields once per live tuple via an injected LLM provider (RFC-0197). Idempotent (--regenerate to overwrite).",
    scope: "app",
    flags: {
      regenerate: {
        kind: "boolean",
        description: "Regenerate existing output.",
      },
      blueprint: {
        kind: "string",
        description: "Limit the command to one Blueprint id.",
      },
      module: {
        kind: "string",
        description: "Programmatic Surface module id.",
      },
      lang: {
        kind: "string",
        description: "Language code.",
      },
    },
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/content/enriched/{blueprint}/{lang}/{artifact}.md"],
    cacheable: false,
    execute: runSurfaceEnrich,
  },
  /* RFC-0272/RFC-0273 */
  {
    name: "surface.artifact.ready",
    description:
      "Mark an approved master-locale PSEO enriched artifact ready for derived translation with a contentHash stamp (RFC-0272).",
    scope: "app",
    flags: {
      "page-id": {
        kind: "string",
        description: "Surface page id.",
      },
      field: {
        kind: "string",
        description: "Surface field id.",
      },
    },
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/content/enriched/{blueprint}/{lang}/{artifact}.md"],
    reads: ["<app>/src/content/enriched/**/*.md"],
    execute: runSurfaceArtifactReady,
  },
  {
    name: "surface.translation.generate",
    description:
      "Generate unapproved derived PSEO translation drafts from ready source artifacts using approved notes/glossaries; never runs in normal builds (RFC-0272/RFC-0273).",
    scope: "app",
    flags: {
      "regenerate-outdated": {
        kind: "boolean",
        description: "Regenerate only outdated translation artifacts.",
      },
    },
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/content/enriched/{blueprint}/{targetLang}/{artifact}.md"],
    cacheable: false,
    execute: runSurfaceTranslationGenerate,
  },
  {
    name: "surface.translation.validate",
    description:
      "Validate PSEO translated artifact lineage, sourceHash freshness, note/glossary ids, and target approval gates (RFC-0272).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/enriched/**/*.md"],
    modulePaths: ["surface-translation.ts"],
    execute: runSurfaceTranslationValidate,
  },
  {
    name: "surface.translation.qa.validate",
    description:
      "Validate deterministic PSEO translation QA invariants such as numeric echo checks and human-review gates (RFC-0272).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/enriched/**/*.md"],
    modulePaths: ["surface-translation.ts"],
    execute: runSurfaceTranslationQaValidate,
  },
  {
    name: "surface.translation.notes.generate",
    description:
      "Generate a frozen draft translator note for one PSEO module target language (RFC-0273).",
    scope: "app",
    flags: {
      regenerate: {
        kind: "boolean",
        description: "Regenerate existing output.",
      },
    },
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/content/enriched/_translation-notes/{module}/{targetLang}.md"],
    cacheable: false,
    execute: runSurfaceTranslationNotesGenerate,
  },
  {
    name: "surface.translation.notes.review",
    description: "Review or approve a PSEO module translator note (RFC-0273).",
    scope: "app",
    flags: {
      approve: {
        kind: "boolean",
        description: "Approve the selected review item.",
      },
    },
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/content/enriched/_translation-notes/{module}/{targetLang}.md"],
    cacheable: false,
    execute: runSurfaceTranslationNotesReview,
  },
  {
    name: "surface.translation.notes.validate",
    description:
      "Validate PSEO module translator notes: approval, required sections, source/target language, and moduleContextHash (RFC-0273).",
    scope: "app",
    flags: {
      module: {
        kind: "string",
        description: "Programmatic Surface module id.",
      },
    },
    supportsAllSites: true,
    reads: ["<app>/src/content/enriched/_translation-notes/**/*.md"],
    modulePaths: ["surface-translation.ts"],
    execute: runSurfaceTranslationNotesValidate,
  },
  {
    name: "surface.translation.glossary.generate",
    description:
      "Generate or restamp a PSEO translation glossary with the current moduleContextHash (RFC-0273).",
    scope: "app",
    flags: {
      module: {
        kind: "string",
        description: "Programmatic Surface module id.",
      },
      target: {
        kind: "string",
        description: "Target language code.",
      },
    },
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/src/content/enriched/_translation-glossaries/{module}/{targetLang}.yaml"],
    cacheable: false,
    execute: runSurfaceTranslationGlossaryGenerate,
  },
  {
    name: "surface.translation.glossary.validate",
    description:
      "Validate machine-readable PSEO translation glossaries and term policy metadata (RFC-0273).",
    scope: "app",
    flags: {
      module: {
        kind: "string",
        description: "Programmatic Surface module id.",
      },
    },
    supportsAllSites: true,
    reads: ["<app>/src/content/enriched/**/*.glossary.yaml"],
    modulePaths: ["surface-translation.ts"],
    execute: runSurfaceTranslationGlossaryValidate,
  },
  {
    name: "enrich.validate",
    description:
      "Validate provenance + approval shape on every Programmatic Surface enriched content entry (RFC-0197).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/enriched/**/*.md"],
    modulePaths: ["surface-enrich.ts"],
    execute: runEnrichValidate,
  },
  /* RFC-0207 */
  {
    name: "surface.enrich.review",
    description:
      "Review + batch-approve pending (approved:false) Programmatic Surface enriched entries. Default lists pending entries with a preview; --approve-all approves all, --approve <pageId>:<field> approves one (RFC-0207).",
    scope: "app",
    flags: {
      "approve-all": {
        kind: "boolean",
        description: "Approve all pending review items.",
      },
      approve: {
        kind: "string",
        description: "Approve the selected review item.",
      },
    },
    mutatesState: true,
    supportsAllSites: true,
    writes: ["<app>/src/content/enriched/{blueprint}/{lang}/{artifact}.md"],
    reads: ["<app>/src/content/enriched/**/*.md"],
    execute: runSurfaceEnrichReview,
  },
  /* RFC-0165 */
  {
    name: "feed.generate",
    description:
      "Generate public/feed.xml (RSS 2.0) and public/feed.json (JSON Feed v1.1) from the dated article pages declared in system.md (RFC-0165, RFC-0317).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/public/feed.xml", "<app>/public/feed.json"],
    reads: ["<app>/src/content/system.md", "<app>/src/content/pages/**/*.md"],
    modulePaths: ["feed.ts"],
    execute: runFeedGenerate,
  },
  {
    name: "feed.validate",
    description: "Validate that public/feed.xml exists and is well-formed RSS (RFC-0165).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/public/feed.xml", "<app>/public/feed.json"],
    modulePaths: ["feed.ts"],
    execute: runFeedValidate,
  },
  /* RFC-0317: canonical URL parity and update-stamp validation */
  {
    name: "canonical.url.validate",
    description:
      "Validate canonical URL parity across sitemap, feed, llms, and HTML canonical tags (RFC-0317).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/dist/client/**/*.html",
      "<app>/dist/client/sitemap*.xml",
      "<app>/public/feed.*",
      "<app>/public/llms*.txt",
    ],
    modulePaths: ["canonical-url.ts"],
    execute: runCanonicalUrlValidate,
  },
  {
    name: "content.update-stamps.validate",
    description:
      "Validate that sitemap <lastmod> values are source-backed by authored update stamps, not build date or mtime (RFC-0317).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/sitemap*.xml", "<app>/src/content/pages/**/*.md"],
    modulePaths: ["canonical-url.ts"],
    execute: runContentUpdateStampsValidate,
  },
  /* RFC-0171 */
  {
    name: "content.source.validate",
    description:
      "Guard the selected Content Source Provider adapter in system.md — only implemented adapters may be selected (RFC-0171).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/system.md"],
    modulePaths: ["content-source-adapter.ts"],
    execute: runContentSourceValidate,
  },
  {
    name: "cms.schema.generate",
    description:
      "Generate the git-based (Decap) CMS admin config from the content schemas (RFC-0171). No-op for filesystem-adapter apps.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/public/admin/config.yml", "<app>/public/admin/index.html"],
    reads: ["<app>/src/content/system.md", "<app>/src/content/schemas/**/*.ts"],
    modulePaths: ["cms.ts"],
    execute: runCmsSchemaGenerate,
  },
  {
    name: "cms.schema.parity",
    description:
      "Fail when the committed Decap CMS config diverges from the content schemas (RFC-0171). No-op pass for filesystem-adapter apps.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/public/admin/config.yml", "<app>/src/content/schemas/**/*.ts"],
    modulePaths: ["cms.ts"],
    execute: runCmsSchemaParity,
  },
  /* RFC-0051 */
  {
    name: "ai.generate",
    description: "Generate public/ai.txt from system.md ai: block before Astro build (RFC-0051).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/public/ai.txt"],
    reads: ["<app>/src/content/system.md"],
    modulePaths: ["ai.ts", "lib/astro-site-url.ts", "result-helpers.ts"],
    execute: runAiGenerate,
  },
  {
    name: "ai.validate",
    description:
      "Validate that public/ai.txt exists, is non-empty, and contains expected structural markers (RFC-0051).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/public/ai.txt"],
    modulePaths: ["ai.ts", "lib/astro-site-url.ts", "result-helpers.ts"],
    execute: runAiValidate,
  },
  /* RFC-0052 */
  {
    name: "robots.generate",
    description:
      "Generate public/robots.txt from system.md robots: block before Astro build (RFC-0052).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/public/robots.txt"],
    reads: ["<app>/src/content/system.md"],
    modulePaths: ["robots.ts"],
    execute: runRobotsGenerate,
  },
  {
    name: "robots.validate",
    description:
      "Validate that public/robots.txt exists, is non-empty, and contains expected directives (RFC-0052).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/public/robots.txt"],
    modulePaths: ["robots.ts"],
    execute: runRobotsValidate,
  },
  /* RFC-0168 (Session C) */
  {
    name: "env.example.generate",
    description:
      "Generate apps/<id>/.env.example from the app's GENERATED env schema plus STRIPE_SECRET_KEY when the app uses entitlements (RFC-0168/0169).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    mutatesState: true,
    writes: ["<app>/.env.example"],
    reads: ["<app>/src/content/system.md", "<app>/src/env.schema.generated.mjs"],
    modulePaths: ["env/env-example.ts", "result-helpers.ts"],
    execute: runEnvExampleGenerate,
  },
  {
    name: "env.example.validate",
    description:
      "Guard that every value in apps/<id>/.env.example stays EMPTY so a real secret can never leak into the repo (RFC-0168).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/.env.example"],
    modulePaths: ["env/env-example.ts", "result-helpers.ts"],
    execute: runEnvExampleValidate,
  },
];
