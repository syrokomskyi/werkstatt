---
id: RFC-0042
title: "Semantic content from page blocks with explicit NEED-THIS markers — remove stub content drift"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-05
updatedAt: 2026-07-06
implementedAt: 2026-05-05
closedAt:
supersedes: []
supersededBy:
amendedBy:
  - RFC-0328
related:
  - DNA-16
  - DNA-24
  - DNA-25
  - RFC-0012
  - RFC-0026
commands:
  proposed:
    - semantic.page.validate
    - content.drift.detect
  added: []
  changed:
    - semantic.mirror.validate
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - share
  - site-kernel-checks
successSignals:
  - "Zero md stub files in src/content/components/{lang}/section/ — only explicit markers in schemas"
  - "Semantic builders read from ResolvedBlock[].props, not from getComponentContent()"
  - "Missing content fields render as NEED_THIS_FIELD_NAME in dev, fail build in production"
  - "llms.txt and JSON-LD reflect actual page content, not placeholder stubs"
  - "Site owners see explicit field requirements instead of hidden stub defaults"
nonGoals:
  - "Do not change block-declarative page shape (RFC-0026) — blocks[].props remains the source"
  - "Do not reintroduce componentOverrides (RFC-0004) — this RFC supersedes that pattern"
  - "Do not support runtime stub merging — strict explicit-content-only model"
  - "Do not keep backward compatibility with stub-based semantic builders"
---

# RFC-0042: Semantic content from page blocks with explicit NEED-THIS markers — remove stub content drift

## Context

RFC-0026 established **block-declarative pages**: every `src/content/pages/<lang>/<slug>.md` contains a `blocks[]` array where each block has `use: PlanetName` and `props: {...}`. The `buildPage(entry, ctx)` pipeline validates these props against manifest schemas and returns `ResolvedBlock[]` with the actual content that renders on the page.

RFC-0012 created per-page **semantic builders** in `src/semantic/pages/` that generate `llms.txt`, JSON-LD, and SEO metadata. However, these builders currently call `getComponentContent("section/*-section", lang)` which reads from **stub files** at `src/content/components/{lang}/section/*-section.md`.

This creates a **two-source problem**: the rendered page uses `blocks[].props` from the page entry, while semantic outputs use stubs from component content files. When these drift (as they currently do — e.g., `"11 betreute Dörfer"` vs `"Kennzahl A"`), `llms.txt` and search engines see placeholder content instead of real content. This violates DNA-16 (semantic outputs as projections, not a second content system).

## Problem

1. **Content drift is invisible.** Site owners edit `pages/de/index.md` and see correct rendering, but `llms.txt` contains stale stub data. No validation catches this.

2. **Stub files add cognitive load.** Site owners must understand two content layers: `pages/` for rendering, `components/{lang}/section/` for defaults. The stubs are rarely edited and become dead weight.

3. **Semantic builders duplicate resolution logic.** They re-implement `getComponentContent()` + deep merge instead of consuming `ResolvedBlock[]` from `buildPage()`.

4. **No explicit signal for missing content.** When a field is omitted in `blocks[].props`, the stub provides a silent fallback. Site owners don't know they missed a field until they see wrong output in production.

## Decision

Semantic builders read content from `ResolvedBlock[].props` (the output of `buildPage()`), not from stub files. Stub files in `src/content/components/{lang}/section/` are removed entirely.

For required fields not present in `blocks[].props`, the system renders explicit markers: `NEED_THIS_HEADING`, `NEED_THIS_TAGLINE`, etc. These markers:

- **In development:** appear in rendered output as visible uppercase placeholders
- **In production build:** fail the build with clear field-level error messages

This makes content requirements **explicit and strict** — site owners see exactly which fields they must provide, and there's no hidden fallback layer creating drift.

## Architectural fit

- **DNA-16 (Semantic outputs as projections):** Semantic layer now reads from the same `ResolvedBlock[]` that renders the page — single source of truth, true projection.
- **DNA-24 (Block-declarative pages):** Reinforces that `blocks[].props` is the canonical content container.
- **DNA-25 (buildPage pipeline):** Semantic builders consume `buildPage()` output instead of bypassing it.
- **RFC-0026:** Extends the block-declarative contract — `buildPage()` becomes the universal content resolver for both rendering and semantics.
- **RFC-0012:** Semantic builders remain per-page files, but their implementation changes from `getComponentContent()` to `buildPage(entry, ctx)`.

