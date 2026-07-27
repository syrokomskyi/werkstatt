---
id: RFC-0039
title: "Section Background Control: transparent and verticalFade"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-04
updatedAt: 2026-06-04
implementedAt: 2026-05-04
closedAt:
supersedes: []
supersededBy:
related:
  # Reference DNA invariants, anti-patterns, spec docs, or other RFCs:
  - DNA-24
  - RFC-0036
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - ui
successSignals: []
nonGoals:
  - Does not apply to shell-level blocks (Background, Header, Footer)
  - Does not support horizontal fade gradients
  - Does not support radial or conic gradients
---

# RFC-0039: Section Background Control: transparent and verticalFade

## Context

The `@gogol/ui` package provides section components that render content blocks on pages. Currently, sections have a fixed solid background (`--ds-color-bg`) with an optional noise texture overlay (`texture: boolean`).

Content authors need flexible control over section backgrounds to achieve visual hierarchy and design goals:

- Some sections should blend into page background (fully transparent)
- Some sections need gradient transitions at edges (fade effects)
- Some sections need inverted gradients when placed on non-default backgrounds

This RFC establishes a content-driven, composable background control system for all section components in `packages/ui/src/sections/`.

## Problem

1. **No transparency control**: Sections cannot be made transparent via content configuration. The only option is the default solid background.

2. **Limited gradient control**: The previous `fade: boolean` property only supported one gradient direction (transparent edges → solid center). There's no way to invert this (solid edges → transparent center) for sections placed on alternative backgrounds.

3. **No composable semantics**: A section cannot be both "transparent base" AND "have gradient edges" in a way that produces the inverted gradient effect.

4. **Agent confusion**: Without documented conventions, AI agents cannot reliably implement background variations across different section types.

## Decision

All section components in `packages/ui/src/sections/` gain two content-driven boolean properties:

1. **`transparent?: boolean`** (default: `false`) — Makes the section background fully transparent when `true`

2. **`verticalFade?: boolean`** (default: `false`) — Applies a vertical fade gradient

The CSS implementation uses a combinatorial class approach where the combination of both classes produces four distinct visual states:

| `transparent` | `verticalFade` | Applied CSS Classes | Visual Result |
| --- | --- | --- | --- |
| `false` | `false` | (base only) | Solid `--ds-color-bg` |
| `false` | `true` | `--verticalFade` | Transparent edges → Solid center |
| `true` | `false` | `--transparent` | Fully transparent |
| `true` | `true` | `--transparent` + `--verticalFade` | Solid edges → Transparent center |

The inverted gradient (last row) is achieved via a combined selector: `.section--transparent.section--verticalFade` with reversed gradient stops.

## Architectural fit

### Alignment with DNA-24 (Block-declarative pages)

This RFC extends DNA-24's component contract model. Section props validate against manifest schemas, keeping pages frontmatter-only.

### Alignment with DNA-22 (Client surface)

Both `transparent` and `verticalFade` are client-editable properties living in content files, not engineering-only.

### Component Contract Pattern

Each section must maintain the three-way mirror:

- `manifest.yaml` — propsSchema with both properties
- `types.ts` — TypeScript interface with optional booleans
- `.astro` — `class:list` directive applying modifier classes

### Anti-Pattern Prevention

- **AP-1 (Ad-hoc CSS exceptions)**: All background variations flow through content props
- **AP-2 (Hardcoded visual logic)**: No conditional CSS based on section ID — only on content props

## Design

### Content Schema (manifest.yaml)

```yaml
propsSchema:
  type: object
  additionalProperties: false
  properties:
    heading: { type: string }
    texture:
      type: boolean
      default: false
      description: Apply noise texture overlay
    transparent:
      type: boolean
      default: false
      description: Make section background fully transparent
    verticalFade:
      type: boolean
      default: false
      description: Apply vertical fade gradient (inverted when transparent)
```

### TypeScript Contract (types.ts)

```typescript
export interface SectionComponentContent {
  heading: string;
  texture?: boolean;
  transparent?: boolean;
  verticalFade?: boolean;
  // ... other props
}
```

### CSS Contract

Each section implements three modifier classes:

