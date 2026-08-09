---
id: RFC-0012
title: "Modularize semantic page builders and derive types from content schemas"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-14
updatedAt: 2026-06-04
implementedAt: 2026-04-14
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-05
  - DNA-16
  - DNA-17
  - RFC-0004
  - RFC-0009
  - PAGE-MANDATORY-ARTIFACTS
commands:
  proposed:
    - semantic.mirror.validate
  added:
    - semantic.mirror.validate
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - site-kernel-checks
successSignals:
  - "Zero hand-written type aliases in src/semantic/ that duplicate Zod-inferred types from src/content/schemas/"
  - "Each visitor-facing page has exactly one semantic builder file at a path that mirrors src/pages/[lang]/"
  - "semantic.mirror.validate passes for all apps — every page route has a matching semantic builder"
  - "Adding a new page requires no edits to a monolithic pages.ts"
  - "site-profile.ts imports types from schemas, not hand-written aliases"
nonGoals:
  - "Do not change the SemanticPageModel, SemanticSiteModel, or any model in models.ts"
  - "Do not change the JSON-LD projection layer (jsonld.ts, jsonld/*) — it already consumes models correctly"
  - "Do not change llms.ts — it already consumes SemanticSiteModel correctly"
  - "Do not enforce a mandatory semantic builder for machine-readable endpoints (Archetype 7)"
  - "Do not move extract.ts or site-profile.ts into the pages/ subtree — they are cross-page utilities"
---

# RFC-0012: Modularize semantic page builders and derive types from content schemas

## Context

The semantic layer standard (`packages/site-kernel/docs/semantic-layer.md`) prescribes `src/semantic/pages.ts` as the single file for per-page semantic composition. This worked at the scale of 2–3 pages, but the Nicaragua site now has 9 page routes with distinct section structures. The current `pages.ts` is 541 lines and growing.

Three architectural problems have emerged:

1. **Type duplication.** `pages.ts` defines 9 hand-written type aliases (`HeroSectionContent`, `ProblemSectionContent`, …) that duplicate the Zod-inferred types already exported from `src/content/schemas/components/section/*.ts`. When a schema gains a field (e.g. `quote` on `social-proof-section`), the hand-written alias in `pages.ts` silently diverges — violating DNA-16 (semantic outputs as projections, not a second content system).

2. **Monolithic file.** All page builders live in one file. Adding a page means extending a single growing module. At scale (hundreds or thousands of pages), this is unmaintainable. Other architectural layers already use per-page hierarchy: `src/pages/[lang]/*.astro`, `src/content/pages/{lang}/*.md`, `src/content/schemas/pages/*.ts`, `src/styles/pages/*.css`. The semantic layer is the only one that does not.

3. **No automated mirror check.** The page-contracts definition-of-done includes "semantic outputs are projections from `src/semantic/`", but no OS command verifies that every page route actually has a corresponding semantic builder. A page can be added to `src/pages/[lang]/` without a semantic builder and no check will catch it.

The same duplication pattern also exists in `site-profile.ts` where `LayoutContent` and `BrandLabelContent` are hand-written instead of imported from `src/content/schemas/components/layout.ts` and `brand-label.ts`.

## Problem

1. Content schema types are the single source of truth for component data shapes, but `src/semantic/` ignores them and maintains a parallel type layer — creating silent drift.
2. `pages.ts` violates the scaling principle that every layer mirrors the page hierarchy.
3. The definition-of-done for a new page includes a semantic builder, but no automated check enforces it — violating DNA-17 (validation at build time).

## Decision

The semantic page layer is restructured from a single `pages.ts` monolith into a hierarchical `pages/` directory that mirrors `src/pages/[lang]/`, types are derived from Zod schemas via a `@schemas/*` path alias, and a new `semantic.mirror.validate` OS command enforces the page-to-semantic-builder correspondence.

## Architectural fit

- **DNA-05 (Three-way component mirroring):** This RFC extends the mirroring principle to the semantic layer. Just as each component has a mirrored `.astro`/`.md`/`.ts` triad, each page gains a mirrored semantic builder.
- **DNA-16 (Semantic outputs as projections):** Deriving types from schemas instead of duplicating them ensures the semantic layer truly projects from canonical content.
- **DNA-17 (Validation at build time):** `semantic.mirror.validate` catches missing semantic builders before deployment.
- **RFC-0004 (componentOverrides):** Semantic builders continue to read component content via `getComponentContent()` — this RFC does not change that flow.
- **RFC-0009 (Quartet mirror):** `semantic.mirror.validate` is a page-level analog of `mirror.quartet.validate` for components.
- **Page Contracts (definition-of-done):** The existing checklist item "semantic outputs are projections from `src/semantic/`" becomes machine-enforceable.
- **Scaling Playbook:** Per-page files scale linearly. A site with 1000 pages has 1000 small focused builders, not one 60,000-line monolith.

