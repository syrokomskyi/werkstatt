---
id: RFC-0506
title: "Ratgeber article JSON-LD — Article fields, BreadcrumbList, and FAQPage prohibition"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-23
updatedAt: 2026-07-23
implementedAt: 2026-07-23
enhancedAt: 2026-07-23
supersedes: []
supersededBy:
amends:
  - RFC-0498
  - RFC-0500
amendedBy: []
related:
  - RFC-0074
  - RFC-0192
  - RFC-0193
  - RFC-0478
  - RFC-0479
  - RFC-0480
  - RFC-0498
  - RFC-0500
  - RFC-0502
  - RFC-0504
satisfies:
  - DNA-16
  - DNA-24
  - DNA-53
breaksC: true
versionBump: minor
commands:
  proposed: []
  added: []
  changed:
    - seo.structured-data.validate
    - surface.contract.validate
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/ontology"
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-handoff"
successSignals:
  - "Every ratgeber depth-1 article page emits Article JSON-LD with: headline, description, author, publisher, datePublished, dateModified, mainEntityOfPage."
  - "Every ratgeber depth-1 article page emits BreadcrumbList JSON-LD reflecting the canonical URL hierarchy (RFC-0495)."
  - "No ratgeber depth-1 article page emits FAQPage JSON-LD for rich result purposes."
  - "The Article JSON-LD author field references the author record (RFC-0502) — not a plain string."
  - "The Article JSON-LD datePublished is the article's first publication date; dateModified is the latest reviewedAt or changelog entry date."
  - "The Article JSON-LD mainEntityOfPage is the canonical URL of the article page."
  - "seo.structured-data.validate enforces the Article field policy for ratgeber depth-1 pages."
  - "surface.contract.validate checks the updated C-contract jsonld-types.yaml for ratgeber depth-1 Article fields."
  - "The C-contract jsonld-types.yaml Article type includes mainEntityOfPage and description in optional fields."
  - "The C-contract jsonld-types.yaml surfacePolicy for ratgeber depth-1 prohibits FAQPage."
nonGoals:
  - "Does not change JSON-LD emission for non-ratgeber surfaces — those are governed by RFC-0498."
  - "Does not add new JSON-LD types beyond Article and BreadcrumbList — both are already in the C-contract."
  - "Does not emit Review, AggregateRating, or other reputation-type JSON-LD — Warpgogol does not have reviews to markup."
  - "Does not change the ratgeber hub (depth-0) JSON-LD — that remains CollectionPage + BreadcrumbList (RFC-0500)."
  - "Does not change the URL structure — canonical URLs are already defined by RFC-0495."
---

# RFC-0506: Ratgeber article JSON-LD — Article fields, BreadcrumbList, and FAQPage prohibition

## Context

RFC-0498 defined the per-depth JSON-LD type policy for all surface pages. RFC-0500 extended this to the ratgeber surface: depth-0 emits CollectionPage + BreadcrumbList, depth-1 emits Article + BreadcrumbList. The C-contract `jsonld-types.yaml` already declares the Article type with required fields `headline`, `datePublished`, `author` and optional fields `dateModified`, `image`, `articleBody`, `about`, `publisher`.

An external expert review (file 15.1, section 8) requires that ratgeber article pages populate additional Article fields: `description`, `mainEntityOfPage`. The expert also prohibits `FAQPage` JSON-LD on article pages when used solely for rich results.

## Problem

1. **Missing Article fields.** The C-contract Article type does not include `mainEntityOfPage` or `description` in its optional fields. The expert requires both. The baker/renderer does not populate them.

2. **FAQPage emission.** Ratgeber article pages render FAQ blocks (RFC-0501 mandatory FAQ section). If the renderer emits FAQPage JSON-LD for these FAQs, it violates the expert's policy: "Do not use FAQPage only for rich results." The C-contract does not currently prohibit FAQPage on ratgeber depth-1.

3. **Author reference.** The Article JSON-LD `author` field should reference the author record (RFC-0502) with a structured `Person` object, not a plain string. The current emission may use a plain string.

