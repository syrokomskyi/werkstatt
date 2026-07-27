---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: unknown
verdict: needs-revision
diffRange: 84eb5a507...HEAD
filesReviewed:
  - apps/warpgogol-com/src/pages/api/integration-inbound.ts
  - apps/warpgogol-com/src/pages/api/integration-route.ts
  - apps/warpgogol-com/src/pages/api/stripe-webhook.ts
  - packages/chat/AGENTS.md
  - packages/chat/README.md
  - packages/chat/package.json
  - packages/chat/src/config.ts (deleted)
  - packages/growth/AGENTS.md
  - packages/growth/README.md
  - packages/growth/src/adapter.ts
  - packages/growth/src/client.ts
  - packages/growth/src/index.ts
  - packages/growth/src/null-adapter.ts
  - packages/growth/src/provider.astro
  - packages/growth/src/registry.ts
  - packages/growth/package.json
  - packages/share/src/integration/index.ts
  - packages/share/src/integration/port-barrel.ts
  - packages/share/src/integration/README.md
  - packages/share/package.json
  - packages/ui/package.json
  - packages/ui/src/sections/chat-widget/chat-widget-section.manifest.yaml
  - packages/ui/src/integration-routes/integration-inbound.api.ts
  - packages/ui/src/integration-routes/integration-delivery.api.ts
  - packages/ui/src/integration-routes/stripe-webhook.api.ts
  - packages/agent-gate/src/ports.ts
  - packages/agent-gate/src/actions.ts
  - packages/integration-adapter-supabase-crm/src/tests/funnel-persistence.test.ts
  - packages/check-core/src/run-paths.ts
  - packages/os/site-kernel-check-warpgogol/src/commands/artifact-builders.ts
  - packages/os/site-kernel-check-warpgogol/src/commands/evidence-readers.ts
  - packages/os/site-kernel-check-warpgogol/src/commands/helpers.ts
---

# Code Review: 84eb5a507...HEAD (architecture review fixes for chat and growth ecosystems)

## Verdict: Needs revision

The diff claims to apply four architectural fixes, but two of the four were not actually applied to the code. Candidate 3 (unify adapter-loader pattern) and Candidate 2 (split integration barrel) exist only as documentation changes and dead files — the code was never modified. Candidate 1 (extract integration routes) is partially applied but broken: `packages/ui/package.json` is missing the new `integration-routes` exports, causing `astro check` to fail with 3 module-not-found errors. Only Candidate 4 (consolidate chat thin modules) and the check-runner refactoring are correctly applied.

## Mechanical floor

**Fail.** `astro check` on `warpgogol-com` produces 3 errors:

```
src/pages/api/integration-inbound.ts:10:22 - error ts(2307): Cannot find module '@warpgogol/ui/integration-routes/inbound'
src/pages/api/integration-route.ts:10:22 - error ts(2307): Cannot find module '@warpgogol/ui/integration-routes/delivery'
src/pages/api/stripe-webhook.ts:10:22 - error ts(2307): Cannot find module '@warpgogol/ui/integration-routes/stripe-webhook'
```

`tsc --noEmit` passes on all individual packages because the `integration-routes` exports are missing from `packages/ui/package.json` — TypeScript resolves the old `chat-widget/api` exports which still point to deleted files, but this is only caught by `astro check` which resolves through the full export map.

## Axis A — Structural correctness

1. **`runRelPath` misuse in `evidence-readers.ts`** — `runRelPath(runId, fileName)` constructs `.check-warpgogol/runs/<runId>/<fileName>`, but callers pass `relRunDir` (already a full relative path like `.check-warpgogol/runs/abc`) as the first argument. This produces double-prefixed paths like `.check-warpgogol/runs/.check-warpgogol/runs/abc/run.json`. The old code used `posix.join(relRunDir, "run.json")` which was correct. Files: `packages/os/site-kernel-check-warpgogol/src/commands/evidence-readers.ts:45-49,134-143`.

2. **Dead code: `registry.ts`** — `packages/growth/src/registry.ts` is created but never imported by `client.ts`, `provider.astro`, or `index.ts`. It defines `ADAPTER_REGISTRY`, `KNOWN_ADAPTER_IDS`, and `getAdapterEntry`, but none of these are consumed anywhere. The file's `MODULE_CONTRACT` claims it is "Consumed by both the client-side bootGrowthLayer() and the build-time validator growth.vendor.resolve" — this is false.