## Design

### Content resolution change

Current pattern (RFC-0012):

```ts
// src/semantic/pages/home.ts — CURRENT
const hero = await getComponentContent<HeroSectionComponentContent>(
  "section/hero-section",
  input.lang,
);
```

New pattern (this RFC):

```ts
// src/semantic/pages/home.ts — NEW
import { buildPage, EMPTY_RUNTIME_CONTEXT } from "@gogol/share";
import { getPageEntry } from "@utils/content-collections";

const entry = await getPageEntry(input.lang, "index");
const ctx = EMPTY_RUNTIME_CONTEXT(input.lang);
const resolved = await buildPage(entry.data, ctx);

// Find hero block in resolved.blocks
const heroBlock = resolved.blocks.find(b => b.id === "hero");
const heroProps = heroBlock?.props as HeroSectionComponentContent | undefined;
```

### Explicit marker system

In section components, when a required string field is missing or empty:

```ts
// In section component or semantic builder
const heading = props.heading ?? "NEED_THIS_HEADING";
```

Build validation catches these markers:

```sh
pnpm exec site-kernel run semantic.page.validate --app nicaragua-projekt
# Error: pages/de/index.md blocks[0].props.heading is missing or empty
```

### Image path convention

**Image paths are relative to `/src/content/pages/de/projects/assets/` (language-independent).**

In page entries, specify image paths as short filenames:

```yaml
blocks:
  - id: women
    use: Iapetus
    props:
      image: "women-focus.jpg"  # Short path, not "/src/content/pages/de/projects/assets/women-focus.jpg"
```

Section components automatically prepend the full path for `import.meta.glob` lookup:

```ts
const imagePath = props.image.startsWith("/")
  ? props.image  // Allow absolute paths for edge cases
  : `/src/content/pages/de/projects/assets/${props.image}`;
```

**Rationale:**

- Images are shared across languages — no need for per-language asset duplication
- Reduces repetition in page entries
- Centralizes asset path configuration
- Makes content more readable
- No backward compatibility required — convention applies to all new content

### File system changes

| Path | Current | New |
| --- | --- | --- |
| `src/content/components/{lang}/section/*.md` | Stub files with defaults | **Deleted** |
| `src/content/components/{lang}/header-component.md` | Site-wide component content | **Kept** (shell components) |
| `src/content/components/{lang}/footer-component.md` | Site-wide component content | **Kept** (shell components) |
| `src/semantic/pages/*.ts` | Uses `getComponentContent()` | Uses `buildPage()` + `ResolvedBlock[].props` |

### CLI surface

```sh
# Validate that semantic content matches page content (no drift)
pnpm exec site-kernel run semantic.page.validate --app nicaragua-projekt

# Detect content drift between pages and any remaining stubs
pnpm exec site-kernel run content.drift.detect --app nicaragua-projekt
```

### TypeScript contracts

```ts
// @gogol/share/src/page.ts — extends ResolvedBlock
export interface ResolvedBlock {
  readonly id: string | null;
  readonly planetName: PlanetName;
  readonly componentImportPath: string;
  readonly props: Record<string, unknown>;
  readonly visibility: VisibilityExpr | null;
  // NEW: explicit marker detection
  readonly hasExplicitMarkers: boolean; // true if any NEED_THIS_* found
}

// Semantic builder input
export interface SemanticPageInput {
  lang: string;
  url: URL | string;
  // REMOVED: title, description — read from resolved page entry
}
```

### Output format

```json
{
  "command": "semantic.page.validate",
  "app": "nicaragua-projekt",
  "status": "fail",
  "violations": [
    {
      "file": "src/content/pages/de/index.md",
      "block": "hero",
      "field": "heading",
      "rule": "missing-required-content",
      "message": "blocks[0].props.heading is required but missing. Use explicit content or mark block visibility: disabled."
    },
    {
      "file": "src/content/pages/de/index.md",
      "block": "impact",
      "field": "stats[0].label",
      "rule": "explicit-marker-detected",
      "message": "Value 'NEED_THIS_STAT_LABEL' is an explicit placeholder. Provide real content."
    }
  ]
}
```

