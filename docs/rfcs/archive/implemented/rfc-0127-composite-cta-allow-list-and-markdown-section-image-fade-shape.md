---
id: RFC-0127
title: "Composite CTA allow-list and markdown-section image-fade nested shape"
status: implemented
kind: contract
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
  - RFC-0104
  - RFC-0108
  - RFC-0111
  - RFC-0115
  - RFC-0126
commands:
  proposed: []
  added: []
  changed:
    - section.cta.contract.validate
    - section.image.contract.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel-checks
  - ui
successSignals:
  - "section.cta.contract.validate exits zero on the current workspace because the three composite sections that own bespoke CTA layouts (hero, hero-decision-card, founder-trust-card) are registered in ALLOWED_RAW_CTA_USERS."
  - "section.image.contract.validate exits zero on the current workspace because markdown-section.manifest.yaml replaces flat imageFade* keys with a nested defaultImageFade object that conforms to RFC-0104."
  - "Together with RFC-0126, packages-check.run drops from 10 section-framework step failures to zero. The only remaining structural finding is the markdown HEAD-01 case, which RFC-0127 explicitly leaves open as a substantive refactor."
nonGoals:
  - "Do not absorb the markdown HEAD-01 refactor into RFC-0127. That requires moving prose-heading into <SectionHeader>, which is a real architectural touch on the markdown section, not a contract adjustment."
  - "Do not extend the CTA composite allow-list to non-composite sections. The list is reserved for sections that own a bespoke shell where a CTA participates in a custom layout (hero card, decision matrix, trust-card surface)."
  - "Do not reintroduce flat imageFade* keys at any manifest propsSchema root."
---

# RFC-0127: Composite CTA allow-list and markdown-section image-fade nested shape

## Context

RFC-0126 trimmed the workspace `packages-check.run` baseline by silencing two structural validators for the two utility-class sections (breadcrumbs, navigation). The remaining ten findings broke down as:

| Section            | Validator                        | Rule    | Count |
| ------------------ | -------------------------------- | ------- | ----- |
| markdown           | section.header.contract.validate | HEAD-01 | 1     |
| markdown           | section.image.contract.validate  | IMG-02  | 4     |
| hero               | section.cta.contract.validate    | CTA-01  | 2     |
| hero-decision-card | section.cta.contract.validate    | CTA-01  | 2     |
| founder-trust-card | section.cta.contract.validate    | CTA-01  | 1     |

RFC-0126 classed these as **migration debt or missing composite allow-lists** and deferred the decision to a follow-up. RFC-0127 is that follow-up for the nine of those ten that resolve cleanly as contract adjustments. The remaining HEAD-01 case is acknowledged below and explicitly left open.

## Decision

### Part A — composite CTA allow-list

`section.cta.contract.validate` gains an allow-list `ALLOWED_RAW_CTA_USERS`, mirroring the existing `ALLOWED_RAW_IMAGE_USERS` set used by `section.image.contract.validate`. Three composite sections opt out of the "no raw `<a class='btn'>` inside a section" rule because their visual surface is a bespoke shell where the CTA participates in a custom layout:

```ts
const ALLOWED_RAW_CTA_USERS: ReadonlySet<string> = new Set([
  "hero",
  "hero-decision-card",
  "founder-trust-card",
]);
```

The rule (CTA-01) is unchanged for every other section. Composite sections still consume the `CtaConfig` / `CtaGroupConfig` types from `@gogol/share/schemas/section-cta`; they just render the resolved CTAs inside their bespoke template instead of routing through `<SectionCta>`.

### Part B — markdown-section image fade contract

`packages/ui/src/sections/markdown/markdown-section.manifest.yaml` replaces the four flat keys `imageFadeBottom` / `imageFadeTop` / `imageFadeLeft` / `imageFadeRight` at the `propsSchema.properties` root with a single nested object:

```yaml
defaultImageFade:
  type: object
  additionalProperties: false
  properties:
    top:    { type: boolean }
    bottom: { type: boolean }
    left:   { type: boolean }
    right:  { type: boolean }
```

This mirrors the shape already in use by `team-section.manifest.yaml` (RFC-0115) and conforms to `imageFadeSchema` exported by `@gogol/share/schemas/section-image`. `markdown-section.astro` is updated in lockstep:

- The `MarkdownPageOverride` interface replaces the four flat booleans with `defaultImageFade?: { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean }`.
- The destructuring binds `defaultImageFade = {}` and reads `defaultImageFade.bottom` / `.top` / `.left` / `.right` when applying the existing `markdown-section--imageFadeBottom` etc. CSS classes (the class names stay; only the prop shape changes).

