---
id: RFC-0497
title: "City×service intersection gate — explicit intersection records"
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
  - RFC-0480
  - RFC-0492
  - RFC-0494
  - RFC-0495
  - RFC-0496
satisfies:
  - DNA-24
  - DNA-53
breaksC: true
versionBump: minor
commands:
  proposed:
    - surface.intersection.validate
    - surface.intersection.report
  added:
    - surface.intersection.validate
    - surface.intersection.report
  changed:
    - surface.generate
    - surface.validate
    - surface.doorway-risk.report
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - "@gogol/surface"
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-handoff"
successSignals:
  - "Depth-5 demand pages (city×service intersections) are only emitted when an explicit intersection record exists in surface/intersections/{lang}/{industry}-{city}-{service}.md — no Cartesian generation from industry × city × service registries."
  - "Each intersection record carries structured fields: intersectionId, industryId, cityId, serviceId, localServiceQuestions, localServiceConstraints, localBookingContext, localEvidence, uniqueContentBlocks, officialSources, expertSources, reviewedAt, reviewedBy, publicationDecision."
  - "surface.intersection.validate enforces a minimum intersection gate: 3 local-service questions, 2 intersection-specific scenarios, 2 verifiable local facts, 1 unique information architecture, 1 unique booking or location workflow, 3 unique FAQ, 1 source set, 1 manual editorial approval."
  - "surface.intersection.validate enforces similarity thresholds: similarityToIndustryPage, similarityToCityPage, similarityToServicePage, and similarityToOtherIntersections must each be below a configured threshold (default 0.70)."
  - "Intersection pages that fail the gate are not emitted — no noindex stub, no sitemap entry, no internal link. Absence of record means absence of page."
  - "surface.intersection.report generates a build-time scaling report: industry pages, city pages, service pages, city-service intersections, indexable intersections, noindex intersections, missing evidence, duplicate similarity, doorway risk."
  - "Release blocks on: indexable intersection without approval, intersection without sources, intersection duplicates parent, intersection only substitutes place name, intersection contains unsupported result claims."
  - "The existing demand record collection (surface/demands/{lang}/{industry}/{city}.md) is preserved as the data source for intersection records — the intersection record adds the gate-specific fields that the demand record lacks."
  - "Inherited prose may not be rendered twice — the intersection page baker does not re-render industry, city, or service prose blocks. Only intersection-specific blocks are emitted."
  - "The 'substance remains after removing city name, key phrase, CTA, and AI image' test is enforced by surface.intersection.validate — if the page loses meaning without these, it fails the gate."
nonGoals:
  - "Does not create service dossier pages — that is RFC-0496. This RFC depends on RFC-0496 for the service parent page that intersection pages redirect to when they fail the gate."
  - "Does not change the URL structure — that is RFC-0495. This RFC uses the URLs defined by RFC-0495."
  - "Does not change structured data — that is RFC-0498."
  - "Does not change the demand record schema — the demand record remains the source of localDemandContext, searchedAs, neededPage, trustProofs, leadLosingMistakes, howSolved, localFacts, citySpecificQa. The intersection record adds gate-specific fields on top."
  - "Does not remove the demand axis from the blueprint — the demand axis remains as the universe for intersection records. The change is that depth-5 pages require an intersection record, not just a demand record."
  - "Does not create industry×city or industry×service intersection records — those are handled by the existing depth-4 (city) and depth-1.5 (service) levels. Only the three-way city×service intersection is gated by this RFC."
---

# RFC-0497: City×service intersection gate — explicit intersection records

## Context

The `website-local` surface (RFC-0238) generates depth-5 pages (demand pages) by combining industry × city × demand axes. The current generation logic creates a page whenever a demand record exists for a given industry×city tuple — this is effectively a Cartesian product gated only by demand record existence.

An external expert review (file 14.3) identified this as **the most problematic level in the entire programmatic surface**. The automatic generation of `industry × city × service` pages creates pages that:

