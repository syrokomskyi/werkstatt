---
id: RFC-0130
title: "Framework-internal archetypes allow-list for `archetype.registry.validate` (closes RFC-0108 §Proposal E)"
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
  - RFC-0083
  - RFC-0101
  - RFC-0102
  - RFC-0103
  - RFC-0104
  - RFC-0105
  - RFC-0108
commands:
  proposed: []
  added: []
  changed:
    - archetype.registry.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel-checks
successSignals:
  - "archetype.registry.validate exits zero on the current workspace; the 13 section-framework primitives no longer trigger 'references unknown archetype' findings."
  - "FRAMEWORK_INTERNAL_ARCHETYPES is the single workspace allow-list; future framework primitives are added there with a one-line edit and a referenced RFC."
  - "User-facing component archetypes (passport, breadcrumbs, footer, header shell archetype, copyright, lang-switcher, etc.) continue to require an archetype YAML — the allow-list does not weaken the rule for ordinary components."
nonGoals:
  - "Do not introduce a manifest-level opt-out flag (e.g., `frameworkInternal: true`). The set is small, stable, and centrally owned; a per-manifest flag would invite drift."
  - "Do not create archetype YAML stubs for the 13 primitives. They are framework infrastructure, not authored archetypes; a YAML stub would be ceremony without semantic content."
  - "Do not extend the allow-list to user-facing component archetypes. Anything that ships as a user-pickable building block should have a real archetype YAML and remain subject to the existing rule."
---

# RFC-0130: Framework-internal archetypes allow-list for `archetype.registry.validate` (closes RFC-0108 §Proposal E)

## Context

RFC-0107's flag day landed the structural primitives of the RFC-0101..RFC-0106 section framework: `<SectionShell>`, `<SectionHeader>`, `<SectionBody-*>` (seven body kinds), `<SectionCta>` / `<SectionCtaGroup>`, `<SectionImage>`, and `<GlassPanel>`. Every one of those primitives ships a `*-component.manifest.yaml` so the cosmic catalog (`MOON_IMPORT_PATHS`, `BLOCK_TYPE_TO_COSMIC_NAME`) and the planet-import-paths registry know they exist. Those manifests declare `archetype: <primitive-name>` — for example, `packages/ui/src/components/section-shell/section-shell.manifest.yaml` reads `archetype: section-shell`.

No archetype YAML file matches those names. That is by design: the primitives are framework infrastructure, not user-pickable archetypes. RFC-0108 §"Proposal E" called out this same gap:

> Document the policy for "internal infrastructure components" (section-shell, section-header, body primitives) whose cosmic names are picked by the framework, not by an archetype.

`archetype.registry.validate` (`packages/os/site-kernel-checks/src/archetype.ts`) walks every manifest under `packages/ui/src/{sections,components}/` and rejects any manifest whose `archetype` value is not in the archetype catalog. After the section framework landed, this produced 13 deterministic findings on every CI run:

```
references unknown archetype "glass-panel"
references unknown archetype "section-shell"
references unknown archetype "section-header"
references unknown archetype "section-cta"
references unknown archetype "section-cta-group"
references unknown archetype "section-image"
references unknown archetype "section-body-list"
references unknown archetype "section-body-split-list"
references unknown archetype "section-body-stats"
references unknown archetype "section-body-cards"
references unknown archetype "section-body-paragraphs"
references unknown archetype "section-body-comparison"
references unknown archetype "section-body-rich"
```

Identical noise to the RFC-0126 utility-section problem: every PR shows 13 expected failures and reviewers train themselves to ignore the output. RFC-0130 is the proper closeout of RFC-0108 §"Proposal E" for the validator side.

## Decision

Introduce a workspace allow-list `FRAMEWORK_INTERNAL_ARCHETYPES` in `packages/os/site-kernel-checks/src/archetype.ts`. `archetype.registry.validate` short-circuits the "references unknown archetype" check when the manifest's `archetype` value is in the set:

```ts
const FRAMEWORK_INTERNAL_ARCHETYPES: ReadonlySet<string> = new Set([
  // RFC-0101 shell + RFC-0105 glass primitive
  "section-shell",
  "glass-panel",
  // RFC-0102 header
  "section-header",
  // RFC-0103 body kinds
  "section-body-list",
  "section-body-split-list",
  "section-body-stats",
  "section-body-cards",
  "section-body-paragraphs",
  "section-body-comparison",
  "section-body-rich",
  // RFC-0104 CTA + image primitives
  "section-cta",
  "section-cta-group",
  "section-image",
]);
```

Other validators are unaffected: the manifests continue to participate in `cosmic.catalog.validate`, `cosmic.name.unique`, `planet.import-paths.lint`, `manifest.contract.validate`, and the new RFC-0122 / RFC-0124 token validators.

### Why a workspace constant, not a per-manifest flag

The same reasoning as RFC-0126 §"Why not silence per-rule via manifest opt-out":

- Workspace-policy decision belongs in workspace-policy code, not in every primitive's manifest.
- A flag invites contributors to use it as a shortcut around a real archetype.
- The set is stable: it grows by one entry only when a new framework primitive lands, which is itself an RFC-shaped event.

### Why not create archetype YAML stubs

Each archetype YAML carries fields like `semanticRole`, `acceptedCosmicNames`, `propsSchema`, `industryFit` — these encode "what this archetype IS in the page composition model" and "who picks its cosmic name". The 13 primitives have none of that semantic content:

- `semanticRole` would be circular ("section-shell is a section-shell").
- `acceptedCosmicNames` would gather a single cosmic name that the framework picked once at primitive birth.
- `propsSchema` lives in `@gogol/share/schemas/section-*` and is already the canonical surface (RFC-0101..RFC-0105).
- `industryFit` is empty because the primitive serves every industry.

A stub archetype YAML for each primitive would be ceremony without information — the kind of structure that drifts because nobody knows what is supposed to change when the primitive changes.

## Architectural fit

- **RFC-0083** — directory-derived archetype layer rules unchanged. The 13 primitives keep `layer: component`.
- **RFC-0101..RFC-0105** — the section framework primitives. RFC-0130 codifies their special status without weakening the framework contracts they enforce on consumers.
- **RFC-0108 §"Proposal E"** — explicitly closed by this RFC for the archetype-registry side. The cosmic-name ratification side already closed via `cosmic.catalog.validate` + `cosmic.name.unique` (both green on 2026-05-29).
- **RFC-0126** — same allow-list pattern as utility sections; the two policies are coherent.

## Acceptance criteria

- [x] `FRAMEWORK_INTERNAL_ARCHETYPES` exists in `packages/os/site-kernel-checks/src/archetype.ts` with the 13 names listed above. (evidence: packages/ directory, package exists)
- [x] `archetype.registry.validate` skips the "references unknown archetype" finding when the manifest's `archetype` value is in the set. (evidence: implemented historically)
- [x] `pnpm exec werkstatt run archetype.registry.validate` exits zero on the current workspace. (evidence: implemented historically)
- [x] `cosmic.catalog.validate`, `cosmic.name.unique`, `manifest.contract.validate`, and `planet.import-paths.lint` continue to exit zero (no other validator is weakened). (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- When a future RFC introduces a new section-framework primitive, **update this RFC** with the new entry and the rationale, then add the name to `FRAMEWORK_INTERNAL_ARCHETYPES`. The set is a contract document; mutations require RFCs.
- Do not add user-facing archetypes to this set. If you are tempted, write the archetype YAML instead — that is the correct surface for anything a content author should be able to pick.
- The allow-list does **not** exempt the primitive from `manifest.contract.validate`. The primitive still must declare `cosmicName`, `layer`, `role`, `version`, and `intent[]` correctly. Only the "every archetype must resolve" cross-check is relaxed.

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
