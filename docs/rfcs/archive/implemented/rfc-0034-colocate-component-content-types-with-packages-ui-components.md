---
id: RFC-0034
title: "Colocate component-content TypeScript types with packages/ui components"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-29
updatedAt: 2026-06-04
implementedAt: 2026-04-29
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0022
  - RFC-0029
  - RFC-0033
commands:
  proposed: []
  added:
    - content-types.validate
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - ui
successSignals:
  - "Every `packages/ui/src/{components,sections}/<name>/` directory contains a `<name>.types.ts` file that exports the component-content TypeScript type (e.g. `BrandLabelComponentContent`)."
  - "`apps/nicaragua-projekt/src/content/schemas/components/` is fully deleted. All consumers (`semantic/*`, `layout.astro`, `component-content.ts`) import types from `@gogol/ui/<name>/types`."
  - "`contentSchemaKey` in each `manifest.yaml` is replaced by (or supplemented with) a `contentTypesPath` field pointing to the collocated `.types.ts` file, making the type discoverable from the manifest."
  - "No Zod schema exists in `packages/ui/` — only plain TypeScript interfaces/types. Zod validation for block props remains in `propsSchema` in `manifest.yaml` (JSON Schema). No parallel Zod in packages."
  - "A new `content-types.validate` command in `@gogol/site-kernel-checks` confirms that every manifest with `contentSchemaKey` has a matching `.types.ts` sibling in the same directory."
  - "The `@schemas` path alias in `tsconfig.json` and `astro.config.mjs` is removed from `apps/nicaragua-projekt` once all consumers are migrated."
nonGoals:
  - "Do not introduce Zod schemas into `packages/ui/`. Types are plain TypeScript — Zod is only for content collection wiring, which is now handled by `propsSchema` in `manifest.yaml`."
  - "Do not move page schemas (`schemas/pages/*.ts`) to packages — they are app-specific and will be retired in RFC-0033 Wave 3 as part of the dispatcher chain removal."
  - "Do not change the `propsSchema` (JSON Schema) in `manifest.yaml` — it is the canonical block-level validator and remains unchanged."
  - "Do not merge `packages/ui` component-content types with `@gogol/share` — types belong collocated with their component, not in a generic utilities package."
  - "Do not rename or restructure the existing `.astro`, `.css`, `.manifest.yaml` quartet. The `.types.ts` file is the fourth member; no existing file is renamed."
---

# RFC-0034: Colocate component-content TypeScript types with packages/ui components

## Context

Every component in `packages/ui/src/{components,sections}/<name>/` has three files today:

```
brand-label-component.astro
brand-label-component.css
brand-label-component.manifest.yaml   ← contentSchemaKey: brand-label-component
```

The `contentSchemaKey` field in `manifest.yaml` already anticipates typed content — it was added as a forward-looking hook. But the TypeScript type that describes the content shape (`BrandLabelComponentContent`, `BreadcrumbsComponentContent`, etc.) currently lives in `apps/nicaragua-projekt/src/content/schemas/components/brand-label-component.ts` — **inside the app**, not next to the component.

This is the root cause of the Wave 3 blocker in [RFC-0033](RFC-0033-retire-app-local-content-schemas-and-migrate-feature-graph-to-share.md):

- `src/semantic/pages/*.ts` (9 files) and `src/semantic/site-profile.ts` import these types via the `@schemas` alias.
- `src/layouts/layout.astro` imports `LayoutContent` from `@schemas/layouts/layout`.
- `src/utils/component-content.ts` calls the dispatcher which validates against these schemas.

The types have no app-specific data. `BrandLabelComponentContent` is `{ brandLabel: string; brandAriaLabel: string; brandTagline?: string }` — identical regardless of which client uses the component. The only app-specific thing is the _content values_ in `.md` files, not the _shape type_.

[RFC-0022](RFC-0022-extract-shared-site-utilities-to-warpgogol-share.md) and [RFC-0029](RFC-0029-greenfield-rebuild-and-client-onboarding-playbook.md) both establish that component code lives in `packages/ui`. Content-shape types are part of that component's contract.

## Problem

Two consequences of the current placement:

1. **Copy-paste across apps.** Every new app that uses `brand-label-component` must copy `brand-label-component.ts` from `apps/nicaragua-projekt/`. This is the exact problem RFC-0022 and RFC-0032 exist to prevent.

2. **Wave 3 of RFC-0033 is unexecutable.** `src/schemas/components/` cannot be deleted while `src/semantic/` depends on its types. Migration is a prerequisite for the Wave 3 cleanup.