1. **Lack unique content** — the page repeats the parent industry page's prose with the city name swapped in.
2. **Create doorway abuse risk** — Google explicitly flags near-identical regional pages as doorway abuse.
3. **Create scaled content abuse risk** — mass-generated pages without independent value violate Google's spam policies.

The expert's core recommendation: **stop the Cartesian generation**. A page should only exist when there is a **self-contained local-service delta** that cannot be expressed on the parent industry, city, or service pages.

## Problem

The current `evidencePerDepth` policy for depth-5 (RFC-0238, RFC-0492) requires:

- `minWerkEvidence: 1` — at least one work evidence
- `approvedNarrative: required` — an approved narrative
- `minTupleSpecificFacts: 2` — two tuple-specific facts
- `duplicate.maxSimilarityWithinCluster: 0.86` — similarity threshold within a cluster

This policy is necessary but **not sufficient**. It gates on evidence and similarity but does not require:

1. **An explicit intersection record** — the page is generated from a demand record that may exist for any reason, not because the intersection has been editorially approved.
2. **Local-service questions** — questions that arise only at the intersection of this city and this service, not on the city or service page alone.
3. **Unique information architecture** — the page must have a structure that differs from its parents.
4. **Manual editorial approval** — the page must be explicitly approved, not auto-generated.
5. **Similarity to all three parents** — the current check only compares within a cluster, not against the industry, city, and service parent pages.

## Decision

### New content collection: `surface/intersections/{lang}/{industry}-{city}-{service}.md`

A new content collection holds intersection records. Each record is a Markdown file with YAML frontmatter, one per industry×city×service tuple that has been editorially approved.

File naming: `surface/intersections/{lang}/{industry}-{city}-{service}.md` (e.g., `surface/intersections/uk/friseur-stuttgart-strizhka.md`).

### Intersection record schema

| Field | Type | Purpose |
| --- | --- | --- |
| `intersectionId` | `string` | Stable identifier (e.g., `friseur/stuttgart/strizhka`) |
| `industryId` | `string` | Parent industry slug |
| `cityId` | `string` | City slug (without country/region) |
| `serviceId` | `string` | Service slug |
| `localServiceQuestions` | `string[]` | Questions that arise only at this city×service intersection |
| `localServiceConstraints` | `string[]` | Constraints specific to this service in this city |
| `localBookingContext` | `string` | How booking works for this service in this city specifically |
| `localEvidence` | `Array<{ id, text, sourceRef, asOf, reviewEvery, provenance }>` | Verifiable local facts specific to this intersection |
| `uniqueContentBlocks` | `string[]` | Content blocks that are unique to this intersection (not inherited from parents) |
| `officialSources` | `Array<{ ref, asOf }>` | Official sources for this intersection |
| `expertSources` | `Array<{ ref, asOf }>` | Expert sources for this intersection |
| `reviewedAt` | `string` (date) | Date of last editorial review |
| `reviewedBy` | `string` | Reviewer identity (human handle) |
| `publicationDecision` | `string` | `approved` | `rejected` | `pending` |

### Generation rule

```
depth-5 page is emitted IF AND ONLY IF:
  1. A demand record exists for this industry×city×service tuple
  2. An intersection record exists for this industry×city×service tuple
  3. The intersection record has publicationDecision: approved
  4. The intersection record passes surface.intersection.validate
```

**Absence of an intersection record means absence of a page.** No noindex stub, no sitemap entry, no internal link. The page simply does not exist.

### Minimum intersection gate

`surface.intersection.validate` enforces:

| Gate | Minimum | Description |
| --- | --- | --- |
| `localServiceQuestions` | 3 | Questions that arise only at this intersection |
| Intersection-specific scenarios | 2 | Scenarios from `localServiceConstraints` or `localBookingContext` |
| `localEvidence` | 2 | Verifiable local facts with sourceRef |
| Unique information architecture | 1 | `uniqueContentBlocks` must have at least 1 entry |
| Unique booking or location workflow | 1 | `localBookingContext` must be present and non-empty |
| Unique FAQ | 3 | FAQ entries in `localServiceQuestions` or a separate `uniqueFaq` field |
| Source set | 1 | At least one entry in `officialSources` or `expertSources` |
| Manual editorial approval | 1 | `publicationDecision: approved` + `reviewedBy` present |

