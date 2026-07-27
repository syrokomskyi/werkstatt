---
id: RFC-0109
title: "ComponentRole enum expansion for section framework primitives"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-27
updatedAt: 2026-06-04
implementedAt: 2026-05-27
closedAt:
supersedes:
supersededBy:
related:
  - DNA-19
  - RFC-0023
  - RFC-0101
  - RFC-0102
  - RFC-0103
  - RFC-0104
  - RFC-0105
  - RFC-0107
  - RFC-0108
commands:
  proposed: []
  added: []
  changed:
    - manifest.contract.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - ontology
successSignals:
  - "ComponentRoleValues includes the seven canonical section framework primitives (section-shell, section-header, section-body, section-cta, section-image, glass-panel, site-background)."
  - "Every component manifest in packages/ui/src/components/* validates against the expanded closed enum."
  - "manifest.contract.validate accepts the new role values and rejects unknown roles."
nonGoals:
  - "Do not loosen ComponentRole to an open string vocabulary — keep DNA-19 closed-enum discipline."
  - "Do not add roles unrelated to the RFC-0101..RFC-0106 framework in this expansion."
---

# RFC-0109: ComponentRole enum expansion for section framework primitives

## Context

`ComponentRoleValues` (`packages/ontology/src/enums.ts`) is a closed enum that narrows the `role` field on component manifests (`layer: component`). Per DNA-19, adding a value requires a superseding RFC.

RFC-0101 through RFC-0106 introduced seven new canonical component primitives:

| Component | Role | RFC |
| --- | --- | --- |
| SectionShell | `section-shell` | RFC-0101 |
| SectionHeader | `section-header` | RFC-0102 |
| SectionList / SplitList / Stats / CardGrid / Paragraphs / Comparison / Rich | `section-body` | RFC-0103 |
| SectionCta + SectionCtaGroup | `section-cta` | RFC-0104 |
| SectionImage | `section-image` | RFC-0104 |
| GlassPanel | `glass-panel` | RFC-0101 |
| SiteBackground | `site-background` | RFC-0105 |

Without enum expansion, every new component manifest fails `manifest.contract.validate` (Zod rejects unknown `role` values).

## Problem

1. **Closed enum without expansion blocks the architecture.** The framework cannot land without amending `ComponentRoleValues`.
2. **Reusing existing values is semantically wrong.** None of the legacy roles (`header`, `layout-shell`, `breadcrumbs`, `footer`, `brand-label`, `copyright`, `lang-switcher`, `footer-promo`, `person-profile`) describe a section primitive.
3. **DNA-19 requires an RFC to add values.** This RFC is the formal record.

## Decision

Extend `ComponentRoleValues` by exactly seven values, matching the framework primitives one-to-one. The enum stays closed; expansion is auditable and visible in version control.

```ts
export const ComponentRoleValues = [
  // ... existing nine values ...
  "section-shell",      // RFC-0101
  "section-header",     // RFC-0102
  "section-body",       // RFC-0103 (seven body components share this role)
  "section-cta",        // RFC-0104 (single CTA and CTA group share this role)
  "section-image",      // RFC-0104
  "glass-panel",        // RFC-0101
  "site-background",    // RFC-0105
] as const;
```

### Role-vs-component cardinality

Some roles are shared by multiple components:

| Role | Components |
| --- | --- |
| `section-body` | section-list, section-split-list, section-stats, section-card-grid, section-paragraphs, section-comparison, section-rich |
| `section-cta` | section-cta, section-cta-group |

This is deliberate: `role` describes the _kind_ of UI primitive, not the specific shape. The `archetype` field still uniquely identifies each component, so cross-manifest validators can distinguish them.

## Design

See `## CLI surface`, `## TypeScript contracts`, and `## Failure modes` above for the full `ComponentRoleValues` enum contract and validation specification.

## Architectural fit

- **DNA-19** — closed enum discipline preserved via the RFC's "added by RFC" record.
- **RFC-0023 / DNA-17** — Mirror Quintet contract maintained; the new roles feed the same `componentManifestSchema`.
- **RFC-0107** — this expansion is a prerequisite for the section framework flag-day; RFC-0107 references this RFC for the enum amendment.

## CLI surface

No new commands. The change is purely a closed-enum amendment:

```sh
pnpm exec site-kernel run manifest.contract.validate
```

continues to validate component manifests; it accepts the seven new values and continues to reject anything outside the enum.

## TypeScript contracts

```ts
export const ComponentRoleValues = [
  "header",
  "layout-shell",
  "breadcrumbs",
  "footer",
  "brand-label",
  "copyright",
  "lang-switcher",
  "footer-promo",
  "person-profile",
  "section-shell",
  "section-header",
  "section-body",
  "section-cta",
  "section-image",
  "glass-panel",
  "site-background",
] as const;
```

## Failure modes

- A component manifest declares `role: section-wrapper` (legacy / wrong) → `manifest.contract.validate` fails with the expected hint to use `section-shell`.
- A new framework primitive lands without a corresponding `ComponentRoleValues` entry → manifest validation rejects it; the project author must amend this RFC (or supersede it) before merging.

## Rollout

Single-commit amendment. No migration cost on consumer manifests: the framework manifests already use the new role names from creation (RFC-0101..0106 implementation pre-merged this expansion to land the manifests at all).

## Alternatives considered

- **Open vocabulary (`z.string()`).** Rejected — breaks DNA-19 audit discipline and removes the closest-match hint at validation time.
- **Single shared `framework` role for all primitives.** Rejected — loses semantic precision in cross-manifest validators (e.g. `section.body.contract.validate` wants to find every component with `role: section-body`).
- **One role per body kind (`section-body-list`, ...).** Rejected — explodes the enum without gain; the archetype id already distinguishes kinds.

## Risks

- Adding new roles to the closed enum without a superseding RFC violates the invariant. Mitigation: the closed enum is enforced by `manifest.contract.validate`; any new role requires its own RFC.
- A future primitive introduces a role not in this list. Mitigation: write a superseding RFC — do not silently extend the enum.

## Acceptance criteria

- [x] `ComponentRoleValues` includes the seven new values in declared order. (evidence: implemented historically)
- [x] Every component manifest in `packages/ui/src/components/*` validates. (evidence: packages/ directory, package exists)
- [x] No raw role string outside the enum survives in the repo. (evidence: implemented historically)
- [x] `manifest.contract.validate` continues to enforce the closed enum. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST use one of the seven new role values for any new section-framework primitive component they author.
- Agents MUST NOT introduce ad-hoc role values; any new component primitive requires a superseding RFC that explicitly extends `ComponentRoleValues`.
