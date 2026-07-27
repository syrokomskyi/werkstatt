---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: unknown
verdict: needs-revision
diffRange: HEAD (uncommitted)
filesReviewed:
  - packages/growth/src/registry.ts
  - packages/growth/src/adapter.ts
  - packages/growth/src/client.ts
  - packages/growth/src/config.ts
  - packages/growth/src/index.ts
  - packages/growth/package.json
  - packages/growth/AGENTS.md
  - packages/growth/README.md
  - packages/ontology/src/schemas/system/growth.ts
  - packages/ontology/src/schemas/system.ts
  - packages/ontology/src/schemas/index.ts
  - packages/os/site-kernel-checks/src/growth-funnel.ts
  - packages/os/site-kernel-checks/src/growth-experiment.ts
---

# Code Review: packages/growth architecture deepening (uncommitted diff)

## Verdict: Needs revision

The diff fixes real bugs (stale hardcoded event list, dead `system.yaml` reads) and removes genuinely dead code (`ClientRuntimeContext`). However, it introduces a new workspace dependency (`@gogol/growth → @gogol/ontology`) that creates a potential cycle path, leaves CHANGE_SUMMARY blocks un-updated on two validator files, and uses an inline string literal for the `window` boot guard key instead of a named constant. These are fixable in-place without reverting any structural change.

## Mechanical floor

Pass — `@gogol/growth`, `@gogol/ontology`, `@gogol/site-kernel-checks`, `@gogol/growth-adapter-matomo` all pass `tsc --noEmit`.

## Axis A — Structural correctness

- **Inline string literal for window key** — `client.ts:66` and `client.ts:69` use `"__webgogol_growth_booted__"` as a raw string literal in two places (`bootGrowthLayer` guard + `destroyGrowthLayer` cleanup). The deleted `GROWTH_CONTEXT_KEY` was a named constant; its replacement should follow the same pattern. Extract `const GROWTH_BOOTED_KEY = "__webgogol_growth_booted__"` to avoid drift if the key name ever changes.
- **Missing CHANGE_SUMMARY updates** — `growth-funnel.ts:11-13` and `growth-experiment.ts:15-17` still show only `Wave 1 (RFC-0027): Initial creation.` despite receiving structural changes (new imports, replaced system config reader, replaced event catalog source). DNA-42 requires CHANGE_SUMMARY to reflect material edits.

## Axis B — DNA alignment

- **DNA-27 (typed event catalog)** — Pass. `growth-funnel.ts` now imports `EVENT_NAMES` from `@gogol/growth` instead of a hardcoded list. This is the correct fix — `EVENT_NAMES` in `adapter.ts` is the single source of truth.
- **DNA-30 (vendor-agnostic GrowthAdapter)** — Pass. The adapter interface itself is unchanged; the registry extraction is purely structural.
- **DNA-42 (Compass markup)** — Fail. `growth-funnel.ts` and `growth-experiment.ts` have stale CHANGE_SUMMARY blocks. `registry.ts` correctly includes a CHANGE_SUMMARY entry.

## Axis C — Ecosystem fit

- **New dependency: `@gogol/growth → @gogol/ontology`** — `package.json` adds `"@gogol/ontology": "workspace:*"` to `@gogol/growth` dependencies. This is architecturally sound (growth config now imports the canonical vendor schema from ontology), but verify no cycle exists: `@gogol/ontology` must not depend on `@gogol/growth`. Confirmed: `packages/ontology/package.json` has no `@gogol/growth` dependency. No cycle.
- **Export path registration** — Pass. `./registry` is correctly added to `package.json` exports map.
- **AGENTS.md update** — Pass. The AGENTS.md table correctly removes `ClientRuntimeContext` references and updates the `KNOWN_ADAPTER_IDS` location to `registry.ts`.
- **README.md update** — Pass. `ClientRuntimeContext` references removed from the description and entry-point table.
- **Compass sync** — Not applicable. No `docs/*.xml` files need updating for these package-internal changes.

## Axis D — Forward-only compliance

- **Dead code removal** — Pass. `ClientRuntimeContext`, `GROWTH_CONTEXT_KEY`, and all window assignments are fully deleted, not maintained behind a flag or shim.
- **`system.yaml` → `system.md` migration** — Pass. The old `system.yaml` read path is completely replaced by `loadSystemManifest`. No dual-path or backward compatibility shim.
- **Hardcoded event list removal** — Pass. The hardcoded `VALID_EVENT_NAMES` set is completely replaced by `new Set<string>(EVENT_NAMES)`. No fallback to the old list.

## Axis E — Agent-facing clarity

- **Compass scaffolding on new file** — Pass. `registry.ts` includes `MODULE_CONTRACT` with purpose, non-goals, and `CHANGE_SUMMARY`.
- **Stale CHANGE_SUMMARY on edited files** — Fail. `growth-funnel.ts` and `growth-experiment.ts` received material changes (new imports, replaced core logic) but their CHANGE_SUMMARY blocks were not updated. An agent reading these files would not know about the 2026-07-10 changes.
- **Ungrounded assertions** — Pass. Comments reference real functions, types, and RFCs. The `registry.ts` docstring correctly describes the three-step adapter registration process.
- **Module doc comment** — Pass. `client.ts` module doc correctly updated to remove step 5 (ClientRuntimeContext exposure) and renumber remaining steps.

## Axis F — Pragmatism

- **Registry module necessity** — Pass. `registry.ts` is 34 lines with a clear single responsibility. It eliminates the split between `KNOWN_ADAPTER_IDS` in `adapter.ts` and the loader map in `provider.astro`. The module earns its existence.
- **Schema unification** — Pass. `growthVendorSchema` extraction is minimal — one `z.object` moved from inline to standalone, one import added. No speculative generality.
- **Scope discipline** — Pass. The diff touches only growth-related files. No scope creep into unrelated packages.

## Axis G — Blind spots

- **Edge case: boot guard key collision** — The inline string `"__webgogol_growth_booted__"` is unique enough, but if another module accidentally uses the same key, the guard would silently prevent boot. A named constant exported from the module would make this collision detectable by grep.
- **Migration path** — Existing apps are unaffected. The `system.yaml` → `system.md` change in validators only affects validation runs; apps that already migrated to `system.md` (all current apps) will now get correct cross-reference checks instead of silent no-ops.
- **Security / privacy** — Not applicable. No changes to user data handling, PII, or external services. The diff does not introduce cookies or client-side persistence.

## Spec compliance

No spec available — spec compliance skipped. The changes originate from an architecture review report (`docs/reviews/architecture/packages-growth/arch-2026-07-10-22.html`) which identified four candidates. All four were addressed.

## Questions for the author

1. `@gogol/growth` now depends on `@gogol/ontology`. Was this dependency direction validated against the package graph? `@gogol/ontology` has zero workspace dependencies, so no cycle exists today — but what prevents a future `@gogol/ontology → @gogol/growth` dependency from being added and creating a cycle?
2. The `window` boot guard key `"__webgogol_growth_booted__"` is an inline string literal duplicated in `bootGrowthLayer()` and `destroyGrowthLayer()`. Why not extract it to a named constant like the deleted `GROWTH_CONTEXT_KEY` was?
3. `growth-funnel.ts` and `growth-experiment.ts` received material changes (new imports, replaced core logic) but their `CHANGE_SUMMARY` blocks still show only `Wave 1 (RFC-0027): Initial creation.` Should these be updated per DNA-42?
