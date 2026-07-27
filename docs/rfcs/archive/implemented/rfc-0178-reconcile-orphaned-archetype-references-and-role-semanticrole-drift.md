---
id: RFC-0178
title: "Reconcile orphaned archetype references and role/semanticRole drift"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-08
updatedAt: 2026-06-08
implementedAt: 2026-06-08
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0072
  - RFC-0084
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/ontology
  - packages/ui
successSignals:
  - "archetype.registry.validate exits 0 — every UI manifest's archetype resolves to a registry entry and every section manifest's role matches a declared archetype semanticRole."
  - "packages-check.run no longer carries a standing archetype.registry.validate failure."
nonGoals:
  - "Do not change the archetype.registry.validate rules — this RFC fixes the data, not the validator."
  - "Do not rename cosmicNames or restructure the affected sections/components — only add missing archetypes and align role drift."
---

# RFC-0178: Reconcile orphaned archetype references and role/semanticRole drift

## Context

`archetype.registry.validate` (RFC-0072 / RFC-0084) is a member of `PACKAGES_CHECK_PIPELINE`, yet it currently exits non-zero on `main`-line work — a standing red that predates and is independent of RFC-0175/0176/0177. Four manifests violate two rules:

- **Orphaned archetype reference** (manifest `archetype:` has no archetype YAML in `packages/ontology/archetypes/`):
  - `packages/ui/src/sections/article-list/article-list-section.manifest.yaml` → `article-list`
  - `packages/ui/src/components/responsive-image/responsive-image.manifest.yaml` → `responsive-image`
  - `packages/ui/src/components/seo/social-meta/social-meta-component.manifest.yaml` → `social-meta`
- **role/semanticRole drift** (section manifest `role:` matches no section archetype's `semanticRole`):
  - `packages/ui/src/sections/send-message/send-message-section.manifest.yaml` uses `role: capture-lead`, but its archetype `send-message` declares `semanticRole: lead-message-capture`.

These are data inconsistencies (missing/mismatched ontology entries), not validator bugs. The validator is correct; the catalog drifted as sections/components were added without archetypes and a role string diverged from its archetype.

## Decision

Fix the **data**, not the rule:

1. Add three archetype definitions so every referenced archetype resolves:
   - `packages/ontology/archetypes/sections/article-list.yaml` (semanticRole for the article-list section).
   - `packages/ontology/archetypes/components/responsive-image.yaml`.
   - `packages/ontology/archetypes/components/social-meta.yaml`. Each mirrors the shape of an existing peer (e.g. `sections/send-message.yaml` for the section; an existing component archetype for the components), with `acceptedCosmicNames` set to the cosmicName the manifest already uses (`Io`, `Belinda`, `Naiad` respectively).
2. Resolve the `send-message` drift by aligning the manifest `role` with the archetype `semanticRole` (`role: lead-message-capture`) — the same convention RFC-0175's `chat-widget` already follows. If `capture-lead` is referenced elsewhere as a role, prefer adding `lead-message-capture` and updating references in the same change; do not invent a second source of truth.
3. Rebuild `packages/ontology/archetypes/index.json` via `archetype.registry.build` and confirm `archetype.registry.validate` exits 0.

## Acceptance criteria

- [x] `sections/article-list.yaml` (Io), `components/responsive-image.yaml` (Belinda), `components/social-meta.yaml` (Naiad) archetypes added; each resolves the orphaned reference with the manifest's existing cosmicName (evidence: implemented historically)
- [x] `send-message` manifest `role` aligned to its archetype `semanticRole` (`lead-message-capture`); `capture-lead` confirmed to be an intent, not a role — no second source of truth introduced (evidence: implemented historically)
- [x] `archetype.registry.build` regenerates `index.json`; `archetype.registry.validate` exits 0 (45 archetypes) (evidence: implemented historically)
- [x] `manifest.contract.validate`, `cosmic.catalog.validate`, `cosmic.name.unique`, `uni.registry.validate` stay green (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- This RFC fixes ontology DATA only — do NOT weaken or change `archetype.registry.validate` (RFC-0084) to make the error disappear.
- New archetype YAMLs MUST mirror the existing peer shape (id, displayName, version, semanticRole, description, expected intents/industryFit, `acceptedCosmicNames`) and reuse the cosmicName already on the manifest — never introduce a new cosmicName (DNA-23 uniqueness).
- After editing, run `archetype.registry.build` then `archetype.registry.validate` and the cosmic/manifest validators; commit the regenerated `index.json`.
- Keep the change minimal and surgical: three archetypes + one role alignment. No section/component restructuring.

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
