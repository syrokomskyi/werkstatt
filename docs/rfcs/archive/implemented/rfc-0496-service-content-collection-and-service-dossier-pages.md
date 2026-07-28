---
id: RFC-0496
title: "Service content collection and service dossier pages"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-23
updatedAt: 2026-07-23
enhancedAt: 2026-07-23
implementedAt: 2026-07-23
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0238
amendedBy: []
related:
  - RFC-0192
  - RFC-0193
  - RFC-0238
  - RFC-0478
  - RFC-0479
  - RFC-0480
  - RFC-0490
  - RFC-0492
  - RFC-0494
  - RFC-0495
  - RFC-0497
satisfies:
  - DNA-24
  - DNA-53
breaksC: true
versionBump: minor
commands:
  proposed:
    - surface.service.validate
  added:
    - surface.service.validate
  changed:
    - surface.generate
    - surface.validate
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/surface"
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
  - "@gogol/site-kernel-handoff"
successSignals:
  - "A new content collection surface/services/{lang}/*.md holds service dossier records — one per industry×service tuple (e.g., friseur/strizhka, elektriker/elektroinstallation)."
  - "A new blueprint website-service.yaml generates service pages at /website/{industry}/{service}/ (DE) and /sait/{industry}/{service}/ (UK) — a separate surface from website-local, with axes industry × service and integer depths."
  - "Each service record carries structured fields: serviceId, industryId, name, slug, summary, servicePurpose, customerQuestions, serviceVariants, pricePresentationModels, durationPresentation, consultationRequirements, bookingRequirements, preparationInformation, aftercareInformation, teamRelation, portfolioRequirements, evidenceRequirements, contactJourney, recommendedComponents, recommendedPageStructure, claimRestrictions, faq, sources, reviewStatus, publicationStatus."
  - "The baker (bakePage) generates service pages from the structured fields — hero from summary/servicePurpose, variants block from serviceVariants, price model block from pricePresentationModels, duration block from durationPresentation, booking block from bookingRequirements/contactJourney, FAQ block from faq."
  - "Service pages do not publish fabricated prices, durations, or availability — pricePresentationModels and durationPresentation describe how a client should present these, not fictional values."
  - "Service pages do not represent Warpgogol as the service provider — the page explains how a client should structure the service on their own site."
  - "surface.service.validate enforces a publication gate: minimum 3 service variants, 3 customer questions, 3 price presentation models, 5 FAQ entries, 1 recommended page structure. Pages failing the gate are not emitted."
  - "surface.service.validate enforces claim restrictions — no unfulfillable commercial promises ('mehr Anfragen', 'mehr Buchungen', 'besser gefunden') in any service record text field."
  - "Service pages are linked from their parent industry page (depth-1) via a service catalog block."
  - "content.references.validate and content.voice.lint pass for all service records."
nonGoals:
  - "Does not change the URL structure of depth-4 city pages or depth-5 demand pages — that is governed by RFC-0495."
  - "Does not create city×service intersection pages — that is RFC-0497."
  - "Does not change structured data emission — that is RFC-0498."
  - "Does not change the industry dossier model (RFC-0492) — service records are a new collection, not a modification of industry records."
  - "Does not add new block archetypes — the baker maps service fields to existing block types (hero, cardGrid, listCards, md, ctaBlock). If a field requires a new block type, a separate RFC is needed."
  - "Does not create profiles of team members or specialists — the teamRelation field describes the relation model, not actual people."
  - "Does not publish AI images as portfolio results — portfolioRequirements describes what evidence is needed, not fabricated results."
  - "Does not add a service axis to the website-local blueprint — the service axis lives in the new website-service blueprint. The website-local axis order (industry × country × region × city × demand) is unchanged."
  - "Does not change the depth numbering of the website-local blueprint — service pages are depth-1 in the website-service blueprint, not depth-1.5 in website-local."
---

# RFC-0496: Service content collection and service dossier pages

## Context

The `website-local` surface (RFC-0238) generates a six-level geo-demand cascade: industry → country → region → city → demand. An external expert review (file 14.3) identified a missing page type in this hierarchy: the **service dossier** — a canonical page at `/website/{industry}/{service}/` that explains how a specific service should be presented on a client's website.

Currently, the only place where service-specific information appears is in the demand record (depth-5), which combines city and service context. But the expert requires a **service-only** page that is independent of any city — it answers questions like:

- What variants of this service exist?
- How should price be presented?
- How should duration be presented?
- What information is needed before booking?
- How should the service connect to team members and booking flow?

This page does not exist in the current cascade. The expert's canonical hierarchy is:

```
/website/{industry}/                    → industry dossier (website-local depth-1, RFC-0492)
/website/{industry}/{service}/          → service dossier (NEW, this RFC — website-service surface)
/website/{industry}/{city}/             → city page (website-local depth-4, RFC-0495 URL)
/website/{industry}/{city}/{demand}/    → city×service intersection (website-local depth-5, RFC-0497)
```

The service dossier is a **separate surface** (`website-service`), not a new depth level in `website-local`. The `website-local` blueprint's axis order (industry × country × region × city × demand) and depth numbering (0–5) are unchanged. This separation is necessary because the blueprint schema requires integer depths (`z.number().int().min(0)`) and the eligibility engine uses axis order position to determine which axes are active at each depth — a non-geo `service` axis cannot be inserted into the geo cascade without breaking the positional model.

## Problem

The current blueprint has no axis or level for a service-only page. The `demand` axis (depth-5) combines city and service, but there is no way to create a page that talks about a service without a city. This means:

1. **No canonical service information.** Service-specific guidance (variants, price models, duration models, booking requirements) is scattered across demand records or missing entirely.
2. **No parent for intersection pages.** The expert's intersection model requires a strong service parent page before a city×service intersection can be considered. Without this parent, intersection pages have no canonical target to redirect to.
3. **No service catalog.** Industry pages cannot link to individual service pages because they don't exist.

## Decision

### New content collection: `surface/services/{lang}/*.md`

A new content collection holds service dossier records. Each record is a Markdown file with YAML frontmatter, one per industry×service tuple.

File naming: `surface/services/{lang}/{industry}-{service}.md` (e.g., `surface/services/uk/friseur-strizhka.md`).

### Service record schema

| Field | Type | Maps to block | Purpose |
| --- | --- | --- | --- |
| `serviceId` | `string` | (metadata) | Stable identifier (e.g., `friseur/strizhka`) |
| `industryId` | `string` | (metadata) | Parent industry slug |
| `name` | `string` | `hero` (heading) | Display name (e.g., "Стрижка") |
| `slug` | `string` | (metadata) | URL slug (e.g., `strizhka`) |
| `summary` | `string` | `hero` (lead) | One-sentence summary of the service |
| `servicePurpose` | `string` | `md` (purpose) | What this service page explains — how to present the service on a client site |
| `customerQuestions` | `string[]` | `cardGrid` (questions) | Questions the page answers through structure |
| `serviceVariants` | `Array<{ displayName, description, includedSteps, priceModel, durationModel, bookingMode, evidenceStatus }>` | `cardGrid` (variants) | Service variant catalog — not auto-published, describes the model |
| `pricePresentationModels` | `string[]` | `listCards` (price) | Honest price presentation models (Festpreis, Ab-Preis, Preisspanne, etc.) |
| `durationPresentation` | `string[]` | `listCards` (duration) | Duration presentation models (ungefähre Dauer, Zeitfenster, etc.) |
| `consultationRequirements` | `string` | `md` (consultation) | When consultation is needed before booking |
| `bookingRequirements` | `Array<{ mode, description }>` | `cardGrid` (booking) | Booking modes (directBooking, bookingRequest, phoneBooking, consultationFirst, externalBookingProvider) |
| `preparationInformation` | `string` | `md` (preparation) | What the client should prepare before the appointment |
| `aftercareInformation` | `string` | `md` (aftercare) | Post-service care guidance |
| `teamRelation` | `string` | `md` (team) | How service connects to team members (service → team member → skills → availability → booking) |
| `portfolioRequirements` | `string` | `md` (portfolio) | What evidence is needed for portfolio (real works only, no AI images) |
| `evidenceRequirements` | `string[]` | `listCards` (evidence) | What must not be published without evidence |
| `contactJourney` | `Array<{ step, description }>` | `cardGrid` (contact) | Contact journey steps for this service |
| `recommendedComponents` | `string[]` | `listCards` (components) | Recommended page components for this service |
| `recommendedPageStructure` | `Array<{ page, description }>` | `cardGrid` (architecture) | Recommended client-site page tree for this service |
| `claimRestrictions` | `string[]` | (validation) | Prohibited phrases for this service (extends global list) |
| `faq` | `Array<{ question, answer }>` | `md` blocks (FAQ) | Service-specific FAQ — no result claims |
| `sources` | `Array<{ ref, asOf, provenance }>` | (metadata) | Source references for verifiable claims |
| `reviewStatus` | `string` | (metadata) | `draft` | `reviewed` | `approved` |
| `publicationStatus` | `string` | (metadata) | `draft` | `published` | `remediation` |

