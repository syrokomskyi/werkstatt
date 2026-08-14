---
reviewId: REVIEW-CODE-2026-08-14-01
date: 2026-08-14
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: HEAD...working-tree
filesReviewed:
  - packages/werkstatt-site/src/checks/playwright-utils.ts
  - packages/werkstatt-site/src/checks/mobile-layout-check.ts
  - packages/werkstatt-site/src/checks/print-pdf.ts
  - packages/werkstatt-site/src/checks/independent-qa.ts
  - packages/werkstatt-site/src/checks/tests/playwright-utils.test.ts
  - packages/werkstatt-site/src/checks/tests/mobile-layout-check.test.ts
---

# Code Review: RFC-0843 implementation — Playwright utils, navigation, evaluateInPage

### Verdict: Needs revision

The implementation correctly addresses all RFC-0843 acceptance criteria: shared utilities, `networkidle` elimination, `evaluateInPage` wrapper, `result.timeout` fix, and `data:`/`blob:` URL handling. Two findings require attention: a missing `CHANGE_SUMMARY` entry in `mobile-layout-check.ts` and a `baseUrl` variable shadowing concern in `print-pdf.ts`.

### Mechanical floor

Pass — TypeScript compiles for all touched files (pre-existing error in `pipelines/apps/axiom/factory/run/axiom-cli.ts` is unrelated). All 20 targeted tests pass (10 `playwright-utils` + 10 `mobile-layout-check`).

### Axis A — Structural correctness

- **Missing `CHANGE_SUMMARY` entry in `mobile-layout-check.ts`**: The file has a `CHANGE_SUMMARY` block (line 15-17) listing RFC-0838. RFC-0843 changes (shared utils adoption, `result.timeout` fix, `evaluateInPage` wrapper) are not recorded. Add `<item>RFC-0843: refactor to shared playwright-utils, fix result.timeout field, adopt evaluateInPage wrapper.</item>`.
- **`baseUrl` variable shadowing in `print-pdf.ts`**: The new `const baseUrl` (line 255) shadows the outer `baseUrl` variable that may exist in the enclosing scope. The `port` variable was used inline before (`http://127.0.0.1:${port}`), so the new variable is fine, but verify no outer `baseUrl` is shadowed. This is a minor concern — the code is correct either way since the new variable serves the same purpose.

### Axis B — DNA alignment

No issues. DNA-69 invariant is unchanged — geometric assertions remain the same. The RFC amends implementation, not the invariant.

### Axis C — Ecosystem fit

No issues. All imports flow correctly within `packages/werkstatt-site/src/checks/`. No cross-package boundary violations. No pipeline changes. No new commands.

### Axis D — Forward-only compliance

No issues. `networkidle` is fully removed — no compatibility shim, no dual-path. The inline `ctx.route()` in `mobile-layout-check.ts` is replaced directly with `blockExternalRequests`.

### Axis E — Agent-facing clarity

- **Missing `CHANGE_SUMMARY` in `mobile-layout-check.ts`**: See Axis A. The `MODULE_CONTRACT` is still accurate, but the `CHANGE_SUMMARY` should reflect the RFC-0843 changes.
- **`playwright-utils.ts` has correct `MODULE_CONTRACT` and `CHANGE_SUMMARY`**: Passes.
- **`print-pdf.ts` and `independent-qa.ts` lack `CHANGE_SUMMARY` entries**: Neither file has a `CHANGE_SUMMARY` block that includes RFC-0843. However, `print-pdf.ts` has a `CHANGE_SUMMARY` (line 14-16) — add RFC-0843 entry. `independent-qa.ts` has a `CHANGE_SUMMARY` (line 14-15) — add RFC-0843 entry.

### Axis F — Pragmatism

No issues. `playwright-utils.ts` is minimal — three exports, no speculative generality. The `evaluateInPage` wrapper is a one-line delegate, not over-engineered. `isExternalUrl` handles the `data:`/`blob:` edge case with a 2-line guard.

### Axis G — Blind spots

No issues. External request blocking is scoped to local server origin. The 2-second settle wait in `print-pdf.ts` matches `SETTLE_WAIT_MS` in `mobile-layout-check.ts`. Context lifecycle is properly managed with `finally` blocks.

### Spec compliance

| Requirement from RFC-0843 | Status | Evidence |
| --- | --- | --- |
| `evaluateInPage<T>` wrapper | Done | `playwright-utils.ts:24-26` |
| `blockExternalRequests` utility | Done | `playwright-utils.ts:43-52` |
| `isExternalUrl` with `data:`/`blob:` handling | Done | `playwright-utils.ts:31-33` |
| `mobile-layout-check.ts` uses shared utils | Done | `mobile-layout-check.ts:376` |
| `result.timeout` only true for real timeouts | Done | `mobile-layout-check.ts:460-461` |
| `print-pdf.ts` uses `load` + `blockExternalRequests` | Done | `print-pdf.ts:257,263` |
| `print-pdf.ts` uses `browser.newContext()` + `context.newPage()` | Done | `print-pdf.ts:256,261` |
| `print-pdf.ts` has 2s settle wait | Done | `print-pdf.ts:264` |
| `independent-qa.ts` uses `load` + `blockExternalRequests` | Done | `independent-qa.ts:297,315` |
| `independent-qa.ts` uses `browser.newContext()` + `context.newPage()` | Done | `independent-qa.ts:296,305` |
| MOBILE-GEO-04 distinguishes timeouts | Done | `mobile-layout-check.ts:467-469` |
| Unit tests for `playwright-utils.ts` | Done | `playwright-utils.test.ts` — 10 tests pass |
| MOBILE-GEO-04 non-timeout test | Done | `mobile-layout-check.test.ts:233-256` |
| No `networkidle` references remain | Done | grep confirms zero results |
| `CHANGE_SUMMARY` entries updated | Partial | `playwright-utils.ts` has entry; `mobile-layout-check.ts`, `print-pdf.ts`, `independent-qa.ts` missing RFC-0843 entries |

### Questions for the author

1. Should `print-pdf.ts` and `independent-qa.ts` have `CHANGE_SUMMARY` entries for RFC-0843? The `MODULE_CONTRACT` comments are still accurate, but the changes are unrecorded.
2. The `baseUrl` variable in `print-pdf.ts` (line 255) — is there any outer scope `baseUrl` that could be shadowed? Verify this is safe.
