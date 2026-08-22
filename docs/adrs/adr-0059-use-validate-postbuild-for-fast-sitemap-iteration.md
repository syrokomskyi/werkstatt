---
id: ADR-0059
title: "Use validate.postbuild for fast sitemap and route-related iteration"
status: proposed
scope: package
decider: architecture
createdAt: 2026-08-22
updatedAt: 2026-08-22
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0883
reviewers: []
---

# ADR-0059: Use validate.postbuild for fast sitemap and route-related iteration

## Context

During m000085, sitemap-related fixes required multiple iteration cycles. Each `mission.validate` run takes 3+ minutes because it executes a full build pipeline: `build.prepare` + `build.check` + `astro build` + `build.post` (61 post-build steps). For sitemap and route-related fixes where the build output doesn't change, this full cycle is wasteful.

RFC-0883 introduced `validate.postbuild` — a post-build-only fast iterative debugging command that skips the build and runs only post-build validators against an existing `dist/`. This reduces the cycle from minutes to seconds.

The problem was discovered when fixing placeholder route templates in sitemap generation: the first `mission.validate` run after the fix revealed a new SITEMAP-COV-01 error (in `sitemap-coverage.ts`), requiring another 3+ minute cycle to verify the second fix.

## Decision

- Agents debugging sitemap, route, or post-build validator issues MUST use `validate.postbuild` (RFC-0883) instead of `mission.validate` for iterative verification when the build output has not changed.
- `validate.postbuild` runs only post-build validators against the existing `dist/` directory, skipping `build.prepare`, `build.check`, and `astro build`.
- After the fix is verified via `validate.postbuild`, a final `mission.validate` run confirms the full pipeline passes before close.

## Justification

- **Speed**: `validate.postbuild` runs in seconds vs 3+ minutes for `mission.validate`. For sitemap fixes where only validator logic changed (not build output), the build step is pure overhead.
- **Existing infrastructure**: RFC-0883 already implements `validate.postbuild`. No new code is needed — this ADR establishes the workflow convention.
- **Safety**: The final `mission.validate` before close catches any regressions that `validate.postbuild` might miss (e.g. build-time issues).

## Consequences

- **Positive**: Iteration time for sitemap/route fixes drops from 3+ minutes to seconds. Multiple fix cycles per session become feasible.
- **Positive**: Less wear on build infrastructure (Playwright, Chromium, etc.) during debugging.
- **Negative**: `validate.postbuild` requires an existing `dist/` — if the build output is stale, the validator results may be misleading. Agents must ensure `dist/` is current before relying on `validate.postbuild`.
- **Technical debt**: None — this is a workflow decision, not a code change.

## Evolution

- If `validate.postbuild` is extended to cover more validators (RFC-0883 future amendments), this ADR's scope expands automatically.
- If `mission.validate` build time drops below 30 seconds (e.g. via incremental build caching), the need for `validate.postbuild` diminishes but the convention remains valid.