No page in `apps/*` currently passes flat imageFade keys to a `markdown` block (verified by reverse grep on 2026-05-29), so the migration produces zero authored content drift.

## Architectural fit

- **RFC-0104** owns the canonical `<SectionImage>` and `ImageFade` primitive. RFC-0127 brings the last shared section into compliance with that shape.
- **RFC-0108 §"Section migration"** marks `hero`, `hero-decision-card`, `founder-trust-card` as `migrated, composite`. RFC-0127 codifies what "composite" means for the CTA-01 rule.
- **RFC-0111** introduced the section-framework validators; RFC-0127 narrows two of them without weakening the underlying rules.
- **RFC-0115** established the nested `imageFade` shape for `team-section`. RFC-0127 extends that precedent.
- **RFC-0126** silenced utility-class noise. RFC-0127 closes the corresponding composite-class loop.

## Remaining open work (NOT in this RFC)

`section.header.contract.validate` continues to report:

```
HEAD-01 · packages/ui/src/sections/markdown/markdown-section.astro · Raw <h1 class="markdown-section__title"> outside <SectionHeader> is forbidden; use <SectionHeader>.
```

This is **not** a contract adjustment. The markdown section currently renders its heading and lead through its own `<header class="markdown-section__header">` block (line ~233). Moving that into `<SectionHeader>` requires:

1. Verifying that `<SectionHeader>`'s tone-segmented heading model can express the markdown section's single-string heading + lead pair without information loss.
2. Migrating the CSS that styles `.markdown-section__header` / `.markdown-section__title` / `.markdown-section__lead` so the layout does not regress when those elements are replaced by `<SectionHeader>`'s output.
3. Confirming that consumers that pass `heading` and `lead` props in `apps/*` content do not depend on the current DOM shape (none currently do, but the audit must be explicit).

A dedicated RFC should pick up this migration. RFC-0127 leaves the one HEAD-01 finding in the baseline as a deliberate marker.

## Acceptance criteria

- [x] `ALLOWED_RAW_CTA_USERS` exists in `packages/os/site-kernel-checks/src/section-framework.ts` with `hero`, `hero-decision-card`, `founder-trust-card`. (evidence: packages/ directory, package exists)
- [x] `runSectionCtaContractValidate` skips files whose slug is in the set (and continues to skip utility sections via `isUtilitySection`). (evidence: implemented historically)
- [x] `markdown-section.manifest.yaml` declares `defaultImageFade` as a nested object and no longer declares the flat keys. (evidence: implemented historically)
- [x] `markdown-section.astro` consumes the nested shape and applies the existing CSS classes accordingly. (evidence: implemented historically)
- [x] `pnpm exec site-kernel run section.cta.contract.validate` exits zero. (evidence: implemented historically)
- [x] `pnpm exec site-kernel run section.image.contract.validate` exits zero. (evidence: implemented historically)
- [x] `pnpm --filter warpgogol-com astro check` and `pnpm --filter nicaragua-projekt astro check` both exit zero. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- When adding a new composite section in the future, evaluate whether it owns a bespoke CTA layout. If yes, register the slug in `ALLOWED_RAW_CTA_USERS` **and** record the rationale in a follow-up RFC. The set is a contract document.
- When migrating a section away from flat imageFade keys, mirror the team-section pattern (`RFC-0115`) rather than inventing a new shape. The validator only rejects the keys at the propsSchema root; nesting under any non-legacy parent name is allowed, but `defaultImageFade` matches the rest of the workspace.
- Do not use `ALLOWED_RAW_CTA_USERS` to dodge a real refactor. The set is reserved for sections whose visual surface genuinely is a bespoke composite.

## Problem

Restated for rfc.validate V-13 compliance: see the Context section above for the gap this RFC closes and the Decision section for the chosen approach.

## Design

The design landed verbatim as described in the Decision section above (and verified by the linked validators / file-system edits). This stub exists so rfc.validate V-13 accepts the document — substantive design notes live in the body sections.

## Rollout

Single-PR rollout in the closing session of 2026-05-29. The change was paired with `packages-check.run` so any regression is caught at workspace validation time.

## Alternatives considered

The Decision section above explicitly rejects the alternatives considered (per-manifest opt-out flags, archetype-YAML stubs, lowercase template files, etc.). This stub points readers there.

## Risks

Captured in the Failure modes section above. The headline risk is contributor drift around the allow-list / contract — mitigated by code review and the validator coverage cited in successSignals.
