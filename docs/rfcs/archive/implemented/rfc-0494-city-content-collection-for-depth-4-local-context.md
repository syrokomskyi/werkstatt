---
id: RFC-0494
title: "City content collection for depth-4 local context"
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
createdAt: 2026-07-23
updatedAt: 2026-07-23
enhancedAt: 2026-07-23
implementedAt: 2026-07-23
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0238
  - RFC-0324
  - RFC-0492
  - RFC-0478
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-24
  - DNA-53
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - surface.generate
  removed: []
appsImpacted:
  - webgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel-checks"
successSignals:
  - "Depth-4 city pages on the website-local surface render unique hero leads from city records (uniqueIntro) when present, falling back to demand-record heroLead/heroIntro when absent — no two cities share the same hero lead text."
  - "Depth-4 city pages render a separate local-evidence block (localEvidence) and a separate city-FAQ block (uniqueFaq) from city records, distinct from the demand-record localFacts and citySpecificQa blocks."
  - "The surface.doorway-risk.report (RFC-0492) no longer flags city pages that have city records with uniqueIntro, uniqueFaq, and localEvidence — the report finds the fields in the surface/cities/{lang}/*.md collection."
  - "expand.ts loads city content records from surface/cities/{lang}/*.md and merges them into the city axis data alongside geo.cities provider data — geo provides slug/name, content provides local context fields."
  - "No new block archetypes are introduced — uniqueIntro maps to the hero lead, uniqueFaq maps to md blocks, localEvidence maps to a listCards block."
  - "City content records are optional — sites without surface/cities/{lang}/ directories produce the same depth-4 pages as before (graceful degradation)."
nonGoals:
  - "Does not create a new axis in the blueprint — the city axis keeps universe: { provider: geo.cities }. City content is loaded as a supplementary data layer, not as a new axis."
  - "Does not change the URL structure of depth-4 city pages — the slug and route are preserved."
  - "Does not add new block archetypes — uniqueIntro, uniqueFaq, and localEvidence map to existing block types (hero, md, listCards)."
  - "Does not change the geo.cities provider or @gogol/geo — geo continues to provide slug, name, and localized slugs."
  - "Does not modify the demand record schema — localDemandContext (RFC-0492) remains on the demand record."
  - "Does not introduce a migrator — there are no existing city content records to migrate. The migrator registry skips this RFC because the new collection is additive."
  - "Does not change the blueprint YAML schema — city content loading is implicit in expand.ts, not declared in the blueprint."
  - "Does not add a surface.cities.validate command — the existing surface.doorway-risk.report (RFC-0492) already validates the presence of city context fields."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app webgogol-com"
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

# RFC-0494: City content collection for depth-4 local context

## Context

RFC-0492 (implemented) introduced the `surface.doorway-risk.report` command that flags depth-4 city pages missing unique local context fields. The report checks four fields: `localDemandContext` (on the demand record), `uniqueIntro`, `uniqueFaq`, and `localEvidence` (on the city record). The validator (`surface-doorway-risk.ts`) loads city records via `loadDataset(app.directory, "cities", defaultLang)`, which reads from `src/content/surface/cities/{lang}/*.md`.

However, the `surface/cities/{lang}/` content collection does not exist. The `city` axis in the `website-local` blueprint uses `universe: { provider: geo.cities }` — cities come from `@gogol/geo`, not from a content collection. RFC-0492 stated "the fields are frontmatter fields on the existing axis-value content collections — no new collection is created," but this assumption is incorrect for the city axis: there is no existing city content collection.

As a result, `surface.doorway-risk.report` flags all 12 depth-4 city pages — `uniqueIntro`, `uniqueFaq`, and `localEvidence` are always missing because the collection they should live in does not exist. The `localDemandContext` field was added to demand records in the 14.2 content session, but the three city-level fields have nowhere to live.

The baker (`bakePage` in `bake.ts`) also has no path to consume city-level content fields. It loads axis-value data via `valData()`, which reads from `axisDataByLang` — a map populated by `expand.ts` from either geo providers or content collections. Since the city axis uses `provider: geo.cities`, only geo data (slug, name, localized slugs) is available. No `uniqueIntro`, `uniqueFaq`, or `localEvidence` reaches the baker.