### Similarity thresholds

```yaml
intersectionSimilarity:
  similarityToIndustryPage: 0.70
  similarityToCityPage: 0.70
  similarityToServicePage: 0.70
  similarityToOtherIntersections: 0.70
```

The similarity is computed using the same shingle method as the existing `duplicate.maxSimilarityWithinCluster` (RFC-0492). The page's hero signature + body text is compared against:

- The parent industry page (depth-1)
- The parent city page (depth-4)
- The parent service page (depth-1.5, RFC-0496)
- All other intersection pages in the same industry

### Substance independence test

The page must remain useful even if the following are removed:

- City name (the `cityId` or city display name)
- Key phrase (the page H1 / hero heading)
- CTA text (identified by `ctaBlock` block type)
- AI image alt text (identified by hero block `imageAlt`)

The test computes the page's token count (using the existing `pageText()` + `tokenize()` helpers from `surface-quality.ts`) with all elements present, then removes the four elements by string replacement and recomputes the token count. If the remaining token count falls below 50% of the original (configurable via `intersection.substanceIndependenceThreshold` in the blueprint, default 0.50), the page fails the gate — it means the page's substance was carried by the city name, key phrase, CTA, and image alone, not by intersection-specific content.

If the intersection page does not have an AI image (no `imageAlt` in the hero block), the test skips that element — the threshold is applied to the remaining three elements only.

### Schema delineation: demand record vs. intersection record

The demand record (`surface/demands/{lang}/*.md`) and the intersection record (`surface/intersections/{lang}/*.md`) serve distinct purposes:

| Source | Fields | Purpose |
| --- | --- | --- |
| Demand record | `localDemandContext`, `searchedAs`, `neededPage`, `trustProofs`, `leadLosingMistakes`, `howSolved`, `localFacts`, `citySpecificQa` | What users search for, why they need the service, trust proofs, common mistakes, how the problem is solved, local facts, city-specific Q&A |
| Intersection record | `localServiceQuestions`, `localServiceConstraints`, `localBookingContext`, `localEvidence`, `uniqueContentBlocks`, `officialSources`, `expertSources` | Questions that arise only at this city×service intersection, constraints specific to the service in this city, booking context, verifiable local facts, unique content blocks, source references |

The baker does NOT render demand record fields on intersection pages. The depth-5 baker specialization for `website-local` is replaced: it emits only intersection-specific blocks from the intersection record. The demand record remains the eligibility source (a demand record must exist for the tuple to be eligible), but the baker reads from the intersection record for block emission.

### Inherited prose prohibition

The intersection page baker **does not re-render** prose from parent pages. Only intersection-specific blocks are emitted:

| Position | Block type | Source field |
| --- | --- | --- |
| 1 | `hero` | Intersection-specific hero (not inherited from industry/city/service) |
| 2 | `cardGrid` (questions) | `localServiceQuestions` |
| 3 | `listCards` (constraints) | `localServiceConstraints` |
| 4 | `md` (booking) | `localBookingContext` |
| 5 | `listCards` (evidence) | `localEvidence` |
| 6 | `md` blocks (unique content) | `uniqueContentBlocks` |
| 7 | `md` blocks (FAQ) | Intersection-specific FAQ |
| 8 | `ctaBlock` | Intersection-specific CTA |

### Build-time scaling report

`surface.intersection.report` generates a report at each build:

```
industry pages: N
city pages: N
service pages: N
city-service intersections: N
  indexable: N
  noindex: N
  missing evidence: N
  duplicate similarity: N
  doorway risk: N
```

### Release blocking

Release is blocked if any of the following are true:

