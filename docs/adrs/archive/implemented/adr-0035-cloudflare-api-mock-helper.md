---
id: ADR-0035
title: "URL+method-based fetch mock helper for Cloudflare API tests"
status: implemented
scope: package
decider: architecture
createdAt: 2026-08-08
updatedAt: 2026-08-08
implementedAt: 2026-08-08
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0752
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0035: URL+method-based fetch mock helper for Cloudflare API tests

## Context

During RFC-0752 implementation, the first version of `subdomain-register.test.ts` used `mockFetch.mockResolvedValueOnce(...)` in a strict call-sequence (DNS list → route list → create DNS → create route). This was fragile: `subdomain-helpers.ts` calls `sourceDotenv` which internally calls `existsSync`, and any change in call order broke the mock sequence. The test failed with `TypeError: existingRoutes.find is not a function` because the route-list call received the create-DNS response.

This problem will recur for any test that mocks `fetch` for a multi-step API interaction (Cloudflare, Supabase, or any REST client).

## Decision

Use `mockImplementation` with URL+HTTP-method routing instead of `mockResolvedValueOnce` sequences for all multi-call `fetch` mocks. Provide a shared helper in `src/tests/helpers/cloudflare-api-mock.ts`.

## Justification

The alternative — wrapping each `mockResolvedValueOnce` sequence in fragile ordering assumptions — breaks on any internal call insertion or reorder. A URL+method-based router is order-independent, making tests resilient to internal implementation changes (e.g. adding `sourceDotenv` or caching layers). The helper is a pure test utility with no production code impact.

## Consequences

- **Positive**: mock order is irrelevant; adding internal calls (like `sourceDotenv`) does not break tests.
- **Positive**: the helper is reusable across all Cloudflare API tests (subdomain commands, cache purge, workers adapter).
- **Negative**: slightly more verbose than `mockResolvedValueOnce` for single-call tests.
- **Technical debt**: the helper is Cloudflare-specific; a generic REST mock helper could be extracted later if other API clients need similar patterns.

## Evolution

If a second REST API client (e.g. Supabase) needs similar mocking, extract a generic `createRestApiMock(handlers)` helper that routes by URL pattern + method. The Cloudflare helper would become a thin wrapper. Monitor for repetition across test files.
