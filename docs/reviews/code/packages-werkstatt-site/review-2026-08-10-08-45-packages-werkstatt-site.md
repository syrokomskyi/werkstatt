---
reviewId: REVIEW-CODE-2026-08-10-01
date: 2026-08-10
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: 280751d8...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/public-surface/aggregate.ts
  - packages/werkstatt-site/src/checks/tests/rfc-0791-well-known-routes.test.ts
---

# Code Review: RFC-0791 implementation (280751d8...HEAD)

### Verdict: Approved

The diff is a minimal, forward-only fix that replaces manual `routePaths.add` calls with a complementary `.well-known/` glob into `publicPaths`. Zero findings across all seven axes.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-site run build:check` exits 0. `rfc.validate --id RFC-0791` exits 0. Three new unit tests pass.

### Axis A — Structural correctness

No issues. The `stat` import is added to the existing `node:fs/promises` line. The loop is straightforward — glob, normalize, stat, add to set. No `any`, no magic numbers, no dead code. `fs.glob` returns an empty iterator for missing directories, so no error handling is needed (confirmed by test 3).

### Axis B — DNA alignment

No issues. No DNA invariants are touched — the change is internal to an existing check command.

### Axis C — Ecosystem fit

No issues. No new commands, no package boundary changes, no pipeline changes. `public.surface.lint` is already registered in `31-public-surface.ts` and already runs in `sites-check-author`.

### Axis D — Forward-only compliance

No issues. Manual `routePaths.add` calls for `.well-known/` routes (lines 173-177) are removed in the same commit as the new complementary glob. No dual paths, no compatibility shims.

### Axis E — Agent-facing clarity

No issues. New test file `rfc-0791-well-known-routes.test.ts` carries `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. `aggregate.ts` `CHANGE_SUMMARY` updated with RFC-0791 entry. Comments reference RFC-0791. Variable names are descriptive: `wellKnownEntries`, `normalized`, `stats`.

### Axis F — Pragmatism

No issues. The solution is minimal — a complementary glob + stat filter. Reuses existing `normalizePublicRelPath` and `publicPathFromRelPath` helpers. No new abstraction, no new dependency, no new helper function.

### Axis G — Blind spots

No issues. Performance impact is negligible (one extra glob for a typically <20-file directory). Missing `.well-known/` directory is handled gracefully (test 3 confirms). Stray files entering `publicPaths` is documented as harmless in the RFC risks section.

### Spec compliance

| Requirement from RFC-0791 | Status | Evidence |
| --- | --- | --- |
| Complementary `.well-known/` glob added to `publicPaths` | Done | aggregate.ts:156-168 |
| Manual `routePaths.add` calls removed | Done | git diff — lines 173-177 removed |
| Extensionless files recognized via `publicPaths` | Done | test 1 passes |
| Unit test: extensionless file → no PUBTXT-07 | Done | rfc-0791-well-known-routes.test.ts:113-128 |
| Unit test: agent.json → no PUBTXT-07 (regression guard) | Done | rfc-0791-well-known-routes.test.ts:131-148 |
| Unit test: missing .well-known/ → no error | Done | rfc-0791-well-known-routes.test.ts:151-167 |
| `rfc.validate` passes | Done | exitCode 0 |

### Questions for the author

None.
