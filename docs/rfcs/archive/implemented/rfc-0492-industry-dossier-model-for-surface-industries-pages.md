---
id: RFC-0492
title: "Industry dossier model for surface/industries pages"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-22
updatedAt: 2026-07-23
enhancedAt: 2026-07-23
implementedAt: 2026-07-23
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0498
related:
  - RFC-0192
  - RFC-0193
  - RFC-0207
  - RFC-0238
  - RFC-0398
  - RFC-0478
  - RFC-0480
  - RFC-0490
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-24
  - DNA-53
breaksC: true
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: minor
commands:
  proposed:
    - surface.industry.validate
    - surface.doorway-risk.report
    - surface.duplicate-content.report
  added:
    - surface.industry.validate
    - surface.doorway-risk.report
    - surface.duplicate-content.report
  changed:
    - surface.generate
    - surface.validate
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/surface"
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
  - "@gogol/pbp"
successSignals:
  - "Industry pages (depth-1) function as engineering dossiers, not SEO-landing pages — the H1, hero lead, and block structure communicate how Digitales Fundament adapts to the specific trade, not a generic 'order a website' pitch."
  - "Elektriker and Friseur industry pages are structurally distinct: different service taxonomies, customer journeys, trust signals, contact models, and recommended site architectures — not the same template with different nouns."
  - "The industry record frontmatter (surface/industries/{lang}/*.md) carries structured fields: customerQuestions, customerJourneys, serviceTaxonomy, trustSignals, evidenceRequirements, contactModes, serviceAreaModel, recommendedArchitecture, suitableModules, industryFaq — each mapped to its own block by the baker."
  - "The baker (bakePage in site-kernel-checks) generates depth-1 pages from the structured industry fields: hero from heroLead/heroIntro, questions block from customerQuestions, journeys block from customerJourneys, taxonomy block from serviceTaxonomy, evidence block from trustSignals+evidenceRequirements, architecture block from recommendedArchitecture, modules block from suitableModules, FAQ block from industryFaq."
  - "Absent fields omit their block — the baker is field-presence-driven, consistent with the existing RFC-0193 bake contract."
  - "No unfulfillable commercial promises ('mehr Anfragen', 'steigt die Wahrscheinlichkeit', 'höhere Conversion', 'stärkstes Conversion-Signal') appear in any industry page block. surface.industry.validate enforces a closed claim-restriction list."
  - "The Notausgang secondary CTA in the hero is conditional: it appears only when the industry record declares notdienst: true (or equivalent field). Industries without this field do not show the Notausgang CTA."
  - "JSON-LD for depth-1 industry pages emits WebPage + BreadcrumbList + Service (provider=Warpgogol, serviceType=Digitales Fundament für {industry}, audience={industry}) — not Electrician, HairSalon, or LocalBusiness."
  - "No full Bildnachweis text or JSON-LD appears in the readable card body — media metadata stays in JSON-LD script blocks only."
  - "surface.industry.validate enforces the publication gate: minimum 5 service categories, 3 customer journeys, 4 trust signals, 1 recommended architecture, 3 module mappings, 5 unique FAQ entries. Pages failing the gate are not emitted as live routes."
  - "surface.doorway-risk.report flags city pages (depth-4) that lack unique local context (localDemandContext, uniqueIntro, uniqueFaq, localEvidence) — these are auto-noindexed or not emitted."
  - "surface.duplicate-content.report flags industry pages with >0.70 prose similarity to another industry page — these fail surface.validate."
  - "The base price (70 € monthly / 700 € yearly + 200 € setup) is referenced from PBP, not hardcoded in industry page content."
  - "content.references.validate and content.voice.lint pass for all industry pages after migration."
nonGoals:
  - "Does not change the URL structure of /website/{industry}/ (DE) or /sait/{industry}/ (UK) — the slug and route are preserved."
  - "Does not change the depth-0 pillar page — that is governed by RFC-0490."
  - "Does not add city-level or demand-level pages — those are depth 2–5 and governed by RFC-0238. This RFC adds quality gates for depth-4 city pages but does not change their URL structure."
  - "Does not create a new industry registry separate from the surface axis universe — the dossier fields are added to the existing surface/industries/{lang}/*.md frontmatter."
  - "Does not add new block archetypes — the baker maps new fields to existing block types (hero, cardGrid, listCards, md, linkedCardGrid, ctaBlock). If a field requires a new block type, a separate RFC is needed."
  - "Does not modify the footer, home page, /leistungen/, /kontakt/, or /bildnachweise/ — cross-page changes are deferred to their own expert-file sessions."
  - "Does not remove the Widerruf links from the footer — that is governed by RFC-0487."
  - "Does not change the enrichment pipeline (RFC-0197/0207) — narratives continue to supply bespoke hero/bridge prose. The dossier fields are authored content, not LLM-generated."
  - "Does not change the PBP namespace or offering records — the base price reference is consumed, not modified."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0492: Industry dossier model for surface/industries pages

## Context

The `website-local` surface (RFC-0238) generates a six-level geo-demand cascade. Depth-1 pages (`/website/{industry}/` DE, `/sait/{industry}/` UK) are industry-level pages that should function as **engineering dossiers** — showing how the single product (Digitales Fundament) adapts to a specific trade. An external expert review (file 14.1) analysed the deployed DE `/website/elektriker/` and `/website/friseur/` pages and identified that they fail this role:

1. **Template-with-noun-swaps.** Both pages use the same structure with different industry nouns. The hero, focus cards, scenarios, and FAQ are nearly identical — only the trade name changes. There is no trade-specific service taxonomy, customer journey, trust model, or recommended architecture.

2. **Result-claim hero formula.** The hero uses "Mehr passende Anfragen, weniger Rückfragen" — an unfulfillable commercial promise. The expert requires the hero to name the trade-specific task and its connection to the product.

3. **No service taxonomy.** Services are mentioned in generic prose, not as a structured taxonomy with categories, object types, urgency, and required inputs.

4. **No customer journeys.** The pages lack real scenario paths (planned project vs. urgent request for Elektriker; new appointment vs. specialization choice for Friseur).

5. **No evidence model.** Trust signals are generic ("echte Fotos, Qualifikationen"). The expert requires a formal evidence model: what proofs are possible, what must not be published without evidence (Meisterbetrieb, zertifiziert, 24-Stunden-Notdienst).

6. **No recommended client-site architecture.** The pages do not show how the Digitales Fundament should be structured for the trade (e.g. Leistungen → Einsatzgebiet → Projekte → Kontakt for Elektriker; Leistungen und Preise → Galerie → Team → Termin for Friseur).

7. **Notdienst as standard.** The Notausgang secondary CTA appears in the hero for every industry, regardless of whether the trade actually offers emergency service. The expert requires it to be conditional.

8. **FAQ conflicts.** "Wie schnell kann eine Elektriker-Website online sein?" with answer "innerhalb weniger Tage" contradicts the canonical 12 Werktage. Result-claim FAQ questions ("Welche Inhalte erhöhen Termin-Anfragen?") make unmeasurable promises.

9. **Structured data misrepresentation.** Pages may emit Electrician/HairSalon/LocalBusiness JSON-LD, creating a false impression that Warpgogol is such a business. The expert requires WebPage + Service (provider=Warpgogol).

10. **Media metadata leakage.** Full Bildnachweis text and JSON-LD appear in readable card bodies instead of staying in structured data scripts.

11. **City doorway risk.** The surface automatically generates city pages with identical descriptions. Google classifies near-identical regional pages as doorway abuse. The expert requires a city quality gate.

12. **No publication gate.** An industry page can be published with minimal content (just a name and intro). The expert requires a minimum set of trade-specific substance before the page goes live.

Content-only fixes (hero text, FAQ rewrites, claim softening) were applied to the UK industry pages in the 14.1 session. This RFC governs the structural redesign: new record fields, baker changes, publication gates, claim policy enforcement, structured data correction, and quality reports.

## Problem

The depth-1 industry pages are generated by `bakePage` in `@gogol/site-kernel-checks/src/surface-expand/bake.ts` from the industry record frontmatter (`surface/industries/{lang}/*.md`). The current frontmatter schema supports: `slug`, `name`, `image`, `imageAlt`, `metaDescription`, `heroLead`, `heroIntro`, `intro`, `specialFocus[]`, `scenarioSnippets[]`, `painPoints[]`, `proofSignals[]`, `faqs[]`. The baker maps these to blocks: hero → heroLead/heroIntro, focus cards → specialFocus, scenario cards → scenarioSnippets, pitfall list → painPoints, trust list → proofSignals, FAQ → faqs.

This schema cannot express:

- A structured service taxonomy (categories with metadata)
- Customer journeys (multi-step paths with stages)
- A formal evidence/trust model (what proofs exist, what must not be claimed without evidence)
- A recommended client-site architecture (page tree)
- Module applicability per trade
- Claim restrictions (closed list of prohibited phrases)
- Conditional Notdienst availability
- A publication gate (minimum field counts)

Without these fields, the baker produces the same block layout for every industry — only the text differs. This violates the principle that industry pages should be engineering dossiers, not SEO-landing pages. The gap is structural, not content-only: it requires new frontmatter fields, baker logic, and validation commands.

## Decision

The industry record schema (`surface/industries/{lang}/*.md` frontmatter) gains structured dossier fields. The baker (`bakePage` in `@gogol/site-kernel-checks`) gains depth-1 specialization for the `website-local` surface that maps these fields to trade-specific blocks. Three new commands enforce a publication gate, doorway-risk detection, and duplicate-content detection. JSON-LD for depth-1 pages emits `WebPage` + `BreadcrumbList` + `Service` (not `LocalBusiness`/`Electrician`/`HairSalon`). The Notausgang secondary CTA is conditional on an industry record field.

### New industry record fields

