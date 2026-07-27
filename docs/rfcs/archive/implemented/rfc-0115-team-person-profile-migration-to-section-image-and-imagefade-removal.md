---
id: RFC-0115
title: "Team / PersonProfile migration to SectionImage and imageFade removal"
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
amends: []
amendedBy:
  - RFC-0200
related:
  - RFC-0101
  - RFC-0103
  - RFC-0104
  - RFC-0107
  - RFC-0108
  - RFC-0111
commands:
  proposed: []
  added: []
  changed:
    - section.image.contract.validate
    - page.block.validate
    - section.scaffold
  removed:
    - flat imageFadeBottom / imageFadeTop / imageFadeLeft / imageFadeRight props at the team section root
    - flat imageFadeBottom / imageFadeTop / imageFadeLeft / imageFadeRight props on PersonProfile component
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - ui
successSignals:
  - "PersonProfile renders its member portrait through <SectionImage>."
  - "The team archetype + manifest no longer accept top-level imageFade* booleans; image-fade configuration lives on each member's image via SectionImage `fade`."
  - "section.image.contract.validate (RFC-0111 IMG-02) is enforced without exceptions; team is no longer carved out."
  - "apps/nicaragua-projekt/src/content/pages/{lang}/about-us.md authors per-member image fade rather than section-level booleans."
nonGoals:
  - "Do not break the per-member animateNumbers / hideRole legacy switches; those are not image-fade related."
  - "Do not redesign PersonProfile beyond the image primitive."
  - "Do not move PersonProfile content out of @gogol/ui."
---

# RFC-0115: Team / PersonProfile migration to SectionImage and imageFade removal

## Context

RFC-0104 introduced `<SectionImage>` as the canonical authored image primitive with `fade` as a property of the image, not the section. RFC-0107 step 6 listed the flat `imageFadeBottom / imageFadeTop / imageFadeLeft / imageFadeRight` props among the legacy artifacts to remove. RFC-0111 IMG-02 documents the validator that rejects flat image-fade props at section roots.

The `team` section is the last holdout. Its `team-section.astro` reads the four booleans at the root and passes them to each `<PersonProfile>` member, which renders the legacy image-fade CSS inline. Apps' `about-us.md` files still author the section-level booleans.

## Problem

1. **PersonProfile owns image-fade rendering.** Migration requires replacing the bespoke fade CSS with `<SectionImage>`.
2. **Per-member granularity is not possible today.** A page cannot fade one member's portrait differently from another's.
3. **RFC-0111 IMG-02 has a carve-out** ("…except `team` until RFC-0115 lands"). This RFC closes the carve-out.

## Decision

Refactor `<PersonProfile>` to render its portrait through `<SectionImage>` and remove the flat `imageFade*` props. The team section stops carrying section-level fade booleans; each member may declare its own `imageFade` block, or the team-level `defaultImageFade` applies as a fallback.

### `<PersonProfile>` (refactored)

```ts
interface PersonProfileProps {
  name: string;
  role?: string;
  bio?: string;
  slug?: string;
  image?: string;
  imageAlt?: string;
  imageFade?: ImageFade;     // RFC-0104 ImageFade
  hideRole?: boolean;
  animateNumbers?: boolean;
}
```

`<PersonProfile>` consumes `<SectionImage>` with `fade={imageFade}`.

### `<TeamSection>` (refactored)

```ts
interface TeamMember extends PersonProfileProps {}

interface TeamSectionProps extends CanonicalSectionProps {
  body: SectionTeamBody;
  hideRole?: boolean;            // global toggle stays
  animateNumbers?: boolean;      // global toggle stays
  defaultImageFade?: ImageFade;  // applies to every member without explicit imageFade
}
```

Or, treating team as a `cards` body kind extension with `member-card` sub-shape under RFC-0103 cards (composite-with-cards). For continuity, this RFC keeps team's `bodyKind: composite` and adds `defaultImageFade` as a section-level prop sibling.

### Page authoring (after migration)

```yaml
- id: team-about
  type: team
  props:
    header:
      heading: "Die Gründer und Unterstützer"
      hideSectionNumber: true
    background:
      kind: transparent
    hideRole: true
    animateNumbers: true
    defaultImageFade:
      bottom: true
      left: true
      right: true
    members:
      - slug: "katrin-hennings"
        name: "Dr. Katrin Hennings"
        image: "/src/content/business/de/assets/katrin-hennings.webp"
        role: "Erste Vorsitzende, leitende Ärztin"
      - slug: "reinhart-bein"
        name: "Reinhart Bein"
        image: "/src/content/business/de/assets/reinhart-bein.webp"
        role: "Vorsitzender (1939–2019)"
        imageFade:                # override default for this member
          bottom: true
```

Flat `imageFadeBottom / imageFadeTop / imageFadeLeft / imageFadeRight` at the section root are rejected by `section.image.contract.validate` without exception (the carve-out is removed).

### Migration steps

1. Refactor `<PersonProfile>` to call `<SectionImage>` for the portrait.
2. Update `team-section.astro` to accept `defaultImageFade` and forward per-member `imageFade` to each `<PersonProfile>`.
3. Update `team-section.types.ts`, `team-section.manifest.yaml`, and the archetype YAML.
4. Migrate `apps/nicaragua-projekt/src/content/pages/de/about-us.md` and `apps/nicaragua-projekt/src/content/pages/en/about-us.md` to the new shape.
5. Remove the team carve-out from `section.image.contract.validate` (RFC-0111 IMG-02).

