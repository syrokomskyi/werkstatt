---
id: RFC-0244
title: "Hierarchical demand records with path-derived slugs for multi-axis pSEO datasets"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-25
updatedAt: 2026-06-25
implementedAt: 2026-06-25
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0238
amendedBy: []
related:
  - RFC-0238
  - RFC-0237
  - RFC-0193
  - RFC-0199
commands:
  proposed:
    - demands.hierarchy.validate
  added:
    - demands.hierarchy.validate
  changed:
    - surface.generate
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - os/site-kernel-checks
successSignals:
  - demand records live in nested folders that mirror the five-axis cascade
  - slug collisions are impossible because the path encodes axis values
  - authors can navigate demands by industry / city / topic without search
  - backward compatibility: flat-folder records continue to work with no migration
nonGoals:
  - changing URL structure (demand slug is still the leaf segment in the path)
  - adding new axes to the blueprint
  - removing the city field from demand frontmatter
---

# RFC-0244: Hierarchical demand records with path-derived slugs for multi-axis pSEO datasets

## Context

RFC-0238 introduced the five-axis `website-local` cascade (`industry → country → region → city → demand`). Demand records live in a flat `demands/{lang}/` folder with a hand-written `slug:` frontmatter field. As the catalog grows — ten industries, twenty cities, ten service topics per city — the flat folder will hold 2 000+ files. Authors already struggle to locate a record, and the `slug` field is redundant with the file's natural position in the axis hierarchy.

The `loadDataset` helper in `@gogol/site-kernel-checks` currently takes the slug from `basename(file).replace(/\.md$/, "")`. If an author tries to organise records into sub-folders today, two files named `haarschnitt.md` in different city folders silently overwrite each other inside the `axisDataByLang` Map, producing undefined behaviour at page-generation time.

## Problem

1. **Flat-folder scaling ceiling.** A single `demands/de/` directory with 2 000+ files is un-navigable for content authors and IDEs.
2. **Redundant `slug` frontmatter.** The file path already encodes `industry`, `city` and `topic`; maintaining a separate `slug` is manual, error-prone and drifts from the file-system truth.
3. **basename collision.** `collectMarkdownFiles` is recursive, but `loadDataset` flattens the relative path into a bare stem, making sub-folder organisation impossible.
4. **No visual axis standard.** Authors cannot look at the folder tree and know whether `freiburg.md` is a city-level record or a topic-level record without opening the file and reading the `industries` and `city` fields.

## Decision

Demand records MAY be placed in a **hierarchical folder tree** under `demands/{lang}/`. The neutral slug is derived from the **relative path segments** joined with `-` (kebab-case), instead of the file basename. The existing `slug:` frontmatter field becomes **optional**; when present it overrides the path-derived value for migration compatibility only.

Three canonical folder patterns are recognised:

| Level | Folder pattern | Example file | Derived slug | What it represents |
| --- | --- | --- | --- | --- |
| **City** | `{industry}/{city}.md` | `elektriker/freiburg.md` | `elektriker-freiburg` | Industry + city presence (d4) |
| **Multi-city topic** | `{industry}/{topic}.md` | `friseur/haarschnitt.md` | `friseur-haarschnitt` | Topic valid for every city with that industry (d5, city-agnostic) |
| **Topic** | `{industry}/{city}/{topic}.md` | `friseur/karlsruhe/haarschnitt.md` | `friseur-karlsruhe-haarschnitt` | Topic scoped to one city (d5, city-specific) |

The `slug` frontmatter field is still accepted and overrides the derived value, but new records should omit it. The file path is the single source of truth.

### Rules

- Only the relative path **below `{lang}/`** participates in the slug.
- Segments are joined with a single `-`.
- The `.md` extension is stripped.
- A file placed directly in `demands/{lang}/` (legacy) falls back to the old basename rule: `demands/de/wallbox-installation.md` → slug `wallbox-installation`.
- The blueprint `{demand}` token in URL templates continues to use the **last path segment** (the leaf), so URLs stay unchanged: `/website/friseur/deu/bw/karlsruhe/haarschnitt/`.

### What does NOT change

- The five-axis blueprint (`industry`, `country`, `region`, `city`, `demand`) is untouched.
- The `city:` and `industries:` frontmatter fields remain mandatory; the folder path is **navigational sugar**, not a replacement for structured axis matching data.
- `axisDataByLang` still stores `slug → frontmatter`; only the key derivation changes.
- URL structure, page titles, breadcrumbs, and twin generation are unaffected.

## Architectural fit

This RFC aligns with the existing `@gogol/surface` Blueprint axis system and the `@gogol/site-kernel-checks` content loading pipeline. The slug derivation change is localized to `loadDataset` in `surface-expand.ts`, leaving `generateEntries` and URL templates untouched. The `demands.hierarchy.validate` command follows the data-driven command table pattern already established in `packages/os/site-kernel-checks/src/command-tables/` and plugs into `apps-check.author` alongside `demand.modifier.lint`.