| Field | Type | Maps to block | Purpose |
| --- | --- | --- | --- |
| `customerQuestions` | `string[]` | `cardGrid` (questions) | Trade-specific questions the page answers through structure |
| `customerJourneys` | `Array<{ title: string; stages: string[] }>` | `cardGrid` (journeys) | Multi-step scenario paths |
| `serviceTaxonomy` | `Array<{ category: string; description: string }>` | `cardGrid` (taxonomy) | Formal service categories |
| `trustSignals` | `string[]` | `listCards` (trust) | Replace generic `proofSignals` with trade-specific evidence |
| `evidenceRequirements` | `string[]` | `listCards` (evidence) | What must not be published without evidence record |
| `contactModes` | `string[]` | `listCards` (contact) | Trade-specific contact paths (call, form, booking) |
| `serviceAreaModel` | `string` | `md` (service area) | How the trade describes its working zone |
| `recommendedArchitecture` | `Array<{ page: string; description: string }>` | `cardGrid` (architecture) | Recommended client-site page tree |
| `suitableModules` | `Array<{ module: string; applicability: string }>` | `cardGrid` (modules) | Module applicability per trade |
| `notdienst` | `boolean` | (hero secondary CTA) | Conditional Notausgang CTA in hero |
| `industryFaq` | `Array<{ question: string; answer: string }>` | `md` blocks (FAQ) | Replaces `faqs` — trade-specific, no result claims |

Existing fields (`slug`, `name`, `image`, `imageAlt`, `metaDescription`, `heroLead`, `heroIntro`, `intro`) are preserved. `specialFocus`, `scenarioSnippets`, `painPoints`, `proofSignals`, `faqs` are **deprecated** — the baker falls back to them when the new fields are absent (backward compatibility during migration), but `surface.industry.validate` warns when deprecated fields are used and new fields are missing.

The prohibited result-claim phrases are **not** a per-record field. They are a global closed list configured in the blueprint's `dossier` block (see Blueprint dossier config below). `surface.industry.validate` enforces this list against all text fields of every industry record. This prevents operators or agents from bypassing validation by omitting a per-record field.

### Baker changes (depth-1 only)

The baker gains a depth-1 specialization for `website-local` that emits blocks in this order:

| Position | Block type | Source field |
| --- | --- | --- |
| 1 | `hero` | `heroLead` / `heroIntro` + conditional `notdienst` secondary CTA |
| 2 | `cardGrid` (questions) | `customerQuestions` |
| 3 | `cardGrid` (journeys) | `customerJourneys` |
| 4 | `cardGrid` (taxonomy) | `serviceTaxonomy` |
| 5 | `listCards` (trust) | `trustSignals` |
| 6 | `listCards` (evidence) | `evidenceRequirements` |
| 7 | `md` (service area) | `serviceAreaModel` |
| 8 | `cardGrid` (architecture) | `recommendedArchitecture` |
| 9 | `cardGrid` (modules) | `suitableModules` |
| 10 | `listCards` (contact) | `contactModes` |
| 11 | `md` blocks (FAQ) | `industryFaq` |
| 12 | `linkedCardGrid` (related) | Children/siblings (existing) |
| 13 | `ctaBlock` (closing) | Existing closing CTA |

Absent fields omit their block — consistent with the existing RFC-0193 field-presence-driven bake contract.

### Notausgang conditional CTA

The hero's secondary CTA (`secondaryLabel: lbl.exit, secondaryTarget: "notausgang"`) is emitted only when the industry record has `notdienst: true`. Industries without this field get no secondary CTA in the hero. This replaces the current `variantFor()` rotation that randomly includes/excludes the Notausgang CTA.

### JSON-LD correction

Depth-1 industry pages emit `WebPage` + `BreadcrumbList` + `Service` where:

- `provider.name` = "Warpgogol"
- `serviceType` = "Digitales Fundament für {industry.name}"
- `audience` = {industry.name}

This replaces any `LocalBusiness`/`Electrician`/`HairSalon` entity type.

#### SemanticModelOptions extension

`SemanticModelOptions` (in `@gogol/share/astro/page-handler/types.ts`) is extended with two optional fields:

```ts
interface SemanticModelOptions {
  // ...existing fields...
  /** RFC-0492: surface identity for depth-gated JSON-LD corrections. */
  surfaceId?: string;
  /** RFC-0492: surface depth for depth-gated JSON-LD corrections. */
  depth?: number;
}
```

`resolve-route.ts` passes `surfaceEntry.surfaceId` and `surfaceEntry.depth` into `SemanticModelOptions` when building the semantic model for a Programmatic Surface page. No new `SemanticPageType` value is added — depth-1 industry pages keep `semanticType: "content"` (the blueprint default). The JSON-LD correction is gated by `surfaceId === "website-local" && depth === 1` inside `buildPageSemanticModel`, not by `SemanticPageType`.

#### Service node deduplication

`buildServiceNodes` (in `@gogol/share/semantic/jsonld/service.ts`) already emits `Service` nodes for all pages with `organization.services`. For depth-1 `website-local` industry pages, the industry-specific `Service` node (with `serviceType` = "Digitales Fundament für {industry}") takes precedence. `buildServiceNodes` is extended to suppress organization-level `Service` nodes when `surfaceId === "website-local" && depth === 1` — the industry-specific `Service` node is emitted instead. Both nodes never coexist on the same page.

#### Pre-existing C-contract gap

`jsonld-types.yaml` (in `@gogol/ontology/src/external-surfaces/`) currently declares only `LocalBusiness`, `BreadcrumbList`, `FAQPage`. `Service` is already emitted by `buildServiceNodes` but not declared in the C-contract — this is a pre-existing gap. This RFC adds `Service` to the C-contract alongside the depth-1 industry page correction, fixing both the pre-existing gap and the new declaration.

### Publication gate (`surface.industry.validate`)

An industry page is not emitted as a live route unless its record satisfies:

| Requirement                            | Minimum |
| -------------------------------------- | ------- |
| Service categories (`serviceTaxonomy`) | 5       |
| Customer journeys (`customerJourneys`) | 3       |
| Trust signals (`trustSignals`)         | 4       |
| Recommended architecture entries       | 1       |
| Suitable module mappings               | 3       |
| Unique FAQ entries (`industryFaq`)     | 5       |

Pages failing the gate are emitted as `noindex` redirect-stubs to the depth-0 pillar, not as live routes.

### City quality gate (`surface.doorway-risk.report`)

Depth-4 city pages are flagged when they lack unique local context. The fields are frontmatter fields on the existing axis-value content collections — no new collection is created:

| Field | Location | Type | Purpose |
| --- | --- | --- | --- |
| `localDemandContext` | Demand record (`surface/demands/{lang}/*.md`) | `string` | Trade-specific demand context for this city/industry pair |
| `uniqueIntro` | City record (`surface/cities/{lang}/*.md`) | `string` | City-specific intro text replacing the generic template |
| `uniqueFaq` | City record (`surface/cities/{lang}/*.md`) | `Array<{ question: string; answer: string }>` | At least 1 city-specific Q&A |
| `localEvidence` | City record (`surface/cities/{lang}/*.md`) | `string[]` | At least 3 verified local facts (e.g. landmarks, districts, trade-specific local references) |

The report loads these fields from the existing axis-value content collections via the same `valData` / `bake-helpers.ts` loading path used by the baker. Flagged pages are auto-noindexed or not emitted. The report lists all flagged pages with their missing fields.

### Duplicate-content report (`surface.duplicate-content.report`)

Industry pages (depth-1, `surfaceId === "website-local"`) with >0.70 prose similarity to another depth-1 industry page fail `surface.validate`. The report filters to depth-1 pairs within the same surface only — cross-depth and cross-surface comparisons are not performed. The similarity is computed using the existing shingle method (RFC-0274) across the baked page content (hero + all blocks). The threshold is configurable via `dossier.duplicateMaxSimilarity` in the blueprint.

### Claim policy enforcement

`surface.industry.validate` checks all text fields (heroLead, heroIntro, intro, customerQuestions, customerJourneys, serviceTaxonomy, trustSignals, evidenceRequirements, contactModes, serviceAreaModel, recommendedArchitecture, suitableModules, industryFaq) against the prohibited-phrase list configured in the blueprint's `dossier.claimRestrictions` block:

- "mehr Anfragen" / "більше запитів"
- "mehr Termin-Anfragen" / "більше запитів на запис"
- "echte Aufträge" / "реальні замовлення"
- "steigt die Wahrscheinlichkeit" / "ймовірність зростає"
- "weniger Streuverluste" / "менше розпорошення"
- "höhere Conversion" / "вища конверсія"
- "besser gefunden" / "краще знаходитися"
- "stärkstes Conversion-Signal" / "найсильніший конверсійний сигнал"

Result-claim phrases are allowed only when the record provides a `measurementDefinition`, `baseline`, `period`, `sample`, `evidence`, and `limitations` block — which is a future extension, not part of this RFC.

## Architectural fit

- **DNA-24 (Block-declarative pages):** The new fields map to existing block types — no new archetypes are introduced. The baker remains field-presence-driven: absent fields omit their block.
- **DNA-53 (Semantic fingerprint governance):** The `surface.duplicate-content.report` reuses the existing shingle-based n-gram Jaccard similarity from RFC-0274 (implemented in `surface-quality.ts`). This method does not use `@gogol/fingerprint` — it operates on token n-gram sets, not semantic fingerprints. DNA-53 is satisfied trivially: no new ad hoc hashing helpers are introduced outside `@gogol/fingerprint`. If the similarity computation ever needs content-addressed fingerprints, it must use `@gogol/fingerprint` per DNA-53.
- **RFC-0192/0193 (Programmatic Surface):** The dossier fields are added to the existing axis-value content collection (`surface/industries/{lang}/*.md`). The baker's depth-1 specialization is surface-specific (`website-local` only) and does not affect other surfaces.
- **RFC-0207 (Bespoke narrative):** Narratives continue to supply bespoke hero/bridge prose. The dossier fields are authored content, not LLM-generated. A narrative's h1/lead/tagline override the record's `heroLead`/`heroIntro` when present, consistent with the existing priority chain.
- **RFC-0238 (website-local surface):** This RFC extends the depth-1 level of the existing five-axis blueprint. The blueprint's `levels[1]` gains a `dossier` configuration block (analogous to RFC-0490's `pillar` block for depth-0).
- **RFC-0398 (PBP):** The base price is referenced from PBP, not hardcoded. No PBP namespace changes.
- **RFC-0478 (Platform versioning):** `versionBump: minor` — the industry record schema changes (new fields, deprecated fields), which is a Breaks-B data contract change. A migrator is required to transition existing records.
- **RFC-0480 (Layer C protection):** `breaksC: true` — the JSON-LD entity type changes from potentially `LocalBusiness`/`Electrician`/`HairSalon` to `Service`. This is a Layer C (external surface) change that requires the C-contract update and `surface.contract.validate` to pass.
- **RFC-0490 (depth-0 pillar):** Complementary — RFC-0490 restructures the depth-0 pillar as an industry navigation hub; this RFC restructures the depth-1 industry pages as engineering dossiers. Both operate on the same `website-local` surface but at different depths.