## Design

See `## CLI surface`, `## TypeScript contracts`, and `## File system responsibilities` above for the full per-member `imageFade` schema and `<SectionImage>` migration specification.

## Architectural fit

- **RFC-0101** — visual contract preserved; team continues to use `<SectionShell>`.
- **RFC-0103** — team remains `bodyKind: composite`.
- **RFC-0104** — `<SectionImage>` is the canonical image primitive.
- **RFC-0107** — closes the last legacy `imageFade*` surface.
- **RFC-0111** — IMG-02 becomes universal after this RFC lands.

## CLI surface

No new commands. Behaviour changes:

- `section.image.contract.validate` — IMG-02 carve-out removed.
- `page.block.validate` — rejects `imageFade*` at team root.
- `section.scaffold` — RFC-0112 templates already use `<SectionImage>`; team is not scaffold-generated.

## TypeScript contracts

```ts
import type { ImageFade } from "@gogol/share";

interface PersonProfileProps {
  name: string;
  role?: string;
  bio?: string;
  slug?: string;
  image?: string;
  imageAlt?: string;
  imageFade?: ImageFade;
  hideRole?: boolean;
  animateNumbers?: boolean;
}

interface TeamSectionContent {
  background?: SectionBackground;
  glass?: GlassConfig;
  density?: SectionDensity;
  tone?: SectionTone;
  header: Omit<SectionHeaderProps, "sectionNumber" | "id">;
  hideRole?: boolean;
  animateNumbers?: boolean;
  defaultImageFade?: ImageFade;
  members: PersonProfileProps[];
}
```

## File system responsibilities

| Path | Edit |
| --- | --- |
| `packages/ui/src/components/person-profile/person-profile-component.astro` | Render portrait via `<SectionImage>` |
| `packages/ui/src/sections/people/people-section.astro` | Remove flat imageFade props; pass `defaultImageFade` + per-member `imageFade` (the `team` section was renamed → `people` by RFC-0200) |
| `packages/ui/src/sections/people/people-section.types.ts` | Update interface (renamed → `people` by RFC-0200) |
| `packages/ui/src/sections/people/people-section.manifest.yaml` | Remove imageFade\* properties; add defaultImageFade + member.imageFade (renamed → `people` by RFC-0200) |
| `packages/ontology/archetypes/sections/people.yaml` | Update propsSchema.shape (renamed → `people` by RFC-0200) |
| `apps/nicaragua-projekt/src/content/pages/{de,en}/about-us.md` | Migrate authored shape |
| `packages/share/src/schemas/section-image.ts` | Remove team carve-out from IMG-02 |

## Failure modes

- A page still authors flat `imageFadeBottom: true` at the team section root → page.block.validate rejects with hint.
- PersonProfile loses access to image fade because the new prop is not forwarded → integration test catches it.

## Rollout

1. Implement `<PersonProfile>` migration with the new image primitive.
2. Refactor team-section.astro and supporting files.
3. Migrate apps content.
4. Remove the IMG-02 carve-out in `section.image.contract.validate`.
5. Run `apps-check.author` to confirm zero violations.

## Alternatives considered

- **Convert team to `body.kind: cards`.** Considered — `StandardCard` is close to `TeamMember` but lacks `slug` (business member binding) and the per-member animation toggles. Keeping team as composite is simpler and preserves existing semantics.
- **Leave team carve-out indefinitely.** Rejected — long-tail carve-outs poison the framework; flagging them as a separate RFC ensures the cleanup actually happens.

## Risks

- Composite sections that previously used flat `imageFade*` props on the section root may be missed in the migration. Mitigation: `section.image.contract.validate` reports any remaining flat `imageFade*` at root level as hard violations.
- Per-member `imageFade` shape may diverge from the canonical `ImageFade` contract in `@gogol/share`. Mitigation: the per-member schema re-uses the same `imageFadeSchema` from `@gogol/share/schemas/section-image`.

## Acceptance criteria

- [x] `<PersonProfile>` renders portrait through `<SectionImage>`. (evidence: implemented historically)
- [x] `team-section.astro` no longer reads flat `imageFade*` from pageOverride root. (evidence: implemented historically)
- [x] Both `about-us.md` files (de + en) author per-member or default image fade. (evidence: implemented historically)
- [x] `section.image.contract.validate` IMG-02 has no carve-out for team. (evidence: implemented historically)
- [x] `apps-check.author` is green for nicaragua-projekt. (evidence: original apps retired by RFC-0381, implemented historically)

## Implementation notes for agents

- Agents MUST author per-member `imageFade` blocks in block-style YAML under each team member entry; the section root no longer accepts these flags.
- Agents MUST migrate every legacy `imageFadeBottom / imageFadeTop / imageFadeLeft / imageFadeRight` page block to either `defaultImageFade` (section-wide) or per-member `imageFade` (overrides).
- Agents MUST keep PersonProfile's other props (`animateNumbers`, `hideRole`) — they are not image-fade related.
