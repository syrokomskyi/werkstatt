---
id: ADR-0042
title: "Add maturity-score-worker as new Cloudflare Worker service"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: accepted
scope: workspace
decider: architecture
createdAt: 2026-08-11
updatedAt: 2026-08-11
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0803
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0042: Add maturity-score-worker as new Cloudflare Worker service

## Context

RFC-0803 introduces a `mountain-journey` section archetype on the warpgogol-com `/reife` page. The section includes a form where visitors submit a website URL to receive an HDRI score (0–100). The score calculation is performed by a Cloudflare Worker — the Worker endpoint URL is configured in the block props (`workerEndpoint`).

The existing `services/` directory contains two service patterns:

- `services/check-warpgogol-runner` — Node/Playwright runner (Dockerfile-based)
- `services/rate-fetcher-worker` — Cloudflare Worker for rate fetching (wrangler-based, RFC-0744)

The `rate-fetcher-worker` is the closest precedent: a Cloudflare Worker with `wrangler.toml`, `src/index.ts` entry point, `.env.example`, and deploy scripts following DNA-40.

The HDRI scoring methodology is maintained outside the codebase. The Worker initially returns a stub score — the real scoring logic is a future concern.

## Decision

A new `services/maturity-score-worker/` service workspace is created as a Cloudflare Worker with a single `POST /score` endpoint that accepts `{ url: string }` and returns `{ score: number }`.

- The Worker follows the `rate-fetcher-worker` pattern: `wrangler.toml`, `src/index.ts`, `.env.example`, deploy scripts per DNA-40.
- The initial implementation returns a stub score (e.g. a fixed value or a deterministic pseudo-random value derived from the URL hash). The real HDRI scoring logic is deferred.
- The service is thin — no business logic lives in the Worker beyond request validation and response formatting. When the real scoring logic is added, shared schemas and validators belong in `packages/*`.

## Justification

- **Separate service, not an endpoint in an existing Worker.** The maturity-score Worker has a different lifecycle, scaling profile, and deployment cadence than `rate-fetcher-worker` (cron-based) or `check-warpgogol-runner` (queue-based). A dedicated service keeps concerns isolated.
- **Follows `rate-fetcher-worker` precedent.** RFC-0744 established the Cloudflare Worker service pattern in `services/` with `wrangler.toml`, `.env.example`, and DNA-40 deploy scripts. Reusing this pattern reduces cognitive load and ensures env-contract compliance.
- **Stub-first approach.** The HDRI methodology is external and not yet integrated. Shipping a stub Worker allows the frontend (RFC-0803) to be developed and tested against a real endpoint, then the scoring logic can replace the stub without changing the service structure.
- **Alternative considered: client-side stub only.** Rejected — the operator explicitly chose a new service. A client-side stub would not exercise the real network path, CORS handling, or Worker deployment pipeline.

## Consequences

- **Positive:** The frontend (RFC-0803) can develop against a real Worker endpoint from day one. The service structure is ready for the real HDRI scoring logic without architectural changes.
- **Positive:** Follows the established `services/` pattern — no new conventions or tooling.
- **Negative:** One more service to deploy and monitor. The stub Worker provides no real value until the scoring logic is added.
- **Technical debt:** The stub score is knowingly postponed. The Worker endpoint contract (`POST /score` → `{ score: number }`) must remain stable when the real logic is added — otherwise the frontend block props need updating.

## Evolution

- **Real HDRI scoring logic** — when the methodology is ready to integrate, replace the stub in `src/index.ts` with the real scoring implementation. Shared schemas and validators should be extracted to `packages/*` before the Worker imports them.
- **Rate limiting** — if the Worker receives significant traffic, add Cloudflare rate limiting rules or a queue-based processing model.
- **Caching** — if the same URL is scored repeatedly, consider caching scores in KV or Durable Objects.
- **Reference:** RFC-0803 (frontend page and section archetype) is the primary consumer.