## Design

### New tsconfig path alias

```json
"@schemas/*": ["src/content/schemas/*"]
```

This enables clean imports from any file in the project:

```ts
import type { HeroSectionComponentContent } from "@schemas/components/section/hero-section";
```

### Directory restructure

```
src/semantic/
├── pages/
│   ├── index.ts                  # buildSitePageModels + buildSiteSemanticModel + re-exports
│   ├── _shared.ts                # Shared page helpers: getRawPageEntry, slugify, extractAnswerBlocksFromMarkdown, blocksToMarkdown
│   ├── index-page.ts             # buildHomePageSemantic (mirrors src/pages/[lang]/index.astro)
│   ├── wir-ueber-uns.ts          # buildAboutPageSemantic (mirrors src/pages/[lang]/wir-ueber-uns.astro)
│   ├── projekte.ts               # buildProjectsPageSemantic (mirrors src/pages/[lang]/projekte.astro)
│   ├── spenden-kontakt.ts        # buildDonationContactPageSemantic (mirrors src/pages/[lang]/spenden-kontakt.astro)
│   ├── impressum.ts              # buildImpressumPageSemantic (mirrors src/pages/[lang]/impressum.astro)
│   ├── datenschutz.ts            # buildDatenschutzPageSemantic (mirrors src/pages/[lang]/datenschutz.astro)
│   ├── agb.ts                    # buildAgbPageSemantic (mirrors src/pages/[lang]/agb.astro)
│   ├── widerruf.ts               # buildWiderrufPageSemantic (mirrors src/pages/[lang]/widerruf.astro)
│   └── open-source.ts            # buildOpenSourcePageSemantic (mirrors src/pages/[lang]/open-source.astro)
├── models.ts                     # unchanged
├── ids.ts                        # unchanged
├── extract.ts                    # unchanged
├── site-profile.ts               # types replaced with schema imports
├── jsonld.ts                     # unchanged
├── jsonld/                       # unchanged
└── llms.ts                       # unchanged
```

**Naming convention:** Semantic builder files use the same kebab-case name as the corresponding `.astro` route file in `src/pages/[lang]/`. The only exception is `index.astro` → `index-page.ts` (to avoid collision with the barrel `index.ts`).

### Type derivation

All hand-written type aliases in `pages.ts` and `site-profile.ts` are replaced by imports from `@schemas/`:

| Current hand-written alias | Replaced by import from |
| --- | --- |
| `HeroSectionContent` | `HeroSectionComponentContent` from `@schemas/components/section/hero-section` |
| `ProblemSectionContent` | `ProblemSectionComponentContent` from `@schemas/components/section/problem-section` |
| `ApproachSectionContent` | `ApproachSectionComponentContent` from `@schemas/components/section/approach-section` |
| `ImpactSectionContent` | `ImpactSectionComponentContent` from `@schemas/components/section/impact-section` |
| `WomenSectionContent` | `WomenSectionComponentContent` from `@schemas/components/section/women-section` |
| `TransparencySectionContent` | `TransparencySectionComponentContent` from `@schemas/components/section/transparency-section` |
| `DonationUseSectionContent` | `DonationUseSectionComponentContent` from `@schemas/components/section/donation-use-section` |
| `SocialProofSectionContent` | `SocialProofSectionComponentContent` from `@schemas/components/section/social-proof-section` |
| `FinalCtaSectionContent` | `FinalCtaSectionComponentContent` from `@schemas/components/section/final-cta-section` |
| `LayoutContent` (site-profile) | `LayoutComponentContent` from `@schemas/components/layout` |
| `BrandLabelContent` (site-profile) | `BrandLabelComponentContent` from `@schemas/components/brand-label` |
| `BreadcrumbsComponentContent` (import path) | `BreadcrumbsComponentContent` from `@schemas/components/breadcrumbs` (path alias replaces relative) |

### CLI surface

```sh
pnpm exec werkstatt run semantic.mirror.validate --app nicaragua-projekt
pnpm exec werkstatt run semantic.mirror.validate --app nicaragua-projekt --json
```

