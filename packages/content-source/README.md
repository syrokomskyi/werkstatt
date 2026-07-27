# @warpgogol/content-source

Content Source Provider (CSP) port — the source-agnostic abstraction for "where content comes from" (RFC-0141).

## Purpose

Makes the filesystem one replaceable adapter instead of a hardcoded assumption. A future headless-CMS adapter (Contentful, Sanity, Strapi) implements the same `ContentSourceProvider` interface with no change to sections, components, `buildPage()`, or the route pipeline.

## Entry points

| Import | What it provides |
| --- | --- |
| `@warpgogol/content-source` | Port contracts: `ContentSourceProvider`, `ContentDomain`, `AssetRef`, `ResolvedAsset`, `ContentSourceCapabilities` |
| `@warpgogol/content-source/astro` | `getEntry`/`getCollection` re-exports (the ONLY module with `astro:content`) |

## Key invariants

- Content reads import `getEntry`/`getCollection` from `@warpgogol/content-source/astro`, never from `astro:content` directly.
- `packages/ui/src/content-assets.ts` is the ONE place allowed to call `import.meta.glob` for content images.
- Bare filenames only for image resolution — no paths, no extensions. Extension priority: `.webp` → `.jpg` → `.jpeg` → `.png`.
- `AssetRef.token` is opaque — never parse it to infer locality.

## Validation

```sh
pnpm --filter @warpgogol/content-source build:check
```
