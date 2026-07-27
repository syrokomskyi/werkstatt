---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: unknown
verdict: approved
fixesApplied: 2026-07-10
fixCommit: 68e892d25
diffRange: HEAD...working-tree
filesReviewed:
  - packages/growth-adapter-matomo/src/index.ts
  - packages/growth/src/adapter.ts
  - packages/growth/src/emit.ts
  - packages/growth/src/null-adapter.ts
  - packages/growth/src/registry.ts
  - packages/growth/src/index.ts
  - packages/growth/src/client.ts
  - packages/growth/src/provider.astro
  - packages/growth/package.json
  - packages/os/site-kernel-checks/src/growth-adapter.ts
  - packages/chat/src/config.ts
  - packages/fingerprint/src/normalizers/index.ts
  - apps/warpgogol-com/package.json
  - apps/nicaragua-projekt/package.json
  - apps/check-warpgogol-com/package.json
  - pnpm-lock.yaml
---

# Code Review: Growth adapter refactoring (working tree vs HEAD)

### Verdict: Approved (fixes applied 2026-07-10)

All review findings have been addressed in commit `68e892d25`. The growth-adapter-matomo architectural refactoring is structurally sound and ecosystem-fit. Below is the original review with resolution notes inline.

### Fixes applied

| Finding | Resolution |
| --- | --- |
| C-1/F-1 (registry.ts dead code) | `registry.ts` deleted; `KNOWN_ADAPTER_IDS` moved to `adapter.ts` as a simple const array |
| C-2/E-2 (AGENTS.md stale refs) | `packages/AGENTS.md` updated — references registry.ts deletion and host-owned loader pattern |
| C-3 (onboarding templates) | Verified clean — no `@warpgogol/growth-adapter-null` references remain |
| C-4 (loader map sync) | Validator now imports `KNOWN_ADAPTER_IDS` from `@warpgogol/growth` (single source of truth) |
| Q4/G-4 (accepts silent skip) | `console.warn` added in `emit.ts` `_dispatchSafe` for dropped events |
| D-4 (singleton export) | Kept — module-level state makes singleton the correct pattern for browser adapter |
| F-2 (unrelated changes) | App `package.json` removals committed with the null-adapter inlining; `chat/config.ts` and `fingerprint` changes were in prior commits |
| Provider.astro build failure | Fixed: moved loader map inside `<script>` (Astro `define:vars` can't serialize functions); `@vite-ignore` on matomo import |

### Mechanical floor

Pass — both `@warpgogol/growth-adapter-matomo` and `@warpgogol/growth` pass `tsc --noEmit` with exit code 0.

### Axis A — Structural correctness

- **A-1 (warning): `registry.ts` `_loadExternal` uses `@vite-ignore` dynamic import.** The client path no longer uses `registry.ts` — `provider.astro` owns static `import()` specifiers. The registry's `_loadExternal("@warpgogol/growth-adapter-matomo")` uses a variable specifier with `@vite-ignore`, which means the bundler cannot code-split the matomo adapter when loaded through the registry. Since the registry is now only consumed by the validator (`KNOWN_ADAPTER_IDS`), the `_loadExternal` helper and the matomo `loader` entry are dead code at runtime.

- **A-2 (pass): No `any` types.** The adapter uses `unknown[]` for transport commands and `Record<string, unknown>` for payload resolution — no `any` casts.

- **A-3 (warning): `resolveNameFrom` is loosely typed.** `@/packages/growth-adapter-matomo/src/index.ts:222` accepts `Record<string, unknown>` and walks a dot-path. The `nameFrom` field in `MatomoBindingEvent` is a freeform string (`"payload.placement"`, `"payload.formId"`). If the binding YAML specifies a field that doesn't exist on the payload, the function silently returns `""` — no validation at binding-load time.

- **A-4 (pass): No dead code in adapter logic.** All exported types and functions (`MatomoBinding`, `MatomoTransport`, `BrowserMatomoTransport`, `StubMatomoTransport`, `createMatomoAdapter`, `DEFAULT_MATOMO_BINDING`) are reachable from the public API.

- **A-5 (warning): `forbiddenQueueCalls` in binding is unused.** `@/packages/growth-adapter-matomo/src/index.ts:99` declares `forbiddenQueueCalls` in `DEFAULT_MATOMO_BINDING.tracker` but no code reads it. This is speculative generality — the field exists but has no enforcement.

### Axis B — DNA alignment

- **DNA-1 (pass): No `apps/* → apps/*` imports.** Package boundaries are clean.

- **DNA-4 (pass): No hardcoded copy strings.** The adapter is logic-only; all content is in the ontology YAML.

- **DNA-42 (pass): Compass scaffolding present.** `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks are present in all touched files, including the new `registry.ts`.

- **DNA-30 (pass): Adapter contract preserved.** The `GrowthAdapter` interface is extended with an optional `accepts` field — no vendor-specific methods leak.

### Axis C — Ecosystem fit

- **C-1 (fail): `registry.ts` is orphaned from the client path.** The diff introduces `registry.ts` as the "single source of truth for adapter id-to-loader mapping" and exports `ADAPTER_REGISTRY`, `KNOWN_ADAPTER_IDS`, and `getAdapterEntry` from `@warpgogol/growth`. However, `client.ts` no longer imports from `registry.ts` — it accepts a `GrowthAdapterLoaders` map from `provider.astro`, which owns its own static `import()` map. The registry is only consumed by:
  - `packages/os/site-kernel-checks/src/growth-adapter.ts` — imports `KNOWN_ADAPTER_IDS` for validator membership checks.
  - `packages/growth/src/index.ts` — re-exports.

  The `ADAPTER_REGISTRY` array, `getAdapterEntry()`, `_loadExternal()`, and the `loader` fields are dead code at runtime. The registry serves only the validator's id-list check. This is a coherence issue: the docstring says "consumed by both the client-side bootGrowthLayer() and the build-time validator" but the client no longer consumes it.

- **C-2 (fail): `packages/AGENTS.md` line 46 still references `growth-adapter-null` as a separate package.** The diff deletes `packages/growth-adapter-null/` and inlines the null adapter into `packages/growth/src/null-adapter.ts`, but `@/packages/AGENTS.md:46` still says: `| growth-adapter-null / growth-adapter-matomo | Concrete GrowthAdapter implementations ... Resolved via dynamic import in growth/client.ts; ...`. This is stale — the null adapter is now built-in, and the resolution path changed to host-owned loaders.

- **C-3 (fail): Onboarding templates still reference `@warpgogol/growth-adapter-null`.** `@/packages/os/site-kernel-onboarding/src/templates/package.template.json:59` and `@/packages/os/site-kernel-onboarding/src/templates/runtime/astro.config.template.mjs:100` both list `"@warpgogol/growth-adapter-null": "workspace:*"` as a dependency. New apps scaffolded via onboarding will have a dangling dependency on a deleted package.

- **C-4 (warning): `provider.astro` loader map is a second source of truth.** `@/packages/growth/src/provider.astro:83` defines `ADAPTER_LOADERS` with `null` and `matomo` keys. The comment says "Keep in sync with KNOWN_ADAPTER_IDS (@warpgogol/growth/registry)" but there is no validator that enforces this sync. If someone adds an adapter to the registry but forgets the provider loader map (or vice versa), the drift is invisible.

- **C-5 (pass): `growth.vendor.resolve` validator now imports from the registry.** `@/packages/os/site-kernel-checks/src/growth-adapter.ts:31` imports `KNOWN_ADAPTER_IDS` from `@warpgogol/growth` — eliminating the previously duplicated hardcoded set.

### Axis D — Forward-only compliance

- **D-1 (pass): No backward compatibility shims.** The old `_paq` direct manipulation, module-level state, and hardcoded tables are fully removed — not maintained behind a flag.

- **D-2 (pass): `growth-adapter-null` package is deleted, not deprecated.** The package directory, `package.json`, `tsconfig.json`, `turbo.json`, `AGENTS.md`, and `README.md` are all deleted. The null adapter is inlined into `@warpgogol/growth`.

- **D-3 (pass): `client.ts` old `_loadAdapter` with hardcoded `knownAdapters` map is removed.** The new host-owned loader pattern replaces it completely.

- **D-4 (warning): Default export singleton preserved.** `@/packages/growth-adapter-matomo/src/index.ts:378` still exports `const MatomoAdapter = createMatomoAdapter(); export default MatomoAdapter;`. This is a singleton created at module load time — the factory exists but the default export doesn't use it per-invocation. The `provider.astro` loader does `import("@warpgogol/growth-adapter-matomo")` which resolves to `mod.default` (the singleton). This means every page load gets the same singleton, not a fresh factory instance. This is acceptable for a browser singleton but contradicts the factory pattern's intent.

### Axis E — Agent-facing clarity

- **E-1 (pass): Compass scaffolding is present and updated.** All touched files have `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks. The `CHANGE_SUMMARY` in `growth-adapter-matomo/src/index.ts` documents the architectural review.

- **E-2 (warning): `registry.ts` docstring is inaccurate.** `@/packages/growth/src/registry.ts:21` says "Both the client-side `bootGrowthLayer()` and the build-time validator `growth.vendor.resolve` import from this module." But `client.ts` no longer imports from `registry.ts` — only the validator does. This will mislead the next agent.

- **E-3 (pass): No ungrounded assertions.** Code comments reference real functions and types.

- **E-4 (pass): Log messages carry context.** `console.warn` calls include `[growth:matomo]` and `[growth]` prefixes with structured context.

### Axis F — Pragmatism

- **F-1 (warning): `registry.ts` is over-engineered for its actual role.** The registry exports `ADAPTER_REGISTRY` (array of entries with loaders), `getAdapterEntry()` (lookup function), `KNOWN_ADAPTER_IDS` (derived id list), and `AdapterRegistryEntry` (interface). But only `KNOWN_ADAPTER_IDS` is consumed externally (by the validator). The `loader` fields, `getAdapterEntry()`, and `_loadExternal()` are dead code. The registry could be a simple `const KNOWN_ADAPTER_IDS = ["null", "matomo"] as const` — or eliminated entirely by having the validator read the ids from the `provider.astro` loader map.

- **F-2 (warning): Unrelated changes mixed into the diff.** The diff includes:
  - Deletion of `packages/chat/src/config.ts` (30 lines removed).
  - Removal of `byteHash` import from `packages/fingerprint/src/normalizers/index.ts`.
  - Removal of `@warpgogol/growth-adapter-null` from three app `package.json` files.

  The app `package.json` removals are related to the null adapter inlining. But the `chat/src/config.ts` deletion and `fingerprint/normalizers` import removal are unrelated to the growth adapter refactoring. These should be separate commits.

- **F-3 (pass): `accepts` field is optional.** The `GrowthAdapter.accepts` field is `readonly accepts?: readonly EventName[]` — existing adapters without `accepts` still typecheck. This is the minimal contract extension.

### Axis G — Blind spots

- **G-1 (warning): `DEFAULT_MATOMO_BINDING` is a TS constant, not a YAML projection.** The binding is declared as a TypeScript object literal (`@/packages/growth-adapter-matomo/src/index.ts:85`). The stated goal was "drive adapter from Matomo Binding ontology" (matomo-binding.yaml), but the binding is not read from the YAML at runtime — it's a hand-maintained TS projection. If the YAML changes, this constant must be manually updated. There is no validator that checks the TS constant against the YAML.

- **G-2 (pass): No cookies.** The adapter uses `disableCookies` and `setDoNotTrack` — no `document.cookie` access.

- **G-3 (pass): `localStorage` only for opt-out.** `@/packages/growth-adapter-matomo/src/index.ts:147` uses `localStorage.getItem(INTERNAL_OPT_OUT_KEY)` — no server-side persistence.

- **G-4 (warning): No test for the `accepts` skip logic.** The `dispatchSafe` function in `emit.ts` now checks `adapter.accepts` and silently returns for unsupported events. There is no unit test verifying this behavior — the `testSignal` for `@warpgogol/growth` is "skipped".

### Spec compliance

No formal spec available — the task was an inline architectural refactoring request. The user's objectives were:

| Objective | Status | Evidence |
| --- | --- | --- |
| Remove hardcoded event maps and dimension keys | Done | `MESSKANON_EVENT_MAP`, `VISIT_DIMENSION_KEYS`, `ACTION_DIMENSION_KEYS` replaced by `DEFAULT_MATOMO_BINDING` |
| Extract `_paq` into injectable transport seam | Done | `MatomoTransport` interface + `BrowserMatomoTransport` + `StubMatomoTransport` |
| Replace module-level state with factory | Done | `createMatomoAdapter()` factory; state in closure |
| Add `accepts` to `GrowthAdapter` + warn in `emit()` | Partial | `accepts` added and checked in `dispatchSafe`, but silently skips — no `console.warn` for dropped events |
| Update null adapter to factory + accepts | Done | `createNullAdapter()` with `accepts: EVENT_NAMES` |
| Update client to use factory + pass binding | Done | `client.ts` accepts `GrowthAdapterLoaders` from host; `provider.astro` owns the map |
| No heavy build — typecheck only | Done | Both packages pass `tsc --noEmit` |

### Questions for the author

1. **`registry.ts` is orphaned from the client path.** `client.ts` no longer imports `ADAPTER_REGISTRY` or `getAdapterEntry` — `provider.astro` owns the loader map. Should `registry.ts` be trimmed to just `KNOWN_ADAPTER_IDS` (a const array), or should the provider loader map be derived from the registry to eliminate the sync drift?

2. **`packages/AGENTS.md` line 46 and onboarding templates still reference `@warpgogol/growth-adapter-null`.** These must be updated in the same change. Are you planning to update them in a follow-up, or should this review block until they're fixed?

3. **`DEFAULT_MATOMO_BINDING` is a hand-maintained TS constant, not a runtime projection of `matomo-binding.yaml`.** Is there a plan to add a validator that checks the TS constant against the YAML, or is the constant considered the source of truth and the YAML documentation?

4. **The `accepts` check in `dispatchSafe` silently drops unsupported events.** The user's objective said "warn in `emit()`" but the implementation returns without logging. Should a `console.warn` be added for dropped events, or is silent skip the intended behavior?

5. **`chat/src/config.ts` deletion and `fingerprint/normalizers` import removal are unrelated to this refactoring.** Should these be split into a separate commit?
