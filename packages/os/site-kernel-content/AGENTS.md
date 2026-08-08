# Site Kernel Content Package Guide

This file defines the package-specific instruction layer for `packages/os/site-kernel-content`.

## Package role

- `@warpgogol/site-kernel-content` provides framework-free content utilities shared across all apps in `apps/*`.
- Any app that needs to read Markdown files or parse frontmatter imports from this package.

## Public API

- **`collectMarkdownFiles(dir)`** — recursively collects `.md` files, skipping `old-*` and `-*` entries.
- **`parseMarkdownFrontmatter(source)`** — parses `--- YAML ---` frontmatter, returns `{ content, data }`.
- **`stringifyMarkdownFrontmatter(content, data)`** — serializes back to frontmatter + content string.
- **`ParsedFrontmatter`** — exported type.
- **`loadSemanticSiteModel`** / **`createFsSemanticReader`** — semantic site model loader; uses the RFC-0527 index-based resolver from `@warpgogol/share/content-reference` (RFC-0529). RFC-0767: `createFsSemanticReader` implements `getDerivedPrices()` via `loadDerivedPrices` from `@warpgogol/share/semantic/derived-prices-loader`.

## Core boundaries

- Keep framework-free and Node.js-only. Only `yaml` is an allowed runtime dependency.

## Validation

- Run `pnpm --filter @warpgogol/site-kernel-content build:check` after changes.