```css
/* Base state - solid background */
.section {
  background: var(--ds-color-bg);
}

/* Fully transparent */
.section--transparent {
  background: transparent;
}

/* Gradient: transparent edges → solid center */
.section--verticalFade {
  background: linear-gradient(
    180deg,
    transparent 0%,
    var(--ds-color-bg) 40%,
    var(--ds-color-bg) 60%,
    transparent 100%
  );
}

/* Combined: solid edges → transparent center */
.section--transparent.section--verticalFade {
  background: linear-gradient(
    180deg,
    var(--ds-color-bg) 0%,
    transparent 40%,
    transparent 60%,
    var(--ds-color-bg) 100%
  );
}
```

### Astro Component Pattern

```astro
<section
  class:list={[
    "section",
    "problem-section",
    { "problem-section--textured": content.texture },
    { "problem-section--transparent": content.transparent },
    { "problem-section--verticalFade": content.verticalFade },
  ]}
>
```

### File system responsibilities

| Path                                            | Role                                |
| ----------------------------------------------- | ----------------------------------- |
| `packages/ui/src/sections/*/manifest.yaml`      | Props schema definition             |
| `packages/ui/src/sections/*/types.ts`           | TypeScript interfaces               |
| `packages/ui/src/sections/*/*.astro`            | Component rendering with class:list |
| `packages/ui/src/sections/*/*.css`              | CSS modifier classes                |
| `apps/*/src/content/components/**/section/*.md` | Content files using the props       |

### Affected Sections (initial rollout)

- `problem-section`
- `approach-section`
- `women-section`
- `transparency-section`
- `donation-use-section`

New sections added to `packages/ui` MUST follow this pattern.

## Rollout

This RFC is implemented as a **non-breaking change**:

1. **Default behavior unchanged**: Both `transparent` and `verticalFade` default to `false`, preserving existing solid backgrounds
2. **Opt-in usage**: Content authors enable effects explicitly in frontmatter
3. **No migration needed**: Existing content files without these properties continue to work

## Alternatives considered

1. **Single enum property** (`backgroundStyle: 'solid' | 'transparent' | 'fade' | 'fade-inverted'`): Rejected because it prevents composability and makes the matrix harder to extend.

2. **CSS custom properties in content** (`--section-bg: transparent`): Rejected because it breaks the design system contract and allows arbitrary values.

3. **Separate `fadeInverted` boolean**: Rejected because combining `transparent` + `verticalFade` achieves the same effect more elegantly.

## Risks

1. **Agent confusion with combined selectors**: Agents might forget to implement the `.section--transparent.section--verticalFade` combined selector.
2. **Visual inconsistency**: Content authors might overuse transparent sections, reducing visual hierarchy.

## Acceptance criteria

- [x] TypeScript types defined in all section `types.ts` files (evidence: implemented historically)
- [x] Manifest schemas updated with `transparent` and `verticalFade` properties (evidence: implemented historically)
- [x] Astro components apply correct CSS modifier classes via `class:list` (evidence: implemented historically)
- [x] CSS implements all four visual states (base, transparent, verticalFade, combined) (evidence: implemented historically)
- [x] Existing apps pass without changes (defaults preserve behavior) (evidence: implemented historically)
- [x] Human with `architecture` role changes status to `accepted` (evidence: implemented historically)
- [x] `rfc.validate` passes on this file after merging (evidence: implemented historically)

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST check `rfc.list --status accepted` before making structural changes
  to packages or app tools that relate to this RFC's scope.
- When implementing, agents MUST reference this RFC ID in commit messages or PR descriptions.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
-->

### Agent Rules for Section Backgrounds

1. **When adding a new section to `packages/ui`**: Agents MUST include both `transparent` and `verticalFade` properties following the exact pattern in this RFC.

2. **CSS Implementation**: Agents MUST implement all four states (base, transparent-only, verticalFade-only, combined) even if only some are initially used.

3. **Class naming**: Agents MUST use kebab-case with double-dash: `{section-name}--transparent` and `{section-name}--verticalFade`.

4. **Default values**: Agents MUST set both properties to `false` in manifest defaults.

5. **No hardcoded exceptions**: Agents MUST NOT add section-ID-based CSS exceptions. All visual variation flows through content props.

6. **Validation**: Agents SHOULD verify that `transparent` and `verticalFade` are present in all three files (manifest, types, astro) for any section they modify.