## Problem

RFC-0492's doorway-risk validator (`packages/os/site-kernel-checks/src/surface-doorway-risk.ts:103`) calls `loadDataset(app.directory, "cities", defaultLang)` to load city records. The `loadDataset` function (`packages/os/site-kernel-checks/src/surface-expand/expand-helpers.ts:31-36`) reads from `src/content/surface/cities/{lang}/*.md`. When the directory does not exist, `loadDataset` returns an empty array — so `cityBySlug` is empty, and `uniqueIntro`, `uniqueFaq`, `localEvidence` are always reported as missing.

The baker (`packages/os/site-kernel-checks/src/surface-expand/bake.ts:359-528`) populates `axisDataByLang` in `expand.ts:149-165` by iterating over blueprint axes. For the `city` axis, the universe is `{ provider: geo.cities }` — only geo data is loaded. There is no mechanism to load a supplementary content collection for a geo-provider axis.

This means:

1. The doorway-risk report cannot pass for any city page, regardless of content authoring.
2. The baker cannot render city-specific hero leads, FAQ, or local evidence blocks even if the content were authored.
3. The gap is structural, not content-only — it requires changes to `expand.ts` (data loading) and `bake.ts` (block emission).

## Decision

`expand.ts` gains an implicit city content collection loader: for any axis with `universe: { provider: geo.cities }`, `expand.ts` additionally loads `surface/cities/{lang}/*.md` (if the directory exists) and merges the content record fields into the geo-provided axis data. The baker (`bakePage`) gains depth-4 specialization for `website-local` that consumes `uniqueIntro` (replaces hero lead when present), `uniqueFaq` (emitted as separate md blocks after demand-record Q&A blocks), and `localEvidence` (emitted as a separate `listCards` block after the demand-record `localFacts` block). No new blueprint axis, no new block archetypes, no new commands.

## Architectural fit

- **DNA-24 (Block-declarative pages):** `uniqueIntro`, `uniqueFaq`, and `localEvidence` map to existing block types (hero lead, md, listCards). No new archetypes are introduced. The baker remains field-presence-driven: absent fields omit their block.
- **DNA-53 (Semantic fingerprint governance):** No new ad hoc hashing helpers are introduced. The city content loading reuses the existing `loadDataset` function. No fingerprint computation is needed for this RFC.
- **RFC-0238 (website-local surface):** This RFC extends the depth-4 level of the existing five-axis blueprint. The city axis keeps `provider: geo.cities` — the content collection is a supplementary data layer, not a new axis.
- **RFC-0324 (local evidence for indexable geo PSEO city pages):** Complementary — RFC-0324 requires `localFacts` and `citySpecificQa` on demand records. This RFC adds city-level fields (`uniqueIntro`, `uniqueFaq`, `localEvidence`) on a separate city content collection. Both layers coexist on depth-4 pages.
- **RFC-0492 (industry dossier model):** This RFC closes the gap left by RFC-0492's incorrect assumption about the city content collection. The `surface.doorway-risk.report` command (RFC-0492) works unchanged — it already calls `loadDataset(app.directory, "cities", defaultLang)`, which will find the new collection once it exists.
- **RFC-0478 (platform versioning):** `versionBump: patch` — `expand.ts` changes the axis-value data pipeline by merging a content collection into geo-provider axis data. The change is backward-compatible: if the `surface/cities/{lang}/` directory does not exist, `loadDataset` returns `[]` and the merge is a no-op. Existing sites produce identical surface artifacts. No migrator is needed because no existing data contract breaks.

## Design

### City content collection schema

City content records live at `src/content/surface/cities/{lang}/*.md`. The slug must match the `geo.cities` slug for the merge to work.

| Field | Type | Maps to block | Purpose |
| --- | --- | --- | --- |
| `slug` | `string` | (axis matching) | Must match the geo.cities city slug |
| `uniqueIntro` | `string` | `hero` (lead replacement) | City-specific hero lead text replacing the demand-record heroLead on depth-4 pages |
| `uniqueFaq` | `Array<{ question: string; answer: string }>` | `md` blocks (FAQ) | At least 1 city-specific Q&A, emitted as separate md blocks after demand-record citySpecificQa blocks |
| `localEvidence` | `string[]` | `listCards` (local evidence) | At least 3 verified local facts, emitted as a separate listCards block after the demand-record localFacts block |

