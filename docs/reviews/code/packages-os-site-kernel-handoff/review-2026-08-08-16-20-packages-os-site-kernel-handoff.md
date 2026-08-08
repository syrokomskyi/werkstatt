---
reviewId: REVIEW-CODE-2026-08-08-01
date: 2026-08-08
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 23b0910a...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/tests/helpers/cloudflare-api-mock.ts
  - packages/os/site-kernel-handoff/src/tests/cloudflare-api-mock.test.ts
  - packages/os/site-kernel-handoff/src/tests/subdomain-register.test.ts
  - packages/os/site-kernel-handoff/src/tests/subdomain-validate.test.ts
  - packages/os/site-kernel-handoff/src/tests/subdomain-list.test.ts
  - packages/os/site-kernel-handoff/src/tests/cloudflare-api.test.ts
  - packages/forge/os/rfc/acceptance.ts
  - packages/forge/os/rfc/verification-evidence.ts
  - docs/adrs/adr-0035-cloudflare-api-mock-helper.md
---

# Code Review: 23b0910a...HEAD (ADR-0035 implementation)

### Verdict: Needs revision

The implementation correctly extracts the URL+method-based fetch mock helper and refactors four test files to use it. All 786 tests pass. However, there are two findings: an unused export and a missing `CHANGE_SUMMARY` entry on one refactored test file.

### Mechanical floor

Pass — 786 tests pass, forge build succeeds after union narrowing fix.

### Axis A — Structural correctness

- **Unused export**: `mockCloudflareResponse` is exported from `cloudflare-api-mock.ts` but only used internally by `cfErrorResponse` and in the helper's own test file via direct import. The `purgeCache` handler in `setupCloudflareApiMock` uses it for the default response, but the export itself is only consumed by the test file. This is acceptable since the test file is a valid consumer, but the `purgeCache` default return could use `cfSuccessResponse` for consistency with other defaults. Minor.

### Axis B — DNA alignment

No issues. No DNA invariants touched.

### Axis C — Ecosystem fit

No issues. The helper is correctly placed in `src/tests/helpers/` alongside `materialize-fixture.ts`. No package boundary violations — the helper imports only `vi` from `vitest`.

### Axis D — Forward-only compliance

No issues. The inline `mockResponse`, `dnsListResponse`, `routeListResponse`, and `setupFetchMock` functions were removed from all four test files and replaced with imports from the shared helper. No legacy paths retained.

### Axis E — Agent-facing clarity

- **Missing CHANGE_SUMMARY entry**: `subdomain-list.test.ts` and `subdomain-validate.test.ts` were refactored to use the shared helper, but their `CHANGE_SUMMARY` blocks still say only "RFC-0752: initial subdomain.list/validate tests." without mentioning the ADR-0035 refactor. `subdomain-register.test.ts` has the same gap. While not strictly required (the ADR itself records the change), adding a `CHANGE_SUMMARY` entry per the Compass markup convention would improve traceability.

### Axis F — Pragmatism

No issues. The helper is minimal — 107 lines covering the exact Cloudflare API surface used by the tests (DNS records, Workers routes, cache purge). No speculative generality. The `cfSuccessResponse` and `cfErrorResponse` convenience wrappers reduce boilerplate without over-abstracting.

### Axis G — Blind spots

No issues. The helper handles the default-fallback case for all routes, preventing silent test failures from unmatched URLs.

### Spec compliance

| Requirement from ADR-0035 | Status | Evidence |
| --- | --- | --- |
| Shared helper in `src/tests/helpers/cloudflare-api-mock.ts` | Done | File created at `packages/os/site-kernel-handoff/src/tests/helpers/cloudflare-api-mock.ts` |
| URL+method routing via `mockImplementation` | Done | `setupCloudflareApiMock` routes by URL pattern + HTTP method |
| Reusable across Cloudflare API tests | Done | Refactored 4 test files: `subdomain-register`, `subdomain-validate`, `subdomain-list`, `cloudflare-api` |
| Eliminate `mockResolvedValueOnce` sequences | Done | All `mockResolvedValueOnce` calls replaced with `setupCloudflareApiMock` |
| ADR stamped as implemented | Done | `adr.implement.stamp` succeeded, status: `implemented` |

### Questions for the author

1. Should `cache-purge.test.ts` also be refactored to use the shared helper? The ADR mentions it as a candidate, but it uses `fetchMock.mockResolvedValue` directly (single-call pattern) and was not refactored.
2. The `purgeCache` default returns `mockCloudflareResponse(true, 200, "")` (empty string body) while all other defaults return `cfSuccessResponse(...)` (JSON envelope). Is the empty string intentional for the purge endpoint?