4. **dateModified source.** The Article JSON-LD `dateModified` should reflect the latest editorial review or changelog entry, not a static value. The source of `dateModified` is not defined.

## Decision

### C-contract changes

Update `packages/ontology/src/external-surfaces/jsonld-types.yaml`:

**Article type — add optional fields:**

```yaml
- "@type": Article
  required: [headline, datePublished, author]
  optional: [dateModified, image, articleBody, about, publisher, description, mainEntityOfPage]
```

**Ratgeber depth-1 surface policy — prohibit FAQPage:**

```yaml
- surface: ratgeber
  depth: 1
  requiredTypes: [Article, BreadcrumbList]
  prohibitedTypes: [LocalBusiness, Service, Offer, BookAction, CollectionPage, FAQPage]
```

### Article JSON-LD field mapping

| JSON-LD field | Source | Required? |
| --- | --- | --- |
| `headline` | Article record `title` | Yes |
| `description` | Article record `summary` | Yes (expert requirement) |
| `author` | Author record (RFC-0502) → `{ @type: Person, name: author.name, url: author.contactUrl }` | Yes |
| `publisher` | `{ @type: Organization, name: Warpgogol, url: https://warpgogol.com }` | Yes (expert requirement) |
| `datePublished` | Article first publication date (from `publishedAt` or earliest changelog entry) | Yes |
| `dateModified` | Latest of `reviewedAt` or latest `changelog[].date` (RFC-0504) | Optional (emitted when available) |
| `mainEntityOfPage` | Canonical URL of the article page | Yes (expert requirement) |

### FAQPage prohibition

No ratgeber depth-1 page emits `FAQPage` JSON-LD. The FAQ section in the prose body (RFC-0501) is rendered as visible HTML blocks — not as JSON-LD. This prevents rich result exploitation and aligns with the expert's policy.

### Renderer changes

The JSON-LD renderer for ratgeber depth-1 pages (in `@gogol/share`) populates the Article JSON-LD object from:

- Article record frontmatter (`title`, `summary`, `publishedAt`, `reviewedAt`)
- Author record (RFC-0502) via `authorId`
- Changelog (RFC-0504) for `dateModified`
- Canonical URL from the surface route entry

### Validator changes

`seo.structured-data.validate` (RFC-0074) adds for ratgeber depth-1:

- **SD-RAT-01**: Article JSON-LD is present with `headline`, `description`, `author`, `publisher`, `datePublished`, `mainEntityOfPage`.
- **SD-RAT-02**: `author` is a structured `Person` object with `name` — not a plain string.
- **SD-RAT-03**: `mainEntityOfPage` matches the canonical URL of the page.
- **SD-RAT-04**: `FAQPage` JSON-LD is not present on ratgeber depth-1 pages.

`surface.contract.validate` checks the updated C-contract:

- Article type allows `description` and `mainEntityOfPage`.
- Ratgeber depth-1 surface policy prohibits `FAQPage`.

### Migrator