## Design

### CLI surface

```sh
pnpm exec site-kernel run demands.hierarchy.validate --app webgogol-com --json
```

Scope: `app`. Supports `--all` and `--json`.

### TypeScript contracts

`loadDataset` now computes `relSlug` from `relative(langDir, file).replace(/\//g, "-")`. `DatasetEntry.slug` may be a path-derived kebab string or the legacy basename. The `slug:` frontmatter field is read as an optional override.

### File system responsibilities

| Path                                                     | Role                             |
| -------------------------------------------------------- | -------------------------------- |
| `apps/<app>/src/content/surface/demands/{lang}/`         | Demand records, now hierarchical |
| `packages/os/site-kernel-checks/src/surface-expand.ts`   | Slug derivation logic            |
| `packages/os/site-kernel-checks/src/demand-hierarchy.ts` | Validator implementation         |

### Output format

`demands.hierarchy.validate` emits RFC-0203 `CheckResult` diagnostics:

- `error`: invalid-level, slug-collision
- `warning`: slug-override

### Failure modes

Exits 0 when no errors exist (warnings are non-blocking). Exits 1 on invalid folder depth or derived-slug collision.

## Rollout

1. **Code change.** Update `loadDataset` in `packages/os/site-kernel-checks/src/surface-expand.ts`:
   - compute `relSlug = relative(langDir, file).replace(/\/g, '-').replace(/\.md$/, '')`
   - if `data.slug` is present, use it (legacy override)
   - otherwise use `relSlug`
   - if `relSlug` contains no `/` (legacy flat file), keep exact old behaviour
2. **Organisation migration (webgogol-com).**
   - Move existing city-level records into `{industry}/{city}.md` folders.
   - Move existing topic-level records into `{industry}/{city}/{topic}.md` or `{industry}/{topic}.md` depending on scope.
   - Delete the explicit `slug:` line from migrated files.
3. **Validation.** Add `demands.hierarchy.validate` (proposed command) that:
   - checks every demand record sits at one of the three canonical levels
   - warns when `slug` frontmatter differs from the derived path slug
   - fails when two files produce the same derived slug (folder + file collision)
4. **Pipeline.** Wire `demands.hierarchy.validate` into `apps-check.author` after `content.surface.validate`.

## Alternatives considered

- **Keep flat folder + mandatory `slug`.** Rejected: does not solve the 2 000-file ceiling or author navigation problem.
- **Use sub-folders but keep `slug` mandatory.** Rejected: the path already carries the information; manual duplication is a drift risk.
- **Derive slug from frontmatter fields (`industries[0]-city-slug`).** Rejected: the file system is the author-facing surface; frontmatter is machine-facing. Requiring authors to keep folder name and frontmatter in sync recreates the drift problem.
- **Change the URL structure to include industry in the demand segment.** Rejected: the blueprint `{demand}` token maps to the leaf segment; changing URLs requires a blueprint RFC and breaks existing index.

## Risks

- **Migration drift.** During the transition, some records live in folders while others stay flat. Mitigation: the slug-override fallback lets migration happen incrementally; validation catches collisions.
- **Deep nesting in IDEs.** Ten industries × twenty cities = 200 folders. Mitigation: IDE folder collapse + the fact that authors usually work on one industry at a time.
- **Slug length.** `friseur-karlsruhe-haarschnitt` is longer than `haarschnitt`. Mitigation: slugs are internal identity keys, not user-facing URLs; the URL leaf segment stays short (`haarschnitt`).

## Acceptance criteria

- [x] `loadDataset` derives the neutral slug from the relative path for files inside sub-folders, with legacy basename fallback for flat files. (evidence: implemented historically)
- [x] `slug:` frontmatter is optional; when present it overrides the derived value. (evidence: implemented historically)
- [x] `axisDataByLang` contains no collisions for the `webgogol-com` pilot dataset. (evidence: implemented historically)
- [x] All existing `webgogol-com` demand records are reorganised into one of the three canonical folder patterns; `slug:` lines removed where derived slug matches, preserved as override where derived slug differs to keep routes byte-identical. (evidence: implemented historically)
- [x] `demands.hierarchy.validate` runs in `apps-check.author` and passes (0 errors, 20 expected warnings for legacy slug overrides). (evidence: implemented historically)
- [x] `surface.generate` produces identical route sets before and after the reorganisation (verified via pageId stability). (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST NOT delete the `slug:` override logic; it is the backward-compatibility bridge.
- Agents MUST move demand records into the canonical folder tree before removing their `slug:` field, never both at once.
- Agents MUST verify that `surface.generate` output is byte-identical (routes + pages) before and after each batch of moves.
- Agents SHOULD implement the code change (slug derivation) first, then migrate content in a second commit, so the repo is never in an inconsistent state.
