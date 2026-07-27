---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: unknown
verdict: needs-revision
diffRange: f5f13d244...HEAD
filesReviewed:
  - packages/surface/src/decision-composer.ts
  - packages/surface/src/geo.ts
  - packages/surface/src/governance/index.ts
  - packages/surface/src/index.ts
  - packages/os/site-kernel-checks/src/surface-expand/expand.ts
  - packages/os/site-kernel-checks/src/surface-expand/pipeline.ts
  - packages/surface/README.md
---

# Code Review: surface architecture deepening (composeIndexDecision, blockTwinRegistry, governance sub-barrel, pipeline stages)

## Verdict: Needs revision

The change introduces a well-structured deepening of `@warpgogol/surface` and its consumer, but the `pipeline.ts` module contract claims immutability while its functions mutate `VirtualRouteEntry` in-place — a direct `MODULE_CONTRACT` violation. Two dead-code items and one unused export round out the findings.

## Mechanical floor

Pass — `tsc --noEmit` for `@warpgogol/surface` and `@warpgogol/site-kernel-checks` both exit 0. Tests: 7/7 pass (surface-localized-slug + pseo-safety).

## Axis A — Structural correctness

- **Dead code: `ExistenceGateCtx` interface** — `pipeline.ts:52-57` defines `ExistenceGateCtx` but it is never imported or used anywhere in the codebase. Remove it.

- **Dead import: `BakeCtx`** — `pipeline.ts:38` imports `type BakeCtx` from `./bake.ts` but never references it. Remove the import.

- **Unused export: `evaluateNavigationGate`** — `decision-composer.ts:168-179` exports `evaluateNavigationGate` and `index.ts:197` re-exports it, but no consumer calls it. This is speculative generality — the navigation-noindex gate is handled elsewhere (in `eligibility.ts` `deriveDecision`). Either remove it or add a `// TODO: RFC-0324` annotation explaining when it will be wired.

- **`as unknown as` double-cast pattern** — `expand.ts:227-233` uses `qualifyingDemandSignals as unknown as (...)` to bridge the typed consumer function to the `unknown`-typed pipeline parameter. This is a type-erasure seam. The pipeline's `applyExistenceGates` accepts `qualifyingDemand: (signals: ReadonlyArray<unknown>, entry: VirtualRouteEntry, policy: unknown) => Array<unknown>` but the actual function has concrete types. Consider making the pipeline generic or accepting the real function signatures instead of erasing types.

## Axis B — DNA alignment

- **DNA-42 (Compass markup) — Pass.** All three new files (`decision-composer.ts`, `governance/index.ts`, `pipeline.ts`) carry `MODULE_CONTRACT` with `<purpose>` ≥ 10 words and ≥ 1 `<non-goals>` item, and `CHANGE_SUMMARY` with ≥ 1 item. Updated files (`geo.ts`, `index.ts`) have updated `CHANGE_SUMMARY`.

- **DNA-1 (monorepo boundary) — Pass.** `pipeline.ts` imports from `@warpgogol/surface` and `@warpgogol/share/string-utils` — correct direction. No `apps/* → apps/*` or `apps/* → services/*` imports.

- **DNA-24/DNA-25 — Pass.** No block-declarative or buildPage changes.

## Axis C — Ecosystem fit

- **Package boundaries — Pass.** `@warpgogol/surface` remains the lower-level package; `pipeline.ts` lives in `site-kernel-checks` (the consumer), which is correct.

- **Compass sync — Not applicable.** No `docs/*.xml` changes needed — the deepening is internal to existing modules.

- **AGENTS.md — Pass.** `packages/surface/README.md` module map updated with new files.

## Axis D — Forward-only compliance

- **Pass.** No compatibility shims or dual-paths. The inline gate logic in `expand.ts` was fully replaced by pipeline calls — no legacy path remains.

## Axis E — Agent-facing clarity

- **MODULE_CONTRACT violation in `pipeline.ts`** — The `<non-goals>` block states: `<item>Do not mutate VirtualRouteEntry arrays in-place — return new arrays.</item>`. However, `applySubstanceGate`, `applyEvidenceGates`, `applyFreshnessGate`, `applyBudgetGate`, `applyUntranslatedGate`, and `insertStringEnrichedFields` all mutate `entry.decision`, `entry.noindex`, `entry.pages`, `entry.routes`, `entry.page`, and `entry.untranslatedLangs` directly on the passed-in entries. Only `dedupByPageId` and `applyExistenceGates` return new arrays. Either:
  1. Update the `<non-goals>` to reflect the actual contract: "Do not perform I/O — all data is supplied by the caller. Functions mutate entries in-place for performance; the caller is responsible for cloning if needed."
  2. Or make the functions truly pure by returning new entry objects.

  Option 1 is pragmatic — option 2 would create significant allocation overhead for large surfaces.

- **`decision-composer.ts` contract accuracy — Pass.** The `MODULE_CONTRACT` accurately describes the module: pure gate functions + composer, no I/O, no mutation of `VirtualRouteEntry`.

- **`geo.ts` contract accuracy — Pass.** Updated `CHANGE_SUMMARY` references the `blockTwinRegistry` extraction.

## Axis F — Pragmatism

- **`blockTwinRegistry` coverage** — The registry covers 6 block types (`hero`, `markdown`, `card-grid`, `linked-card-grid`, `list-cards`, `cta`). The fallback renderer ensures unknown types are not silently dropped. However, the registry is a `const` object — not extensible at runtime. If a future block type needs a twin renderer, it must be added here. This is acceptable for now but should be noted.

- **`applyExistenceGates` parameter count** — The function takes 7 parameters. This is a lot, but the alternative (a context object) would add indirection without reducing the surface. Acceptable.

## Axis G — Blind spots

- **Performance** — `applySubstanceGate` calls `buildTokenDocFreq(bakedPages)` once and then iterates all entries — O(n) + O(n*m) where m is records per entry. Same as before. No regression.

- **Edge cases** — `applyBudgetGate` handles `indexBudget === 0` correctly (all live entries become noindex). `applyFreshnessGate` handles `ages.length === 0` (skips entry). No edge case regressions.

## Spec compliance

No spec available — this was an architecture review deepening, not a spec-driven change. Skipped.

## Questions for the author

1. `pipeline.ts` `MODULE_CONTRACT` says "Do not mutate VirtualRouteEntry arrays in-place" but all gate functions mutate entries directly. Should the contract be updated to reflect reality, or should the functions be made truly pure?

2. `evaluateNavigationGate` is exported but never called. Is it intended for future use (RFC-0324), or should it be removed as speculative generality?

3. The `as unknown as` double-cast in `expand.ts:227-233` erases type safety at the pipeline boundary. Should `applyExistenceGates` accept generic-typed function parameters instead of `unknown`?
