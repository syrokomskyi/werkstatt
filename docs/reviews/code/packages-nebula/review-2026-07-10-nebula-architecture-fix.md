---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: unknown
verdict: needs-revision
diffRange: uncommitted changes (git diff)
filesReviewed:
  - packages/nebula/package.json
  - packages/nebula/src/compute.ts
  - packages/nebula/src/collect.ts
  - packages/nebula/src/compute.test.ts
  - packages/nebula/src/index.ts
  - packages/passport/src/emit.ts
  - packages/os/site-kernel-checks/src/passport.ts
---

# Code Review: Nebula architecture fix — uncommitted changes

### Verdict: Needs revision

The diff fixes all four identified candidates (stub values, exported derive functions, unified input collector, passport projection helper) and adds 24 passing tests. However, two findings require revision before merge: an unused parameter in `collect.ts` that contradicts its own JSDoc, and a stale `AGENTS.md` entry-point table that does not document the new `@warpgogol/nebula/collect` export.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/nebula build:check`, `pnpm --filter @warpgogol/passport build:check`, `pnpm --filter @warpgogol/site-kernel-checks build:check` all exit 0. `pnpm --filter @warpgogol/nebula test` — 24/24 passed.

### Axis A — Structural correctness

- **FAIL — unused `label` parameter in `readJsonSafe`.** `@warpgogol/nebula/src/collect.ts:97` declares `label: string` but never uses it. The JSDoc at line 59 says "Malformed files are logged and ignored" but the `catch` block at line 103 is silent — no `console.warn`, no structured log. Either remove the `label` parameter or use it in a diagnostic log. Dead parameters are a structural smell that linters in other packages already flag.
- **PASS — strict typing.** No `any`, no implicit casts. `Partial<T>` spread at `collect.ts:102` is the correct pattern for shallow-merging parsed JSON over stub fallback.
- **PASS — minimalism.** `toPassportScores` is a tight 7-line projection. `collectNebulaInputs` is a single responsibility module. No over-engineering.
- **PASS — error handling.** `readJsonSafe` swallows errors intentionally (missing artifacts are expected pre-CI). This is documented in the JSDoc. The `catch` block could log, but the silent fallback is consistent with the stub-first design.

### Axis B — DNA alignment

- **PASS — DNA-1 (monorepo boundary).** All imports flow `packages/* → packages/*`. No `apps/* → apps/*` or `apps/* → services/*` imports.
- **PASS — DNA-6 (kebab-case).** `collect.ts`, `compute.test.ts` — both kebab-case. No underscores.
- **PASS — DNA-33 (Nebula Score).** The scoring algorithm, weights, and pillar structure are unchanged. Stub fix (0→100) aligns the stub with its JSDoc contract ("all-passing values").
- **PASS — DNA-42 (Compass markup).** `collect.ts` carries `MODULE_CONTRACT` (purpose ≥ 10 words, 3 non-goals) and `CHANGE_SUMMARY` (1 item). `compute.test.ts` is a test file — Compass markup is not required for test files per convention.
- **N/A — DNA-23 (cosmic naming).** No manifests or cosmic names touched.
- **N/A — DNA-5/17 (mirror quintet).** No `.astro` components touched.
- **N/A — DNA-10 (no hardcoded tokens).** No CSS touched.
- **N/A — DNA-24/25 (block-declarative pages).** No page content touched.

### Axis C — Ecosystem fit

- **FAIL — `AGENTS.md` not updated.** `@warpgogol/nebula/src/index.ts` now exports `collectNebulaInputs`, `toPassportScores`, 4 derive functions, `PassportScores`, `PassportPillarScore`, and `CollectNebulaInputsOptions`. The package `AGENTS.md` entry-point table (lines 7–12) still lists only `computeNebulaScore`, `createStubNebulaInputs`, and types. The new `@warpgogol/nebula/collect` export path (added to `package.json` exports) is not documented. Per root `AGENTS.md`: "Keep the affected files synchronized with code, architecture, and verification changes."
- **PASS — package boundaries.** `passport/emit.ts` imports from `@warpgogol/nebula/compute` and `@warpgogol/nebula/collect` — both are subpath exports of `@warpgogol/nebula`, already a `workspace:*` dependency. No new cross-package dependency edges.
- **PASS — `package.json` exports.** `./collect` subpath correctly added to `packages/nebula/package.json` exports map. Lockfile updated with `vitest` and `fast-check` devDeps.
- **PASS — pipeline placement.** No new OS commands introduced. Existing `nebula.score.compute` and `passport.emit` commands are unchanged in their pipeline registration.
- **N/A — Compass sync.** No `docs/*.xml` changes needed — the diff does not change repository-wide requirements or shared package contracts. The change is internal to the nebula scoring pipeline.

### Axis D — Forward-only compliance

- **PASS.** No compatibility shims or dual-paths. The old `createStubNebulaInputs()` call in `emit.ts` is replaced by `collectNebulaInputs()` — not kept behind a flag. The manual field-by-field mapping in `emit.ts` is replaced by `toPassportScores()` — the old 12-line block is deleted, not maintained. The manual lighthouse-only read in `passport.ts` is replaced by `collectNebulaInputs()` — the old code is deleted.

### Axis E — Agent-facing clarity

- **PASS — Compass scaffolding.** `collect.ts` has `MODULE_CONTRACT` + `CHANGE_SUMMARY`. `compute.ts` `CHANGE_SUMMARY` updated with 3 new items documenting the stub fix, derive exports, and projection helper.
- **PASS — no ungrounded assertions.** All JSDoc references real functions, types, and files. `toPassportScores` JSDoc says "passport schema's scores shape" — the passport schema (`ScoresSchema` in `schema.ts`) has exactly `{ nebula, pillars: { performance, accessibility, contentHealth, architecturalCompliance } }` with `score` + `weight` per pillar. The projection is accurate.
- **PASS — readable by another agent.** Function names are self-documenting: `collectNebulaInputs`, `toPassportScores`, `derivePerformanceScore`. Variable names reveal intent.
- **PASS — `@ai-invariant` preserved.** The existing `@ai-invariant: computeNebulaScore is deterministic for identical inputs` comment at `compute.ts:102` is preserved. The new `toPassportScores` and `collectNebulaInputs` do not break this invariant — they are pure projections / I/O wrappers.

### Axis F — Pragmatism

- **PASS — minimal command surface.** No new commands. The diff consolidates scattered input collection into one module and eliminates boilerplate — exactly the scope requested.
- **PASS — lean contracts.** `PassportScores` and `PassportPillarScore` are the minimum types needed. `CollectNebulaInputsOptions` has 5 fields (1 required, 4 optional filename overrides) — justified by the 4 artifact types.
- **PASS — existing patterns.** `toPassportScores` follows the existing projection pattern in the codebase (strip fields, return subset). `collectNebulaInputs` follows the `readJsonSafe` pattern used elsewhere.
- **PASS — scope discipline.** The diff touches only nebula, passport emit, and site-kernel-checks passport — the three files that needed updating. No scope creep.

### Axis G — Blind spots

- **PASS — edge cases.** `collectNebulaInputs` handles missing files (fallback to stub), malformed JSON (silent fallback), and partial JSON (`{ ...fallback, ...parsed }` merge). Empty-state (new app with no CI artifacts) produces stub inputs → score 100, which is the correct "vacuously passing" behavior.
- **PASS — performance.** `collectNebulaInputs` reads 4 small JSON files sequentially. No regex, no file-tree walks. Cost is negligible (4 `readFile` calls).
- **PASS — false positives.** No new validators introduced. The stub-first design means missing artifacts silently produce a perfect score — this is intentional for pre-CI development but could mask real issues in production. The JSDoc documents this behavior.
- **N/A — security/privacy.** No user data, PII, or external services touched. No cookies, no `localStorage`.

### Spec compliance

No formal spec available — the task was an architectural improvement request ("fix all candidates"). The four candidates identified in the prior architectural review:

| Requirement | Status | Evidence |
| --- | --- | --- |
| Fix stub inputs (0→100 for perf/a11y) | Done | `compute.ts:166` — `performanceScore: 100, accessibilityScore: 100` |
| Export 4 derive functions | Done | `compute.ts:48,59,73,85` — all 4 now `export function` |
| Create unified input collector | Done | `collect.ts` — `collectNebulaInputs()` reads 4 artifact types |
| Add `toPassportScores` projection | Done | `compute.ts:191` — eliminates 12-line manual mapping in `emit.ts` |
| Update consumers | Done | `emit.ts:132` uses `collectNebulaInputs`; `passport.ts:284` uses `collectNebulaInputs` |
| Add tests | Done | `compute.test.ts` — 24 tests, all passing |
| Update exports | Done | `index.ts` exports all new functions/types; `package.json` adds `./collect` subpath |

### Questions for the author

1. **`readJsonSafe` `label` parameter — remove or use?** The `label: string` parameter at `collect.ts:97` is declared but never referenced. The JSDoc says "Malformed files are logged and ignored" but the catch block is silent. Should the parameter be removed, or should the catch block log a warning using `label` (e.g., `console.warn(\`[nebula] ${label} artifact not found or malformed — using stub\`)`)?
2. **Should `AGENTS.md` be updated in the same change?** The `packages/nebula/AGENTS.md` entry-point table does not list `@warpgogol/nebula/collect` or the new exported functions (`toPassportScores`, derive functions). Per the root AGENTS.md Compass duties, should this be updated now?
3. **`PassportScores` type vs `ScoresSchema` — should they be structurally verified?** `toPassportScores` returns `PassportScores` (from `compute.ts`) which is assigned to `scores` in `PassportJson` (from `schema.ts`). The types are structurally compatible but live in different packages. Should there be a compile-time assertion (e.g., `satisfies ScoresSchema`) or a test that validates the projection against the Zod schema?
