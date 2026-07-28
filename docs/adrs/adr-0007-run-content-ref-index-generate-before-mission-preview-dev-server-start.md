---
id: ADR-0007
title: "Run content.ref-index.generate before mission.preview dev server start"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: accepted
scope: package
decider: architecture
createdAt: 2026-07-28
updatedAt: 2026-07-28
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0527
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0007: Run content.ref-index.generate before mission.preview dev server start

## Context

`mission.preview` starts an Astro dev server for a mission workpiece without running any preparation steps. The content reference index (`src/content-ref-index.generated.yaml`, RFC-0527) is a generated cache of frontmatter values from all `.md` files under `src/content/`. The resolver in `@warpgogol/share/content-reference` reads from this cache, not from the source `.md` files.

When a content file (e.g. `business-profile/de/documents/imprint.md`) is edited in the workpiece but the index is not regenerated, the dev server renders stale values. This was observed on `/uk/pravova-informatsiya` where `lastUpdateDate` showed `2026-07-01` (old cache) instead of `2026-07-28` (updated source).

`build.prepare` regenerates the index as part of the build pipeline, but `mission.preview` bypasses `build.prepare` entirely.

## Decision

`mission.preview` runs `content.ref-index.generate` for the mission workpiece before starting the Astro dev server.

- Scope is limited to `content.ref-index.generate` — other `build.prepare` steps are not invoked.
- The generation runs against the workpiece directory resolved by the mission-aware site resolver.

## Justification

The content reference index is the single source of truth for the resolver at render time. Without regeneration, edited frontmatter values are invisible to the dev server, producing stale output that does not match the source files.

Alternatives considered:

- **Run full `build.prepare` before `mission.preview`** — rejected: too slow for iterative dev work; most `build.prepare` steps (surface expansion, changelog, material credits) are unnecessary for previewing content changes.
- **Vite file watcher with HMR-triggered regeneration** — deferred as future enhancement: would cover live edits during a running dev session, but adds complexity. The pre-start regeneration covers the common case (edit → preview).
- **Resolver reads source files directly instead of cache** — rejected: RFC-0527 intentionally moved away from per-file disk reads for performance.

## Consequences

- Positive: dev server always renders current frontmatter values from source files; no manual `content.ref-index.generate` needed before previewing.
- Positive: minimal startup overhead (~100ms for 323 entries across 10 collections).
- Negative: does not cover live edits during a running dev session — if a content file is edited while the server is running, the index is stale until the next `mission.preview` restart.
- Technical debt: a Vite plugin or file watcher for HMR-triggered regeneration is knowingly postponed.

## Evolution

Revisit if:

- The content reference index grows large enough that generation adds noticeable startup latency (>2s).
- A Vite plugin is implemented for HMR-triggered regeneration, making the pre-start generation redundant.
- Additional `build.prepare` steps are identified as necessary for dev preview, warranting a broader `mission.preview --prepare` flag.
