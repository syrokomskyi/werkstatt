# AGENT QUICKSTART

> 60-second orientation for any AI agent before changing code in this architecture.

## What this repo is

- The current codebase is the **reference implementation**.
- The rules in this folder describe the **portable DNA**.
- Project-specific pages, sections, components, copy, and visuals are **examples**, not the architecture itself.

## Non-negotiables

- **Pages stay thin** and orchestrate only layout, content loading, and composition.
- **Visitor-facing meaning lives in `src/content/`**, not in routes or components.
- **Styles live in `src/styles/`** and use only `--ds-*` tokens.
- **Navigation labels and targets live in content** (`site/{lang}/labels.md`, `navigation/{lang}/navigation.md`).
- **Canonical routes live in `src/content/system.md`** (`pages[].routes`).
- **Machine-readable outputs are projections from `src/semantic/`**, not a second content system.
- **`lang` flows from route to layout to children**.
- **Interactivity stays inside isolated hydrated islands**.
- **Cookies are forbidden** across the entire repository.

## First question: what kind of change is this?

- **New page or route change**
  - touch `src/content/system.md` (pageId + routes + planets) + `src/content/pages/{lang}/` + semantic wiring if needed

- **Reusable section component**
  - touch component in `packages/ui/` + manifest + register in `PLANET_IMPORT_PATHS` or `MOON_IMPORT_PATHS` + pin in `system.md`

- **Pure structural component**
  - touch component + stylesheet only

- **Navigation or link visibility change**
  - touch `src/content/site/{lang}/labels.md` (header.navIds, footer.navIds) + `src/content/navigation/{lang}/navigation.md`

- **JSON-LD, `llms.txt`, or machine-readable output**
  - touch `src/semantic/` and keep delivery points thin

## Source-of-truth map

- **Copy**
  - `src/content/pages/{lang}/` — page blocks and shell copy
  - `src/content/prose/{lang}/` — long-form prose
  - `src/content/business/{lang}/` — business data
  - `src/content/navigation/{lang}/` — navigation labels and targets
  - `src/content/site/{lang}/` — shell UI labels and layout settings

- **Canonical routes**
  - `src/content/system.md` (`pages[].pageId` + `pages[].routes`)

- **Semantic projections**
  - `src/semantic/`

- **Styles**
  - `src/styles/`

## Read next when needed

- **Always first for full context**
  - `packages/os/site-kernel/docs/architecture-dna.md`

- **If the task touches routes or pages**
  - `packages/os/site-kernel/docs/page-contracts.md`

- **If the task touches components or sections**
  - `packages/os/site-kernel/docs/component-contracts.md`

- **If you are implementing a change**
  - `AGENT_RULES.md`

- **If the task touches JSON-LD, `llms.txt`, or semantic outputs**
  - `SEMANTIC_LAYER.md`

- **If a shortcut feels tempting**
  - `packages/os/site-kernel/docs/anti-patterns.md`

## Stop signs

Do not proceed with a design that requires any of the following:

- hardcoded visitor-facing copy in a route or component
- inline `<style>` or inline `style="..."`
- raw href maps duplicated in components or routes
- JSON-LD built inside UI components
- AI-only hidden content trees
- dead links to disabled pages or sections
- `use: PlanetName` in page block frontmatter (use `type: <archetype>` per RFC-0047)
- route slugs edited in `navigation.md` instead of `system.md` (per RFC-0048)

## Definition of done

A change is usually safe only when all of the following are true:

- the source of truth is still explicit
- routes remain thin
- component ownership is still clear
- disabled targets disappeared from every visitor-facing surface and discovery output
- semantic outputs still come from normalized meaning, not UI markup
- no styling escaped `src/styles/` or the `--ds-*` token system
