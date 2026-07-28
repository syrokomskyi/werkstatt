---
id: RFC-0129
title: "Biome-driven site-background pipeline — completion scope for RFC-0114 / RFC-0117"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-29
updatedAt: 2026-06-04
implementedAt: 2026-05-29
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0025
  - RFC-0071
  - RFC-0078
  - RFC-0105
  - RFC-0114
  - RFC-0117
  - RFC-0125
commands:
  proposed:
    - biome.site-background.derive
  added:
    - biome.site-background.derive
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - ontology
  - os/site-kernel-codegen
  - os/site-kernel-onboarding
  - os/site-kernel-checks
successSignals:
  - "Each gap in RFC-0114 / RFC-0117 is enumerated as a discrete, testable change with a target file and an acceptance criterion."
  - "Reviewers can size the remaining work in one read without re-deriving the gap analysis."
  - "Whoever picks this up next has a sequenced implementation order that avoids partially-coherent intermediate states."
nonGoals:
  - "Do not implement the gaps in this RFC. RFC-0129 is a process / scope document; it does not change code."
  - "Do not change the existing `biomeSiteBackgroundSchema` shape from RFC-0114. The schema landed cleanly and is the authority."
  - "Do not introduce a constellation-level fallback. That path was explicitly closed by RFC-0125."
---

# RFC-0129: Biome-driven site-background pipeline — completion scope for RFC-0114 / RFC-0117

## Context

RFC-0114 introduced `biomeSiteBackgroundSchema` and a `siteBackground?` block on the biome contract. RFC-0117 described `biome.site-background.derive` + `onboarding.scaffold` integration as the build-time pipeline that derives the block from biome axes and seeds new apps. RFC-0125 closed RFC-0108 §"Proposal G" by anchoring the default at the biome layer rather than the constellation layer.

Together those three RFCs land the **shape** of the contract. They do not land the **plumbing** that makes a biome's `siteBackground` block actually reach an app at build time. As of 2026-05-29 the gaps are:

1. The derive routine is not wired. `packages/os/site-kernel-onboarding/src/biome-derive.ts` implements `biome.tokens.derive` per RFC-0071 (palette, typography, spacing, motion, geometry), but has zero references to `siteBackground` — no `deriveSiteBackground(axes)` helper, no call site inside `deriveBiomeFields`.
2. No dedicated kernel command. `biome.site-background.derive` is not registered in `packages/os/site-kernel-checks/src/module.ts`. The RFC-0117 §"New CLI surface" form exists only on paper.
3. Onboarding scaffold ignores the block. `packages/os/site-kernel-onboarding/src/scaffold.ts` does not read `biome.siteBackground` and does not seed `apps/<id>/src/content/system.md shell.background` on first materialisation.
4. No biome ships a `siteBackground` block today. Neither `packages/ontology/biomes/handwerk-material-warm.yaml` nor `packages/ontology/biomes/nonprofit-trust.yaml` declares one, so even a working pipeline would derive an empty result for the two shipped apps until those biomes are amended.

Each gap is small in isolation. Together they are a coherent feature whose value materialises only when every piece lands at once. RFC-0129 enumerates them so the next session can pick this up without re-deriving the analysis.

## Decision

Treat the remaining RFC-0114 / RFC-0117 work as a single multi-package change with the implementation order below. **No code is changed by this RFC** — the deliverable is the sequenced scope.

### Sequenced implementation order

1. **Pure derivation routine in `packages/os/site-kernel-onboarding/src/biome-derive.ts`.**
   - Add `deriveSiteBackground(axes: BiomeAxes): BiomeSiteBackground | undefined` following the RFC-0114 §"Deriver behaviour" table:
     - `decorativeAllowed: false` + `photoStance: none | founder` + `motionStance: static` → one `color` layer using `--ds-color-bg`.
     - `decorativeAllowed: false` + `photoStance: documentary` + `motionStance: restrained` → `color` + subtle vignetteDark `gradient`.
     - `decorativeAllowed: true` + `photoStance: editorial` + `motionStance: expressive` → `color` + `gradient` using the biome `accent` colour.
     - Default: a single `color` layer at the bottom.
   - Call it from inside `deriveBiomeFields`, but only when the input biome does not already declare `siteBackground` (RFC-0114 §"Deriver behaviour" item 1).
   - Acceptance: existing `biome.tokens.derive` runs unchanged on biomes that already declare `siteBackground`; biomes without it gain a derived block.

