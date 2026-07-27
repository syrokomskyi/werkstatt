# `@gogol/content-source` — Agent Guide

This package is the **Content Source Provider (CSP) port** introduced by **RFC-0141** — the single named seam for _where content and assets come from_. It makes the filesystem one replaceable adapter instead of a hardcoded assumption, so a future headless-CMS adapter (Contentful, Sanity, Strapi, Payload, …) can be added by implementing one interface, with no change to sections, components, `buildPage()`, or the route pipeline.

This is **Phase 0** of the headless-CMS arc. See `docs/rfcs/archive/implemented/rfc-0141-content-source-provider-abstraction-and-asset-reference-decoupling.md` for the full design and the forward-looking phase plan.

## What lives here

| Entry point | Module | What it provides |
| --- | --- | --- |
| `@gogol/content-source` | `src/types.ts` | Port contracts: `ContentSourceProvider`, `ContentDomain`, `ContentEntry`, `ContentEntryRef`, `AssetRef`, `ResolvedAsset`, `ContentSourceCapabilities` |
| `@gogol/content-source` | `src/adapters/fs/assets.ts` | The relocated bare-filename image resolver (`resolveImage`, `resolveImageRequired`, `createImageResolver`, `IMAGE_EXTENSIONS`, `DEFAULT_LANGUAGE`) **and** `createFsAssetResolver(images)` → the abstract `AssetRef → ResolvedAsset` resolver |
| `@gogol/content-source` | `src/adapters/fs/loaders.ts` | `fsMarkdownCollectionLoader`, `fsDataCollectionLoader` |
| `@gogol/content-source` | `src/adapters/fs/capabilities.ts` | `FS_CAPABILITIES` |
| `@gogol/content-source/cms-git` | `src/adapters/cms-git/index.ts` | **RFC-0171** git-based (Decap) adapter: `CMS_GIT_CAPABILITIES` + the pure, node-safe Decap config builder (`buildDecapConfig`, `inferDecapField`, `mergeSamples`). No I/O, no `yaml`, no `astro:content` — the `cms.schema.generate`/`cms.schema.parity` kernel commands read content and serialize. Git markdown is read through the fs Astro provider, so production resolves only merged (published) content (fail-closed). |
| `@gogol/content-source/astro` | `src/astro.ts` | The **only** module that owns the `astro:content` dependency: re-exports `getEntry` / `getCollection` |

Two entry points on purpose: `.` is source-agnostic (safe for node-side consumers like kernel checks); `./astro` pulls `astro:content` and is for app/build-context consumers only.

## The seam invariants (enforced repo-wide)

> Content origin and asset origin are replaceable peripherals, reachable **only** through this port. No section, component, route, or builder may assume content comes from local markdown or that assets are local files.

- **Content reads** import `getEntry` / `getCollection` from `@gogol/content-source/astro`, never from `astro:content` directly. `@gogol/share`'s `astro/content.ts` + `astro/page-handler.ts` already route through it.
- **Collection loaders** come from the fs adapter. `@gogol/share/astro/loaders` re-exports `markdownCollectionLoader` (= `fsMarkdownCollectionLoader`) so generated `content.config.ts` is unchanged; `@gogol/pbp` builds its collection via `fsDataCollectionLoader`.
- **Assets**: `packages/ui/src/content-assets.ts` is the ONE place in `packages/ui` allowed to call `import.meta.glob` for content images. Sections resolve via `resolveImage(contentAssetImages, …)`. `import.meta.glob` is resolved by Vite at the call site against the app root, which is why the glob cannot live inside this package — only the resolution logic does.
- **`system.md` is engineering-owned** and is never served by a provider. `ContentDomain` deliberately treats `system` as out of the editable-content set; do not route the route registry / shell / growth / passport config through a CMS.

## Rules for AI agents

- Do NOT re-add a per-component `import.meta.glob` for content assets. Use `contentAssetImages` from `@gogol/ui/src/content-assets.ts`. `asset.reference.validate` exists to catch unresolved tokens (warning mode today; will be promoted to fail-hard).
- Do NOT import `astro:content` anywhere new. Import the accessors from `@gogol/content-source/astro`.
- Do NOT reimplement bare-filename image resolution. It lives in `src/adapters/fs/assets.ts`; `@gogol/share` re-exports it for backward compatibility.
- Treat `AssetRef.token` as **opaque**. Never parse it to infer locality — the provider decides local vs remote. The fs adapter returns `{ kind: "local", image }`; a CMS adapter returns `{ kind: "remote", url, … }`.
- `ContentEntry.body` carries the markdown body for body-bearing domains (e.g. `prose`); it is `undefined` for frontmatter-only domains. A CMS adapter maps its rich-text bridge into `body`.
- `content.source.parity` (in `@gogol/site-kernel-checks`) is the migration guard: the fs adapter's enumeration must equal the on-disk content inventory. Keep it green when changing loaders or id derivation.

## How to add a new (e.g. CMS) adapter — later phases, each needs its own RFC

1. Create `src/adapters/<name>/` implementing `ContentSourceProvider` with honest `capabilities` (`remoteAssets` / `liveFetch` / `richText`).
2. `getEntry` / `listEntries` map the CMS payload into `ContentEntry` (same `{lang}/{slug}` id scheme; populate `body` for prose).
3. `resolveAsset` returns `{ kind: "remote", url, width?, height?, format? }`.
4. Default path stays **"CMS → git as SSOT"**: a `content.pull` command normalizes CMS content into the existing `.md` shapes, then the existing build/validate/passport pipeline runs unchanged. Only add SSR + live `getEntry` for a site that truly needs live preview.
5. Generated `content.config.ts` is **not** edited by hand — it is owned by `routes.generate` and its template lives at `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/content.config.template.ts`. If a phase must change how collections are wired, edit that template and regenerate, never the per-app file (it carries the `GENERATED` marker).

## Gotcha: glob patterns inside block comments

A `/* … */` doc comment that contains a glob pattern with `**/` (or any `*/`) **closes the comment early** — the characters `*` `/` terminate the block. This produces cryptic `TS2304: Cannot find name '…'` errors on the text after the pattern. When documenting glob patterns, keep them out of `/* */` blocks or describe them in prose (e.g. "recursive asset folders") rather than pasting the literal `**/…` pattern. This bit the first cut of `content-assets.ts`.