### New blueprint: `website-service`

A new blueprint `website-service.yaml` generates service dossier pages. It is a separate surface from `website-local`, with its own axes, levels, and dataset. The `website-local` blueprint is not modified — no new axis, no new depth level.

```yaml
id: website-service
entitlement: pseo
axes:
  - id: industry
    universe: { collection: industries, field: slug }
    match: { recordField: industryId }
  - id: service
    universe: { collection: services, field: slug }
    match: { recordField: slug }
dataset:
  collection: services
  status: active
levels:
  - depth: 1
    slug:
      de: "website/{industry}/{service}"
      uk: "sait/{industry}/{service}"
    constellation: website-service
policy:
  minRecordsPerDepth:
    1: 1
  trailingSlash: true
linking:
  parent:
    surface: website-local
    depth: 1
    joinField: industryId
```

The service surface has two axes (`industry × service`) and one level (depth-1, the service dossier). There is no depth-0 pillar — the pillar page at `/website/` is generated by `website-local` and is shared via cross-linking. The `linking.parent` block declares that service pages link up to their parent industry page in `website-local`.

### Baker specialization (website-service, depth-1)

The baker gains a `website-service` depth-1 specialization that emits blocks in this order:

| Position | Block type                | Source field                                 |
| -------- | ------------------------- | -------------------------------------------- |
| 1        | `hero`                    | `name` / `summary` + service-purpose eyebrow |
| 2        | `md` (purpose)            | `servicePurpose`                             |
| 3        | `cardGrid` (questions)    | `customerQuestions`                          |
| 4        | `cardGrid` (variants)     | `serviceVariants`                            |
| 5        | `listCards` (price)       | `pricePresentationModels`                    |
| 6        | `listCards` (duration)    | `durationPresentation`                       |
| 7        | `cardGrid` (booking)      | `bookingRequirements`                        |
| 8        | `md` (consultation)       | `consultationRequirements`                   |
| 9        | `md` (team)               | `teamRelation`                               |
| 10       | `md` (portfolio)          | `portfolioRequirements`                      |
| 11       | `listCards` (evidence)    | `evidenceRequirements`                       |
| 12       | `cardGrid` (architecture) | `recommendedPageStructure`                   |
| 13       | `md` blocks (FAQ)         | `faq`                                        |
| 14       | `ctaBlock`                | service-specific CTA                         |

Absent fields omit their block — the baker is field-presence-driven, consistent with RFC-0193.

### Publication gate

`surface.service.validate` enforces:

| Gate                       | Minimum     |
| -------------------------- | ----------- |
| `serviceVariants`          | 3           |
| `customerQuestions`        | 3           |
| `pricePresentationModels`  | 3           |
| `faq`                      | 5           |
| `recommendedPageStructure` | 1           |
| `reviewStatus`             | `approved`  |
| `publicationStatus`        | `published` |

Pages failing the gate are not emitted as live routes.

### Claim restrictions

The global claim-restriction list from the `website-local` blueprint `dossier.claimRestrictions` (RFC-0492) applies to all service record text fields. Additionally, each service record may declare `claimRestrictions` for service-specific prohibited phrases. `surface.service.validate` checks all text fields against both the global list and the per-record list.

### Industry page linking

The industry page (depth-1 of `website-local`) gains a service catalog block that links to all published service pages for that industry. The baker emits this block when service records exist for the industry — it queries the `website-service` surface's generated routes for matching `industryId` and emits a `linkedCardGrid` block.

## Architectural fit

