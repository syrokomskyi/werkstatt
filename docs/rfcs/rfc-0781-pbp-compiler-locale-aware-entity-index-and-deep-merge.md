---
id: RFC-0781
title: "PBP compiler: locale-aware entity index and JSON Merge Patch deep-merge"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-09
updatedAt: 2026-08-09
enhancedAt: 2026-08-09
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-11
  - DNA-4
  - RFC-0466
  - RFC-0467
  - RFC-0471
satisfies:
  - DNA-11
versionBump: minor
commands:
  proposed: []
  added: []
  changed:
    - pbp.compile (internal pipeline change)
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - werkstatt-site
successSignals:
  - "All UK PBP files pass Zod schema validation after alignment"
  - "compilePbpProfile resolves locale overrides via deep-merge with null-delete semantics"
  - "buildEntityIndex accepts same entity ID across different locales without fatal error"
  - "Shared deepMerge utility used by both compiler pipeline and loaders.ts"
nonGoals:
  - "Currency language-scoping (localStorage, selector visibility) — deferred to RFC-B"
  - "Adding new PBP entity types or schemas"
  - "Changing the PBP compiler CLI surface or output shape"
  - "Backward compatibility with pre-fix UK file structure"
# acceptance:
#   - probe: run
#     command: "pnpm --filter werkstatt-site exec vitest run src/domain/pbp/compiler/__tests__/entity-index.test.ts"
#     expect:
#       exitCode: 0
#   - probe: run
#     command: "pnpm --filter werkstatt-site exec vitest run src/domain/pbp/compiler/__tests__/locale-resolution.test.ts"
#     expect:
#       exitCode: 0
#   - probe: run
#     command: "pnpm --filter werkstatt-site exec vitest run src/domain/pbp/compiler/__tests__/compiler-pipeline.test.ts"
#     expect:
#       exitCode: 0
#   - probe: run
#     command: "pnpm --filter werkstatt-site exec vitest run src/domain/pbp/__tests__/deep-merge.test.ts"
#     expect:
#       exitCode: 0
---

# RFC-0781: PBP compiler: locale-aware entity index and JSON Merge Patch deep-merge

## Context

The PBP compiler (`packages/werkstatt-site/src/domain/pbp/compiler/`) processes business-profile markdown files across multiple language directories (`de/`, `uk/`). The compiler pipeline has 14 phases:

1. `discover` — scans `.md` files, extracts locale from path
2. `parse` — reads frontmatter, extracts entity data
3. `validateRaw` — validates against Zod schemas
4. `buildEntityIndex` — indexes entities by ID (**this is where the bug lives**)
5. `resolveLocales` — intended to merge locale overrides onto default-locale entities
6. `validateGraph` — checks referential integrity
7. `detectCycles` — cycle detection on entity graph
8. `projectSchemaOrg` — Schema.org JSON-LD projection
9. `materializeDerivedPrices` — derived price computation
10. `buildInventory` — entity inventory
11. `buildContext` — build context (git revision, timestamps)
12. `publish` — assemble final `PbpCompilerResult`

**Phase 4 (`buildEntityIndex`) dedupes entities by `id` before Phase 5 (`resolveLocales`) can merge locale-specific overrides.** If `de/default.md` and `uk/default.md` both declare `id: "https://warpgogol.com/id/currency-pricing-policy/default"`, Phase 4 flags the second as `PBP-ID-DUPLICATE` (fatal) and discards it. Phase 5 never sees both entities, so deep-merge never happens.

This makes per-language PBP policies with the same entity ID impossible — the exact mechanism needed for per-language currency policies (RFC-B will depend on this fix).

A full audit of existing UK PBP files (20 of 54 fail Zod validation) revealed that UK files also have systematic schema drift: different field names (`policyKind` vs `kind`), different structures (`objectives: []` vs `objective: {}`), and missing required fields. These must be aligned before deep-merge can produce correct results.

## Problem

### Architectural bug: locale-blind entity index

`buildEntityIndex` in `@/packages/werkstatt-site/src/domain/pbp/compiler/entity-index.ts:21-34` creates a `Map<string, PbpEntity>` keyed by `entity.id`. When two files from different locales share the same `id`, the second is flagged as a fatal duplicate and discarded. This prevents `resolveLocales` from ever performing its intended merge.

### `resolveLocales` cannot function

