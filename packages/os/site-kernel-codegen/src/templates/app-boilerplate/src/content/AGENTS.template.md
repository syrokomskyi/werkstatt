{{GENERATED_HEADER}}

# Content Instructions

Apply these instructions when reading or editing files under `src/content/`.

## Local reminders

- `src/content/` is the canonical source of visitor-facing meaning.
- Keep page-shell copy, navigation labels, and structured visitor-facing copy here.
- Keep labels semantic; href resolution belongs elsewhere.
- Do not create a parallel AI-only content tree.
- Entity-ID normalization utilities (`toDataEntryId`, `getEntryLanguage`, `stripEntryLanguage`) come from `@gogol/share/content` — do not re-implement them here. The local `src/content/schemas/entity-id.ts` is a thin proxy.
- **`src/content/components/` does not exist** in this app — it was removed per RFC-0047. Do not create it.
- **`src/content/features/` does not exist** in this app — the feature graph was retired per RFC-0047. Do not create it.
- **`src/content/media/` is forbidden** — optimized assets belong under content-local `assets/` folders (e.g. `pages/{lang}/assets/`, `prose/{lang}/assets/`). Fixed-path exceptions go in `public/`. (This bans the *top-level* `src/content/media/`, not the per-language `media/` below.)
- **Feature/background VIDEO source masters go in `<domain>/{lang}/media/`, NOT `assets/`** (RFC-0210). The large transcode master must not be bundled by Vite — `assets/**` is emitted into `_astro` and an 80+ MiB master breaks Cloudflare's 25 MiB asset limit; the `media/` folder is outside the bundling glob. The build derives HLS/MP4/WebM/poster into `public/_video` and `<Media>` serves those. Ambient living-photo clips stay in `assets/` (small, served directly).
- **Material credits are mandatory** — when adding a video `media.source.name`, a living-photo clip (RFC-0202: a `live` block with a `photo` token, or ambient media via `media.source.fromImage`), or an image token in `pages`, `business`, or `site` frontmatter, add a matching `*.credits.yaml` sidecar in the same content-local `assets/` folder. A living-photo video is a distinct `kind: video` material and requires its own credit sidecar, separate from the still-image credit. Run `pnpm exec site-kernel run material.credits.validate --site {{APP_ID}}` before committing.
- **`prose/{lang}/credits.md` is generated** — do NOT edit it directly. It is regenerated from `business/{lang}/assets/*.credits.yaml` sidecars by `material.credits.generate` on every `build.prepare`. To change credits content (names, roles, links, license): edit the relevant `*.credits.yaml` sidecar, then run `pnpm exec site-kernel run material.credits.generate --site {{APP_ID}}` to preview locally. Run `pnpm exec site-kernel run material.credits.drift.validate --site {{APP_ID}}` to confirm no uncommitted manual edits remain.

## Content domain map (RFC-0047)

| Path | Role |
| --- | --- |
| `system.md` | Single canonical app manifest: pages, routes, planets, growth, passport, i18n |
| `pages/{lang}/**/*.md` | Block-declarative pages (`kind: page`, `pageId`, `blocks[].type`) |
| `pages/{lang}/assets/**` | Optimized assets owned by page entries |
| `prose/{lang}/**/*.md` | Long-form prose with default-language fallback |
| `prose/{lang}/assets/**` | Optimized assets owned by prose entries |
| `business-profile/{lang}/**/*.md` | PBP entity data loaded by `@gogol/pbp` (semantic profile) |
| `people/{lang}/**/*.md` | Person records for the data-driven People section (RFC-0200) |
| `navigation/{lang}/navigation.md` | Navigation labels, order, groups, semantic targets (not route slugs) |
| `site/{lang}/labels.md` | Shell UI labels, header/footer nav IDs |
| `site/{lang}/layout.md` | Shell layout name and settings |
| `site/{lang}/assets/**` | Optimized shell-owned assets |

## Route ownership (RFC-0048)

- Canonical public routes live in `system.md pages[pageId].routes`.
- Each page `.md` carries a stable `pageId` that links it to the route registry.
- To add a localized URL, edit `system.md pages[pageId].routes`, not `navigation.md`.
- `navigation.md` semantic targets reference internal pages via `pageId`; the route resolution happens at runtime.

## Language fallback for content entries (RFC-0008)

- Page routes MUST use `getPageEntryWithFallback(lang, slug)` from `@utils/content-collections` instead of bare `getEntry` + throw.
- When a `pages/{lang}/{slug}` entry is absent, the helper falls back to the default language (`{{DEFAULT_LANG}}`) and emits a `console.warn` at build time.
- If neither the requested nor the default-language entry exists, the helper throws — the hard error is preserved as the final guard.
- Do NOT create empty stub translation files as a workaround; the fallback helper is the correct resolution.
- Do NOT suppress the `console.warn` — it is a first-class signal that a translation is missing.

## Content file naming (RFC-0054)

- Page files: `pages/{lang}/<pageId-derived-path>.md` — path is derived from `system.md pages[pageId].pageId` via `pageIdToContentFileSlug()`, **not** from the route slug. Slash pageIds stay nested (for example `cosmic/passport` → `pages/{lang}/cosmic/passport.md`, `cosmic/starMap` → `pages/{lang}/cosmic/star-map.md`).
- Prose files: `prose/{lang}/<kebab-pageId>.md` — same rule: filename is kebab-case pageId, not route slug.
- contentRef values in page blocks: `"prose/<kebab-pageId>"` — matches prose filename, not the route URL.
- Business files: `business/{lang}/<type>.md` — singleton files per schema type.
- Navigation file: `navigation/{lang}/navigation.md` — singleton per language.
- Site files: `site/{lang}/labels.md`, `site/{lang}/layout.md` — singletons per language.

**Slash-segment rule for agents:** if a `pageId` contains `/`, each new segment starts with a lowercase letter. Use camelCase only *inside* a segment, never to start a new segment after `/`. Examples: `cosmic/passport`, `cosmic/starMap`.

**Key invariant:** Can a content file be found from `pageIdToContentFileSlug(pageId)` without reading route slugs? If yes, it uses the correct naming. If its lookup depends on the route URL, it is following the old convention and must be renamed (RFC-0054).