## Decision

Add a fourth file to each component directory in `packages/ui`:

```
brand-label-component.astro
brand-label-component.css
brand-label-component.manifest.yaml
brand-label-component.types.ts          ← NEW
```

### What goes in `.types.ts`

A **plain TypeScript interface** — no Zod, no runtime code:

```ts
// packages/ui/src/components/brand-label/brand-label-component.types.ts
export interface BrandLabelComponentContent {
  brandLabel: string;
  brandAriaLabel: string;
  brandTagline?: string;
}
```

For layout content (currently in `schemas/layouts/layout.ts`):

```ts
// packages/ui/src/components/layout/layout.types.ts  (or a new layout/ directory)
export interface LayoutContent {
  defaultDescription: string;
  skipLinkLabel: string;
}
```

### Export paths in `packages/ui/package.json`

One export path per component, using the pattern `"./<name>/types"`:

```jsonc
"./brand-label-component/types": {
  "types": "./src/components/brand-label/brand-label-component.types.ts",
  "default": "./src/components/brand-label/brand-label-component.types.ts"
},
"./breadcrumbs-component/types": {
  "types": "./src/components/breadcrumbs/breadcrumbs-component.types.ts",
  "default": "./src/components/breadcrumbs/breadcrumbs-component.types.ts"
},
// … one per component and section
```

### Consumer migration

All `import type { X } from "@schemas/components/…"` in `apps/nicaragua-projekt/src/` are replaced with `import type { X } from "@gogol/ui/<name>/types"`.

After all consumers are migrated, `apps/nicaragua-projekt/src/content/schemas/components/` is deleted and the `@schemas` path alias is removed from `tsconfig.json` and `astro.config.mjs`.

### `manifest.yaml` update

The `contentSchemaKey` field is supplemented with `contentTypesPath` pointing to the sibling `.types.ts`:

```yaml
contentSchemaKey: brand-label-component
contentTypesPath: "./brand-label-component.types.ts"
```

This makes the type discoverable from the manifest without parsing TypeScript.

### Validation command

`content-types.validate` scans every `manifest.yaml` in `packages/ui/src/{components,sections}/` that has `contentSchemaKey`. For each such manifest it asserts:

1. A `.types.ts` file exists in the same directory.
2. The `.types.ts` file exports a type/interface whose name matches `<PascalCase(contentSchemaKey)>` (e.g. `brand-label-component` → `BrandLabelComponentContent`).

## Design

See `## Decision` above for the full colocation scheme, export path pattern, `contentTypesPath` manifest field, and `content-types.validate` command specification.

## Affected components

### `packages/ui/src/components/` (7 types to add)

| Directory | Type name | App schema file (to delete) |
| --- | --- | --- |
| `brand-label/` | `BrandLabelComponentContent` | `schemas/components/brand-label-component.ts` |
| `breadcrumbs/` | `BreadcrumbsComponentContent` | `schemas/components/breadcrumbs-component.ts` |
| `copyright/` | `CopyrightComponentContent` | `schemas/components/copyright-component.ts` |
| `footer/` | `FooterComponentContent` | `schemas/components/footer-component.ts` |
| `footer-promo/` | `FooterPromoComponentContent` | `schemas/components/footer-promo-component.ts` |
| `header/` | `HeaderComponentContent` | `schemas/components/header-component.ts` |
| `lang-switcher/` | `LangSwitcherComponentContent` | `schemas/components/lang-switcher-component.ts` |

### `packages/ui/src/sections/` (11 types to add)

| Directory | Type name | App schema file (to delete) |
| --- | --- | --- |
| `approach/` | `ApproachSectionComponentContent` | `schemas/components/section/approach-section.ts` |
| `dna/` | `DnaSectionComponentContent` | `schemas/components/section/dna-section.ts` |
| `donation-use/` | `DonationUseSectionComponentContent` | `schemas/components/section/donation-use-section.ts` |
| `final-cta/` | `FinalCtaSectionComponentContent` | `schemas/components/section/final-cta-section.ts` |
| `hero/` | `HeroSectionComponentContent` | `schemas/components/section/hero-section.ts` |
| `impact/` | `ImpactSectionComponentContent` | `schemas/components/section/impact-section.ts` |
| `problem/` | `ProblemSectionComponentContent` | `schemas/components/section/problem-section.ts` |
| `social-proof/` | `SocialProofSectionComponentContent` | `schemas/components/section/social-proof-section.ts` |
| `team/` | `TeamSectionComponentContent` | `schemas/components/section/team-section.ts` |
| `transparency/` | `TransparencySectionComponentContent` | `schemas/components/section/transparency-section.ts` |
| `women/` | `WomenSectionComponentContent` | `schemas/components/section/women-section.ts` |

