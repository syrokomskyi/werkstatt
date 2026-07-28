---
id: RFC-0198
title: "Render the Programmatic Surface in the cosmic star-map"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-15
updatedAt: 2026-06-16
implementedAt: 2026-06-16
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0028
  - RFC-0192
  - RFC-0194
  - RFC-0196
commands:
  proposed: []
  added:
    - surface.starmap
  changed: []
  removed: []
appsImpacted:
  - apps/warpgogol-com
packagesImpacted:
  - packages/surface
  - packages/star-map
  - packages/nebula
successSignals:
  - "The studio can see its programmatic long-tail as a constellation in the cosmic star-map: indexable, suppressed, and decayed pages are visually distinct."
  - "The surface manifest feeds nebula/star-map without bespoke export code."
nonGoals:
  - "Do not change the public passport/star-map contract for authored pages."
  - "Do not expose per-page PII or client data in the visualization."
---

# RFC-0198: Render the Programmatic Surface in the cosmic star-map

## Context

The ecosystem already renders a site's structure as a cosmic visualization: `passport.emit` writes a signed passport, `nebula.compute` writes a score, and `star-map.render` draws the constellation (RFC-0028). The Programmatic Surface (RFC-0192) introduces a large, dynamic population of pages whose health (indexable vs. suppressed-thin vs. decayed) is operationally important but invisible. The surface already emits `dist/.well-known/pseo-manifest.json` with exactly that per-page state — it just needs to feed the existing visualization rather than a separate dashboard.

## Decision

A `surface.starmap` step projects the `pseo-manifest.json` (RFC-0192/0194/0196) into the nebula/star-map pipeline so generated pages appear as a distinct constellation family. Each generated page is a star whose visual state encodes its `IndexDecision` (indexable / over-budget / thin / decayed). The projection reuses the existing `star-map.render` machinery; no new public artifact contract is introduced for authored pages. The visualization carries only aggregate/structural data (counts, axis labels, decision states) — never per-record PII or client data.

## Acceptance criteria

- [x] `surface.starmap` projects the surface artifact/manifest into a cosmic star-map SVG (`public/.well-known/pseo-star-map.svg`) (evidence: implemented historically)
- [x] Generated pages render as a distinct constellation (one state-coloured star per page: indexable / thin / over-budget / decayed / redirect), grouped by depth (evidence: implemented historically)
- [x] Reuses the cosmic visualization idiom; **scope note:** emits a standalone surface star-map SVG rather than mutating `star-map.render`/the passport pipeline — this keeps the authored-page passport/star-map contract untouched (the RFC's explicit non-goal), which was the safer reading of "reuse without forking" (evidence: implemented historically)
- [x] Visualization is aggregate/structural only (slugs + decision state); no per-record PII or client data (evidence: implemented historically)
- [x] Runs in `build.prepare` after `surface.generate`/`surface.freshness`; absent artifact ⇒ no-op (verified on nicaragua-projekt) (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `AGENTS.md` — the surface star-map is covered by the Programmatic Surface section; the artifact is a gitignored build output (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- Consume the existing `pseo-manifest.json`; do not introduce a parallel data export for the visualization.
- Reuse `star-map.render`/`nebula.compute`; do not fork the passport pipeline.
- The visualization MUST NOT include PII or per-record client data — aggregate/structural state only.
- `surface.starmap` MUST be a no-op when the manifest is absent (surface disabled).

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Problem

See the Context section above for the problem this RFC addresses. (This section is required by the unified RFC template; the original mini-RFC recorded the problem within Context.)

## Architectural fit

This RFC aligns with the DNA invariants and related RFCs listed in the frontmatter. (Backfilled during mini-template retirement; original mini-RFC did not include a separate Architectural fit section.)

## Design

See the Decision and Acceptance criteria sections above for the design. (Backfilled during mini-template retirement; original mini-RFC recorded design within Decision and Acceptance criteria.)

## Rollout

Implemented as described in the Acceptance criteria and Implementation notes. (Backfilled during mini-template retirement.)

## Alternatives considered

No alternatives were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)

## Risks

No additional risks were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)