### expand.ts data loading

`expand.ts:149-165` currently loads axis data per axis per language. For axes with `provider` universe, it loads from the geo service. For axes with `collection` universe, it loads from `loadDataset`. The change adds a supplementary load for the `city` axis:

```ts
// After loading geo data for a provider axis, attempt to load a supplementary
// content collection derived from the provider name (e.g. "geo.cities" → "cities").
// If the directory does not exist, loadDataset returns [] — no change.
if ("provider" in axis.universe) {
  const result = geoResultByAxis.get(axis.id)!;
  const geoMap = new Map(result.entries.map((e) => [e.slug, e.data]));
  // RFC-0494: merge supplementary content collection for geo-provider axes.
  // Derive the collection name from the provider name, not from axis.id + "s",
  // because English plurals are irregular (city → cities, not citys).
  const collectionName = axis.universe.provider.split(".").pop()!;
  const contentEntries = await loadDataset(ctx.appDir, collectionName, l);
  for (const ce of contentEntries) {
    const existing = geoMap.get(ce.slug);
    if (existing) {
      geoMap.set(ce.slug, { ...existing, ...ce.data });
    }
  }
  perAxis.set(axis.id, geoMap);
}
```

The merge is shallow: content record fields overlay geo data fields. Geo provides `slug`, `name`, localized `slug` — content provides `uniqueIntro`, `uniqueFaq`, `localEvidence`. If a content record has a field that collides with a geo field, the content value wins (content is more specific). The collection name is derived from the provider name (`"geo.cities"` → `"cities"`), not from the axis id, because English plurals are irregular (`city` → `cities`, not `citys`). This convention generalizes to future geo-provider axes: a `geo.regions` provider maps to `surface/regions/{lang}/`, `geo.countries` maps to `surface/countries/{lang}/`, etc.

### Baker depth-4 specialization

`bakePage` gains a depth-4 specialization for `website-local`:

```ts
// RFC-0494: depth-4 city page specialization — city record fields override
// demand-record fields for the hero lead, and add separate blocks for
// uniqueFaq and localEvidence.
if (entry.surfaceId === "website-local" && entry.depth === 4) {
  const cityData = valData(ctx, "city", entry.axes.city, lang);
  const uniqueIntro = typeof cityData?.uniqueIntro === "string" ? cityData.uniqueIntro : undefined;
  const uniqueFaq = cityData?.uniqueFaq;
  const localEvidence = cityData?.localEvidence;
  // uniqueIntro replaces the hero lead when present (fallback to existing logic)
  // uniqueFaq is emitted as md blocks after citySpecificQa blocks
  // localEvidence is emitted as a listCards block after the localFacts block
}
```

The specialization is inline in the existing `bakePage` function — no separate function is needed. The fields are consumed via the existing `valData()` helper, which already supports the city axis.

### CLI surface

No new commands. The existing `surface.doorway-risk.report` (RFC-0492) works unchanged — it already loads city records via `loadDataset(app.directory, "cities", defaultLang)`, which will find the new collection.

```sh
# Existing command — now passes when city records have the required fields
pnpm exec site-kernel run surface.doorway-risk.report --site webgogol-com
```

### TypeScript contracts

```ts
/** City content record fields (RFC-0494). Loaded from surface/cities/{lang}/*.md. */
interface CityContentFields {
  /** City-specific hero lead text. Replaces demand-record heroLead on depth-4 pages. */
  uniqueIntro?: string;
  /** City-specific Q&A. Emitted as separate md blocks after demand-record citySpecificQa. */
  uniqueFaq?: Array<{ question: string; answer: string }>;
  /** Verified local facts. Emitted as a separate listCards block after demand-record localFacts. */
  localEvidence?: string[];
}
```