- **DNA-24 (Block-declarative pages):** The service record fields map to existing block types (hero, cardGrid, listCards, md, ctaBlock) — no new block archetypes are introduced. The baker remains field-presence-driven: absent fields omit their block. This is consistent with DNA-24 and the existing RFC-0193 bake contract.
- **DNA-53 (Semantic fingerprint governance):** `surface.service.validate` uses string matching for claim restrictions and record counting for the publication gate. No content-addressed fingerprints or ad hoc hashing helpers are introduced. DNA-53 is satisfied trivially — no new hashing outside `@gogol/fingerprint`. If similarity computation between service pages is needed in the future, it must use `@gogol/fingerprint` per DNA-53.
- **RFC-0192/0193 (Programmatic Surface):** The `website-service` blueprint is a new surface following the existing `PageSurfaceProvider` contract. The `expandBlueprint` orchestrator already handles multiple blueprints — `blueprints.ts` loads all YAML files from `packages/ontology/blueprints/` and `expandBlueprint` is called per blueprint. No new route source is introduced.
- **RFC-0238 (website-local surface):** Amended — the `website-local` blueprint gains cross-linking from depth-1 industry pages to `website-service` service pages. The axis order, depth numbering, and level structure of `website-local` are unchanged.
- **RFC-0478 (Platform versioning):** `versionBump: minor` — a new blueprint YAML and a new content collection are in `packages/`, so the platform semantic hash changes. A migrator is required (RFC-0479).
- **RFC-0479 (Migrator system):** A no-op migrator with id `rfc-0496` is registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts`. The migrator advances `migratorCursor` without transforming authored data — the `services` collection is additive, there are no existing service records to migrate.
- **RFC-0480 (Layer C protection):** `breaksC: true` declared. The declarative C-contract (`url-schema.yaml`) is updated in the same RFC with the new `/:locale?/:industry/:service` route pattern. `surface.contract.validate` verifies the C-contract.
- **RFC-0490 (depth-0 pillar):** Complementary — RFC-0490 restructures the depth-0 pillar as an industry navigation hub; this RFC adds service pages as a separate surface. The pillar links to industry pages, which in turn link to service pages.
- **RFC-0492 (industry dossier):** Complementary — RFC-0492 restructures depth-1 industry pages as engineering dossiers; this RFC adds service dossier pages as a separate surface. The industry page's `serviceTaxonomy` field (RFC-0492) drives the service catalog block.
- **RFC-0494 (city content collection):** Unaffected — city content records are in `website-local`'s depth-4. No overlap with `website-service`.
- **RFC-0495 (URL restructuring):** Complementary — RFC-0495 removed country/region segments from depth-4 and depth-5 URLs. This RFC adds a new URL pattern for service pages. No conflict.
- **RFC-0497 (intersection gate):** Dependent — RFC-0497's intersection pages redirect to service dossier pages when the intersection fails the gate. This RFC provides the service parent pages that RFC-0497 requires.

## Design

### CLI surface

```sh
# Validate service records against the publication gate + claim policy
pnpm exec site-kernel run surface.service.validate --site warpgogol-com

# Accepts --json for machine-readable output
pnpm exec site-kernel run surface.service.validate --site warpgogol-com --json
```

`surface.service.validate` is `scope: workspace` (operates on a specific site's surface content). It is integrated into `build.check` as a blocking check (warn mode initially, fail mode after grace period — same pattern as RFC-0492's `surface.industry.validate`).

### TypeScript contracts

```ts
/** New service record fields (added to the services content collection). */
interface ServiceDossierFields {
  serviceId: string;
  industryId: string;
  name: string;
  slug: string;
  summary: string;
  servicePurpose?: string;
  customerQuestions?: string[];
  serviceVariants?: Array<{
    displayName: string;
    description: string;
    includedSteps?: string[];
    priceModel?: string;
    durationModel?: string;
    bookingMode?: string;
    evidenceStatus?: string;
  }>;
  pricePresentationModels?: string[];
  durationPresentation?: string[];
  consultationRequirements?: string;
  bookingRequirements?: Array<{ mode: string; description: string }>;
  preparationInformation?: string;
  aftercareInformation?: string;
  teamRelation?: string;
  portfolioRequirements?: string;
  evidenceRequirements?: string[];
  contactJourney?: Array<{ step: string; description: string }>;
  recommendedComponents?: string[];
  recommendedPageStructure?: Array<{ page: string; description: string }>;
  claimRestrictions?: string[];
  faq?: Array<{ question: string; answer: string }>;
  sources?: Array<{ ref: string; asOf: string; provenance?: string }>;
  reviewStatus?: "draft" | "reviewed" | "approved";
  publicationStatus?: "draft" | "published" | "remediation";
}

/** Blueprint-level service configuration for website-service depth-1. */
interface BlueprintServiceConfig {
  gate: ServicePublicationGate;
  claimRestrictions: string[];
  mode: "warn" | "fail";
}

