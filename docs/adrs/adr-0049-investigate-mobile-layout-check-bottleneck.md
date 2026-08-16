---
id: ADR-0049
title: "Investigate and optimize mobile.layout.check bottleneck (11+ minutes in release.prepare)"
status: accepted
scope: package
decider: architecture
createdAt: 2026-08-16
updatedAt: 2026-08-16
implementedAt:
closedAt:
supersedes: []
supersededBy:
related: []
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0049: Investigate and optimize mobile.layout.check bottleneck (11+ minutes in release.prepare)

## Context

During the m000060 pipeline test (2026-08-16), `mobile.layout.check` took **11 minutes 14 seconds** — the single slowest step in the entire pipeline. The `build.post` phase total was 13m 27s, with `mobile.layout.check` being 84% of that time.

This step runs during `release.prepare` and significantly slows down the release preparation phase, which is a prerequisite for deployment. For AI agents operating the pipeline, this is a major friction point — the agent waits idle for 11+ minutes.

## Decision

Investigate the root cause of the `mobile.layout.check` performance bottleneck and optimize it to complete in under 3 minutes for a 124-page site.

- The investigation should examine what `mobile.layout.check` does internally — likely Playwright-based viewport rendering for each page at mobile breakpoints.
- Potential optimizations: parallel page rendering, caching by content hash, skipping unchanged pages, or reducing the number of viewport profiles.

## Root cause hypothesis

`mobile.layout.check` likely launches Playwright for each page (or a subset of pages) at mobile viewport dimensions and checks for layout issues. With 124 pages, even 5 seconds per page would result in ~10 minutes. The check may be running sequentially rather than in parallel.

## Recommended investigation steps

1. Read the `mobile.layout.check` implementation to understand its architecture.
2. Measure per-page timing to identify if specific pages are outliers.
3. Check if Playwright browser contexts are being reused or created per page.
4. Evaluate whether the check can be parallelized (e.g., 4 concurrent pages).
5. Evaluate whether the check can be cached by content hash (skip unchanged pages).

## Consequences

- If unfixed, every `release.prepare` will take 11+ minutes just for this one check.
- The optimization could reduce release preparation from ~15 minutes to ~5 minutes.