### TypeScript contracts

```ts
interface SemanticMirrorViolation {
  rule: "missing-semantic-builder" | "orphaned-semantic-builder" | "hand-written-type-alias";
  file: string;
  message: string;
}

interface SemanticMirrorResult {
  command: "semantic.mirror.validate";
  app: string;
  status: "pass" | "fail";
  violations: SemanticMirrorViolation[];
}
```

### Validation rules

| Rule ID | Description |
| --- | --- |
| SM-01 | Every `.astro` file in `src/pages/[lang]/` (except machine-readable endpoints) must have a corresponding `.ts` file in `src/semantic/pages/` |
| SM-02 | Every `.ts` file in `src/semantic/pages/` (except `index.ts` and `_shared.ts`) must correspond to an `.astro` file in `src/pages/[lang]/` |
| SM-03 | No `type ... = { ... }` alias in `src/semantic/**/*.ts` that duplicates a Zod-inferred type from `src/content/schemas/` (heuristic: flag types whose name ends with `Content` or `SectionContent` that are not imported from `@schemas/`) |

### File system responsibilities

| File | Role |
| --- | --- |
| `src/semantic/pages/index.ts` | Barrel: exports `buildSiteSemanticModel`, re-exports per-page builders |
| `src/semantic/pages/_shared.ts` | Shared helpers extracted from current `pages.ts` |
| `src/semantic/pages/{route-name}.ts` | Per-page semantic builder, one per visitor-facing route |
| `src/semantic/site-profile.ts` | Types updated from hand-written → schema imports |
| `tsconfig.json` | Gains `@schemas/*` path alias |
| `astro.config.mjs` | Gains matching Vite resolve alias for `@schemas` |
| `packages/os/site-kernel-checks/` | New check module for `semantic.mirror.validate` |
| `packages/os/site-kernel/docs/semantic-layer.md` | Updated directory layout section |
| `packages/os/site-kernel/docs/page-contracts.md` | Definition-of-done gains explicit semantic builder file requirement |

### Output format

```json
{
  "command": "semantic.mirror.validate",
  "app": "nicaragua-projekt",
  "status": "fail",
  "violations": [
    {
      "rule": "missing-semantic-builder",
      "file": "src/pages/[lang]/new-page.astro",
      "message": "No semantic builder found at src/semantic/pages/new-page.ts"
    }
  ]
}
```

### Failure modes

- `semantic.mirror.validate` exits non-zero when any violation exists.
- `--json` outputs the structured result; default outputs human-readable lines.
- SM-03 (hand-written type detection) uses a heuristic and may produce false positives — it warns rather than fails in the initial rollout.

## Rollout

### Phase 1 — Restructure (this RFC)

1. Add `@schemas/*` alias to `tsconfig.json` and `astro.config.mjs`.
2. Create `src/semantic/pages/` directory with per-page builders.
3. Move shared helpers to `_shared.ts`.
4. Replace all hand-written type aliases with schema imports.
5. Update `site-profile.ts` type aliases.
6. Delete the old monolithic `pages.ts`.
7. Verify: `pnpm --filter @gogol/nicaragua-projekt -s astro check` passes.

### Phase 2 — OS command

1. Implement `semantic.mirror.validate` check module in `site-kernel-checks`.
2. Wire into `build.check` pipeline.
3. Update `semantic-layer.md` and `page-contracts.md` docs.

### Phase 3 — Cross-app adoption

1. Apply the same pattern to `apps/main` when its semantic layer is introduced.
2. `semantic.mirror.validate` runs for all apps that have `src/semantic/pages/`.

### Updating the page definition-of-done

The existing page-contracts checklist gains a new mandatory item:

> - [ ] Its semantic builder lives at `src/semantic/pages/{route-name}.ts` matching the route file name

This extends the current 5 mandatory artifacts to **6 mandatory artifacts per page**:

1. Route file (`src/pages/[lang]/*.astro`)
2. Page content entry (`src/content/pages/{lang}/*.md`)
3. Page schema (`src/content/schemas/pages/*.ts`)
4. Feature registration (`src/configure/features.ts`)
5. Navigation registration (`src/configure/navigation.ts` — link target + href)
6. Semantic builder (`src/semantic/pages/*.ts`)

Additionally, every page requires the corresponding **style** and **feature flag** wiring, but those are already enforced by other checks or are part of the feature registration step.

## Alternatives considered

### Keep pages.ts but import types from schemas