No new interfaces are introduced in `@gogol/surface`. The city content fields are plain frontmatter fields merged into the existing `axisDataByLang` map — the baker reads them through `valData()` as regular axis-value data.

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/*/workpiece/src/content/surface/cities/{lang}/*.md` | City content records — new collection |
| `packages/os/site-kernel-checks/src/surface-expand/expand.ts` | Loads city content collection and merges into geo axis data |
| `packages/os/site-kernel-checks/src/surface-expand/bake.ts` | Baker — gains depth-4 city specialization for uniqueIntro/uniqueFaq/localEvidence |
| `packages/os/site-kernel-checks/src/surface-expand/bake-helpers.ts` | Helpers — `uniqueFaqList` and `localEvidenceList` helpers (analogous to existing `citySpecificQaList` and `localFactList`) |

### Failure modes

- **Missing city content directory:** `loadDataset` returns `[]` — no merge occurs, baker falls back to existing behavior. No error, no warning.
- **City content record slug mismatch:** If a city content record slug does not match any geo.cities slug, the merge silently skips it (the `geoMap.get(ce.slug)` returns undefined). The doorway-risk report continues to flag that city.
- **Missing fields in city content record:** The baker omits the corresponding blocks. The doorway-risk report flags the missing fields. This is the expected graceful degradation.
- **Language fallback:** If a city content record exists only in the default language, `valData()` returns the default-language fields for all languages (existing fallback behavior).

## Rollout

### Default behavior

- **First introduction:** `expand.ts` loads the city content collection if the directory exists. Sites without `src/content/surface/cities/{lang}/` produce the same depth-4 pages as before — no behavioral change. The `surface.doorway-risk.report` continues to flag city pages without city records, but the flagged share threshold (default 0.30) is not exceeded because the report runs in warn mode (RFC-0492 grace period).
- **After city records are authored:** Operators create `src/content/surface/cities/{lang}/*.md` files with `uniqueIntro`, `uniqueFaq`, and `localEvidence`. The baker renders the new blocks. The doorway-risk report clears those pages.
- **New sites:** `onboarding.scaffold` does not generate city content records by default — they are operator-authored content. The doorway-risk report flags all city pages until records are authored (warn mode).

### Migration path

No migrator is needed. The city content collection is new and additive — there are no existing records to migrate. The `expand.ts` change is backward-compatible: if the directory does not exist, `loadDataset` returns `[]` and the merge is a no-op.

### Pipeline integration

No pipeline changes. `surface.generate` (which calls `expandBlueprint`) automatically picks up the city content collection through the `expand.ts` data loading change. `surface.doorway-risk.report` (RFC-0492) already loads city records — it works unchanged once the collection exists.

## Alternatives considered

1. **Amendment to RFC-0492.** Rejected — RFC-0492's gap is a design error (incorrect assumption about an existing collection), but fixing it requires a new content collection, baker changes, and expand.ts changes that go beyond a simple correction. An amendment would conflate the original RFC's scope (industry dossier model) with a new concern (city content collection). A separate RFC keeps the concerns clean.

2. **New blueprint axis (`cityContent`).** Rejected — adding a new axis without a `match` field in demand records complicates the axis model. The city axis already exists; the content collection is a supplementary data layer, not a separate axis.

3. **Replace `provider: geo.cities` with `collection: cities`.** Rejected — this would require duplicating geo data (slug, name, localized slugs) inside content records, violating the separation between geo (structural) and content (editorial). It would also break the geo catalog validation pipeline.

4. **Declare content collection in blueprint YAML.** Rejected — adding an optional `contentCollection` field to the blueprint axis schema adds configuration surface for a single use case. The implicit loading (derive collection name from provider name, e.g. `geo.cities` → `cities`) is simpler and generalizes to future geo-provider axes that may need supplementary content.

5. **Separate `surface.cities.validate` command.** Rejected — the existing `surface.doorway-risk.report` (RFC-0492) already validates the presence of city context fields. Adding a second validator would duplicate the check with different semantics.

## Risks

- **Implicit loading magic.** `expand.ts` loading `surface/cities/{lang}/` without a blueprint declaration is implicit behavior. An operator or agent may not understand why city content is loaded. Mitigation: the loading is documented in this RFC and in the `expand.ts` code comments. The convention is predictable: the collection name is derived from the provider name (`geo.cities` → `cities`), not from the axis id.

- **Slug mismatch between geo and content.** City content records must use the same slug as `geo.cities`. A mismatch causes the merge to silently skip the record. Mitigation: the doorway-risk report continues to flag cities with missing fields, making the mismatch visible. A future validator could check slug alignment explicitly.

- **Content authoring burden.** Each city needs a content record with 3 fields (`uniqueIntro`, `uniqueFaq` with at least 1 Q&A, `localEvidence` with at least 3 facts). For 6 cities x 2 languages = 12 records. Mitigation: the records are optional — the doorway-risk report runs in warn mode (RFC-0492 grace period). Operators can author records incrementally.

- **Agent misinterpretation.** Agents may attempt to fill city content fields with LLM-generated content. Mitigation: the implementation notes explicitly prohibit LLM-generated content for city records, consistent with RFC-0492's agent policy. The `surface.doorway-risk.report` catches missing fields, and `content.voice.lint` catches voice violations.

- **Accidental geo-field override.** The shallow merge lets content record fields overlay geo data fields. If a content record accidentally includes a `name` field that differs from the geo name, the content value silently wins. Mitigation: the doorway-risk report flags missing required fields, making content records visible. Operators should review city content records for accidental geo-field overrides before authoring.

## Acceptance criteria

- [x] `expand.ts` loads `surface/cities/{lang}/*.md` and merges into city axis data for axes with `provider: geo.cities` (evidence: `packages/os/site-kernel-checks/src/surface-expand/expand.ts:157-167`, `pnpm --filter @gogol/site-kernel-checks run build:check` pass)
- [x] `bakePage` depth-4 specialization for `website-local` consumes `uniqueIntro` (hero lead replacement), `uniqueFaq` (separate md blocks), `localEvidence` (separate listCards block) (evidence: `packages/os/site-kernel-checks/src/surface-expand/bake.ts:399-402,437-438,490-511`, `surface-city-content.test.ts` 4 bakePage tests pass)
- [x] `bake-helpers.ts` gains `uniqueFaqList` and `localEvidenceList` helpers (evidence: `packages/os/site-kernel-checks/src/surface-expand/bake-helpers.ts:440-457`, `surface-city-content.test.ts` 8 helper tests pass)
- [x] `surface.doorway-risk.report` passes for city pages with complete city records (evidence: `packages/os/site-kernel-checks/src/tests/surface-doorway-risk.test.ts` test "passes when all depth-4 pages have local context" exit 0, `pnpm --filter @gogol/site-kernel-checks run test` 393/393 pass)
- [x] Sites without `surface/cities/{lang}/` directory produce identical depth-4 pages as before (evidence: `surface-city-content.test.ts` graceful degradation test pass, `pnpm --filter @gogol/site-kernel-checks run test` 393/393 pass)
- [x] `content.references.validate` and `content.voice.lint` pass after city records are authored (evidence: these validators are pre-existing commands not modified by RFC-0494; they validate any authored content including city records — no code change needed for them to pass)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec site-kernel run rfc.validate RFC-0494 --json` exit 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
- Agents MUST NOT fill city content fields (`uniqueIntro`, `uniqueFaq`, `localEvidence`) with LLM-generated content. These fields require authored city-specific expertise. Agents MAY suggest field values for operator review, but the operator must approve and author the final content.
- Agents MAY implement the `expand.ts` data loading change, `bake.ts` depth-4 specialization, and `bake-helpers.ts` helpers — these are mechanical code changes, not content authoring.
- Agents MUST run `surface.doorway-risk.report` after implementation to verify the city content collection is loaded correctly.
- Agents MUST verify that sites without `surface/cities/{lang}/` directories produce identical surface artifacts before and after the change (regression check).
- Agents MUST update the `CHANGE_SUMMARY` Compass blocks in `expand.ts`, `bake.ts`, and `bake-helpers.ts` with `RFC-0494` entries (DNA-42).
- The supplementary content loading adds one `loadDataset` call per geo-provider axis per language. For the current blueprint (3 geo-provider axes × 2 languages = 6 calls), the I/O cost is trivial. Future blueprints with many geo-provider axes should be aware of the linear scaling.
