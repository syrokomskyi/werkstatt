---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: HEAD (uncommitted working tree)
filesReviewed:
  - packages/growth/src/null-adapter.ts
  - packages/growth/src/registry.ts
  - packages/growth/src/emit.ts
  - packages/growth/src/client.ts
  - packages/growth/src/index.ts
  - packages/growth/src/adapter.ts
  - packages/growth/package.json
  - packages/growth-adapter-null/src/index.ts
  - packages/os/site-kernel-checks/src/growth-adapter.ts
  - apps/webgogol-com/package.json
  - apps/check-webgogol-com/package.json
  - apps/nicaragua-projekt/package.json
---

# Code Review: Growth adapter architecture fix — uncommitted working tree

### Verdict: Needs revision

The diff introduces two new source files (`null-adapter.ts`, `registry.ts`) intended to fix four architectural candidates in the growth adapter system, but the implementation is **critically incomplete**: none of the four candidates were actually applied to tracked files. The new files are dead code — nothing imports them — and they contain a type error that breaks `tsc --noEmit` for the entire `@gogol/growth` package. The `growth-adapter-null` package was not deleted, app `package.json` files still reference it, and the duplicated adapter registry in `client.ts` and the validator remains untouched.

### Mechanical floor

**Fail.**

```
src/null-adapter.ts:47:5 - error TS2353: Object literal may only specify known properties, and 'accepts' does not exist in type 'GrowthAdapter'.
47     accepts: EVENT_NAMES,
       ~~~~~~~
```

`pnpm --filter @gogol/growth build:check` exits with code 2. The `GrowthAdapter` interface (`adapter.ts:223-251`) has no `accepts` property — only `id`, `init`, `track`, `identifySegment?`, `destroy?`.

### Axis A — Structural correctness

1. **Fail — type error in `null-adapter.ts:47`.** The `accepts: EVENT_NAMES` property does not exist on the `GrowthAdapter` interface (`adapter.ts:223-251`). This is not a warning — it is a hard `tsc` error that blocks the entire package.

2. **Fail — dead code: `registry.ts` is imported by nothing.** The file exports `ADAPTER_REGISTRY`, `KNOWN_ADAPTER_IDS`, `getAdapterEntry`, and `AdapterRegistryEntry`, but no file in the repository imports them. `client.ts:170-199` still uses the hardcoded `knownAdapters` map. The validator (`growth-adapter.ts:37`) still uses `const KNOWN_ADAPTER_IDS = new Set(["null", "matomo"])`. The registry is a disconnected orphan module.

3. **Fail — dead code: `null-adapter.ts` is imported by nothing.** The file exports `createNullAdapter` and `NullAdapter`, but no tracked file imports them. The `growth-adapter-null` package still exists at `packages/growth-adapter-null/src/index.ts` with its own `NullAdapter` default export. The inlined version is a duplicate that nothing references.

4. **Fail — `createNullAdapter()` factory is speculative generality.** The original `NullAdapter` was a simple object literal. The refactored version wraps it in a factory function `createNullAdapter()` with no caller that needs factory semantics (no parameterized config, no test isolation). This adds indirection without value.

### Axis B — DNA alignment

1. **Pass — DNA-30 (vendor-agnostic GrowthAdapter).** The `null-adapter.ts` implementation correctly implements the closed `GrowthAdapter` interface (modulo the invalid `accepts` property). No vendor-specific methods are exposed.

2. **Fail — DNA-42 (Compass markup).** Both new files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks — this is correct. However, the `CHANGE_SUMMARY` in `null-adapter.ts` claims "Inlined from the former @gogol/growth-adapter-null package" — but the package was NOT inlined (it still exists). The claim is an ungrounded assertion about a state that was not achieved.

3. **Pass — DNA-27 (typed event catalog).** The `null-adapter.ts` imports `EVENT_NAMES` from `adapter.ts`, respecting the closed catalog. No duplication of the event list.

### Axis C — Ecosystem fit

1. **Fail — package boundaries broken.** `registry.ts:77` creates a static dependency edge from `@gogol/growth` to `@gogol/growth-adapter-matomo` via `_loadExternal("@gogol/growth-adapter-matomo")`. While the `@vite-ignore` comment prevents Vite from creating a build-time edge, the registry module itself imports `createNullAdapter` from `null-adapter.ts` which is a sibling — this is fine. But the `packages/AGENTS.md:46` still lists `growth-adapter-null` as a package, and the `client.ts` still references `@gogol/growth-adapter-null` in its `knownAdapters` map. The ecosystem is in a split state: new files claim the old package is gone, but the old package and all references to it remain.

2. **Fail — Compass sync not done.** If the intent was to collapse `growth-adapter-null` into `@gogol/growth`, the following Compass files needed updates (none were modified):
   - `docs/PACKAGE_GRAPH.md` — still lists `@gogol/growth-adapter-null`
   - `docs/engineering/growth-adapters.md` — still references the old package
   - `docs/compass-inventory.xml` — still has entry for `packages/growth-adapter-null/src/index.ts`
   - `docs/grace-inventory.xml` — same
   - `docs/ecosystem.generated.json` — still references the package
   - `packages/AGENTS.md:46` — still lists `growth-adapter-null` as a package

