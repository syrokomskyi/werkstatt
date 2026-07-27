---
id: RFC-0155
title: "GRACE markers for section-owned client and CSS assets"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-04
updatedAt: 2026-06-04
implementedAt: 2026-06-04
closedAt:
supersedes: []
supersededBy:
amendedBy:
  - RFC-0353
related:
  - RFC-0015
  - RFC-0140
  - RFC-0149
commands:
  proposed: []
  added: []
  changed:
    - compass.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - ui
successSignals:
  - "pnpm compass:validate exits 0 across packages/ui; no section-owned asset is exempt by accident."
  - "Section client scripts and CSS carry the same MODULE_CONTRACT/MODULE_MAP/CHANGE_SUMMARY discipline as the rest of the codebase."
nonGoals:
  - "Do not change what GRACE markers mean or how grace.validate parses them (RFC-0015 domain)."
  - "Do not exempt .client.ts/.css files wholesale — bring them into compliance instead."
---

# RFC-0155: GRACE markers for section-owned client and CSS assets

## Context

`pnpm compass:validate` currently exits non-zero because two section-owned assets introduced with the send-message endpoint (RFC-0140, later reshaped by RFC-0149) are missing GRACE scaffolding:

- `packages/ui/src/sections/send-message/send-message-section.client.ts`
- `packages/ui/src/sections/send-message/send-message-section.css`

They lack the `MODULE_CONTRACT` / `MODULE_MAP` / `CHANGE_SUMMARY` markers that `grace.validate` (RFC-0015) expects. Because `grace.validate` is part of the package check pipeline, the whole workspace grace gate is red on a clean tree — which trains operators to ignore it.

## Decision

Section-owned client scripts (`*.client.ts`) and stylesheets (`*.css`) are in scope for GRACE discipline like any other module:

- Backfill the `MODULE_CONTRACT` / `MODULE_MAP` / `CHANGE_SUMMARY` headers on the two send-message assets so `grace.validate` exits 0.
- Confirm `grace.validate`'s file-selection covers `.client.ts` and `.css` under `packages/ui/src/sections/**` (so newly scaffolded section assets are checked from day one), and that `section.scaffold` / `api.routes.generate` emit the markers in generated assets.

## Acceptance criteria

- [x] The two send-message `.client.ts` / `.css` files carry valid GRACE markers and `pnpm compass:validate` exits 0 workspace-wide on a clean tree (518 authored files OK). Also backfilled three other modules that were blocking a green workspace: `preview-images.ts`, `preview-templates.ts` (RFC-0150) and `resolve-field-path.ts` (RFC-0138). (evidence: implemented historically)
- [x] `grace.validate` selects section-owned `.client.ts` and `.css` files — `grace-inventory` `SOURCE_EXTENSIONS` includes `.ts`/`.css`; empirically the unmarked modules failed the check and passed once marked. (evidence: implemented historically)
- [x] `section.scaffold` now emits full GRACE markers in generated `.astro`/`.css`/`.types.ts` (`sectionGraceMarkers()`); `api.routes.generate` output is a `GENERATED`-marked thin re-export (grace-exempt by design), so no markers are needed there. (evidence: implemented historically)

## Implementation notes for agents

- This is a small compliance fix plus a scaffold-generator update; no behavioural change to rendered output.
- Cross-check the generators touched by RFC-0149 (the Pages-Functions → Workers/APIRoute migration) so regenerating an app does not reintroduce marker-less assets.

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