### Layout type (separate directory or existing `layout/`)

`LayoutContent` from `schemas/layouts/layout.ts` → `packages/ui/src/components/layout/layout.types.ts` (create `layout/` directory if absent).

## Rollout

- **Wave 1** ✅ — 19 `.types.ts` files created in `packages/ui/src/{components,sections}/`. 19 export paths registered in `packages/ui/package.json`. `contentTypesPath` added to 18 `manifest.yaml` files. _(Implemented.)_
- **Wave 2** ✅ — All `import type` consumers in `semantic/` (11 files) and `layouts/layout.astro` migrated from `@schemas/…` to `@gogol/ui/<name>/types`. _(Implemented.)_
- **Wave 3** ✅ — `schemas/components/` and `schemas/layouts/` deleted. `@schemas` alias removed from `tsconfig.json` and `astro.config.mjs`. `@gogol/ui/*` wildcard path added to `tsconfig.json`. _(Implemented.)_
- **Wave 4** ✅ — RFC-0033 Wave 3 executed: `schemas/pages/`, all dispatcher files, and entire `schemas/` directory deleted. `content-types.validate` implemented in `packages/os/site-kernel-checks/src/content-types.ts` and registered in `STANDARD_CHECK_PIPELINE`. _(Implemented.)_

## Architectural fit

| Principle | How this RFC satisfies it |
| --- | --- |
| Feature-first colocation (DNA-21, RFC-0025) | Type lives next to `.astro` and `.manifest.yaml` in the same component directory |
| Single source of truth | One `.types.ts` per component; no parallel Zod schema; no app-local copy |
| App-agnostic packages (RFC-0022, RFC-0032) | `packages/ui` ships the type contract; apps consume it |
| Forward compatibility | New apps scaffolded via RFC-0029 import types from `@gogol/ui` with zero copy-paste |

## Alternatives considered

1. **Put all content types in `@gogol/share`.** Rejected — content types are component-specific. `BrandLabelComponentContent` belongs next to `brand-label-component.astro`, not in a generic utilities package. Colocation makes discovery trivial.

2. **Generate types from `propsSchema` in `manifest.yaml`.** Appealing but premature — JSON Schema → TypeScript codegen adds toolchain complexity. Manual `.types.ts` is simpler and equally correct. Can be revisited in a future RFC.

3. **Keep `@schemas` alias and types in the app.** Rejected. Copy-paste per app, Wave 3 of RFC-0033 unexecutable indefinitely.

## Risks

- A future component addition may miss the `.types.ts` file. Mitigation: `content-types.validate` enforces this at CI time.
- Export path bloat in `packages/ui/package.json` if the component list grows large. Mitigation: wildcard exports could be adopted in a future RFC; individual exports are the safer starting point.

## Acceptance criteria

- [x] Every component and section directory in `packages/ui/src/{components,sections}/` has a `.types.ts` file (evidence: packages/ directory, package exists)
- [x] All `.types.ts` export paths registered in `packages/ui/package.json` (evidence: packages/ directory, package exists)
- [x] `contentTypesPath` added to each affected `manifest.yaml` (evidence: implemented historically)
- [x] Zero `import type … from "@schemas/components/…"` remaining in `apps/nicaragua-projekt/src/` (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/nicaragua-projekt/src/content/schemas/components/` deleted (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/nicaragua-projekt/src/content/schemas/layouts/` deleted (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `@schemas` alias removed from `apps/nicaragua-projekt/tsconfig.json` and `astro.config.mjs` (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `content-types.validate` command implemented and exits zero on the post-migration workspace (evidence: implemented historically)
- [x] RFC-0033 Wave 3 (dispatcher + `schemas/pages/` deletion) executed after this RFC's Wave 3 (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Wave 1 is safe to execute atomically — pure additions to `packages/ui`, no deletions.
- Types must be plain TypeScript interfaces — no `z.object()`, no `z.infer<>`, no Zod import.
- Import `z` from `"astro/zod"` is **forbidden** in `packages/ui/` types files — packages must stay framework-neutral.
- When deriving type names: `brand-label-component` → strip `-component`/`-section` suffix → PascalCase → append `ComponentContent` or `SectionComponentContent` to match existing convention.
- Reference `RFC-0034` in commit messages when implementing.