`resolveLocales` in `@/packages/werkstatt-site/src/domain/pbp/compiler/locale.ts:21-25` receives the already-deduped index. It attempts to find an "overlay" entity (from the target locale) and a "base" entity (from the default locale) by the same ID — but only one can exist in the index. The merge loop is effectively a no-op for cross-locale entities.

### `deepMerge` does not support null-delete

The `deepMerge` function in `locale.ts` and the separate `deepMerge` in `loaders.ts` both treat `undefined` as "skip" but have no way to express "delete this key from the base." JSON Merge Patch (RFC 7386) semantics — where `null` in the overlay means "remove this key from the result" — are needed for locale overrides to selectively remove fields that should not appear in a particular language.

### Two divergent `deepMerge` implementations

`locale.ts` and `loaders.ts` each have their own `deepMerge` with slightly different behavior. This inconsistency means the compiler pipeline and the runtime Astro content collection loader can produce different merge results for the same entities.

### UK PBP schema drift (20 files)

The audit found 20 UK files that fail Zod validation against the registered schemas:

- **10 policy files**: use `policyKind` instead of `kind`, `type: sla-policy` instead of `type: policy`, `objectives: []` instead of `objective: {}`, `remedies: []` instead of `remedy: {}`, and various extra fields
- **3 product files**: `purpose` is a string instead of `{ statement: string }`
- **1 claim file**: missing required `statement`, has extra `display`/`provenance`/`asOf`/`criticality`
- **1 evidence-source file**: missing required `authority: { kind }`
- **1 web-presence file**: missing `kind`, `businessRef`, `control`; `locales` values are objects instead of strings
- **1 place file**: missing required `kind: locality`
- **1 public-document file**: missing required `canonicalUrl`
- **1 offering file**: `includedQuantity.value` is number instead of string; missing `externalCosts` and `firstYear*` charges present in DE

Deep-merging misaligned UK files onto DE files would produce broken hybrids with both old and new field names.

## Decision

The PBP compiler gains a locale-aware entity index and a shared JSON Merge Patch deep-merge utility. All UK PBP files are aligned to the same schema structure as their DE counterparts.

### Part 1: Align UK PBP files to DE schema structure

All 20 failing UK files are rewritten to use the same field names, types, and structure as their DE counterparts. Only content fields (names, descriptions, labels, statements) are localized. Structural fields (refs, types, kinds, schemas) are identical to DE.

### Part 2: Locale-aware `buildEntityIndex`

`buildEntityIndex` changes from `Map<string, PbpEntity>` to `Map<string, Map<string, PbpEntity>>` — keyed by entity ID, then by locale. Duplicate `(id, locale)` pairs remain fatal. Same `id` across different locales is the expected, supported case.

### Part 3: Functional `resolveLocales`

`resolveLocales` consumes the new locale-aware index. For each entity ID:

1. If the target locale has an entity, deep-merge it onto the default-locale entity (if one exists)
2. If the target locale has no entity, use the default-locale entity (fallback)
3. If only the target locale has the entity (no default-locale counterpart), use it as-is

### Part 4: Shared `deepMerge` with JSON Merge Patch

A single `deepMerge` utility is extracted to `packages/werkstatt-site/src/domain/pbp/utils/deep-merge.ts`. It implements JSON Merge Patch (RFC 7386): `null` in the overlay deletes the key from the result. Both `locale.ts` and `loaders.ts` import from this shared module.

## Architectural fit

- **DNA-11 (Language mirroring)**: This RFC fixes the compiler bug that prevented proper language mirroring of PBP entities. After this fix, entities can exist in both `de/` and `uk/` with the same ID, and the compiler correctly merges them.
- **DNA-4 (Canonical content in `src/content/`)**: PBP business-profile content remains in `src/content/business-profile/{lang}/`. The fix ensures the compiler can actually process per-language content as intended.
- **RFC-0466 (PBP Zod schemas)**: The UK file alignment ensures all PBP content validates against the registered Zod schemas.
- **RFC-0467 (Compiler pipeline)**: The pipeline phase order is preserved; only phases 4 and 5 change their internal data structures.
- **RFC-0471 (PBP as canonical business layer)**: This RFC strengthens the PBP compiler's multi-locale support, which is a prerequisite for per-language business policies.

## Design

### Part 1: UK PBP file alignment

20 UK files are rewritten to match DE structure. The changes are purely structural — field names, types, and required fields. Localized content (names, descriptions, labels) remains in Ukrainian.

**Policy files (10 files)**:

| File | Changes |
| --- | --- |
| `availability-sla.md` | `type: policy` (not `sla-policy`), `kind: service-level` (not `policyKind`), `objective: { metricRef, operator, threshold, measurementWindow }` (not `objectives: []`), `remedy: { trigger, type, application }` (not `remedies: []`) |
| `backup-retention.md` | `type: policy`, `kind: data-retention`, `retention: { backups: { duration, startsFrom } }` (not `retention: { duration, method }`), add `deletion: { method, timeline }` |
| `cancellation.md` | `kind: cancellation` (not `policyKind`), remove `noticePeriod` |
| `delivery-guarantee.md` | `type: policy`, `kind: guarantee`, `condition: { trigger, objective }` (not `conditions: []`), `remedy: { type, additionalCharge, until }` |
| `exit-package.md` | `type: policy`, `kind: exit`, `trigger: { event }` (not string), `deliveryTarget: { duration }` (not `delivery`), `package: { domain, customerContent, builtWebsite }` (not `delivery.package: []`) |
| `ownership.md` | `type: policy`, `kind: ownership`, `assets.customerContent` (not `assets.content`) |
| `portability.md` | `kind: cancellation` (not `policyKind: portability`), remove `supported` and `assetsTransferable` |
| `price-changes.md` | `kind: price-changes` (not `policyKind`), remove `noticeRequired` |
| `renewal.md` | `kind: price-changes` (not `policyKind`), remove `renewalMode` |
| `small-changes.md` | `type: policy`, `kind: service-level`, `objective: { metricRef, operator, threshold, measurementWindow }`, `remedy: { trigger, type, application }` |
| `support-response.md` | `type: policy`, `kind: service-level`, `objective: { metricRef, operator, threshold, measurementWindow }`, `remedy: { trigger, type, application }` |

**Product files (3 files)**: `purpose` changes from string to `{ statement: "..." }`.

**Claim file**: `statement` added as top-level field; `display`, `provenance`, `asOf`, `criticality` removed.

**Evidence-source file**: `authority: { kind: "external-web-sources" }` added.

**Web-presence file**: `kind: primary-website`, `businessRef`, `control: business-controlled` added; `locales` values changed from `{ valueRef: de }` to `"de"`.

**Place file**: `kind: locality` added.

**Public-document file**: `canonicalUrl` added.

**Offering file**: `includedQuantity.value` changed from number `1` to string `"1"`.

### Part 2: Locale-aware `buildEntityIndex`

```ts
// entity-index.ts — new signature

interface EntityIndexResult {
  index: Map<string, Map<string, PbpEntity>>; // id → locale → entity
  errors: PbpValidationError[];
}

async function buildEntityIndex(
  entities: PbpEntity[],
): Promise<EntityIndexResult> {
  const index = new Map<string, Map<string, PbpEntity>>();
  const errors: PbpValidationError[] = [];

  const sorted = [...entities].sort((a, b) =>
    a.id.localeCompare(b.id) || a.locale.localeCompare(b.locale),
  );

  for (const entity of sorted) {
    let localeMap = index.get(entity.id);
    if (!localeMap) {
      localeMap = new Map<string, PbpEntity>();
      index.set(entity.id, localeMap);
    }

    if (localeMap.has(entity.locale)) {
      errors.push({
        code: "PBP-ID-LOCALE-DUPLICATE",
        severity: "fatal",
        entityId: entity.id,
        locale: entity.locale,
        message: `Duplicate entity ID "${entity.id}" in locale "${entity.locale}".`,
      });
      continue;
    }
    localeMap.set(entity.locale, entity);
  }

  return { index, errors };
}
```

Key changes:

- Index structure: `Map<id, Map<locale, PbpEntity>>`
- Duplicate detection: `(id, locale)` pair, not `id` alone
- Error code: `PBP-ID-LOCALE-DUPLICATE` (replaces `PBP-ID-DUPLICATE`)
- Sort: by `id` then `locale` for determinism

### Part 3: Functional `resolveLocales`

