---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: unknown
verdict: needs-revision
diffRange: HEAD (uncommitted changes)
filesReviewed:
  - packages/geo/src/types.ts
  - packages/geo/src/slug.ts
  - packages/geo/src/countries.ts
  - packages/geo/src/regions.ts
  - packages/geo/src/cities.ts
  - packages/geo/src/service.ts
  - packages/geo/src/index.ts
  - packages/os/site-kernel-checks/src/surface-expand/expand-helpers.ts
  - packages/os/site-kernel-checks/src/surface-expand/expand.ts
---

# Code Review: @gogol/geo architecture deepening (uncommitted diff)

### Verdict: Needs revision

The diff successfully absorbs `resolveGeoProvider` into `GeoService.providerEntries`, removes the DE hard-coding, and makes the slug pipeline language-extensible. However, `providerEntries` introduces FS I/O against `appDir` inside `@gogol/geo`, violating the package's own AGENTS.md scope rule ("Do not read from `apps/*` or site-local content here"). Two dead imports remain after the refactor. The `registerSlugStrategy` / `registerCountryLocale` functions create process-global mutable state without documenting concurrency expectations.

### Mechanical floor

Pass — `pnpm --filter @gogol/geo build:check` and `pnpm --filter @gogol/site-kernel-checks build:check` both exit 0. `vitest run` passes 3/3 PBT tests.

### Axis A — Structural correctness

1. **Dead import: `LocalizedSlug` in `expand-helpers.ts`** — `type LocalizedSlug` is imported from `@gogol/surface` at `expand-helpers.ts:18` but no longer used after `resolveGeoProvider` was removed. Should be deleted.

2. **Dead import: `DatasetEntry` in `expand.ts`** — `type DatasetEntry` is imported from `./expand-helpers.ts` at `expand.ts:42` but never referenced in the file body. Should be deleted.

3. **Non-exhaustive `provider` dispatch** — `resolveProviderEntries` in `service.ts:57-136` handles `"geo.countries"`, `"geo.regions"`, `"geo.cities"` with if/else chains but has no `else` branch or default case. An unknown provider string silently returns `{ entries: [], localized: new Map() }` with no error or warning. A `default` branch that throws or logs would make debugging easier.

4. **Mutable global state in `slugStrategies`** — `slug.ts:54` declares a module-level `Map<string, SlugStrategy>` mutated by `registerSlugStrategy`. This is process-global mutable state: two concurrent `createGeoService()` calls in the same process could race if one registers a strategy mid-flight. The same pattern applies to `registeredLocales` in `countries.ts:21`. If this is intentional (registration only at module load time), it should be documented; otherwise it is a concurrency hazard.

### Axis B — DNA alignment

1. **FAIL — `providerEntries` violates `@gogol/geo` AGENTS.md scope** — `packages/geo/AGENTS.md:7` states: "Keep the package app-agnostic. Do not read from `apps/*` or site-local content here." The `resolveProviderEntries` function in `service.ts:102-115` calls `existsSync(join(appDir, "src", "content", "surface", "assets", ...))` — direct FS I/O against app-local content paths. This couples `@gogol/geo` to the app's directory layout. The image-probing logic should stay in the consumer (`expand.ts`), or `providerEntries` should accept an injectable image-resolver callback instead of `appDir`.

2. **DNA-42 (Compass markup)** — Pre-existing: none of the modified files have `<non-goals>` in their `MODULE_CONTRACT`. The diff did not introduce this gap, but it did update `CHANGE_SUMMARY` items, so the files were touched. Not a blocking finding for this diff.

### Axis C — Ecosystem fit

1. **Package boundary** — `@gogol/geo` → `@gogol/surface` dependency is not introduced (good). `expand.ts` now imports `createGeoService` and `GeoProviderResult` from `@gogol/geo` — this is a `packages/os → packages/geo` dependency, which is valid.

2. **Compass sync** — No `docs/*.xml` files were updated. The diff changes the public API of `@gogol/geo` (new `GeoServiceConfig`, `SlugStrategy`, `GeoProviderResult`, `providerEntries` method, `regionNames` override). If `docs/technology.xml` or `docs/knowledge-graph.xml` track package public surfaces, they may need updating. Not blocking — these are typically generated.

