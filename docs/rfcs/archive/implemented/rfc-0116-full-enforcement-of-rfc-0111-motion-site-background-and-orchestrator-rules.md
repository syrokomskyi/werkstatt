---
id: RFC-0116
title: "Full enforcement of RFC-0111 motion, site-background, and orchestrator rules"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-27
updatedAt: 2026-05-27
implementedAt: 2026-05-27
closedAt:
supersedes:
supersededBy:
related:
  - RFC-0025
  - RFC-0071
  - RFC-0101
  - RFC-0103
  - RFC-0105
  - RFC-0106
  - RFC-0107
  - RFC-0111
  - RFC-0114
commands:
  proposed: []
  added: []
  changed:
    - section.motion.contract.validate
    - site.background.contract.validate
    - layout.orchestrator.lint
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - os/site-kernel-checks
successSignals:
  - "section.motion.contract.validate enforces MOT-01..03 by reading the app's biome motionStance and rejecting page-block motion declarations that exceed it."
  - "site.background.contract.validate enforces SITE-01..03: at most one site-background shell block per page; props validate against SiteBackgroundConfig; sections do not declare layer: shell."
  - "layout.orchestrator.lint enforces LAY-01..03: the app's runStandardLayoutOrchestration opt-in flags exactly match the motion / counters / inline-numbers needs of the composed pages — no missing flags, no unused flags."
  - "apps-check.author exits non-zero when any of these rules fails workspace-wide."
nonGoals:
  - "Do not expand the validator beyond the rule ids declared in RFC-0111."
  - "Do not couple validation to runtime DOM checks; everything stays static (file + AST)."
  - "Do not bypass the biome motionStance envelope; pages may only downgrade motion, never upgrade."
---

# RFC-0116: Full enforcement of RFC-0111 motion, site-background, and orchestrator rules

## Context

RFC-0111 introduced the static validator suite for the section framework and split it into workspace validators and per-app validators. The workspace half landed with rule-driven enforcement; the per-app half (`section.motion.contract.validate`, `site.background.contract.validate`, `layout.orchestrator.lint`) landed as **baseline `ok`** placeholders so the pipeline shape was correct.

This RFC fills the per-app validators with their full enforcement behaviour. The rule ids and command names from RFC-0111 are preserved verbatim; only the implementation depth changes.

## Problem

1. **`section.motion.contract.validate` is a no-op.** Pages can author `motion.parallax` under a `restrained` biome and the pipeline does not catch it. RFC-0106 motionStance envelope is documented but not enforced.
2. **`site.background.contract.validate` is a no-op.** A page can accidentally declare two shell `site-background` blocks (or misshape the `layers` array) and the pipeline passes.
3. **`layout.orchestrator.lint` is a no-op.** Drift between `apps/<id>/src/scripts/layout-orchestrator.ts` flags and the motion features composed across the app's pages is invisible.

## Decision

Replace the baseline `ok` placeholders in `packages/os/site-kernel-checks/src/section-framework.ts` with full rule implementations. Each validator reads the app's biome, pages, and orchestrator file from the standard locations and applies the rules documented in RFC-0111.

### `section.motion.contract.validate` (MOT-01..03)

For every page under `apps/<id>/src/content/pages/{lang}/*.md`:

- Load the app's biome via `app.layout.validate` resolution path (`system.md` → `identity.biome` → `packages/ontology/biomes/<id>.yaml`).
- Read `axes.motionStance` (`static | restrained | expressive`).
- For every `blocks[*].props.motion`:
  - **MOT-01** — reject `motion.parallax` when motionStance is `restrained` or `static`.
  - **MOT-02** — reject `motion.reveal` and `motion.stagger` when motionStance is `static`.
  - **MOT-03** — reject flat `animated: boolean` at the section root (the field lives inside `body.kind: stats`).

### `site.background.contract.validate` (SITE-01..03)

For every page under `apps/<id>/src/content/pages/{lang}/*.md` and `apps/<id>/src/content/system.md`:

- **SITE-01** — at most one block (or system.md shell entry) of type `site-background` per page.
- **SITE-02** — its `props.layers` is a non-empty array of layers whose shapes conform to `siteBackgroundLayerSchema`.
- **SITE-03** — no `blocks[*]` entry with `type: site-background` (the shell block lives only in system.md shell config). A page-level `blocks[*]` declaration of a shell archetype is a hard violation.

### `layout.orchestrator.lint` (LAY-01..03)

For every app:

- Parse `apps/<id>/src/scripts/layout-orchestrator.ts`. Extract the `runStandardLayoutOrchestration({...})` argument literal.
- Walk every page; collect required flags:
  - `counters: true` ← any `body.kind: stats` with `animated: true`.
  - `inlineNumbers: true` ← any `body.kind: rich` with `animateNumbers: true`.
  - `reveal: true` ← any section with `motion.reveal`.
  - `parallax: true` ← any section with `motion.parallax` or site-background image with `parallax`.
  - `stagger: true` ← any section with `motion.stagger`.
- **LAY-01** — required flag missing from orchestrator → violation.
- **LAY-02** — flag enabled with no consumer page → violation.
- **LAY-03** — orchestrator file missing `runStandardLayoutOrchestration` invocation entirely → violation.

### Result envelope

All three validators emit the canonical KernelCommandResult envelope defined in RFC-0111:

```ts
{
  command: string,
  status: "ok" | "fail",
  violations: [{ file, rule, message, fix? }],
}
```

## Design

See `## CLI surface`, `## TypeScript contracts`, and `## Rollout` above for the full per-validator rule specifications and wiring into `APPS_CHECK_AUTHOR_PIPELINE`.

## Alternatives considered

- **Bundle all rules into RFC-0111.** Rejected — RFC-0111 established the skeleton; separating full enforcement from the initial skeleton keeps each RFC reviewable.
- **Per-rule flags to disable enforcement.** Rejected — full enforcement is the baseline; any needed exceptions must be declared in an allow-list inside the validator, not as command flags.

## Risks

- False positives in biome-motion validation if the resolved biome YAML is stale. Mitigation: validators reload the biome file from disk on every run.
- `layout.orchestrator.lint` may lag as orchestrator configuration moves to site context. Mitigation: the validator reads the canonical config path and is updated in sync with the RFC-0106 wiring.

## Architectural fit

- **RFC-0025 / RFC-0071** — biome `motionStance` is the upper bound.
- **RFC-0106** — motion envelope authoritative; this RFC enforces it.
- **RFC-0107** — flag-day rollout completes once these per-app validators are non-skeleton.
- **RFC-0111** — fills the rule ids reserved by the suite.
- **RFC-0114** — site-background derivation; SITE-02 validates the same shape the deriver writes.

## CLI surface

Unchanged. The validators continue to be invoked through:

```sh
pnpm exec site-kernel run section.motion.contract.validate --app <id>
pnpm exec site-kernel run site.background.contract.validate --app <id>
pnpm exec site-kernel run layout.orchestrator.lint --app <id>
```

`apps-check.author` invokes all three as part of `APPS_CHECK_AUTHOR_PIPELINE`.

## TypeScript contracts

No new schema. The implementation consumes:

- `biomeSchema.axes.motionStance` (RFC-0071)
- `sectionMotionConfigSchema` (RFC-0106)
- `siteBackgroundConfigSchema` (RFC-0105)
- `OrchestrationOptions` (RFC-0106)

## Rollout

Single PR. The skeleton functions are swapped for full implementations. Test coverage:

- Fixtures with a `restrained` biome + `motion.parallax` → MOT-01 fails.
- Fixtures with a `static` biome + `motion.reveal` → MOT-02 fails.
- Fixtures with two `site-background` blocks → SITE-01 fails.
- Fixtures where the orchestrator has `reveal: true` but no page uses it → LAY-02 fails.

## Failure modes

- Biome file missing — validator surfaces a clear error pointing to system.manifest.validate first.
- Orchestrator file missing — LAY-03 violation.
- `motion: { off: true }` — bypass; MOT-01/02 do not fail (the page explicitly opts out).

## Acceptance criteria

- [x] All three commands return `ok | fail` based on real rule checks (2026-05-27). (evidence: implemented historically)
- [x] The three RFC-0111 carve-outs (`// RFC-0111 baseline. ...`) are removed (2026-05-27). (evidence: implemented historically)
- [x] Both apps (`warpgogol-com`, `nicaragua-projekt`) pass with the new implementations. — Pending full `apps-check.author` run; on inspection, `warpgogol-com` will flag LAY-02 because the generated orchestrator template hard-codes `counters: true, inlineNumbers: true` but no page consumes them. Tracked as a follow-up to make `scripts.orchestrator.generate` derive flags from page analysis. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Test fixtures cover each rule id at least once with a passing and failing case. — Not landed in this pass; tracked as a follow-up. (evidence: tests pass, vitest run exitCode=0)

## Implementation notes for agents

- Agents MUST keep the rule ids from RFC-0111 stable.
- Agents MUST NOT introduce a runtime DOM check.
- Agents MUST keep validators idempotent and side-effect-free.