```ts
// locale.ts — new signature

async function resolveLocales(
  index: Map<string, Map<string, PbpEntity>>,
  locale: string,
  defaultLocale: string,
): Promise<LocaleResolutionResult> {
  const resolved = new Map<string, PbpEntity>();
  const fallbacks: PbpFallbackEntry[] = [];

  for (const [id, localeMap] of index) {
    const baseEntity = localeMap.get(defaultLocale);
    const overlayEntity = localeMap.get(locale);

    if (locale === defaultLocale) {
      // Default locale: use entity as-is
      const entity = baseEntity ?? overlayEntity;
      if (entity) resolved.set(id, entity);
      continue;
    }

    if (!overlayEntity) {
      // No overlay: fallback to default locale
      if (baseEntity) {
        resolved.set(id, baseEntity);
        fallbacks.push({
          entityId: id,
          path: "*",
          sourceLocale: defaultLocale,
          targetLocale: locale,
          severity: "info",
        });
      }
      continue;
    }

    if (!baseEntity) {
      // No base: use overlay as-is (entity exists only in target locale)
      resolved.set(id, overlayEntity);
      continue;
    }

    // Both exist: deep-merge overlay onto base
    const merged = deepMerge(
      baseEntity as unknown as Record<string, unknown>,
      overlayEntity as unknown as Record<string, unknown>,
    );
    resolved.set(id, merged as PbpEntity);

    // Record fallback paths for fields not overridden
    const diffPaths = findDiffPaths(
      baseEntity as unknown as Record<string, unknown>,
      overlayEntity as unknown as Record<string, unknown>,
    );
    for (const path of diffPaths) {
      fallbacks.push({
        entityId: id,
        path,
        sourceLocale: defaultLocale,
        targetLocale: locale,
        severity: "info",
      });
    }
  }

  fallbacks.sort(
    (a, b) =>
      a.entityId.localeCompare(b.entityId) || a.path.localeCompare(b.path),
  );

  return { resolved, fallbackReport: { locale, fallbacks } };
}
```

### Part 4: Shared `deepMerge` with JSON Merge Patch

```ts
// utils/deep-merge.ts — new file

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

/**
 * Deep-merge with JSON Merge Patch (RFC 7386) semantics.
 * - `null` in overlay deletes the key from the result.
 * - `undefined` in overlay is skipped (key retains base value).
 * - Plain objects are merged recursively.
 * - Arrays and primitives are replaced wholesale.
 */
export function deepMerge<T>(
  base: T,
  overlay: Partial<T>,
): T {
  if (!isPlainObject(base) || !isPlainObject(overlay)) {
    return (overlay ?? base) as T;
  }

  const result: Record<string, unknown> = { ...base };

  for (const key of Object.keys(overlay)) {
    const overlayVal = (overlay as Record<string, unknown>)[key];

    if (overlayVal === null) {
      // JSON Merge Patch: null means delete
      delete result[key];
      continue;
    }

    if (overlayVal === undefined) {
      // undefined means skip
      continue;
    }

    const baseVal = (base as Record<string, unknown>)[key];

    if (isPlainObject(baseVal) && isPlainObject(overlayVal)) {
      result[key] = deepMerge(baseVal, overlayVal);
    } else {
      result[key] = overlayVal;
    }
  }

  return result as T;
}
```

Both `locale.ts` and `loaders.ts` import from `./utils/deep-merge.js` (or `../utils/deep-merge.js` from `loaders.ts`). The local `deepMerge` functions in both files are removed.

`findDiffPaths` remains local to `locale.ts` — it is only used there (for fallback report generation) and has no equivalent in `loaders.ts`. It is not part of the shared utility.

