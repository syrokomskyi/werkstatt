# @gogol/site-kernel-content

Framework-free Markdown file discovery and frontmatter parsing utilities for the Site OS.

## Purpose

OS command packages need to read and write `.md` files without importing Astro or any framework. This package provides the minimal Node.js-only primitives to do that.

## Public API

```typescript
import {
  collectMarkdownFiles,
  parseMarkdownFrontmatter,
  stringifyMarkdownFrontmatter,
  type ParsedFrontmatter,
} from "@gogol/site-kernel-content";
```

### `collectMarkdownFiles(dir: string): Promise<string[]>`

Recursively collects absolute paths to all `.md` files under `dir`. Automatically skips directories and files whose names start with `old-` or `-`.

### `parseMarkdownFrontmatter(source: string): ParsedFrontmatter`

Parses a `--- YAML ---` frontmatter block from raw Markdown source. Returns `{ data, content }` where `data` is the parsed YAML object and `content` is the body below the delimiter.

### `stringifyMarkdownFrontmatter(content: string, data: Record<string, unknown>): string`

Serializes `data` back to a `--- YAML ---` block and prepends it to `content`.

## Constraints

- No dependency on `@gogol/site-kernel` or Astro — pure Node.js + `yaml`.
- Do not import from this package in Astro route files; use `astro:content` there instead.

## Validation

```sh
pnpm --filter @gogol/site-kernel-content build:check
```