2. **Dedicated narrower command `biome.site-background.derive`.**
   - Register in `packages/os/site-kernel-checks/src/module.ts` alongside `biome.tokens.derive`.
   - Implementation is the same `deriveSiteBackground` helper plus the YAML round-trip; the command exists for "I want to derive only the background block on a biome that already has palette / typography" — the focused-update use case from RFC-0117.
   - Acceptance: `pnpm exec site-kernel run biome.site-background.derive --biome packages/ontology/biomes/<id>.yaml --inplace` produces the same `siteBackground` block as the full `biome.tokens.derive` run.

3. **Onboarding scaffold integration in `packages/os/site-kernel-onboarding/src/scaffold.ts`.**
   - Read `biome.siteBackground` from the brief-resolved biome.
   - Translate the `BiomeSiteBackground` shape into the `system.md shell.background` shape (the `cosmicMoon: Hermippe` + `pin` + `props.layers` block from RFC-0114 §Context).
   - Acceptance: scaffolding a new RFC-0047 app inherits the background without the agent having to hand-write the block.

4. **Sample data in shipped biome YAMLs.**
   - Add an explicit `siteBackground` block to `packages/ontology/biomes/handwerk-material-warm.yaml` and `packages/ontology/biomes/nonprofit-trust.yaml` matching the visual identity each biome already conveys.
   - Acceptance: `astro build` on warpgogol-com and nicaragua-projekt produces unchanged visual output (because the shipped `system.md` already declares its own background) **or** explicitly migrates each app to drop the per-app shell.background and inherit the biome default. Decide per app.

5. **Validator alignment.**
   - Extend `biome.contract.validate` (per RFC-0114 §"File system responsibilities") to accept the new block and reject a `parallax` on a `static` biome (RFC-0106 envelope rule).
   - Acceptance: `pnpm exec site-kernel run biome.contract.validate` exits zero on both biomes after step 4.

### Why steps must land together

Steps 1–4 form a load-bearing chain: step 1 without step 4 produces an unused helper; step 4 without step 1 produces a biome that nothing reads; step 3 without step 4 silently scaffolds an empty block. A partial implementation surfaces "phantom green CI" — the pipeline runs but the apps do not change. Pin the work to one PR (or one cohesive RFC) that lands all four steps with sample data validated on both shipped sites.

### Why this is not done in this session

RFC-0129 lives in the same session that closed seven other open RFCs and migrated the markdown section header. Each of those was a contained, locally-verifiable change. The biome-siteBackground pipeline is the first piece on the list that crosses three packages and modifies the visual output of two shipped apps. The right boundary is to enumerate it precisely, hand it off, and pick it up as the focus of its own session with explicit visual-regression checks on `/` of both apps.

## Architectural fit

- **RFC-0025 / RFC-0071** — biome is the single source of visual DNA. RFC-0129 preserves that envelope.
- **RFC-0114 / RFC-0117** — RFC-0129 is the closing-out plan, not a competitor.
- **RFC-0125** — RFC-0129 inherits the biome-over-constellation choice and does not reopen it.
- **RFC-0108** — the RFC-0108 "Outcome" annotation (2026-05-29) now reads correctly: Proposal G is closed by RFC-0125, the implementation gap is tracked by RFC-0129.

## Acceptance criteria

- [x] This RFC enumerates every concrete file and acceptance criterion the next implementer needs. (evidence: implemented historically)
- [x] No code under `packages/*` or `apps/*` is changed by this RFC. (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- When picking this up: open the four files named in §"Sequenced implementation order" in one editor session. Do not split steps across PRs.
- Before step 4, run `pnpm --filter warpgogol-com astro build` and `pnpm --filter nicaragua-projekt astro build` and take a screenshot of `/`. Compare against the post-step-4 build. If the visual changes, decide explicitly whether to drop the per-app override or keep it.
- If a future session decides that constellations need a `siteBackground` override on top of the biome default, prefer a small additive RFC (constellation-as-override, never as primary source) over reopening RFC-0125.

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