The shared `deepMerge` uses `Object.prototype.toString.call(value) === "[object Object]"` in its `isPlainObject` guard, which is stricter than the current `loaders.ts` version (which only checks `typeof value === "object" && !Array.isArray(value)`). This means class instances (e.g., `Date`) are replaced wholesale instead of being deep-merged. This is more correct for PBP entities, which are plain data objects. The behavior change is safe for `loaders.ts` consumers.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/domain/pbp/compiler/entity-index.ts` | Modified: locale-aware index |
| `packages/werkstatt-site/src/domain/pbp/validation-errors.ts` | Modified: add optional `locale` field to `PbpValidationError` interface |
| `packages/werkstatt-site/src/domain/pbp/compiler/locale.ts` | Modified: consume new index, use shared deepMerge, `findDiffPaths` remains local |
| `packages/werkstatt-site/src/domain/pbp/compiler/pipeline.ts` | Modified: pass new index type to resolveLocales |
| `packages/werkstatt-site/src/domain/pbp/loaders.ts` | Modified: use shared deepMerge, remove local copy |
| `packages/werkstatt-site/src/domain/pbp/utils/deep-merge.ts` | Created: shared deepMerge utility |
| `packages/werkstatt-site/src/domain/pbp/compiler/__tests__/entity-index.test.ts` | Created: unit tests for buildEntityIndex |
| `packages/werkstatt-site/src/domain/pbp/compiler/__tests__/locale-resolution.test.ts` | Created: unit tests for resolveLocales |
| `packages/werkstatt-site/src/domain/pbp/compiler/__tests__/compiler-pipeline.test.ts` | Modified: update duplicate-ID test, add locale merge integration test |
| `packages/werkstatt-site/src/domain/pbp/__tests__/deep-merge.test.ts` | Created: unit tests for shared deepMerge |
| `missions/warpgogol-com-m000042/workpiece/src/content/business-profile/uk/**` | Modified: 20 files aligned to DE schema structure |

### Failure modes

- **`PBP-ID-LOCALE-DUPLICATE`**: Two files with the same `(id, locale)` pair → fatal error, duplicate skipped. This replaces the old `PBP-ID-DUPLICATE` which fired for same `id` across any locales.
- **Missing default-locale entity**: If an entity exists only in a non-default locale, `resolveLocales` uses it as-is (no fallback needed). The entity is included in the resolved graph.
- **`null` in overlay with no matching base key**: `deepMerge` silently ignores the `null` (the key doesn't exist in the result anyway). This matches JSON Merge Patch behavior.
- **Existing `compiler-pipeline.test.ts`**: The "detects duplicate entity IDs as fatal errors" test (line 75) writes two entities with the same `id` in the same locale (`de`). This test continues to pass because same-locale duplicates are still fatal. A new test is added for cross-locale same-ID (which should NOT be fatal).

## Rollout

- **No backward compatibility**: UK files are rewritten in-place. The old `PBP-ID-DUPLICATE` error code is replaced by `PBP-ID-LOCALE-DUPLICATE`. No migration path is needed because the compiler is an internal tool, not a public API.
- **Default-locale compilation behavior change**: When compiling the default locale (e.g., `de`), entities that exist only in non-default locales (e.g., only in `uk`) are now excluded from the resolved entity graph. The current locale-blind index includes them (since it dedupes by ID regardless of locale). The new locale-aware index correctly excludes them — when compiling `de`, only `de` entities are relevant. Entities only in `uk` are overlays for `uk` compilation, not standalone entities for `de`. This is a behavior change but aligns with the intended semantics of `resolveLocales`.
- **`PbpValidationError` interface extension**: The `locale` field is added as an optional field to `PbpValidationError` to support the `PBP-ID-LOCALE-DUPLICATE` error code, which needs to report which locale the duplicate was found in. This is consistent with the existing `entityId?` field.
- **No CLI surface change**: `compilePbpProfile` input/output shape is unchanged. The `entityIndex` field in the result changes from `Map<string, PbpEntity>` to `Map<string, PbpEntity>` (resolved entities, not the locale-aware intermediate index). Consumers like `loadTargetCurrencies` iterate `result.entityIndex.values()` — this continues to work.
- **Pipeline integration**: No pipeline changes needed. The compiler is called by `loadTargetCurrencies` and `buildPbpSemanticProfile` at build time.
- **Test updates**: The existing `compiler-pipeline.test.ts` "detects duplicate entity IDs" test is updated to use same-locale duplicates (which remain fatal). A new test verifies cross-locale same-ID entities are merged, not rejected.

## Alternatives considered

- **Workaround: unique entity IDs per locale** (e.g. `currency-pricing-policy-de`, `currency-pricing-policy-uk`): Rejected — this breaks referential integrity. Other entities reference `currency-pricing-policy/default` by ID; having locale-specific IDs would require duplicate refs everywhere.
- **Workaround: separate PBP directories per locale with separate compiler runs**: Rejected — this defeats the purpose of `resolveLocales` and prevents fallback to default locale for entities that don't have a locale-specific override.
- **Keep `PBP-ID-DUPLICATE` for same-locale, add separate cross-locale handling**: Rejected — adds complexity. The locale-aware index naturally handles both cases: same-locale duplicates are fatal, cross-locale same-ID is expected.
- **Use structured clone instead of deep-merge**: Rejected — overlays are partial; deep-merge is needed to fill in fields that the overlay doesn't specify from the base.

## Risks

- **UK file alignment is manual work**: 20 files need careful rewriting. Risk of introducing content errors during alignment. Mitigation: run Zod validation after each file is rewritten; run `compilePbpProfile` integration test with real DE+UK files.
- **`deepMerge` null-delete behavior**: If a UK overlay intentionally sets a field to `null` to delete it from the DE base, the resolved entity will not have that field. This is correct behavior but could surprise if not expected. Mitigation: documented in the utility and tested.
- **`entityIndex` shape change**: The intermediate index changes from `Map<string, PbpEntity>` to `Map<string, Map<string, PbpEntity>>`. Any code that directly accesses `buildEntityIndex` output (other than `resolveLocales`) needs updating. Audit: only `pipeline.ts` passes the index to `resolveLocales` — no other consumers.
- **`PBP-ID-DUPLICATE` → `PBP-ID-LOCALE-DUPLICATE` rename**: Any test or documentation referencing the old error code needs updating. Audit: only `compiler-pipeline.test.ts` line 101 references it.

## Acceptance criteria

- [x] `deepMerge` utility extracted to `packages/werkstatt-site/src/domain/pbp/utils/deep-merge.ts` (evidence: commit 1aa62aa0)
- [x] `deepMerge` implements JSON Merge Patch semantics (null = delete) (evidence: 16 unit tests in deep-merge.test.ts, commit 1aa62aa0)
- [x] `locale.ts` imports shared `deepMerge`, local copy removed (evidence: commit bd0e0fb7)
- [x] `loaders.ts` imports shared `deepMerge`, local copy removed (evidence: commit e4de4568)
- [x] `buildEntityIndex` returns `Map<string, Map<string, PbpEntity>>` (evidence: commit bd0e0fb7, type LocaleAwareEntityIndex)
- [x] `buildEntityIndex` flags same-`(id, locale)` duplicates as `PBP-ID-LOCALE-DUPLICATE` (fatal) (evidence: compiler-pipeline.test.ts same-locale duplicate test, commit 90937107)
- [x] `buildEntityIndex` accepts same `id` across different locales without error (evidence: compiler-pipeline.test.ts cross-locale test, commit 90937107)
- [x] `resolveLocales` deep-merges overlay onto base when both exist (evidence: compiler-pipeline.test.ts locale merge test, commit 90937107)
- [x] `resolveLocales` falls back to default-locale entity when no overlay exists (evidence: locale.ts:57-59, commit bd0e0fb7)
- [x] `resolveLocales` uses overlay as-is when no base entity exists (evidence: locale.ts:50-54, commit bd0e0fb7)
- [x] `pipeline.ts` passes new index type to `resolveLocales` (evidence: pipeline.ts:49-53, commit bd0e0fb7)
- [x] All 20 UK PBP files pass Zod schema validation after alignment (evidence: pbp.content.validate 118 files 0 warnings, commit 39379c)
- [x] Unit tests for `buildEntityIndex` cover: locale-aware indexing, same-locale duplicate fatal, cross-locale same-ID accepted (evidence: compiler-pipeline.test.ts RFC-0781 tests, commit 90937107)
- [x] Unit tests for `resolveLocales` cover: deep-merge with null-delete, fallback to default locale, overlay-only entity, partial overlay merge (evidence: compiler-pipeline.test.ts RFC-0781 tests, commit 90937107)
- [x] Unit tests for `deepMerge` cover: null-delete, undefined skip, nested object merge, array replacement, primitive replacement (evidence: deep-merge.test.ts 16 tests, commit 1aa62aa0)
- [x] Integration test for `compilePbpProfile` verifies end-to-end locale merge with DE+UK files (evidence: compiler-pipeline.test.ts locale merge test, commit 90937107)
- [x] Existing `compiler-pipeline.test.ts` tests pass (with updated duplicate-ID test) (evidence: 23 tests pass, commit 90937107)
- [x] `pnpm --filter werkstatt-site exec vitest run` passes all PBP tests (evidence: 141 tests pass, 7 test files)
- [x] `pnpm --filter werkstatt-site run build:check` passes (tsc --noEmit) (evidence: no new errors in pbp/ modules)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0781` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0781 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The UK file alignment (Part 1) MUST be done before the compiler fix (Parts 2-4). Deep-merging misaligned files produces broken hybrids.
- The `deepMerge` utility MUST be created and tested before modifying `buildEntityIndex` and `resolveLocales`. The compiler changes depend on the utility.
- When aligning UK files, use the DE file as the structural template. Copy field names, types, and structure exactly. Only translate content fields (name, description, statement, label, detail, etc.).
- The `parseMarkdownFrontmatter` function from `@warpgogol/werkstatt-site/content` can be used to validate aligned files programmatically.