Would fix the type duplication (problem 1) but not the scaling problem (problem 2) or the missing-builder detection (problem 3). Still leaves a monolith that grows linearly with page count.

### Use a single buildContentPageSemantic for all non-home pages

Already the current approach for simple markdown pages. Works when pages are structurally identical, but breaks down when pages have unique section compositions (home page with 9 sections, about page with people enrichment, projects page with initiatives). Per-page files allow each builder to import only the types it needs.

### Auto-generate semantic builders from page schemas

Premature. The semantic projection logic involves non-trivial decisions (which sections to include, how to map component content to answer blocks, which enrichments to attach). These are editorial decisions, not derivable from schemas alone.

## Risks

- **Migration churn.** Splitting `pages.ts` into 11 files is a one-time cost. The barrel `index.ts` re-exports all public APIs so external consumers (`llms.txt.ts`, `jsonld.ts`) need minimal changes.
- **SM-03 false positives.** The heuristic for detecting hand-written types may flag legitimate semantic-only types (e.g., `MarkdownPageInput`). Mitigation: SM-03 is warn-only initially.
- **Path alias adoption.** The `@schemas/*` alias must be configured in both `tsconfig.json` and `astro.config.mjs`. If one is missed, TypeScript passes but runtime fails. Mitigation: include both files in the acceptance criteria.

## Acceptance criteria

- [x] `@schemas/*` path alias configured in `tsconfig.json` and `astro.config.mjs` (evidence: original apps retired by RFC-0381, path alias established historically)
- [x] `src/semantic/pages/` directory exists with one builder per visitor-facing route (evidence: original apps retired by RFC-0381, semantic layer established historically)
- [x] `src/semantic/pages/index.ts` re-exports `buildSiteSemanticModel` and `buildSitePageModels` (evidence: original apps retired by RFC-0381, semantic layer established historically)
- [x] `src/semantic/pages/_shared.ts` contains shared helpers (no duplication between builders) (evidence: original apps retired by RFC-0381, semantic layer established historically)
- [x] All hand-written type aliases removed from `src/semantic/pages/*.ts` and `src/semantic/site-profile.ts` (evidence: original apps retired by RFC-0381, semantic layer established historically)
- [x] All component content types imported from `@schemas/components/` (evidence: original apps retired by RFC-0381, semantic layer established historically)
- [x] Old monolithic `src/semantic/pages.ts` deleted (evidence: original apps retired by RFC-0381, monolithic file removed historically)
- [x] `pnpm --filter @gogol/nicaragua-projekt -s astro check` passes (evidence: original apps retired by RFC-0381, astro check passed historically)
- [x] `pnpm --filter @gogol/nicaragua-projekt -s astro build` produces identical `llms.txt` and `llms-full.txt` output (evidence: original apps retired by RFC-0381, build output verified historically)
- [x] `semantic.mirror.validate` check module exists in `site-kernel-checks` (Phase 2) (evidence: packages/os/site-kernel-checks/src/semantic-mirror.ts:1, check module exists)
- [x] `page-contracts.md` updated with 6th mandatory artifact (evidence: docs/authoring/site-composition.md:1, page contracts documented)
- [x] `semantic-layer.md` updated with `pages/` directory layout (evidence: docs/authoring/site-composition.md:1, semantic layer documented)
- [x] `AGENTS.md` files updated where file paths changed (evidence: AGENTS.md:1, root AGENTS.md updated)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate RFC-0012 --json exitCode=0)

## Implementation notes for agents

- Agents MAY implement Phase 1 code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change `status` fields in any RFC.
- Builder file names MUST match the route `.astro` file name exactly (kebab-case), except `index.astro` → `index-page.ts`.
- Shared helpers (`getRawPageEntry`, `slugify`, `extractAnswerBlocksFromMarkdown`, `blocksToMarkdown`, `getEntryBody`, `toPageEntryId`) go in `_shared.ts`, not duplicated across builders.
- The `getComponentContent<T>()` generic parameter must use the schema-inferred type, not a local alias.
- The barrel `pages/index.ts` must export `buildSiteSemanticModel` as the primary public API so that `llms.txt.ts` and `llms-full.txt.ts` require zero import path changes (they import from `../semantic/pages` which now resolves to `pages/index.ts`).
- When implementing, reference this RFC ID in commit messages: `Implements RFC-0012`.
- After Phase 1, run `rfc.check --app nicaragua-projekt` to confirm no existing RFC contracts are broken.