- Indexable intersection without `publicationDecision: approved`
- Intersection without sources (`officialSources` and `expertSources` both empty)
- Intersection duplicates parent (similarity threshold exceeded)
- Intersection only substitutes place name (substance independence test failed)
- Intersection contains unsupported result claims (claim restrictions violated)

### No redirects for failed intersections

When an intersection record does not exist or fails the gate, the page is not emitted — no route, no sitemap entry, no internal link. Old depth-5 URLs that previously served 200 now return 404. No redirect policy, no backward compatibility, no legacy stubs. Absence of record means absence of page.

## Architectural fit

- **DNA-24 (Block-declarative pages):** The intersection record fields map to existing block types (hero, cardGrid, listCards, md, ctaBlock) — no new block archetypes are introduced. The baker remains field-presence-driven: absent fields omit their block. The depth-5 baker specialization is replaced with intersection-specific block emission only.
- **DNA-53 (Semantic fingerprint governance):** The similarity computation reuses the existing shingle-based n-gram Jaccard similarity from RFC-0274 (implemented in `surface-quality.ts`). No new ad hoc hashing helpers are introduced outside `@gogol/fingerprint`. If the similarity computation ever needs content-addressed fingerprints, it must use `@gogol/fingerprint` per DNA-53.
- **RFC-0192/0193 (Programmatic Surface):** The intersection collection is loaded as a supplementary dataset for the demand axis (analogous to RFC-0494's city content loading). The eligibility engine and `expandBlueprint` orchestrator are extended with a new intersection gate — no new route source is introduced.
- **RFC-0238 (website-local surface):** Amended — the depth-5 generation rule changes from demand-record-only to demand-record + intersection-record. The five-axis cascade (industry × country × region × city × demand) is preserved; only the depth-5 emission gate changes.
- **RFC-0478 (Platform versioning):** `versionBump: minor` — the depth-5 generation contract changes (new required collection), which is a Breaks-B data contract change. A migrator is required (RFC-0479).
- **RFC-0479 (Migrator system):** A no-op migrator with id `rfc-0497` is registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts`. The migrator advances `migratorCursor` without transforming authored data — the `intersections` collection is additive, there are no existing intersection records to migrate.
- **RFC-0480 (Layer C protection):** `breaksC: true` declared. The behavior change is that depth-5 URLs that used to serve 200 now return 404 (page not emitted). No C-contract file changes are needed — `url-schema.yaml` already has the depth-5 pattern (`/:locale?/:industry/:city/:demand`) from RFC-0495, `jsonld-types.yaml` is unchanged (RFC-0498 handles structured data), and `sitemap-shape.yaml` is unchanged (the sitemap just has fewer entries). The `breaksC: true` is required because `release.prepare` blocks on C-surface regression (fewer indexable pages) without it.
- **RFC-0492 (industry dossier):** Complementary — RFC-0492 restructured depth-1 industry pages as engineering dossiers. This RFC gates depth-5 intersection pages on explicit intersection records. The `surface.doorway-risk.report` (RFC-0492) is updated to also check for intersection records.
- **RFC-0494 (city content collection):** Unaffected — city content records are in `website-local`'s depth-4. No overlap with intersection records.
- **RFC-0495 (URL restructuring):** Complementary — RFC-0495 defined the depth-5 URL pattern (`/website/{industry}/{city}/{demand}/`). This RFC uses those URLs. Depth-5 URLs without intersection records simply return 404.
- **RFC-0496 (service dossier):** Related — RFC-0496 provides service dossier pages at depth-1.5. Intersection pages and service dossier pages coexist independently; no redirect relationship.

## Design

### CLI surface

```sh
# Validate intersection records against the minimum gate, similarity thresholds, and substance independence test
pnpm exec site-kernel run surface.intersection.validate --site webgogol-com

# Generate the build-time scaling report
pnpm exec site-kernel run surface.intersection.report --site webgogol-com

# Both accept --json for machine-readable output
pnpm exec site-kernel run surface.intersection.validate --site webgogol-com --json
```

Both commands are `scope: workspace` (they operate on a specific site's surface content). `surface.intersection.validate` is integrated into `build.check` as a blocking check (warn mode initially, fail mode after grace period — same pattern as RFC-0492/0496). `surface.intersection.report` is a diagnostic report — it emits warnings in `build.check` but does not block.

### Content collection loading

`expand.ts` loads intersection records via `loadDataset(appDir, "intersections", lang)` (analogous to RFC-0494's city content loading). The intersection records are matched against depth-5 entries by joining on `industryId` (matches the entry's `axes.industry`), `cityId` (matches the entry's `axes.city`), and `serviceId` (matches the entry's `axes.demand` — the demand slug is the service identifier).

A new gate `applyIntersectionGate` is added to `pipeline.ts` (alongside the existing `applyExistenceGates`). Entries at depth-5 that do not have a matching intersection record with `publicationDecision: approved` are dropped (do-not-emit). This gate runs after the existing demand and evidence gates.

### TypeScript contracts

```ts
/** Intersection record fields (RFC-0497). Loaded from surface/intersections/{lang}/*.md. */
interface IntersectionRecord {
  intersectionId: string;
  industryId: string;
  cityId: string;
  serviceId: string;
  localServiceQuestions?: string[];
  localServiceConstraints?: string[];
  localBookingContext?: string;
  localEvidence?: Array<{ id: string; text: string; sourceRef: string; asOf: string; reviewEvery?: string; provenance?: string }>;
  uniqueContentBlocks?: string[];
  officialSources?: Array<{ ref: string; asOf: string }>;
  expertSources?: Array<{ ref: string; asOf: string }>;
  reviewedAt?: string;
  reviewedBy?: string;
  publicationDecision: "approved" | "rejected" | "pending";
}

/** Blueprint-level intersection configuration for depth-5. */
interface BlueprintIntersectionConfig {
  gate: IntersectionGate;
  similarity: IntersectionSimilarity;
  substanceIndependenceThreshold: number; // default 0.50
  mode: "warn" | "fail"; // default "warn"
}

interface IntersectionGate {
  minLocalServiceQuestions: number;   // 3
  minScenarios: number;               // 2
  minLocalEvidence: number;           // 2
  minUniqueContentBlocks: number;     // 1
  minUniqueFaq: number;               // 3
  minSources: number;                 // 1
}

interface IntersectionSimilarity {
  similarityToIndustryPage: number;       // 0.70
  similarityToCityPage: number;           // 0.70
  similarityToServicePage: number;        // 0.70
  similarityToOtherIntersections: number; // 0.70
}

/** Result of surface.intersection.validate. */
interface IntersectionValidationResult {
  command: "surface.intersection.validate";
  status: "pass" | "fail";
  intersections: Array<{
    intersectionId: string;
    gatePassed: boolean;
  }>;
}

/** Result of surface.intersection.report. */
interface IntersectionReportData {
  command: "surface.intersection.report";
  status: "pass" | "warn";
  industryPages: number;
  cityPages: number;
  servicePages: number;
  cityServiceIntersections: number;
  indexable: number;
  noindex: number;
  missingEvidence: number;
  duplicateSimilarity: number;
  doorwayRisk: number;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/*/workpiece/src/content/surface/intersections/{lang}/*.md` | Intersection records — new content collection |
| `packages/ontology/blueprints/website-local.yaml` | Blueprint — gains `intersection` config block on depth-5 level |
| `packages/surface/src/blueprint.ts` | Types — `BlueprintLevel` gains optional `intersection?: BlueprintIntersectionConfig` field |
| `packages/surface/src/blueprint-schema.ts` | Zod schema — `intersectionSchema` added to `BlueprintLevel` schema |
| `packages/os/site-kernel-checks/src/surface-expand/expand.ts` | Loads intersection collection and passes to intersection gate |
| `packages/os/site-kernel-checks/src/surface-expand/pipeline.ts` | New `applyIntersectionGate` function — drops depth-5 entries without approved intersection records |
| `packages/os/site-kernel-checks/src/surface-expand/bake.ts` | Baker — depth-5 specialization replaced with intersection-specific block emission |
| `packages/os/site-kernel-checks/src/surface-expand/bake-helpers.ts` | Helpers — `intersectionQuestions`, `intersectionConstraints`, `intersectionEvidence`, `intersectionContentBlocks` helpers |
| `packages/os/site-kernel-checks/src/surface-intersection-validate.ts` | New command handler for `surface.intersection.validate` |
| `packages/os/site-kernel-checks/src/surface-intersection-report.ts` | New command handler for `surface.intersection.report` |
| `packages/os/site-kernel-checks/src/surface-doorway-risk.ts` | Updated — also checks for intersection records at depth-5 |
| `packages/os/site-kernel-checks/src/command-tables/` | Command table entries registering the two new commands |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0497.ts` | New no-op migrator (RFC-0479) |
| `packages/os/site-kernel-handoff/src/migrators/registry.ts` | Registry — append `rfc0497Migrator` |

### Output format

```json
{
  "command": "surface.intersection.validate",
  "status": "fail",
  "intersections": [
    {
      "intersectionId": "friseur/stuttgart/strizhka",
      "gatePassed": false
    }
  ]
}
```

```json
{
  "command": "surface.intersection.report",
  "status": "warn",
  "industryPages": 2,
  "cityPages": 12,
  "servicePages": 5,
  "cityServiceIntersections": 24,
  "indexable": 3,
  "noindex": 0,
  "missingEvidence": 18,
  "duplicateSimilarity": 2,
  "doorwayRisk": 1
}
```

### Failure modes

- **`surface.intersection.validate`**: exits non-zero when any intersection record fails the minimum gate, similarity thresholds, or substance independence test. In `--json` mode, the full `intersections[]` array is returned. In warn mode (`intersection.mode: "warn"`), gate failures are reported but exit 0.
- **`surface.intersection.report`**: exits 0 with `status: "warn"` when pages are flagged. The report is diagnostic — it does not block `build.check`.
- **Empty collection**: when no intersection records exist, `surface.intersection.validate` exits 0 with `status: "pass"` and an empty `intersections[]` array. `surface.generate` emits no depth-5 pages. This is graceful degradation — sites without intersection records have no depth-5 pages.
- **Intersection record without matching demand record**: the generation rule requires both a demand record AND an intersection record. If an intersection record exists but no demand record matches the tuple, the entry is not generated (the demand gate drops it before the intersection gate runs).
- **Language fallback**: if an intersection record exists only in the default language, `valData()` returns the default-language fields for all languages (existing fallback behavior).
- All commands are idempotent and read-only — they do not modify files.

## Rollout

### Default behavior

- **First introduction:** `surface.intersection.validate` runs in **warn mode** (`intersection.mode: "warn"`) — it reports gate failures but does not block `build.check`. Depth-5 pages without intersection records are not emitted (the generation rule is enforced regardless of mode), but the validator does not block the build. This gives operators time to author intersection records.
- **After grace period (90 days):** Operators switch `intersection.mode` to `"fail"` in the blueprint — intersection records failing the gate cause `build.check` to fail. The mode transition is a blueprint edit, not a date-based code change.
- **New sites:** automatically comply from day one — `onboarding.scaffold` does not generate intersection records (they require authored local expertise). `surface.intersection.validate` passes with an empty collection. No depth-5 pages are emitted until intersection records are authored.

### Migration path

The migrator (`rfc-0497`) is a no-op on authored data — the `intersections` collection is additive, there are no existing intersection records to migrate. `mission.migrate` runs the migrator, which advances `migratorCursor` without changing content files. `surface.generate` regenerates `src/surface.generated.json` with the intersection gate applied — existing depth-5 pages that do not have intersection records are not emitted and return 404.

### Pipeline integration

| Command | Pipeline | Behavior |
| --- | --- | --- |
| `surface.intersection.validate` | `build.check` | Blocking after grace period; warn mode initially |
| `surface.intersection.report` | `build.check` | Diagnostic — warnings only, does not block |
| `surface.generate` | `build.prepare` | Emits depth-5 pages only when approved intersection records exist |
| `surface.validate` | `build.check` | Checks intersection record gates |
| `surface.doorway-risk.report` | `build.check` | Updated — also checks for intersection records at depth-5 |

## Implementation plan

1. Add `surface/intersections/{lang}/*.md` content collection — loaded by `expand.ts` via `loadDataset(appDir, "intersections", lang)`.
2. Add `intersectionSchema` to `BlueprintLevel` in `@gogol/surface` (Zod schema + TypeScript type).
3. Add `intersection` config block to `website-local.yaml` depth-5 level.
4. Add `applyIntersectionGate` to `pipeline.ts` — drops depth-5 entries without approved intersection records.
5. Update `expand.ts` to load intersection records and pass them to `applyIntersectionGate`.
6. Replace depth-5 baker specialization in `bake.ts` — emit only intersection-specific blocks.
7. Add `surface.intersection.validate` command in `surface-intersection-validate.ts`.
8. Add `surface.intersection.report` command in `surface-intersection-report.ts`.
9. Register both commands in command tables.
10. Update `surface.doorway-risk.report` to check for intersection records at depth-5.
11. Register no-op migrator `rfc-0497` in `packages/os/site-kernel-handoff/src/migrators/registry.ts`.
12. Integrate `surface.intersection.validate` into `build.check` (warn mode).
13. Update `release.prepare` to block on intersection gate failures.

## Alternatives considered

1. **Extend `surface.doorway-risk.report` instead of new commands.** Rejected — `surface.doorway-risk.report` (RFC-0492) is a diagnostic for depth-4 city pages. Intersection gate enforcement requires a blocking validator (publication gate, similarity thresholds, substance independence test) and a scaling report (industry/city/service/intersection counts). These are distinct purposes from doorway-risk diagnosis. Adding them as flags would overload the existing command with different semantics.

2. **Merge `surface.intersection.validate` and `surface.intersection.report` into one command.** Rejected — the validate command is a blocking gate (exits non-zero on failure), while the report command is diagnostic (always exits 0). Merging them would require a `--report` flag to switch between blocking and diagnostic behavior, which is inconsistent with the ecosystem pattern (RFC-0492 separated `surface.industry.validate` from `surface.duplicate-content.report`).

3. **Auto-generate intersection records from demand records.** Rejected — intersection records require editorial approval and local expertise (`localServiceQuestions`, `localEvidence`, `uniqueContentBlocks`). Auto-generation would defeat the gate's purpose: the intersection record exists precisely to prevent automatic page generation without human review.

4. **Keep depth-5 pages as noindex stubs instead of not emitting them.** Rejected — the expert review (file 14.3) explicitly identified noindex stubs as insufficient. Google may still crawl noindex pages and flag them as doorway/scaled content. Absence of the page (no route, no sitemap entry, no internal link) is the only clean signal.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| SEO disruption from depth-5 pages disappearing | Medium | Pages simply disappear (404); sitemap regenerated immediately; warn mode gives operators time to author intersection records |
| Content authoring burden | High | Each intersection needs 3 questions, 2 scenarios, 2 evidence items, 3 FAQ, 1 source set, editorial approval. Grace period (90 days) gives operators time. Warn mode does not block initially. |
| False positive in substance independence test | Medium | The 50% token-count threshold is configurable. Operators can adjust `intersection.substanceIndependenceThreshold` in the blueprint. The test skips absent elements (e.g., no AI image). |
| O(N²) similarity computation for N intersections per industry | Low | Current dataset has 2 industries × 6 cities × ~4 services = ~48 potential intersections. O(N²) = ~2304 comparisons per industry — trivial. Future scaling should precompute parent page text once and cache shingle sets. |
| Agent misinterpretation: LLM-generated intersection records | Medium | Implementation notes explicitly prohibit LLM-generated content. `surface.intersection.validate` catches missing fields and similarity violations. |
| Layer C break | Low | `breaksC: true` declared; no C-contract file changes needed; `surface.contract.validate` passes (URL patterns unchanged from RFC-0495). |
| Migrator not registered | None | `versionBump: minor` requires migrator (RFC-0479); no-op migrator `rfc-0497` registered in the same change. |

## Acceptance criteria

- [x] `surface/intersections/{lang}/*.md` collection exists and is loaded by `expand.ts` via `loadDataset(appDir, "intersections", lang)`. (evidence: packages/os/site-kernel-checks/src/surface-expand/expand.ts:270-287)
- [x] `surface.generate` does not emit depth-5 pages without an approved intersection record. (evidence: packages/os/site-kernel-checks/src/surface-expand/pipeline.ts:135-159, applyIntersectionGate filters by approved records)
- [x] `surface.intersection.validate` enforces the minimum gate, similarity thresholds, and substance independence test. (evidence: packages/os/site-kernel-checks/src/surface-intersection-validate.ts:1-280, diagnostics: intersection-gate-below-threshold, intersection-similarity-exceeded, intersection-substance-independence)
- [x] `surface.intersection.report` generates the build-time scaling report. (evidence: packages/os/site-kernel-checks/src/surface-intersection-report.ts:1-120, registered in command table 09b-build-artifacts-part2.ts:126-134)
- [x] The baker does not re-render inherited prose on depth-5 pages — only intersection-specific blocks are emitted. (evidence: packages/os/site-kernel-checks/src/surface-expand/bake.ts:483-572, bakeIntersection emits only hero/questions/constraints/bookingContext/evidence/uniqueContent/cta blocks from intersection record)
- [x] Release blocks on intersection gate failures. (evidence: packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts:117-118, surface.intersection.validate in pipeline)
- [x] Old URLs for non-existent intersections return 404 — verified via `surface.generate` output (no route emitted for depth-5 without intersection record). (evidence: packages/os/site-kernel-checks/src/surface-expand/pipeline.ts:140-142, entries without approved record are filtered out)
- [x] No new city×service pages are generated automatically without an explicit intersection record. (evidence: packages/os/site-kernel-checks/src/surface-expand/pipeline.ts:135-159, applyIntersectionGate drops all depth-5 entries when intersections list is empty)
- [x] Migrator `rfc-0497` registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts`. (evidence: packages/os/site-kernel-handoff/src/migrators/registry.ts:31,41)
- [x] `migrator.registry.validate` passes with the new migrator. (evidence: pnpm exec site-kernel run migrator.registry.validate — 8 migrator(s) in registry, only pre-existing rfc-0492.snapshot.test.ts violation remains)
- [x] `rfc.validate` passes on this file. (evidence: pnpm exec site-kernel run rfc.validate — exit code 0, no RFC-0497 specific errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` or `implemented`.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
- Agents MUST NOT fill intersection record fields (`localServiceQuestions`, `localServiceConstraints`, `localBookingContext`, `localEvidence`, `uniqueContentBlocks`) with LLM-generated content. These fields require authored local expertise. Agents MAY suggest field values for operator review, but the operator must approve and author the final content.
- Agents MAY implement the `expand.ts` data loading change, `pipeline.ts` intersection gate, `bake.ts` depth-5 specialization, validation commands, and migrator — these are mechanical code changes, not content authoring.
- Agents MUST register the `rfc-0497` migrator in `packages/os/site-kernel-handoff/src/migrators/registry.ts` — `versionBump: minor` requires a migrator (RFC-0479).
- Agents MUST run `surface.intersection.validate` and `surface.intersection.report` after implementation to verify the gate and scaling report.
- Agents MUST update the `CHANGE_SUMMARY` Compass blocks in `expand.ts`, `pipeline.ts`, `bake.ts`, and the new `surface-intersection-validate.ts` / `surface-intersection-report.ts` files with `RFC-0497` entries (DNA-42).
- Agents MUST update `packages/os/site-kernel-checks/AGENTS.md` command table with the two new commands.
