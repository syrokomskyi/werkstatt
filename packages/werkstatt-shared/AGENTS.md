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
| `build`       | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `build:check` | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `test`        | `vitest run`                              |
| `test:watch`  | `vitest`                                  |

## NPM publishing

- Package is published as `@warpgogol/werkstatt-shared` with `access: public` and NPM provenance.
- `prepublishOnly` runs typecheck before publish.
- CI workflow: `.github/workflows/npm-publish.yml` publishes on `v*` tags.
