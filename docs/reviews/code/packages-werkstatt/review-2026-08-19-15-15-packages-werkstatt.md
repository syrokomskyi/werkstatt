---
reviewId: REVIEW-CODE-2026-08-19-01
date: 2026-08-19
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 4141fc04...HEAD
filesReviewed:
  - packages/werkstatt/src/nachweis/nachweis-validate.ts
  - packages/werkstatt-site/src/domain/share/astro/nachweis-routes.ts
  - packages/werkstatt-site/src/domain/ui/components/nachweis-list/nachweis-list-component.astro
  - packages/werkstatt/src/tests-handoff/rfc-0880-nachweis-slug.test.ts
---

# Code Review: RFC-0880 — NACHWEIS-SLUG-01 validator + fallback removal

### Verdict: Needs revision

One minor finding on Axis A: inconsistent error handling between the route generator (throws) and the list component (silently skips) for the same error condition — published Nachweis record without slug.

### Mechanical floor

Pass for reviewed files. Pre-existing errors in `src/certification/` and `src/leitstand/` modules (`_` prefixed export issues) are unrelated to this diff. Reviewed files produce zero TypeScript errors.

### Axis A — Structural correctness

**Finding A1: Inconsistent error handling for missing slug.** `nachweis-routes.ts:111-116` throws when `slug` is absent on a published record, but `nachweis-list-component.astro:181-185` silently `continue`s (skips the record). Both are build-time code paths that run on the same data. The route generator throws because route generation cannot proceed without a slug — correct. The list component skips to avoid crashing the entire page — but this means a published record without slug silently disappears from the Nachweis list page while `nachweis.validate` is the only safety net. Since the route generator already throws for this condition, the list component's skip path is unreachable in practice (the build would fail first). The inconsistency could confuse agents reading either file independently. Consider either: (a) making the list component throw too (consistent hard-fail), or (b) adding a comment in the list component explaining that the route generator throws first, making this a defensive guard only.

### Axis B — DNA alignment

No issues. No DNA invariants directly govern Nachweis slug validation. The change is scoped to `nachweis.validate` and route generation — no invariant conflict.

### Axis C — Ecosystem fit

No issues. `NACHWEIS-SLUG-01` is emitted by `nachweis.validate`, which already runs in `SITES_BUILD_CHECK_PIPELINE`. No new commands. Changed command `nachweis.validate` is already registered. No package boundary violations — `werkstatt` owns validation, `werkstatt-site` owns route generation.

### Axis D — Forward-only compliance

No issues. File-path fallback (`?? stripEntryLanguage(toDataEntryId(entry.id))`) is fully removed in both consumers — no dual paths, no compatibility shims, no flags.

### Axis E — Agent-facing clarity

No issues. All three modified files have updated `CHANGE_SUMMARY` entries referencing RFC-0880. New test file carries `MODULE_CONTRACT` and `CHANGE_SUMMARY`. Comments reference RFC-0880 and explain the rationale.

### Axis F — Pragmatism

No issues. The validator check is a single field presence test (4 lines). No new dependencies. Existing test patterns from `nachweis-rfc-0872.test.ts` are followed. Unused imports (`stripEntryLanguage`, `toDataEntryId`) are correctly removed.

### Axis G — Blind spots

No issues. False positive rate is low — check applies only to Nachweis-kind records. Edge cases (empty string, whitespace-only) are covered. Migration path: all existing published records already have `slug` (verified during m000077). The broader scope (checking all Nachweis-kind records, not just published) was an explicit operator decision to catch drafts early.

### Spec compliance

| Requirement from RFC-0880 | Status | Evidence |
| --- | --- | --- |
| `nachweis.validate` emits `NACHWEIS-SLUG-01` | Done | `nachweis-validate.ts:163-171` |
| `nachweis-routes.ts` uses only `data.slug` | Done | `nachweis-routes.ts:110-116` |
| Route paths have no leading/trailing slashes | Done | `nachweis-routes.ts:132,153` |
| `resolvePageRoute` maps `nachweis:{slug}` to detail template | Done | `resolve-route.ts:571-583` (pre-existing) |
| `resolvePageRoute` maps `nachweis-verify:{slug}:{version}` | Done | `resolve-route.ts:574-583` (pre-existing) |
| `nachweis-list-component.astro` uses `data.slug` without fallback | Done | `nachweis-list-component.astro:181-185` |
| Unit tests cover slug scenarios | Done | `rfc-0880-nachweis-slug.test.ts` — 6 tests |
| `rfc.validate` passes | Done | Zero errors |

### Questions for the author

1. Should `nachweis-list-component.astro` throw instead of `continue` when slug is absent, to match the route generator's hard-fail behavior? Or is the silent skip intentional as a defensive guard for an unreachable path?