3. **AGENTS.md update** — `packages/geo/AGENTS.md:8` says "Treat `createGeoService()` as the public facade." The signature changed from `createGeoService(overrides?)` to `createGeoService(config?)`. The AGENTS.md should mention `GeoServiceConfig` and `providerEntries` as part of the public surface. Not blocking but recommended.

### Axis D — Forward-only compliance

No issues. The old `createGeoService(overrides)` signature is replaced, not paralleled. `resolveGeoProvider` is deleted, not kept behind a flag. No compatibility shims.

### Axis E — Agent-facing clarity

1. **`MODULE_CONTRACT` `<purpose>` word count** — Pre-existing: `types.ts` purpose is 8 words ("RFC-0237: Type contracts for the shared geo gazetteer."), `slug.ts` is 9 words, `countries.ts` is 9 words. DNA-42 requires ≥ 10 words. The diff updated `CHANGE_SUMMARY` but did not fix the purpose. Not introduced by this diff.

2. **Ungrounded assertion in comment** — `service.ts:3` says "unified entrypoint for country, region, city, and provider-axis lookups" — this is accurate after the diff. Good.

3. **CHANGE_SUMMARY accuracy** — All CHANGE_SUMMARY entries accurately describe the changes made. Good.

### Axis F — Pragmatism

1. **`registerSlugStrategy` and `registerCountryLocale` are speculative** — No consumer in the codebase calls either function. They are exported "for future extensibility" but currently have zero callers. This is speculative generality (Axis A item 3). Consider removing them until a concrete consumer exists, or document the expected registration pattern.

2. **`GeoLocalizedSlug` duplicates `LocalizedSlug` from `@gogol/surface`** — Both have the identical shape `{ neutral: string; byLang?: Record<string, string> }`. The structural compatibility is what makes the code typecheck, but the duplication is a maintenance hazard. Consider importing `LocalizedSlug` from `@gogol/surface` instead of declaring `GeoLocalizedSlug`, or document why `@gogol/geo` cannot depend on `@gogol/surface` (it likely cannot — `@gogol/surface` depends on `@gogol/geo` indirectly).

### Axis G — Blind spots

1. **Performance of `providerEntries`** — `resolveProviderEntries` iterates all cities for every call. In `expand.ts`, the result is now cached per axis (`geoResultByAxis`), which is an improvement over the previous 3× calls. However, `createGeoService()` itself calls `buildCityCatalog` for each configured country, which loads the full `country-state-city` dataset. This is O(N) per service creation and not memoized across multiple `expandBlueprint` calls in the same process.

2. **Edge case: empty `languages` array** — If `config.languages` is `[]`, `buildCityCatalog` sets `primaryLang = langs[0] ?? "de"` (line 29), which falls back to `"de"`. But the `names` and `slugByLang` records will be empty objects `{}`, meaning every `city.names[defaultLang]` lookup in `providerEntries` returns `undefined`. This is a silent degradation, not a crash.

3. **Edge case: unknown `provider` string** — See Axis A item 3. Silent empty result.

### Spec compliance

No spec available — spec compliance skipped. The diff implements the architecture review recommendations from the HTML report generated in the previous session.

### Questions for the author

1. **`providerEntries` does `existsSync` on `appDir` paths inside `@gogol/geo`. This violates `packages/geo/AGENTS.md:7` ("Do not read from `apps/*` or site-local content here"). Should the image-probing logic move back to the consumer, or should `providerEntries` accept an injectable image-resolver callback?**

2. **`registerSlugStrategy` and `registerCountryLocale` have zero callers. Are these intended for immediate use, or are they speculative? If speculative, should they be removed until a concrete consumer exists?**

3. **`GeoLocalizedSlug` in `types.ts` is structurally identical to `LocalizedSlug` in `@gogol/surface`. Is this intentional to avoid a `@gogol/geo → @gogol/surface` dependency, or should one be imported from the other?**