interface ServicePublicationGate {
  minServiceVariants: number;       // 3
  minCustomerQuestions: number;     // 3
  minPriceModels: number;           // 3
  minFaq: number;                   // 5
  minPageStructure: number;         // 1
}

/** Result of surface.service.validate. */
interface ServiceValidationResult {
  command: "surface.service.validate";
  status: "pass" | "fail";
  services: Array<{
    slug: string;
    industryId: string;
    lang: string;
    gatePassed: boolean;
    claimViolations: string[];
    missingFields: string[];
  }>;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/*/workpiece/src/content/surface/services/{lang}/*.md` | Service records — new content collection |
| `packages/ontology/blueprints/website-service.yaml` | New blueprint — service dossier surface |
| `packages/ontology/src/external-surfaces/url-schema.yaml` | Layer C contract — add `/:locale?/:industry/:service` route pattern |
| `packages/os/site-kernel-checks/src/surface-expand/bake.ts` | Baker — gains `website-service` depth-1 specialization |
| `packages/os/site-kernel-checks/src/surface-service-validate.ts` | New command handler for `surface.service.validate` |
| `packages/os/site-kernel-checks/src/command-tables/` | Command table entries registering the new command |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0496.ts` | New no-op migrator (RFC-0479) |
| `packages/os/site-kernel-handoff/src/migrators/registry.ts` | Registry — append `rfc0496Migrator` |
| `packages/surface/src/blueprint.ts` | Types — `BlueprintLevel` gains optional `service?: BlueprintServiceConfig` field |
| `packages/surface/src/blueprint-schema.ts` | Zod schema — `serviceSchema` added to `BlueprintLevel` schema |

### Output format

```json
{
  "command": "surface.service.validate",
  "status": "fail",
  "services": [
    {
      "slug": "strizhka",
      "industryId": "friseur",
      "lang": "uk",
      "gatePassed": false,
      "claimViolations": ["більше запитів"],
      "missingFields": ["serviceVariants", "pricePresentationModels", "faq"]
    }
  ]
}
```

### Failure modes

- **`surface.service.validate`**: exits non-zero when any service record fails the publication gate or contains claim violations. In `--json` mode, the full `services[]` array is returned. In pretty mode, each violation is printed with the file path and field name. In warn mode (`service.mode: "warn"`), gate failures are reported but exit 0.
- **Empty collection**: when no service records exist, `surface.service.validate` exits 0 with `status: "pass"` and an empty `services[]` array. `surface.generate` emits no service routes. Industry pages omit the service catalog block. This is graceful degradation — sites without service records are unaffected.
- **Missing blueprint**: when `website-service.yaml` is not listed in `system.md`'s `surface.blueprints`, `surface.generate` skips the surface. No error — the surface is optional.
- All commands are idempotent and read-only — they do not modify files.

## Rollout

### Default behavior

- **First introduction:** `surface.service.validate` runs in **warn mode** (`service.mode: "warn"`) — it reports gate failures and claim violations but does not block `build.check`. This gives operators time to author service records.
- **After grace period (90 days):** Operators switch `service.mode` to `"fail"` in the blueprint — service records failing the publication gate are not emitted, and `build.check` fails. The mode transition is a blueprint edit, not a date-based code change.
- **New sites:** automatically comply from day one — `onboarding.scaffold` does not generate service records (they require authored trade-specific expertise). `surface.service.validate` passes with an empty collection.

### Migration path

The migrator (`rfc-0496`) is a no-op on authored data — the `services` collection is additive, there are no existing service records to migrate. `mission.migrate` runs the migrator, which advances `migratorCursor` without changing content files. `surface.generate` regenerates `src/surface.generated.json` with the new `website-service` routes.

### Pipeline integration

| Command | Pipeline | Behavior |
| --- | --- | --- |
| `surface.service.validate` | `build.check` | Blocking after grace period; warn mode initially |
| `surface.generate` | `build.prepare` | Emits service pages from `website-service` blueprint |
| `surface.validate` | `build.check` | Checks service record gates and cross-linking |
| `surface.contract.validate` | `build.check` | Validates `/:locale?/:industry/:service` route pattern (Layer C) |

### Deployment sequence

1. Platform change merged: new blueprint, C-contract, baker, validator, migrator.
2. Next mission for `warpgogol-com`: `mission.materialize` → `mission.migrate` (no-op) → operator authors service records → `mission.validate` → `release.prepare` → `mission.reconcile` → `release.publish`.
3. `release.publish` deploys the new `dist` with service pages and updated `_redirects` simultaneously.

## Alternatives considered

1. **Depth 1.5 in `website-local` blueprint.** Rejected — the blueprint schema requires `depth: z.number().int().min(0)` (integer depths only). Fractional depths fail Zod validation. Additionally, the eligibility engine uses axis order position to determine which axes are active at each depth — inserting a `service` axis between `industry` and `country` would make depth-2 = `industry × service`, not `industry × country`, breaking the geo cascade.

2. **Renumber all depths in `website-local`.** Rejected — inserting `service` at depth-2 would shift country→3, region→4, city→5, demand→6. This requires updating all depth-dependent config (`minRecordsPerDepth`, `noindexBelowPerDepth`, `substanceMinPerDepth`, `evidencePerDepth`, `demandPerDepth`, `depthRoles`, `slaDaysPerDepth`, `regionalGateDepths`) in the blueprint, all depth comparisons in the eligibility engine, and all depth-specific baker specializations. The blast radius is disproportionate to the benefit — a separate surface achieves the same goal without touching the geo cascade.

3. **Extend blueprint schema to support non-sequential levels.** Rejected — over-engineering. The positional axis model is fundamental to the eligibility engine. Adding support for non-positional axes or fractional depths would complicate every depth-dependent function (`childrenOf`, `siblingsOf`, `skipSingletonChildren`, `levelByDepth`). A separate surface is simpler.

4. **Service pages as authored (non-surface) pages.** Rejected — authored pages lack the eligibility engine, publication gate, claim restriction enforcement, and automatic cross-linking that the surface model provides. Service pages need the same governance as industry pages (RFC-0492).

5. **LLM-generated service records.** Rejected — service records carry trade-specific expertise (variants, price models, booking requirements) that must be authored by operators who understand the trade. LLM generation risks hallucinating service variants, price models, or booking workflows that do not match the actual trade. The enrichment pipeline (RFC-0197/0207) remains limited to narratives.

6. **Separate `service-dossier` content collection outside the surface model.** Rejected — adding a collection outside the surface model would require a new loading path, a new mapping to routes, and a new validation pipeline. Using the existing surface model (new blueprint + new collection) is simpler and reuses all existing infrastructure.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Content authoring burden | Medium | The publication gate requires 3 variants, 3 questions, 3 price models, 5 FAQs, 1 page structure per service. The grace period (90 days) gives operators time. Warn mode does not block initially. |
| False positive in claim detection | Low | The validator matches full phrases (e.g. "більше запитів", not just "більше"), consistent with RFC-0492. The phrase list is reviewed during implementation. |
| Agent misinterpretation: LLM-generated service records | Medium | Implementation notes explicitly prohibit LLM-generated service records. `surface.service.validate` claim detection catches many hallucination patterns. |
| Baker complexity | Low | The `website-service` depth-1 specialization is isolated to `surfaceId === "website-service" && depth === 1` and follows the existing field-presence-driven pattern. Other surfaces and depths are unaffected. |
| Layer C break | Low | `breaksC: true` declared, `url-schema.yaml` updated in the same RFC, `surface.contract.validate` verifies. |
| Cross-surface linking errors | Low | Industry-to-service linking uses the generated routes from `website-service`, not hardcoded URLs. `surface.validate` checks for broken cross-links. |
| Empty collection on initial deployment | None | Graceful degradation — no service records means no service routes, no service catalog block, validator passes with empty array. |

## Implementation plan

1. Create `packages/ontology/blueprints/website-service.yaml` with axes `industry × service`, depth-1 level, and service config block.
2. Add `surface/services/{lang}/*.md` to the site content schema (loaded by `expandBlueprint` via `loadDataset`).
3. Add `website-service` to `system.md`'s `surface.blueprints` list.
4. Add `website-service` depth-1 baker specialization in `bakePage` (`bake.ts`).
5. Add industry-to-service cross-linking block in the `website-local` depth-1 baker.
6. Create `surface.service.validate` command in `packages/os/site-kernel-checks/src/surface-service-validate.ts`.
7. Register `surface.service.validate` in command tables.
8. Add `/:locale?/:industry/:service` route pattern to `url-schema.yaml`.
9. Register no-op migrator `rfc-0496` in `packages/os/site-kernel-handoff/src/migrators/registry.ts`.
10. Integrate `surface.service.validate` into `build.check` (warn mode).
11. Update `docs/requirements.xml` and `docs/verification-plan.xml` if they contain surface structure rules.
12. Update `packages/AGENTS.md` with agent instructions for service records.

## Acceptance criteria

- [x] `surface/services/{lang}/*.md` collection exists and is loaded by `expandBlueprint` for the `website-service` blueprint. (evidence: systems/warpgogol-com/src/content/surface/services/de/.gitkeep, packages/os/site-kernel-checks/src/surface-expand/expand.ts:70-80)
- [x] `packages/ontology/blueprints/website-service.yaml` exists with axes `industry × service` and depth-1 level. (evidence: packages/ontology/blueprints/website-service.yaml:1-57, surface-service-validate.test.ts:19-46)
- [x] `url-schema.yaml` contains the `/:locale?/:industry/:service` route pattern with `generated: true`. (evidence: packages/ontology/src/external-surfaces/url-schema.yaml:34-44, surface.contract.validate — 0 violations)
- [x] `bakePage` generates service pages from the structured fields for `website-service` depth-1. (evidence: packages/os/site-kernel-checks/src/surface-expand/bake.ts:354-494, bakeServiceDossier function)
- [x] `surface.service.validate` enforces the publication gate and claim restrictions. (evidence: packages/os/site-kernel-checks/src/surface-service-validate.ts:1-197, surface-service-validate.test.ts — 5 tests pass)
- [x] `surface.service.validate` is registered in command tables with `--site` and `--json` flags. (evidence: packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts:93-101)
- [x] `surface.service.validate` is integrated into `build.check` (warn mode initially). (evidence: packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts:113-116)
- [x] Service pages are generated at `/website/{industry}/{service}/` (DE) and `/sait/{industry}/{service}/` (UK). (evidence: packages/ontology/blueprints/website-service.yaml:14-17, slug templates for de and uk)
- [x] Industry pages (depth-1 of `website-local`) link to their child service pages via a service catalog block. (evidence: packages/os/site-kernel-checks/src/surface/service-catalog-links.ts:1-115, surface-service-catalog-links.test.ts — 4 tests pass)
- [x] No service page publishes fabricated prices, durations, or availability. (evidence: packages/os/site-kernel-checks/src/surface-expand/bake.ts:354-494, baker uses pricePresentationModels/durationPresentation as structural guidance, not fabricated values)
- [x] Migrator `rfc-0496` registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts`. (evidence: packages/os/site-kernel-handoff/src/migrators/registry.ts:38, rfc-0496.ts)
- [x] `migrator.registry.validate` passes with the new migrator. (evidence: migrator.registry.validate — 0 rfc-0496 violations, rfc-0496.pbt.test.ts + rfc-0496.snapshot.test.ts pass)
- [x] `surface.contract.validate` passes with the updated `url-schema.yaml`. (evidence: surface.contract.validate --site warpgogol-com — 3 surfaces validated, 0 violations)
- [x] `content.references.validate` and `content.voice.lint` pass for all service records. (evidence: content.references.validate --site warpgogol-com — 0 violations, content.voice.lint --site warpgogol-com — 0 warnings)
- [x] `rfc.validate` passes on this file. (evidence: rfc.validate --root — 0 rfc-0496 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT fill service record fields (`serviceVariants`, `pricePresentationModels`, `bookingRequirements`, `faq`, `recommendedPageStructure`, etc.) with LLM-generated content. These fields require authored trade-specific expertise. Agents MAY suggest field values for operator review, but the operator must approve and author the final content.
- Agents MAY implement the blueprint, baker specialization, validation command, C-contract update, and migrator — these are mechanical code changes, not content authoring.
- Agents MUST register the `rfc-0496` migrator in `packages/os/site-kernel-handoff/src/migrators/registry.ts` — `versionBump: minor` requires a migrator (RFC-0479).
- Agents MUST update `url-schema.yaml` in the same change as the new blueprint — `breaksC: true` requires the C-contract to be updated (RFC-0480).
- Agents MUST run `surface.service.validate` and `surface.contract.validate` after implementation to verify the gate and C-contract compliance.
- Agents MUST update the `CHANGE_SUMMARY` Compass blocks in `bake.ts` and the new `surface-service-validate.ts` with `RFC-0496` entries (DNA-42).