3. **Dead code: `port-barrel.ts`** — `packages/share/src/integration/port-barrel.ts` is created but no `./integration/port` export is added to `packages/share/package.json`. No consumer imports from it. The file's `MODULE_CONTRACT` claims "Type-only consumers import from here" — but none do.

4. **Stale exports in `packages/ui/package.json`** — Lines 414-425 still export `./sections/chat-widget/api`, `./sections/chat-widget/delivery-api`, and `./sections/chat-widget/stripe-webhook` pointing to deleted files (`chat-widget-section.api.ts`, `chat-widget-section.delivery.api.ts`, `chat-widget-section.stripe-webhook.api.ts`).

## Axis B — DNA alignment

1. **DNA-7 (thin routes) — Pass.** The generated API route files remain thin re-exports.

2. **DNA-42 (Compass markup) — Partial fail.** `registry.ts` and `null-adapter.ts` carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`, but `registry.ts`'s contract claims consumption that doesn't exist. `port-barrel.ts` carries proper scaffolding but its purpose is unfulfilled. The `client.ts` `MODULE_CONTRACT` `<non-goals>` says "Do not import adapter packages — the HOST injects the loader map" but the code does the opposite — it imports adapters via `@vite-ignore` dynamic import. The contract lies about the code's behavior.

## Axis C — Ecosystem fit

1. **Package boundaries — Pass.** No `apps/* → apps/*` imports.

2. **AGENTS.md / README.md drift — Fail.** `packages/growth/AGENTS.md` line 12 and `packages/growth/README.md` line 16 claim `bootGrowthLayer(loaders)` and `GrowthAdapterLoaders` type exist, but the actual `bootGrowthLayer()` signature takes zero parameters and `GrowthAdapterLoaders` is not defined anywhere. Documentation misleads agents.

3. **`packages/AGENTS.md` line 46** still says "Resolved via dynamic import in `growth/client.ts`" — this is accurate for the current code but contradicts the claimed Candidate 3 fix. The AGENTS.md was not updated to reflect the host-owned loader pattern (which wasn't applied).

4. **`packages/growth/package.json`** — The `./null-adapter` and `./registry` exports were NOT added, despite the commit message claiming they were. The old `./config` export still points to `./src/config.ts` which still exists (it was NOT deleted, unlike `packages/chat/src/config.ts`).

5. **`packages/share/package.json`** — The `./integration/port` export was NOT added, despite `port-barrel.ts` being created and documented in the README.

## Axis D — Forward-only compliance

1. **Candidate 4 (chat config consolidation) — Pass.** `config.ts` is deleted, `./config` export removed, content folded into `port.ts`. No backward compatibility shim.

2. **Candidate 1 (integration routes extraction) — Partial.** Old files are deleted, but old `package.json` exports remain as stale pointers to deleted files. This is not a compatibility shim — it's an incomplete migration.

3. **Candidate 3 (adapter-loader unification) — Not applied.** The old `@vite-ignore` dynamic import pattern remains in `client.ts`. No new pattern was introduced. Documentation claims the old pattern was removed, but it wasn't.

4. **Candidate 2 (barrel split) — Not applied.** The barrel was not split. `port-barrel.ts` exists but is unwired.

## Axis E — Agent-facing clarity

1. **Documentation lies about code behavior — Fail.** This is the most serious agent-facing issue. `packages/growth/AGENTS.md` and `README.md` describe a `bootGrowthLayer(loaders)` API that doesn't exist. An agent reading these docs would write code that doesn't compile. The `client.ts` `MODULE_CONTRACT` says "the HOST injects the loader map" but the code injects adapters itself via `@vite-ignore`.

2. **`registry.ts` contract is false — Fail.** Claims to be consumed by `bootGrowthLayer()` and `growth.vendor.resolve`, but neither imports it.

3. **Compass scaffolding on new files — Pass.** `null-adapter.ts`, `registry.ts`, and `port-barrel.ts` all carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`.

4. **`integration-routes` files — Pass.** Moved files updated their `MODULE_CONTRACT` purpose lines and `CHANGE_SUMMARY` entries to reflect the move.

## Axis F — Pragmatism

1. **`registry.ts` is speculative generality.** It defines a registry abstraction (`AdapterRegistryEntry`, `ADAPTER_REGISTRY`, `getAdapterEntry`) that was meant to replace the hardcoded map in `client.ts`, but since `client.ts` was never modified to use it, it's pure dead code. If Candidate 3 were properly applied (host-owned loader map), `registry.ts` would be unnecessary — the host's static loader map is the registry.

2. **`port-barrel.ts` is a valid minimal split** — the types-only barrel is a one-file, 25-line re-export. But it's unwired, so it currently adds nothing.

3. **Check-runner refactoring scope — Pass.** The `as any` → `as unknown` casts, path centralization, and unused export pruning are minimal and focused.

## Axis G — Blind spots

1. **`runRelPath` double-prefix bug** — The `evidence-readers.ts` changes will produce incorrect paths at runtime. The old `posix.join(relRunDir, "run.json")` produced correct paths; the new `runRelPath(relRunDir, "run.json")` prepends `.check-warpgogol/runs/` again. This will cause file-not-found errors at runtime when reading run artifacts.

2. **`api.routes.generate` will overwrite manifest changes.** The manifest handler paths were updated to `@warpgogol/ui/integration-routes/*`, but running `api.routes.generate` (which happens during `build.prepare`) will regenerate the generated route files. Since the `packages/ui/package.json` exports are missing, the generated files will fail to resolve. The codegen reads the manifest `handler` field — so the manifest is correct, but the export map must be fixed for the generated files to work.

3. **`packages/growth/src/config.ts` still exists.** Unlike `packages/chat/src/config.ts` which was deleted, the growth `config.ts` was not deleted. The `./config` export in `package.json` still points to it. This is correct for the current code (since `client.ts` imports from `./config.ts`), but if Candidate 3 had been applied, this would need updating.

## Spec compliance

The commit message describes four candidates. Gap table:

| Requirement | Status | Evidence |
| --- | --- | --- |
| Candidate 4: Fold config.ts into port.ts | Done | `packages/chat/src/config.ts` deleted, export removed, docs updated |
| Candidate 3: bootGrowthLayer accepts host-supplied loaders | Missing | `client.ts:81` — `bootGrowthLayer()` takes zero params; `provider.astro:80` calls it with no args |
| Candidate 3: Remove @vite-ignore dynamic import | Missing | `client.ts:176,180` — still uses `import(/* @vite-ignore */ path)` |
| Candidate 3: provider.astro owns static loader map | Missing | `provider.astro:77-82` — no loader map defined |
| Candidate 3: Add ./null-adapter export to growth package.json | Missing | `package.json` has no `./null-adapter` export |
| Candidate 3: Export GrowthAdapterLoaders from index.ts | Missing | `index.ts` does not export `GrowthAdapterLoaders` |
| Candidate 1: Move API handlers to integration-routes/ | Done | Files moved and renamed |
| Candidate 1: Update manifest handler paths | Done | `chat-widget-section.manifest.yaml` lines 26,38,46 |
| Candidate 1: Update generated app route files | Done | 3 files updated to import from `@warpgogol/ui/integration-routes/*` |
| Candidate 1: Add integration-routes exports to ui package.json | Missing | `packages/ui/package.json` has no `integration-routes` entries |
| Candidate 1: Delete old chat-widget API files | Done | Files deleted in commit `ebb38d0c6` |
| Candidate 2: Create port-barrel.ts | Done | File created at `packages/share/src/integration/port-barrel.ts` |
| Candidate 2: Add ./integration/port export to share package.json | Missing | `packages/share/package.json` has no `./integration/port` entry |
| Candidate 2: Update type-only consumers to use port barrel | Missing | `agent-gate/src/ports.ts` and `actions.ts` still import from `@warpgogol/share/integration` |
| Candidate 2: Update supabase-crm test to use port barrel | Missing | Test still imports from `@warpgogol/share/integration` |
| Candidate 2: Document split in README | Done | `packages/share/src/integration/README.md` updated |

## Questions for the author

1. **Why does `bootGrowthLayer()` still take zero parameters?** The commit message, AGENTS.md, and README all claim it accepts a `GrowthAdapterLoaders` map, but the code was never modified. Was the edit lost, or was it never attempted?

2. **Why does `packages/ui/package.json` not have `integration-routes` exports?** The generated app route files import from `@warpgogol/ui/integration-routes/inbound` etc., but these export paths don't exist in the package's export map. Did the edit to `package.json` get overwritten by `api.routes.generate` during `build:check` and never re-applied?

3. **Why was `registry.ts` created but never wired in?** It's imported by nothing. If the intent was to replace the hardcoded map in `client.ts`, that modification was never made. If the intent was to provide `KNOWN_ADAPTER_IDS` for validators, the validator already imports from `@warpgogol/growth` which doesn't re-export it. Should `registry.ts` be deleted, or should the code be fixed to use it?
