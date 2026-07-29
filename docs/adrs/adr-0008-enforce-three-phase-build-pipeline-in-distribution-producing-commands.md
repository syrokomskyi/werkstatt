---
id: ADR-0008
title: "Enforce three-phase build pipeline in distribution-producing commands"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: proposed
scope: package
decider: architecture
createdAt: 2026-07-29
updatedAt: 2026-07-29
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0356
  - RFC-0357
  - RFC-0235
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0008: Enforce three-phase build pipeline in distribution-producing commands

## Context

`mission.build`, `mission.validate`, and `release.prepare` in `packages/os/site-kernel-handoff` were calling `execSync("pnpm exec astro build")` directly, bypassing the kernel pipeline system. The `build.post` pipeline (`SITES_BUILD_POST_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/build-post.ts`) contains `text.normalize.apply` (RFC-0235), `passport.emit`, `dist.sitemap.images.generate`, `video.dist.prune`, and `dist.generated-marker.strip`. Without `build.post`, the dist output is raw Astro output — unnormalized and unsigned.

This was discovered after a Cloudflare deployment where long dashes (em dash U+2014, en dash U+2013) remained in the deployed HTML despite the text normalizer being in place. The normalizer was never invoked because no command ran the `build.post` pipeline.

RFC-0356 (mission materialization) and RFC-0357 (release discipline) describe `astro build` as the build step but do not explicitly mention `build.post`. Both RFCs are archived as `implemented` and cannot be amended in place.

## Decision

All distribution-producing commands in `packages/os/site-kernel-handoff` must run the full three-phase build pipeline — `build.prepare` → `astro build` → `build.post` — unconditionally and in that order, via `executeKernelPipeline`.

- Each phase must succeed; a failure in any phase aborts the build and the distribution is not signed.
- `mission.build` additionally writes `build-input-hash.json` so `release.prepare` can reuse the distribution when the build input hash matches.
- `release.prepare` uses the reuse path (copy from `missions/<id>/distribution/dist`) only when `build-input-hash.json` matches; otherwise it runs the full pipeline.

## Justification

The `build.post` pipeline contains critical egress transformations (`text.normalize.apply`, `passport.emit`) that must run on every distribution. Bypassing it produces unnormalized, unsigned output — the dist may contain AI-authorship typographic signals (em dashes, curly quotes, special spaces) and lacks a cosmic passport.

Alternatives considered:

- **Add `text.normalize.apply` to `mission.build` directly** — rejected: would miss other `build.post` steps (`passport.emit`, `video.dist.prune`, etc.) and duplicate pipeline logic.
- **Move `text.normalize.apply` into `build.prepare`** — rejected: `build.prepare` runs before `astro build`; normalization must happen after dist generation.
- **Create a new RFC** — rejected: this is a bug fix restoring the intended behavior, not an architectural change. RFC-0356/0357 already describe the build step; this ADR clarifies that the build step includes all three pipeline phases.

## Consequences

- Positive: Every distribution is normalized and signed before deployment. Text normalization (RFC-0235) is guaranteed to run. The `build-input-hash.json` written by `mission.build` enables `release.prepare` to skip redundant rebuilds.
- Negative: Build time increases because `build.prepare` and `build.post` now run on every `mission.build` and `release.prepare` fresh build. Previously, only `astro build` ran.
- Technical debt: `mission.validate` now runs `build.post` after `astro build`, which modifies the workpiece `dist/` directory. This is acceptable for validation but means the workpiece dist is not pristine after validation.

## Evolution

- If a future RFC introduces a fourth build phase, this ADR should be updated to include it.
- If `build.post` is ever split into mandatory and optional steps, the mandatory subset must remain unconditional.
- Implemented in commit `c5b3734` — `fix: run full build pipeline (prepare → astro → post) in mission.build, mission.validate, release.prepare`.