### Failure modes

- **Development:** `NEED_THIS_*` markers render visibly in sections and semantic outputs. Build succeeds but warnings are shown.
- **Production build (`astro build`):** `semantic.page.validate` runs as part of `build.check`. Any `NEED_THIS_*` markers or missing required fields fail the build.
- **Migration:** Existing stub content is either promoted to `blocks[].props` in page files, or deleted if unused.

## Rollout

### Phase 1 — RFC acceptance

RFC status changes to `accepted` (human-only transition).

### Phase 2 — Remove stubs and migrate content

1. For each `src/content/components/{lang}/section/*-section.md`:
   - Copy any non-placeholder content to corresponding `pages/{lang}/*.md` `blocks[].props`
   - Delete stub file
2. Update `src/semantic/pages/home.ts` to use `buildPage()` instead of `getComponentContent()`
3. Add `NEED_THIS_*` marker support to section components
4. Verify `llms.txt` output matches real page content

### Phase 3 — Validation commands

1. Implement `semantic.page.validate` in `site-kernel-checks`
2. Wire into `build.check` pipeline
3. Update `semantic.mirror.validate` to verify semantic builders use `buildPage()` pattern

### Phase 4 — Documentation

1. Update `docs/authoring/block-declarative-pages.md` with explicit marker convention
2. Update `apps/nicaragua-projekt/AGENTS.md` semantic layer section
3. Remove stub-authoring documentation

## Alternatives considered

1. **Keep stubs as optional defaults.** Rejected — creates permanent two-source problem. Drift is inevitable; explicit markers are cleaner.

2. **Auto-promote stub content to page entries.** Rejected — mixes migration with architecture. Manual promotion ensures site owners review and own their content.

3. **Schema-level required field validation only.** Rejected — doesn't help site owners understand _which_ fields are missing. `NEED_THIS_*` markers provide visual feedback.

4. **Type-level strictness (TypeScript errors for missing props).** Rejected — content is runtime data, not compile-time. Need runtime validation that produces clear messages for content authors.

## Risks

- **Content migration effort.** Every stub file must be reviewed and either promoted or deleted. Mitigated by doing this in dedicated Phase 2 with human review.

- **Site owners unfamiliar with explicit markers.** Initial confusion seeing `NEED_THIS_HEADING` in dev. Mitigated by clear documentation and immediate build-time error messages explaining exactly which field to fill.

- **Section components with many optional fields.** Some fields are truly optional; over-using `NEED_THIS_*` creates noise. Mitigated by schema annotation: `requiredForSemantic: true` distinguishes fields that must have real content.

- **Breaking change for existing semantic consumers.** `llms.txt` content will change (become accurate). This is the intended fix, not a bug.

## Acceptance criteria

- [x] All `src/content/components/{lang}/section/*.md` stub files deleted (evidence: implemented historically)
- [x] `src/semantic/pages/home.ts` uses `buildPage()` + `ResolvedBlock[].props`, not `getComponentContent()` (evidence: implemented historically)
- [x] `NEED_THIS_*` marker system implemented in section components (evidence: implemented historically)
- [x] `semantic.page.validate` command exists and catches missing content (evidence: implemented historically)
- [x] `llms.txt` output matches actual page content (no drift) (evidence: implemented historically)
- [x] Build fails if any `NEED_THIS_*` markers present in production build (evidence: implemented historically)
- [x] Dev mode shows visible markers and warnings (not silent fallbacks) (evidence: implemented historically)
- [x] `apps/nicaragua-projekt/AGENTS.md` updated with new semantic builder pattern (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change `status` fields in any RFC.
- When implementing Phase 2, agents MUST reference this RFC ID in commit messages: `Implements RFC-0042`.
- Agents MUST delete stub files — do not leave empty files or comments.
- Agents MUST update semantic builders to use `buildPage()` pattern; do not keep `getComponentContent()` calls for section content.
- Agents MUST ensure `NEED_THIS_*` markers use uppercase with underscores for visibility.
- Agents MUST update section component types to distinguish `required` vs `requiredForSemantic` fields.
