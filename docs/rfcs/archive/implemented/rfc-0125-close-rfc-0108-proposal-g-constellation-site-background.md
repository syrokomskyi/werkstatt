---
id: RFC-0125
title: "Close RFC-0108 Proposal G — constellation-level site background is superseded by biome-level derivation"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-28
updatedAt: 2026-06-04
implementedAt: 2026-05-28
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0025
  - RFC-0071
  - RFC-0105
  - RFC-0108
  - RFC-0114
  - RFC-0117
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted: []
successSignals:
  - "RFC-0108 §\"Proposal G\" is marked closed by this RFC with an explicit rationale for choosing biome-level over constellation-level."
  - "The remaining gaps in the biome-level pipeline are enumerated as scoped follow-up work against RFC-0114 and RFC-0117, not as a fresh constellation-level workstream."
  - "No new commands or schemas are introduced — this is a process/policy closeout."
nonGoals:
  - "Do not add `siteBackground` to `constellation.yaml`."
  - "Do not add a `siteBackground` prop to `<Layout>`. Site background is rendered via shell blocks in `<BlocksRenderer>` (RFC-0036) — bypassing that would split the render pipeline."
  - "Do not implement the RFC-0114 deriver or RFC-0117 scaffold integration in this RFC. Those remain owned by their original RFCs."
---

# RFC-0125: Close RFC-0108 Proposal G — constellation-level site background is superseded by biome-level derivation

## Context

RFC-0108 §"Proposal G" raised two consequences of authoring `<SiteBackground>` per page Markdown frontmatter and suggested evaluating two remedies:

> - Whether `<SiteBackground>` belongs in `constellation.yaml` (default for the family) with page-level override.
> - Whether the `<Layout>` component should accept a `siteBackground` prop and the constellation supplies it.

Since RFC-0108 landed (2026-05-27), two RFCs have shipped that take a different — biome-level — path to the same pain points:

- **RFC-0114** added `biomeSiteBackgroundSchema` and a `siteBackground?` block on the biome contract. The schema is implemented in [packages/ontology/src/schemas/biome.ts:193–269](packages/ontology/src/schemas/biome.ts).
- **RFC-0117** described `biome.site-background.derive` + `onboarding.scaffold` integration as the build-time pipeline that derives the block from biome axes and seeds new apps.

The biome layer is hierarchically _broader_ than constellation: every constellation belongs to a biome, but a biome can serve multiple constellations. Putting the default at the biome means a single source of truth across both the section sequences a biome publishes _and_ the pages that fall outside any constellation.

## Decision

Close RFC-0108 Proposal G as superseded by RFC-0114 + RFC-0117. Do **not** add `siteBackground` to `constellation.yaml`, and do **not** add a `siteBackground` prop to `<Layout>`.

### Rationale

1. **Wrong layer for the default.** Constellations describe ordered section sequences for a single page archetype (home, prose, passport, …). Site background is a viewport-level shell concern that spans every page of the site. Anchoring it at the constellation would require every constellation to repeat the same value, recreating the duplication Proposal G is trying to eliminate.
2. **`<Layout>` is not the renderer of shell blocks.** Today `<Layout>` is a thin HTML shell; shell blocks (including `site-background`) flow through `<BlocksRenderer>` on the page route. A separate `siteBackground` prop on `<Layout>` would bypass `<BlocksRenderer>`, splitting the render pipeline for one block kind, and require parallel update paths for every future shell archetype.
3. **Biome layer already absorbs the use case.** RFC-0114's deriver produces a `siteBackground.layers` block that the onboarding scaffold writes once into `system.md`. A page that wants a different background continues to override the shell block locally (RFC-0036 already supports this). Both of Proposal G's stated consequences are addressed:
   - _Authors must repeat the same block on every page that wants the same background_ — no, the block lives at the app level in `system.md`, not per page.
   - _A constellation cannot declare a default site background applied across all pages of the same biome_ — biome-level default is strictly stronger; every constellation under that biome inherits it.

### Remaining open work (NOT in this RFC)

Closing Proposal G does not close the biome-level pipeline. RFC-0114 and RFC-0117 remain `partially-implemented` because:

- `biome.site-background.derive` is not registered as a kernel command yet (no entry in `packages/os/site-kernel-checks/src/module.ts`, no implementation in `packages/os/site-kernel-codegen/src/biome-tokens.ts`).
- `onboarding.scaffold` does not read `biome.siteBackground` and seed the `system.md shell.background` block on first materialisation (`packages/os/site-kernel-onboarding/src/scaffold.ts` has no `siteBackground` reference).
- The current biome YAMLs (`packages/ontology/biomes/handwerk-material-warm.yaml`, `packages/ontology/biomes/nonprofit-trust.yaml`) do not declare a `siteBackground` block, so neither shipped app benefits from the schema yet.

These are tracked against RFC-0114 and RFC-0117, not against this RFC.

## Architectural fit

- **RFC-0025 / RFC-0071** — biome is the declared single source of visual DNA. RFC-0125 keeps `siteBackground` inside that envelope.
- **RFC-0036** — shell blocks render through `<BlocksRenderer>`. RFC-0125 preserves that pipeline.
- **RFC-0105** — `<SiteBackground>` component contract is unchanged.

## Acceptance criteria

- [x] RFC-0108's status is updated (in a future doc pass) to note Proposal G is closed by RFC-0125. (evidence: implemented historically)
- [x] No `siteBackground` field is added to `constellation.yaml` or its schema. (evidence: implemented historically)
- [x] No `siteBackground` prop is added to `<Layout>`. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- This RFC adds **no code**. It records a decision that closes a proposal and redirects energy.
- Future agents reading RFC-0108 should treat Proposal G as superseded and look at RFC-0114 / RFC-0117 for the active workstream.
- If a sibling biome later needs a per-constellation override (e.g., a campaign landing page with a unique background), prefer adding a `system.md pages[].shell.background` override on the affected pages — that path is already supported and does not require schema changes.

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Problem

See the Context section above for the problem this RFC addresses. (This section is required by the unified RFC template; the original mini-RFC recorded the problem within Context.)

## Design

See the Decision and Acceptance criteria sections above for the design. (Backfilled during mini-template retirement; original mini-RFC recorded design within Decision and Acceptance criteria.)

## Rollout

Implemented as described in the Acceptance criteria and Implementation notes. (Backfilled during mini-template retirement.)

## Alternatives considered

No alternatives were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)

## Risks

No additional risks were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)