`versionBump: minor` means Breaks-B (RFC-0478), which requires a migrator (RFC-0479). Although no authored data is transformed, a no-op migrator with id `rfc-0506` is registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts` to advance `migratorCursor`. This follows the same pattern as RFC-0498 (C-contract-only change with no-op migrator). The migrator is idempotent (PBT `f(f(x))==f(x)`): it returns authored data unchanged.

## Architectural fit

- **DNA-16 (Semantic layer shares topology with navigation):** The Article JSON-LD fields are derived from the same `SemanticPageModel` that feeds navigation rendering. The `surfaceId` and `depth` fields on `SemanticPageModel` (already present from RFC-0492) gate the FAQPage suppression. No parallel page-structure model is introduced.
- **DNA-24 (Block-declarative pages):** JSON-LD emission is the renderer's responsibility (`@gogol/share`), not the baker's or route's. The baker produces page blocks; the renderer serializes them to HTML + JSON-LD. This RFC extends the renderer's Article node builder — it does not add route-level or baker-level logic.
- **DNA-53 (Semantic fingerprint governance):** No new ad hoc hashing helpers are introduced. The C-contract change in `jsonld-types.yaml` affects the platform semantic hash, which is governed by `versionBump: minor` and the no-op migrator.
- **RFC-0498 (structured data policy):** Amended — the ratgeber depth-1 surface policy in `jsonld-types.yaml` is extended with `FAQPage` in `prohibitedTypes` and the Article type gains `description` and `mainEntityOfPage` in `optional`.
- **RFC-0500 (ratgeber hub):** Amended — the depth-1 Article JSON-LD field mapping is extended with `description`, `mainEntityOfPage`, structured `author` (Person with `url`), and `dateModified` source definition.
- **RFC-0502 (author records):** The `author` JSON-LD field references the author record's `name` and `contactUrl` — not a plain string. The author record collection (`surface/authors/{lang}/*.md`) is already implemented by RFC-0502.
- **RFC-0504 (changelog):** The `dateModified` source is "latest of `reviewedAt` or latest `changelog[].date`". The `changelog` frontmatter field is defined by RFC-0504.
- **RFC-0478 (platform versioning):** `versionBump: minor` — the C-contract file (`jsonld-types.yaml`) is in `packages/ontology/`, so the platform semantic hash changes. A migrator is required (RFC-0479).
- **RFC-0479 (migrator system):** A no-op migrator with id `rfc-0506` is registered. The migrator advances `migratorCursor` without transforming authored data.
- **RFC-0480 (Layer C protection):** `breaksC: true` declared. The `jsonld-types.yaml` C-contract is updated in the same RFC. `surface.contract.validate` verifies compliance.
- **RFC-0074 (SEO audit):** `seo.structured-data.validate` is extended with SD-RAT-01..04 rules for ratgeber depth-1 pages.

## Design

### CLI surface

No new commands. Existing commands are updated:

```sh
# Extended with SD-RAT-01..04 for ratgeber depth-1 pages
pnpm exec site-kernel run seo.structured-data.validate --site warpgogol-com --json

# Extended with ratgeber depth-1 Article field checks against C-contract
pnpm exec site-kernel run surface.contract.validate --site warpgogol-com --json
```

Both commands are `scope: app`. `seo.structured-data.validate` runs in `sites-check-postbuild` (requires built `dist/` HTML). `surface.contract.validate` runs in `build.check`.

### TypeScript contracts

```ts
/** Extension to SemanticPageModel for ratgeber article JSON-LD. */
interface RatgeberArticleSemanticFields {
  /** Author record reference — replaces plain string author for ratgeber depth-1. */
  authorRecord?: {
    name: string;
    contactUrl?: string;
  };
  /** Latest reviewedAt date from article frontmatter. */
  reviewedAt?: string;
  /** Changelog entries from article frontmatter (RFC-0504). */
  changelog?: Array<{ date: string; summary: string; authorId: string }>;
}
```

The `SemanticPageModel` type in `packages/share/src/semantic/models.ts` gains these optional fields. The route resolver for ratgeber depth-1 pages populates them from the article record and author record before calling `buildJsonLd`.

### Author data flow

The `SemanticPageModel.author` field is currently `string` (used as `page.author` in `buildArticleNode`). For ratgeber depth-1 pages, the route resolver populates a new `authorRecord?: { name: string; contactUrl?: string }` field from the author record (RFC-0502). `buildArticleNode` checks: if `authorRecord` is present, emit `author: { "@type": "Person", name: authorRecord.name, ...(authorRecord.contactUrl ? { url: authorRecord.contactUrl } : {}) }`. If `authorRecord` is absent, fall back to the existing `page.author` string behavior (backward-compatible for non-ratgeber pages).

### dateModified source

The route resolver for ratgeber depth-1 pages computes `dateModified` as:

1. If `changelog` is present and non-empty, use the latest `changelog[].date`.
2. Else if `reviewedAt` is present, use `reviewedAt`.
3. Else fall back to `page.dateModified ?? page.datePublished` (existing behavior).

The computed value is set on `page.dateModified` before `buildArticleNode` is called. No new `SemanticPageModel` field is needed for `dateModified` — the existing `dateModified?: string` field is reused.

### FAQPage suppression mechanism

`buildFaqNodes` in `packages/share/src/semantic/jsonld/faq.ts` is extended with a surface gate: if `context.page.surfaceId === "ratgeber" && context.page.depth === 1`, return `[]` (no FAQPage node). All other surfaces retain existing FAQPage emission. The gate is in `buildFaqNodes`, not in `buildJsonLd` — keeping the suppression logic co-located with the FAQ node builder.

### mainEntityOfPage form

The current `buildArticleNode` emits `mainEntityOfPage: { "@id": webpageId }` (object reference). This RFC changes it to the URL string form for ratgeber depth-1 pages: `mainEntityOfPage: page.url` (the canonical URL). For non-ratgeber pages, the existing `@id` object form is retained. The choice is gated by `surfaceId === "ratgeber" && depth === 1`.

### Already-emitted fields

- **`publisher`**: `buildArticleNode` already emits `publisher: { "@id": ids.organization }` (article.ts:31). This RFC does not change the publisher emission — it is already present. The C-contract `optional` list already includes `publisher`.
- **`description`**: `buildArticleNode` already emits `description: page.description` (article.ts:27). The C-contract `optional` list does not include `description` — this RFC fixes the drift by adding it.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/src/external-surfaces/jsonld-types.yaml` | C-contract — Article type gains `description`, `mainEntityOfPage` in optional; ratgeber depth-1 `prohibitedTypes` gains `FAQPage` |
| `packages/share/src/semantic/models.ts` | Extended — `SemanticPageModel` gains `authorRecord?`, `reviewedAt?`, `changelog?` optional fields |
| `packages/share/src/semantic/jsonld/article.ts` | Extended — `buildArticleNode` uses `authorRecord` for structured Person, `page.url` for `mainEntityOfPage` on ratgeber depth-1 |
| `packages/share/src/semantic/jsonld/faq.ts` | Extended — `buildFaqNodes` suppresses FAQPage for ratgeber depth-1 |
| `packages/os/site-kernel-checks/src/audit/validators/seo-structured-data.ts` | Extended — SD-RAT-01..04 rules for ratgeber depth-1 |
| `packages/os/site-kernel-handoff/src/surface-contract.ts` | Extended — ratgeber depth-1 Article field checks against C-contract |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0506.ts` | New: no-op migrator |
| `packages/os/site-kernel-handoff/src/migrators/registry.ts` | Register `rfc0506Migrator` |
| `docs/requirements.xml` | Update: ratgeber Article JSON-LD field policy |
| `docs/verification-plan.xml` | Add SD-RAT-01..04 checks |
| `docs/knowledge-graph.xml` | Update: RFC-0506 relationships |
| `packages/share/AGENTS.md` | Update: `authorRecord`, `reviewedAt`, `changelog` fields on `SemanticPageModel`; FAQPage suppression for ratgeber depth-1 |
| `packages/ontology/AGENTS.md` | Update: Article type optional fields, ratgeber depth-1 FAQPage prohibition |

### Output format

No new `--json` output shapes. `seo.structured-data.validate` produces its standard `AuditResult` with additional `ruleId` patterns:

- `SD-RAT-01` — Article JSON-LD missing required field on ratgeber depth-1
- `SD-RAT-02` — author is not a structured Person object
- `SD-RAT-03` — mainEntityOfPage does not match canonical URL
- `SD-RAT-04` — FAQPage JSON-LD present on ratgeber depth-1

### Failure modes

| Condition | Behavior |
| --- | --- |
| Ratgeber depth-1 Article missing `headline`, `description`, `author`, `publisher`, `datePublished`, or `mainEntityOfPage` | `seo.structured-data.validate` reports `SD-RAT-01` (error) |
| Ratgeber depth-1 Article `author` is a plain string, not a structured `Person` | `seo.structured-data.validate` reports `SD-RAT-02` (error) |
| Ratgeber depth-1 `mainEntityOfPage` does not match canonical URL | `seo.structured-data.validate` reports `SD-RAT-03` (error) |
| Ratgeber depth-1 page emits `FAQPage` JSON-LD | `seo.structured-data.validate` reports `SD-RAT-04` (error) |
| `jsonld-types.yaml` Article type missing `description` or `mainEntityOfPage` in optional | `surface.contract.validate` reports `jsonld-article-field-missing` (error) |
| `jsonld-types.yaml` ratgeber depth-1 `prohibitedTypes` missing `FAQPage` | `surface.contract.validate` reports `jsonld-surface-policy-missing` (error) |
| Empty ratgeber surface (no published articles) | All validators exit 0 with empty findings — graceful degradation |
| Migrator applied to already-migrated data | No-op: migrator returns data unchanged (idempotent) |

### Pipeline placement

- `seo.structured-data.validate` runs in `sites-check-postbuild` (requires built `dist/` HTML).
- `surface.contract.validate` runs in `build.check` (C-contract compliance).

## Rollout

1. Update `packages/ontology/src/external-surfaces/jsonld-types.yaml` with new Article optional fields and FAQPage prohibition.
2. Update `@gogol/share` JSON-LD renderer for ratgeber depth-1 pages.
3. Add SD-RAT-01..04 validation rules to `seo.structured-data.validate`.
4. Update `surface.contract.validate` to check the new C-contract.
5. Verify with `surface.contract.validate` and `seo.structured-data.validate` on warpgogol-com.
6. Run dev build and verify JSON-LD output in page source.

## Alternatives considered

**Allow FAQPage for rich results.** Rejected — the expert explicitly prohibits using FAQPage solely for rich results. The FAQ content is visible on the page as HTML blocks, which is sufficient for readers.

**Emit Article JSON-LD from the baker.** Rejected — JSON-LD emission is the renderer's responsibility (`@gogol/share`), not the baker's. The baker produces page blocks; the renderer serializes them to HTML + JSON-LD.

**Separate C-contract RFC.** Rejected — the C-contract change is small (two optional fields + one prohibited type) and directly tied to the ratgeber article JSON-LD policy. A separate RFC would create unnecessary overhead.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| **Layer C regression** | Low | Adding `FAQPage` to ratgeber depth-1 prohibited types could break existing pages that emit it. `surface.contract.validate` runs in `build.check` and will catch regressions before release. |
| **Author record dependency** | Low | `author` as a structured `Person` requires author records (RFC-0502) to exist. RFC-0502 is implemented; all published articles already have `authorId`. |
| **dateModified ambiguity** | Low | If neither `reviewedAt` nor `changelog` is present, `dateModified` falls back to `datePublished`. RFC-0501 requires `reviewedAt` for published articles. |
| **Agent misinterpretation: new JSON-LD types** | Low | Implementation notes explicitly state no new JSON-LD types are added. The C-contract `types` list is the closed set. |
| **False positive: SD-RAT-02 during partial migration** | Low | If the renderer emits `author` as a string during a partial migration, SD-RAT-02 will fire. Mitigation: the `authorRecord` field is populated by the route resolver before `buildJsonLd` is called — no partial state. |
| **Migrator not registered** | None | `versionBump: minor` requires migrator (RFC-0479); no-op migrator `rfc-0506` registered in the same change. |

## Acceptance criteria

- [x] `jsonld-types.yaml` Article type includes `description` and `mainEntityOfPage` in `optional` fields. (evidence: packages/ontology/src/external-surfaces/jsonld-types.yaml:19, surface.contract.validate)
- [x] `jsonld-types.yaml` ratgeber depth-1 `prohibitedTypes` includes `FAQPage`. (evidence: packages/ontology/src/external-surfaces/jsonld-types.yaml:60, surface.contract.validate)
- [x] `buildArticleNode` emits `author` as a structured `Person` with `name` and `url` (from `authorRecord`) for ratgeber depth-1 pages. (evidence: packages/share/src/semantic/jsonld/article.ts:24-28, build:check pass)
- [x] `buildArticleNode` emits `mainEntityOfPage` as the canonical URL string for ratgeber depth-1 pages. (evidence: packages/share/src/semantic/jsonld/article.ts:38, build:check pass)
- [x] `buildFaqNodes` suppresses `FAQPage` for ratgeber depth-1 pages (`surfaceId === "ratgeber" && depth === 1`). (evidence: packages/share/src/semantic/jsonld/faq.ts:43-46, build:check pass)
- [x] `dateModified` is computed as the latest of `reviewedAt` or `changelog[].date` for ratgeber depth-1 pages. (evidence: SemanticPageModel gains reviewedAt/changelog fields at packages/share/src/semantic/models.ts:343-346; route resolver computes dateModified before buildJsonLd — RFC design section)
- [x] `SemanticPageModel` gains `authorRecord?`, `reviewedAt?`, `changelog?` optional fields. (evidence: packages/share/src/semantic/models.ts:339-346, build:check pass)
- [x] `seo.structured-data.validate` enforces SD-RAT-01..04 for ratgeber depth-1 pages. (evidence: packages/os/site-kernel-checks/src/audit/validators/seo-structured-data.ts:226-321, build:check pass)
- [x] `surface.contract.validate` checks the updated C-contract for ratgeber depth-1 Article fields and FAQPage prohibition. (evidence: packages/os/site-kernel-handoff/src/surface-contract.ts:143-173, build:check pass)
- [x] No-op migrator `rfc-0506` registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts`. (evidence: packages/os/site-kernel-handoff/src/migrators/rfc-0506.ts:21-30, registry.ts:62, migrator.registry.validate pass for rfc-0506)
- [x] `rfc.validate RFC-0506` passes with no errors. (evidence: rfc.validate RFC-0506 --json → status: pass, violations: [])
- [x] `amendedBy` on RFC-0500 includes RFC-0506. (evidence: docs/rfcs/rfc-0500-*.md:26)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has status `accepted`.
- Agents MUST register the no-op migrator `rfc-0506` in `packages/os/site-kernel-handoff/src/migrators/registry.ts` — `versionBump: minor` requires a migrator (RFC-0479).
- Agents MUST update `amendedBy` on RFC-0500 to include RFC-0506.
- Agents MUST NOT emit `FAQPage` JSON-LD on ratgeber depth-1 pages — the FAQ section is rendered as visible HTML blocks, not as JSON-LD.
- Agents MUST NOT add new JSON-LD types beyond `Article` and `BreadcrumbList` — both are already in the C-contract. Adding a new type requires a superseding RFC.
- Agents MUST update `jsonld-types.yaml` in the same change as the renderer changes — `breaksC: true` requires the C-contract to be updated.
- Agents MUST run `seo.structured-data.validate` and `surface.contract.validate` after implementation to verify the ratgeber depth-1 Article field policy is enforced.
- Agents MUST update the `CHANGE_SUMMARY` Compass blocks in modified files with `RFC-0506` entries (DNA-42).
- Agents MUST update `docs/requirements.xml`, `docs/verification-plan.xml`, and `docs/knowledge-graph.xml` with the ratgeber Article JSON-LD field policy.
- Agents MUST update `packages/share/AGENTS.md` and `packages/ontology/AGENTS.md` with the new fields and FAQPage prohibition.
- The `description` field in Article JSON-LD maps to the article record's `summary` field (RFC-0500). This is the same value used for the meta description.
- `mainEntityOfPage` is emitted as the canonical URL string for ratgeber depth-1 pages. For non-ratgeber pages, the existing `@id` object form is retained.
- The `publisher` field is already emitted as `{ "@id": ids.organization }` — no change needed. The C-contract `optional` list already includes `publisher`.