3. **Fail — app package.json files not updated.** All three apps (`webgogol-com`, `check-webgogol-com`, `nicaragua-projekt`) still list `"@gogol/growth-adapter-null": "workspace:*"` as a dependency. If the package were actually deleted, `pnpm install` would fail.

4. **Fail — `package.json` exports not updated.** `packages/growth/package.json` does not export `./registry` or `./null-adapter` subpaths. Even if someone tried to import from `@gogol/growth/registry`, the package exports map would not resolve it.

5. **Fail — `index.ts` not updated.** The barrel file `packages/growth/src/index.ts` does not re-export anything from `registry.ts` or `null-adapter.ts`. The validator (`site-kernel-checks/src/growth-adapter.ts`) would need to import `KNOWN_ADAPTER_IDS` from `@gogol/growth` — but that export does not exist.

### Axis D — Forward-only compliance

1. **Fail — dual-path created, not collapsed.** The diff creates a second `NullAdapter` implementation (`packages/growth/src/null-adapter.ts`) alongside the existing one (`packages/growth-adapter-null/src/index.ts`). This is the opposite of forward-only: it introduces a parallel implementation without removing the old one. Forward-only discipline requires deleting the old package in the same change.

2. **Fail — duplicated registry, not unified.** The diff creates a new `ADAPTER_REGISTRY` in `registry.ts` but does not remove or replace the `knownAdapters` map in `client.ts:173-182` or the `KNOWN_ADAPTER_IDS` set in `growth-adapter.ts:37`. There are now THREE sources of truth for adapter ids: the old `knownAdapters` map, the old `KNOWN_ADAPTER_IDS` set, and the new `ADAPTER_REGISTRY`. This is worse than before — the duplication tripled.

### Axis E — Agent-facing clarity

1. **Fail — ungrounded assertion in `null-adapter.ts` CHANGE_SUMMARY.** Line 14 claims "Inlined from the former @gogol/growth-adapter-null package" — but the package was not removed. An agent reading this would believe the old package no longer exists and fail to find it.

2. **Fail — ungrounded assertion in `registry.ts` docstring.** Lines 4-6 claim the registry is "Consumed by both the client-side bootGrowthLayer() ... and the build-time validator growth.vendor.resolve" — but neither consumer imports from this file. An agent would search for the import and find nothing, losing trust in the documentation.

3. **Pass — Compass scaffolding present.** Both new files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks with purpose and non-goals. The structure is correct even though the content claims are inaccurate.

4. **Pass — `@ai-invariant` in `emit.ts`.** The existing `emit.ts` has an `@ai-invariant` comment block (lines 15-19) that accurately describes the singleton contract. The file was not modified, so this is unchanged.

### Axis F — Pragmatism

1. **Fail — `createNullAdapter()` factory adds no value.** The original `NullAdapter` was a 20-line object literal. The new version wraps it in a factory function that returns the same object. No caller needs factory semantics. The `registry.ts:72` loader calls `createNullAdapter()` on every invocation — unnecessary allocation when a static object would suffice.

2. **Fail — `AdapterRegistryEntry` interface is over-designed.** The `description` field is human-readable prose that no code path reads. The `loader` function type `() => Promise<GrowthAdapter>` is correct, but the `readonly` modifiers on every field are defensive coding for a static array that is never mutated.

3. **Pass — scope is correct.** The files target the right architectural seam (adapter registry). The problem is execution, not scope.

### Axis G — Blind spots

1. **Fail — no migration path.** If `growth-adapter-null` were actually being collapsed, the diff needs to address: (a) what happens to apps that import from `@gogol/growth-adapter-null` in their `astro.config.mjs` Vite aliases, (b) what happens to the `growth.adapter.contract` validator that scans `packages/growth-adapter-*` directories, (c) what happens to the lockfile entry. None of these are considered.

2. **Pass — edge cases for `null` adapter.** The `NullAdapter` implementation correctly handles all interface methods. The `console.debug` calls are development-appropriate.

3. **Fail — concurrent execution.** The `registry.ts` module is safe for concurrent reads (static array), but the `_loadExternal` helper at line 59-62 does an unguarded dynamic `import()`. If two callers call `getAdapterEntry("matomo").loader()` simultaneously, they both trigger the dynamic import. This is not a race condition (ES module imports are deduplicated by the module system), but it is worth noting that the helper provides no caching.

### Spec compliance

No spec available — spec compliance skipped. The four candidates were identified in a previous architecture review session but not formally specified in an RFC or issue.

### Questions for the author

1. **Why do the new files exist if no tracked file was modified?** The `emit.ts`, `client.ts`, `index.ts`, `package.json`, and `growth-adapter.ts` edits described in the session summary are not present in the working tree. Were they reverted, or were the `edit`/`multi_edit` calls applied to a stale file handle?

2. **Where does the `accepts: EVENT_NAMES` property come from?** The `GrowthAdapter` interface has no `accepts` field. Was this copied from a different adapter pattern (e.g. `ChatWidgetAdapter` which has `requiredOptions`), or is it a speculative extension of the interface that was never proposed via RFC?

3. **What is the intended completion path?** The two new files are disconnected orphans. Should they be deleted and the work restarted, or should the remaining wiring (client.ts, index.ts, package.json, validator, package deletion, app package.json cleanup, Compass sync) be applied around them?
