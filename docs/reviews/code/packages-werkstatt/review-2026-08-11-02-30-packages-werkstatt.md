---
reviewId: REVIEW-CODE-2026-08-11-01
date: 2026-08-11
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: b1662050...HEAD
filesReviewed:
  - packages/werkstatt/src/mission/index.ts
  - packages/werkstatt/src/mission/mission.module.ts
  - packages/werkstatt/src/handoff/index.ts
---

# Code Review: ADR-0041 — Consolidate command flag registration to mission.module.ts

### Verdict: Approved

The diff cleanly implements ADR-0041's decision: remove duplicate command registrations from `mission/index.ts`, leaving it as a pure re-export barrel. `mission.module.ts` remains the single source of truth for command flag schemas. The change is minimal, forward-only, and introduces no new abstractions.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt run build:check` passes with zero errors.

### Axis A — Structural correctness

No issues. The removal of 265 lines of duplicate command registrations is clean — `mission.module.ts` already contained the canonical, complete set of flags (including `skip-auto-archive`, `skip-auto-sync`, `skip-content-regression`, `skip-template-sync`). No dead code, no magic numbers, no untyped parameters introduced.

### Axis B — DNA alignment

No issues. No DNA invariant is directly touched by this change. DNA-64 (stack-agnostic) is not affected — no new imports added.

### Axis C — Ecosystem fit

No issues. Package boundaries unchanged. Command lifecycle unchanged — no commands added, removed, or renamed. The `@warpgogol/werkstatt/mission` entry point still maps to `./src/mission/index.ts` (now a pure barrel), and `@warpgogol/werkstatt/mission-module` still maps to `./src/mission/mission.module.ts`. The `handoff/index.ts` re-export was updated to point to `mission.module.ts` instead of `index.ts`.

### Axis D — Forward-only compliance

No issues. The duplicate `createMissionModule()` in `index.ts` was deleted, not maintained behind a flag or shim. No backward compatibility layer.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` updated in both `index.ts` and `mission.module.ts` with ADR-0041 references. The non-goals in `index.ts` now explicitly state "Do not register commands or declare flag schemas here — use mission.module.ts (ADR-0041)."

### Axis F — Pragmatism

No issues. The change is minimal — 265 lines removed, 5 lines added. No new abstractions, no new dependencies. The lowest rung of the minimality ladder was used: delete duplicate code.

### Axis G — Blind spots

No issues. No performance concerns (pure code organization). No edge cases — the runtime loads `mission.module.ts` via `kernel.config.ts`, which was already the case before this change.

### Spec compliance

| Requirement from ADR-0041 | Status | Evidence |
| --- | --- | --- |
| `mission.module.ts` is the single source of truth for command flag registration | Done | `packages/werkstatt/src/mission/mission.module.ts:17-397` — contains all command registrations |
| `index.ts` must not register commands with flags | Done | `packages/werkstatt/src/mission/index.ts:1-43` — pure re-export barrel, no `createMissionModule` |
| `index.ts` may re-export types or functions | Done | `packages/werkstatt/src/mission/index.ts:15-43` — re-exports handler functions and types |
| Adding a flag requires updating only `mission.module.ts` | Done | No other file contains command registrations for the mission module |

### Questions for the author

No questions — the diff fully and cleanly implements the ADR decision.
