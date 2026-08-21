# `@warpgogol/werkstatt-shared` — Agent Guide

RFC-0868: Stack-agnostic shared infrastructure extracted from `@warpgogol/werkstatt-site`. Owns checks, integration, ontology, passport, share, and surface domains consumed by both the engine and site plugin.

**Workspace type:** Package

This is a **package** workspace. Expose stable typed APIs. Do not import from `werkstatt-site` or services.

## Boundary rules

- This package MUST NOT import from `@warpgogol/werkstatt-site` — enforced by `werkstatt.shared.validate`.
- This package MAY import from `@warpgogol/werkstatt` (engine) and external packages.
- Axiom dependencies (`@syrokomskyi/axiom-*`) are `optionalDependencies` — consumers without axiom installed must use type-only imports or guard runtime access.

## Scripts

| Script        | Command                                   |
| ------------- | ----------------------------------------- |
| `lint`        | `pnpm exec eslint "src/**/*.ts"`          |
| `typecheck`   | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `build`       | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `build:check` | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `test`        | `vitest run`                              |
| `test:watch`  | `vitest`                                  |

## NPM publishing

- Package is published as `@warpgogol/werkstatt-shared` with `access: public`.
- `prepublishOnly` runs typecheck before publish.
- Publication is operator-triggered via repo-extract (RFC-0773). See `extract.config.yaml` and `docs/authoring/publication-runbook.md`.

## Canonical utilities

### Slug generation (RFC-0915, DNA-88)

Location: `packages/werkstatt-shared/src/share/slug/` — exported via `@warpgogol/werkstatt-shared/share/slug`.

| Export | Purpose |
| --- | --- |
| `slugUrl(text, lang?)` | Locale-aware URL slug (German umlauts, Ukrainian transliteration, default) |
| `slugId(text)` | Semantic block ID slug (replaces custom NFKD slugify) |
| `HeadingSlugger` | Stateful heading anchor deduplication (wraps github-slugger) |

Rules:

- Agents MUST import slug utilities from `@warpgogol/werkstatt-shared/share/slug` and MUST NOT reimplement slugify logic.
- The external packages `@sindresorhus/slugify`, `cyrillic-to-translit-js`, and `github-slugger` are dependencies of this package only — no other package may declare them as direct dependencies.
- Enforcement: `utility.provenance.validate` (RFC-0916) scans for reimplementations outside the canonical path.

### Semantic extraction (RFC-0901)

Location: `packages/werkstatt-shared/src/share/semantic/` — exported via `@warpgogol/werkstatt-shared/share/semantic`.

| Export | Purpose |
| --- | --- |
| `splitSentences(text, locale?)` | Locale-aware sentence boundary detection with abbreviation handling for `de`, `uk`, `en` (RFC-0901) |

### Utility registry (RFC-0916)

Location: `packages/werkstatt-shared/src/share/utility-registry.yaml`

To add a new canonical utility:

1. Implement the utility in `packages/werkstatt-shared/src/share/<name>/`
2. Add a subpath export to `packages/werkstatt-shared/package.json`
3. Add an entry to `utility-registry.yaml` with `id`, `canonicalPath`, `forbiddenImports`, `functionNames`, `patterns`, and `allowlist`
4. Document the utility in this AGENTS.md section