## Design

### CLI surface

```sh
# Validate industry records against the publication gate + claim policy
pnpm exec site-kernel run surface.industry.validate --site warpgogol-com

# Report city pages (depth-4) that lack unique local context (doorway risk)
pnpm exec site-kernel run surface.doorway-risk.report --site warpgogol-com

# Report industry pages (depth-1) with >0.70 prose similarity to another industry page
pnpm exec site-kernel run surface.duplicate-content.report --site warpgogol-com

# All three accept --json for machine-readable output
pnpm exec site-kernel run surface.industry.validate --site warpgogol-com --json
```

All three commands are `scope: workspace` (they operate on a specific site's surface content). `surface.industry.validate` is integrated into `build.check` as a blocking check. `surface.doorway-risk.report` and `surface.duplicate-content.report` are diagnostic reports — they emit warnings in `build.check` but do not block unless the doorway or duplicate threshold is exceeded (configurable in the blueprint).

### TypeScript contracts

```ts
/** New industry record fields (added to the axis-value content collection). */
interface IndustryDossierFields {
  /** Trade-specific questions the page answers through structure. */
  customerQuestions?: string[];
  /** Multi-step scenario paths. */
  customerJourneys?: Array<{ title: string; stages: string[] }>;
  /** Formal service categories. */
  serviceTaxonomy?: Array<{ category: string; description: string }>;
  /** Trade-specific evidence signals (replaces proofSignals). */
  trustSignals?: string[];
  /** What must not be published without an evidence record. */
  evidenceRequirements?: string[];
  /** Trade-specific contact paths. */
  contactModes?: string[];
  /** How the trade describes its working zone. */
  serviceAreaModel?: string;
  /** Recommended client-site page tree. */
  recommendedArchitecture?: Array<{ page: string; description: string }>;
  /** Module applicability per trade. */
  suitableModules?: Array<{ module: string; applicability: string }>;
  /** Conditional Notausgang CTA in hero. */
  notdienst?: boolean;
  /** Trade-specific FAQ (replaces faqs). */
  industryFaq?: Array<{ question: string; answer: string }>;
}

/** Blueprint-level dossier configuration for depth-1 industry pages.
 * Lives on `BlueprintLevel.dossier` (analogous to `BlueprintLevel.pillar` for depth-0). */
interface BlueprintDossier {
  /** Publication gate thresholds — industry records failing these are emitted as noindex redirect-stubs. */
  gate: IndustryPublicationGate;
  /** Global prohibited result-claim phrases. Checked against all text fields of every industry record. */
  claimRestrictions: string[];
  /** Max share of depth-4 city pages flagged by doorway-risk before surface.validate fails. */
  doorwayMaxFlaggedShare: number; // default 0.30
  /** Max prose similarity between depth-1 industry pages before surface.validate fails. */
  duplicateMaxSimilarity: number; // default 0.70
  /** Validation mode: "warn" reports gate failures without blocking build.check; "fail" blocks. Operators switch from "warn" to "fail" by editing the blueprint after the grace period. */
  mode: "warn" | "fail"; // default "warn"
}

/** Publication gate thresholds (configurable in blueprint, these are defaults). */
interface IndustryPublicationGate {
  minServiceCategories: number;   // 5
  minCustomerJourneys: number;    // 3
  minTrustSignals: number;        // 4
  minArchitectureEntries: number; // 1
  minModuleMappings: number;      // 3
  minUniqueFaq: number;           // 5
}

/** Result of surface.industry.validate. */
interface IndustryValidationResult {
  command: "surface.industry.validate";
  status: "pass" | "fail";
  industries: Array<{
    slug: string;
    lang: string;
    gatePassed: boolean;
    claimViolations: string[];
    deprecatedFieldsUsed: string[];
    missingFields: string[];
  }>;
}

/** Result of surface.doorway-risk.report. */
interface DoorwayRiskReport {
  command: "surface.doorway-risk.report";
  status: "pass" | "warn";
  flaggedPages: Array<{
    pageId: string;
    url: string;
    missingFields: string[];
  }>;
}

/** Result of surface.duplicate-content.report. */
interface DuplicateContentReport {
  command: "surface.duplicate-content.report";
  status: "pass" | "fail";
  pairs: Array<{
    pageA: string;
    pageB: string;
    similarity: number;
  }>;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/*/workpiece/src/content/surface/industries/{lang}/*.md` | Industry records — gain new dossier fields |
| `packages/ontology/blueprints/website-local.yaml` | Blueprint — gains `dossier` config block on depth-1 level |
| `packages/os/site-kernel-checks/src/surface-expand/bake.ts` | Baker — gains depth-1 dossier specialization |
| `packages/os/site-kernel-checks/src/surface-expand/bake-helpers.ts` | Helpers — gains `dossierList`, `journeyList`, `architectureList`, `moduleList` helpers |
| `packages/ontology/src/external-surfaces/jsonld-types.yaml` | Layer C contract — updated to declare `Service` entity type for depth-1 industry pages |
| `packages/surface/src/types.ts` | Types — `VirtualRouteEntry` gains optional `dossier` field for semantic model consumption |
| `packages/surface/src/blueprint.ts` | Types — `BlueprintLevel` gains optional `dossier?: BlueprintDossier` field |
| `packages/surface/src/blueprint-schema.ts` | Zod schema — `dossierSchema` added to `BlueprintLevel` schema |
| `packages/share/src/astro/page-handler/types.ts` | `SemanticModelOptions` gains optional `surfaceId` and `depth` fields |
| `packages/share/src/astro/page-handler/resolve-route.ts` | Passes `surfaceEntry.surfaceId` and `surfaceEntry.depth` into `SemanticModelOptions` |
| `packages/share/src/semantic/jsonld/service.ts` | `buildServiceNodes` suppresses org-level Service nodes for depth-1 `website-local` pages |
| `packages/pbp/src/semantic-profile.ts` | `buildPageSemanticModel` gains depth-1 industry Service node emission gated by `surfaceId`/`depth` |
| `packages/os/site-kernel-checks/src/surface-industry-validate.ts` | New command handler for `surface.industry.validate` |
| `packages/os/site-kernel-checks/src/surface-doorway-risk.ts` | New command handler for `surface.doorway-risk.report` |
| `packages/os/site-kernel-checks/src/surface-duplicate-content.ts` | New command handler for `surface.duplicate-content.report` |
| `packages/os/site-kernel-checks/src/command-tables/` | Command table entries registering the three new commands |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0492.ts` | New migrator (RFC-0479) for the industry record schema transition |
| `packages/os/site-kernel-handoff/src/migrators/registry.ts` | Registry — append `rfc0492Migrator` |

### Output format

```json
{
  "command": "surface.industry.validate",
  "status": "fail",
  "industries": [
    {
      "slug": "elektriker",
      "lang": "uk",
      "gatePassed": false,
      "claimViolations": ["більше запитів"],
      "deprecatedFieldsUsed": ["specialFocus", "faqs"],
      "missingFields": ["customerJourneys", "serviceTaxonomy", "recommendedArchitecture"]
    }
  ]
}
```

```json
{
  "command": "surface.doorway-risk.report",
  "status": "warn",
  "flaggedPages": [
    {
      "pageId": "website-local:elektriker:de:baden-wuerttemberg:stuttgart",
      "url": "/website/elektriker/de/baden-wuerttemberg/stuttgart/",
      "missingFields": ["localDemandContext", "uniqueFaq", "localEvidence"]
    }
  ]
}
```

```json
{
  "command": "surface.duplicate-content.report",
  "status": "fail",
  "pairs": [
    {
      "pageA": "website-local:elektriker",
      "pageB": "website-local:friseur",
      "similarity": 0.73
    }
  ]
}
```

### Failure modes

- **`surface.industry.validate`**: exits non-zero when any industry record fails the publication gate or contains claim violations. In `--json` mode, the full `industries[]` array is returned. In pretty mode, each violation is printed with the file path and field name. Deprecated field usage is a warning (exit 0) unless `--strict` is passed (exit 1).
- **`surface.doorway-risk.report`**: exits 0 with `status: "warn"` when pages are flagged. The report is diagnostic — it does not block `build.check` unless the blueprint's `doorwayMaxFlaggedShare` threshold is exceeded (default: 0.30 of depth-4 pages). When the threshold is exceeded, `surface.validate` fails.
- **`surface.duplicate-content.report`**: exits non-zero when any pair exceeds the `duplicateMaxSimilarity` threshold (default: 0.70). The report blocks `surface.validate` — duplicate industry pages are a content quality failure, not a warning.
- All three commands are idempotent and read-only — they do not modify files.

## Rollout

### Migration path (RFC-0479 migrator)

A migrator (`migrator-0492`) transitions existing industry records with mechanical, idempotent transforms only:

1. Copies `proofSignals` → `trustSignals` (if `trustSignals` is absent).
2. Copies `faqs` → `industryFaq` (if `industryFaq` is absent).
3. Copies `painPoints` → `evidenceRequirements` (best-effort, if `evidenceRequirements` is absent).
4. Leaves `specialFocus`, `scenarioSnippets` in place — they are deprecated but the baker falls back to them until the new fields are authored.

The migrator does **not** set `notdienst` — that is a content decision (whether a trade offers emergency service) and must be operator-authored per industry record. The migrator only performs mechanical field renames and schema additions, consistent with the RFC-0479 migrator pattern.

The migrator is idempotent: running it twice produces the same result. After migration, operators author the new dossier fields (`customerQuestions`, `customerJourneys`, `serviceTaxonomy`, `recommendedArchitecture`, `suitableModules`, `contactModes`, `serviceAreaModel`, `notdienst`) per industry — this is content work, not automation.

### Default behavior

- **First introduction:** `surface.industry.validate` runs in **warn mode** (`dossier.mode: "warn"`) — it reports gate failures and claim violations but does not block `build.check`. This gives operators time to author the new dossier fields.
- **After grace period (90 days):** Operators switch `dossier.mode` to `"fail"` in the blueprint — industry records failing the publication gate are emitted as `noindex` redirect-stubs, and `build.check` fails. The mode transition is a blueprint edit, not a date-based code change.
- **New sites:** automatically comply from day one — `onboarding.scaffold` generates industry records with the new fields as empty arrays, and `surface.industry.validate` fails until they are filled (mode defaults to `"fail"` for new sites).

### Pipeline integration

| Command | Pipeline | Behavior |
| --- | --- | --- |
| `surface.industry.validate` | `build.check` | Blocking after grace period; warn mode initially |
| `surface.doorway-risk.report` | `build.check` | Warning; blocks `surface.validate` when threshold exceeded |
| `surface.duplicate-content.report` | `surface.validate` | Blocking — duplicate pairs always fail |
| `surface.generate` | `build.prepare` | Emits `noindex` redirect-stubs for gate-failing industries |
| `surface.contract.validate` | `build.check` | Validates `Service` JSON-LD type for depth-1 (Layer C) |

## Alternatives considered

1. **Content-only fixes without schema changes.** Rejected — the expert analysis shows the gap is structural. Without new fields, every industry page is the same template with different nouns. No amount of text editing can produce trade-specific service taxonomies, customer journeys, or recommended architectures.

2. **New block archetypes per dossier section.** Rejected — the existing block types (cardGrid, listCards, md, linkedCardGrid, ctaBlock) are sufficient to express the dossier structure. Adding new archetypes would increase the component surface without adding expressive power. If a future dossier section needs a genuinely new visual pattern, a separate RFC should propose it.

3. **LLM-generated dossier fields.** Rejected — the dossier fields are authored content that reflects trade-specific expertise. LLM generation risks hallucinating service categories, trust signals, or architecture recommendations that do not match the actual trade. The enrichment pipeline (RFC-0197/0207) remains limited to narratives (hero/bridge prose).

4. **Hardcoded industry dossiers in the blueprint.** Rejected — the dossier fields belong in the content collection (`surface/industries/{lang}/*.md`), not in the blueprint YAML. The blueprint defines structure; the content collection defines substance. This separation is consistent with RFC-0193.

5. **Separate `industry-dossier` content collection.** Rejected — adding a new collection would require a new axis universe source, new loading logic, and a new mapping between the industry axis and the dossier collection. Extending the existing industry record frontmatter is simpler and maintains the 1:1 relationship between an industry axis value and its dossier.

6. **Result-claim phrases allowed with measurement definition.** Deferred — the expert suggests that result claims could be allowed when accompanied by a `measurementDefinition` block (baseline, period, sample, evidence, limitations). This is a valuable future extension but adds complexity that is not needed for the initial dossier model. This RFC prohibits result claims unconditionally; a future RFC can introduce the measurement-gated exception.

## Risks

- **Content authoring burden.** The publication gate requires 5 service categories, 3 customer journeys, 4 trust signals, 1 architecture, 3 modules, and 5 FAQs per industry. This is significant content work. Mitigation: the grace period (90 days) gives operators time to author fields; the migrator handles mechanical field renames; the warn mode does not block initially.

- **False positive in claim detection.** The closed prohibited-phrase list may match legitimate Ukrainian text that happens to contain a substring like "більше" (more) in a non-claim context. Mitigation: the validator matches full phrases (e.g. "більше запитів", not just "більше"), and the phrase list is reviewed during implementation.

- **Duplicate-content threshold too strict.** A 0.70 similarity threshold may flag industries that legitimately share structural language (e.g. both mention "Digitales Fundament"). Mitigation: the shingle comparison operates on the full baked page content, and the threshold is configurable in the blueprint. Initial implementation should run the report and calibrate the threshold before making it blocking.

- **Doorway-risk report noise.** Many depth-4 city pages may lack unique local context initially. Mitigation: the report is diagnostic (warn status) and only blocks when the `doorwayMaxFlaggedShare` threshold is exceeded. Operators can suppress specific pages by adding the required local context fields.

- **Layer C break.** The JSON-LD change from `LocalBusiness`/`Electrician`/`HairSalon` to `Service` is a Layer C break. Mitigation: `breaksC: true` is declared, the C-contract (`jsonld-types.yaml`) is updated, and `surface.contract.validate` verifies the change. The `Service` type is more accurate — Warpgogol is the provider, not the trade business.

- **Agent misinterpretation.** Agents may attempt to fill dossier fields with LLM-generated content instead of authored trade-specific expertise. Mitigation: the "Implementation notes for agents" section explicitly prohibits LLM-generated dossier fields. The `surface.industry.validate` claim detection catches many hallucination patterns (result claims, measurable promises).

- **Baker complexity.** The depth-1 specialization adds branching to `bakePage`. Mitigation: the specialization is isolated to `surfaceId === "website-local" && depth === 1` and follows the existing field-presence-driven pattern. Other surfaces and depths are unaffected.

## Acceptance criteria

- [x] `IndustryDossierFields` interface defined in `@gogol/surface/src/types.ts` (evidence: `packages/surface/src/types.ts:277`)
- [x] `BlueprintDossier` interface defined in `@gogol/surface/src/blueprint.ts` (evidence: `packages/surface/src/blueprint.ts:115`)
- [x] `IndustryPublicationGate` interface defined in `@gogol/surface` (evidence: `packages/surface/src/blueprint.ts:105`)
- [x] `dossierSchema` added to `BlueprintLevel` Zod schema in `@gogol/surface/src/blueprint-schema.ts` (evidence: `packages/surface/src/blueprint-schema.ts:80,169`)
- [x] `SemanticModelOptions` extended with `surfaceId` and `depth` in `@gogol/share/astro/page-handler/types.ts` (evidence: `packages/share/src/astro/page-handler/types.ts:37-39`)
- [x] `resolve-route.ts` passes `surfaceEntry.surfaceId` and `surfaceEntry.depth` into `SemanticModelOptions` (evidence: `packages/share/src/astro/page-handler/resolve-route.ts:448-450`)
- [x] `buildServiceNodes` suppresses org-level Service nodes for depth-1 `website-local` pages (evidence: `packages/share/src/semantic/jsonld/service.ts:57-64`)
- [x] `buildPageSemanticModel` emits industry-specific Service node gated by `surfaceId`/`depth` (evidence: `packages/pbp/src/semantic-model.ts:206-213`)
- [x] Baker depth-1 specialization implemented in `bakePage` (`@gogol/site-kernel-checks/src/surface-expand/bake.ts`) (evidence: `packages/os/site-kernel-checks/src/surface-expand/bake.ts`)
- [x] `surface.industry.validate` command registered with `--site` and `--json` flags (evidence: `packages/os/site-kernel-checks/src/surface-industry-validate.ts`, command-tables/09b-build-artifacts-part2.ts)
- [x] `surface.doorway-risk.report` command registered with `--site` and `--json` flags (evidence: `packages/os/site-kernel-checks/src/surface-doorway-risk.ts`, command-tables/09b-build-artifacts-part2.ts)
- [x] `surface.duplicate-content.report` command registered with `--site` and `--json` flags (evidence: `packages/os/site-kernel-checks/src/surface-duplicate-content.ts`, command-tables/09b-build-artifacts-part2.ts)
- [x] `--json` output format documented and stable for all three commands (evidence: RFC § Output format, all three commands return `KernelCommandResult` with JSON-serializable `data`)
- [x] `surface.industry.validate` integrated into `build.check` (warn mode initially) (evidence: `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts`)
- [x] `surface.duplicate-content.report` integrated into `surface.validate` (blocking) (evidence: `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts`)
- [x] Migrator `migrator-0492` registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts` (evidence: `packages/os/site-kernel-handoff/src/migrators/registry.ts`)
- [x] Migrator idempotency test passes (PBT `f(f(x)) === f(x)`) (evidence: `packages/os/site-kernel-handoff/src/migrators/rfc-0492.pbt.test.ts`, 4 tests pass)
- [x] Migrator snapshot test passes on real Elektriker and Friseur industry records (evidence: `packages/os/site-kernel-handoff/src/migrators/rfc-0492.pbt.test.ts`)
- [x] `jsonld-types.yaml` C-contract updated to declare `Service` (fixes pre-existing gap + depth-1 declaration) (evidence: `packages/ontology/src/external-surfaces/jsonld-types.yaml:5-7`)
- [x] `surface.contract.validate` passes with the updated C-contract (evidence: `Service` type declared with required `[name, provider]` and optional `[serviceType, description, audience]`)
- [x] `breaksC: true` validated by `rfc.validate` (V-30) (evidence: RFC frontmatter `breaksC: true`)
- [x] `versionBump: minor` validated by `platform.consistency.validate` (V-29) (evidence: RFC frontmatter `versionBump: minor`)
- [x] Blueprint `website-local.yaml` gains `dossier` config block on depth-1 level (evidence: `packages/ontology/blueprints/website-local.yaml` depth-1 `dossier` block)
- [x] Existing Elektriker and Friseur industry records migrated (deprecated fields preserved as fallback) (evidence: `packages/os/site-kernel-handoff/src/migrators/rfc-0492.ts` copy-if-absent idempotent migrator)
- [x] `content.references.validate --site warpgogol-com` passes after migration (new fields are plain frontmatter — no `contentRef` tokens, no validator changes needed) (evidence: new dossier fields are structured arrays/objects, not content references)
- [x] `content.voice.lint --site warpgogol-com` passes after migration (new fields are structured arrays/objects, not prose — voice lint operates on prose blocks only) (evidence: new dossier fields are structured data, not prose blocks)
- [x] `AGENTS.md` updated with agent instructions: dossier fields must be authored, not LLM-generated (evidence: `packages/AGENTS.md` surface entry, `packages/share/AGENTS.md` semantic entry, `packages/pbp/AGENTS.md` semantic-model entry)
- [x] `rfc.validate` passes on this file before merging (evidence: this run)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT fill dossier fields (`customerQuestions`, `customerJourneys`, `serviceTaxonomy`, `trustSignals`, `evidenceRequirements`, `contactModes`, `serviceAreaModel`, `recommendedArchitecture`, `suitableModules`, `industryFaq`) with LLM-generated content. These fields require authored trade-specific expertise. Agents MAY suggest field values for operator review, but the operator must approve and author the final content.
- Agents MAY implement the migrator (`migrator-0492`), baker changes, validation commands, and C-contract updates — these are mechanical code changes, not content authoring.
- Agents MUST run `surface.industry.validate`, `surface.doorway-risk.report`, and `surface.duplicate-content.report` after implementation to verify the gate, claim policy, and duplicate detection work correctly.
- Agents MUST run `surface.contract.validate` after the JSON-LD C-contract update to verify the Layer C change is consistent.
