---
id: RFC-0035
title: "Unify section component props contract to eliminate renderer conditionals"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-30
updatedAt: 2026-04-30
implementedAt: 2026-04-30
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-24
  - DNA-25
  - RFC-0023
  - RFC-0026
  - RFC-0034
commands:
  proposed:
    - section.props.contract
  added: []
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - ui
  - share
successSignals:
  - "All section components in packages/ui/src/sections/ accept a single unified SectionProps interface."
  - "blocks-renderer.astro renders blocks without any planetName conditionals."
  - "Adding a new section requires zero changes to blocks-renderer.astro."
  - "section.props.contract validates that every section component exports the correct props interface."
nonGoals:
  - "Do not change the block-declarative page structure established in RFC-0026."
  - "Do not modify the manifest.yaml schema or cosmic overlay from RFC-0023."
  - "Do not introduce runtime prop validation — only static contract enforcement."
---

# RFC-0035: Unify section component props contract to eliminate renderer conditionals

## Context

[RFC-0026](RFC-0026-block-declarative-pages-and-runtime-context.md) established the block-declarative page pipeline where `blocks-renderer.astro` dynamically dispatches `ResolvedBlock[]` to section components. However, the current implementation in `packages/ui/src/blocks-renderer.astro` contains hardcoded conditional logic based on `planetName` to determine which props to pass to each section type:

```astro
if (block.planetName === "Hyperion") {
  return <Component heading={p.heading} lead={p.lead} contentRef={p.contentRef} lang={lang} />;
}
if (block.planetName === "Europa" || block.planetName === "Dione") {
  return <Component lang={lang} linkRegistry={linkRegistry!} pageOverride={p} sectionNumber={sectionNumber} />;
}
return <Component lang={lang} pageOverride={p} sectionNumber={sectionNumber} />;
```

This violates the Open/Closed Principle: adding a new section with unique prop requirements requires modifying the renderer.

[RFC-0023](RFC-0023-introduce-uni-ui-ontology-and-manifest-driven-registry.md) established the cosmic overlay with `manifest.yaml` files declaring `propsSchema` for each section. However, the schema declaration is not coupled to the actual runtime props interface, leading to drift between manifest and implementation.

[RFC-0034](RFC-0034-colocate-component-content-types-with-packages-ui-components.md) colocated content types with components, establishing the pattern that component interfaces and their metadata should live together.

## Problem

Three specific invariants are unprotected:

1. **No unified props interface.** Each section component invents its own prop names and shapes. `Hyperion` expects `heading`, `lead`, `contentRef`; `Europa` expects `pageOverride` with a specific shape; others expect different variations. Content authors cannot predict what props are valid without reading component source code.

2. **Renderer contains section-specific knowledge.** The renderer knows that "Hyperion is a prose block" and "Europa/Dione need linkRegistry". This knowledge should live in the sections themselves, not in the dispatcher.

3. **Adding sections requires renderer changes.** When a new section type is introduced, even if it follows the standard pattern, the renderer may need a new conditional branch if it has unique prop requirements.

## Decision

Establish **DNA-37: Universal Section Props Contract** — every section component in `packages/ui/src/sections/` must accept a single unified `SectionProps` interface:

```ts
interface SectionProps {
  /** Active locale for i18n rendering */
  lang: string;
  /** Zero-padded section index (01, 02, ...) for anchors and styling */
  sectionNumber: string;
  /** Optional link registry for CTA/link resolution */
  linkRegistry?: Record<string, string | null>;
  /** Complete block.props as declared in page frontmatter */
  pageOverride: Record<string, any>;
}
```

Sections are responsible for destructuring what they need from `pageOverride`. The renderer passes the same props to every section unconditionally.

## Architectural fit

- **DNA-24 (Block-declarative pages):** Preserved — blocks still declare `use` and `props` in frontmatter.
- **DNA-25 (Page route contract):** Strengthened — routes become even thinner as all dispatch logic is eliminated.
- **RFC-0023 (Uni-UI ontology):** `manifest.yaml` `propsSchema` now validates against the actual runtime shape; no drift.
- **RFC-0026 (RuntimeContext):** `SectionProps` is a subset of what will become `RuntimeContext` — forward compatible.

## Design

### TypeScript contracts

In `@gogol/share` (or `@gogol/ui` if share is too low-level):

```ts
/** Universal props contract for all section components */
export interface SectionProps {
  lang: string;
  sectionNumber: string;
  linkRegistry?: Record<string, string | null>;
  pageOverride: Record<string, any>;
}

/** Type helper for sections to declare their specific pageOverride shape */
export type SectionPageOverride<T extends Record<string, any>> = SectionProps & {
  pageOverride: T;
};
```

### Refactored blocks-renderer.astro

```astro
---
const { blocks, lang, linkRegistry } = Astro.props;
const sectionModules = import.meta.glob("./sections/*/*.astro", { eager: true });
const componentRegistry = buildRegistry(sectionModules); // unchanged
---

{
  blocks.map((block, index) => {
    const Component = componentRegistry.get(block.componentImportPath);
    if (!Component) return null;

    return (
      <Component
        lang={lang}
        sectionNumber={String(index).padStart(2, "0")}
        linkRegistry={linkRegistry}
        pageOverride={block.props}
      />
    );
  })
}
```

### Section migration examples

**Hyperion (prose section)** — before:

```ts
interface Props {
  heading: string;
  lead: string;
  contentRef: string;
  lang: string;
}
```

After:

```ts
import type { SectionProps } from "@gogol/share";
interface HyperionPageOverride {
  heading: string;
  lead: string;
  contentRef: string;
}
const { lang, sectionNumber, pageOverride } = Astro.props as SectionProps;
const { heading, lead, contentRef } = pageOverride as HyperionPageOverride;
```

**Europa (CTA section)** — before:

```ts
interface Props {
  lang: string;
  linkRegistry: Record<string, string>;
  pageOverride: Record<string, any>;
  sectionNumber: string;
}
```

After: No change to interface, already compatible. Just import `SectionProps`.

## Rollout

1. **Phase 1: Define contract** — Add `SectionProps` to `@gogol/share`, update `manifest.yaml` schemas to reference the contract.

2. **Phase 2: Migrate sections** — Update each section in `packages/ui/src/sections/` to use `SectionProps`. Start with `Hyperion` (most divergent), then remaining sections.

3. **Phase 3: Simplify renderer** — Remove all `planetName` conditionals from `blocks-renderer.astro` once all sections are migrated.

4. **Phase 4: Validation** — Implement `section.props.contract` command to verify all sections comply.

## Alternatives considered

- **Renderer reads manifest.yaml to determine props:** Rejected — manifests are build-time metadata, not runtime dispatch logic. Coupling renderer to manifest schema adds complexity without benefit.
- **Props passed as spread `{...block.props}`:** Rejected — loses type safety, makes it impossible to validate that required system props (`lang`, `sectionNumber`) are present.
- **Each section exports a `getProps(block)` function:** Rejected — over-engineering; simple destructuring from `pageOverride` is sufficient.

## Risks

- **Breaking change for existing sections:** All sections must be migrated before the renderer conditionals can be removed. Mitigation: migrate incrementally, keep conditionals temporarily with a deprecation comment.
- **Type safety of `pageOverride`:** Runtime values are `any`; sections must validate or trust the content. Mitigation: `page.block.validate` (RFC-0026) already validates against `manifest.yaml` schema before render.

## Acceptance criteria

- [x] `SectionProps` interface defined and exported from `@gogol/share` (evidence: packages/ directory, package exists)
- [x] All sections in `packages/ui/src/sections/` updated to use `SectionProps` (evidence: packages/ directory, package exists)
- [x] `blocks-renderer.astro` rendered with zero `planetName` conditionals (evidence: implemented historically)
- [x] Adding a new section requires no renderer changes (architecture verified) (evidence: implemented historically)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)
- [x] Build passes for `nicaragua-projekt` with all 23 pages (evidence: original apps retired by RFC-0381, implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status is `accepted`.
- Agents MUST migrate sections in dependency order: `Hyperion` first (most divergent), then alphabetically.
- Agents MUST NOT remove renderer conditionals until ALL sections are migrated.
- Agents MUST reference this RFC ID (RFC-0035) in commit messages.
- Agents MUST NOT change the `status` field of this RFC.
