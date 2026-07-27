# Naming Conventions — Workspace File Naming Standards

> **Scope.** This document defines file and directory naming rules for the whole workspace. Rules are repository-wide unless explicitly marked as site-specific. A site's own AGENTS.md may add stricter extensions but may not relax these rules.

---

## Enforcement key

| Symbol          | Meaning                             |
| --------------- | ----------------------------------- |
| ✅ **Now**      | Enforced by an existing OS command. |
| 🔜 **Later**    | Phase 2 kernel command candidate.   |
| 📖 **Doc only** | Verified by human review.           |

---

## Global Rule — All Files

### Rule: kebab-case for all filenames

All filenames in registered workspace roots must use **kebab-case**: lowercase letters, digits, and hyphens. **Underscores (`_`) must not be used as word separators.**

```
✅ hero-section.ts
✅ content-validation.ts
✅ my-helper.astro
❌ hero_section.ts       — underscore instead of hyphen
❌ content_validation.ts — underscore instead of hyphen
```

### Exceptions — these are never flagged

| Exception | Examples |
| --- | --- |
| File starts with a dot | `.env`, `.gitignore`, `.prettierrc` |
| File starts with an underscore | `_shared.ts`, `_headers`, `_redirects`, `_routes.json` |
| File name contains `config` | `astro.config.mjs`, `kernel.config.ts`, `tailwind.config.js` |
| File name contains `module` | `check.module.ts`, `service.module.ts` |
| File lives in a dot-prefixed folder | `.git/`, `.astro/`, `.vscode/` (entire tree is skipped) |
| File lives in a tool/local scratch top-level folder | `.windsurf/`, `tmp/` (root names are registered; contents are not authored source) |
| File lives in a generated media-artifact folder | `_img/` (RFC-0204 image variants), `_video/` (RFC-0210 video variants / HLS `.ts` segments) — generator-owned, gitignored |
| File lives in a `migrations/` folder | `002_sync_tenants.sql` — ordered DB-migration tool convention (`NNN_name.sql`), not authored prose |
| File matched by `.gitignore` or `.windsurfignore` | Simple non-wildcard patterns only |

> **Note on underscore-prefixed files.** Files starting with `_` are conventionally used for internal/private modules (e.g., `_shared.ts` for shared schemas) and platform-specific configuration files (e.g., Cloudflare Pages `_headers`, `_redirects`, `_routes.json`). They are intentionally exempt from the kebab-case rule.

> **Strict kebab-case enforcement.** All other files must use **only** lowercase letters, digits, and hyphens. PascalCase (`Header.astro`), camelCase (`myHelper.ts`), and ALLCAPS (`README.md`, `AGENTS.md`) are **not allowed** and will be flagged as violations.

| Enforcement |
| --- |
| ✅ `naming.convention.lint` (workspace-scoped, scans registered source roots including `apps/`, `packages/`, `services/`, `docs/`, `hooks/`, and Site OS support roots) |

---

## Layer 1 — Pages (`src/pages/`)

### Rule: no layer suffix tokens in page filenames (RFC-0020)

Filenames in `src/pages/` at any nesting depth must not contain `-page`, `-component`, `-section`, or `-style` tokens. Route filenames must stay concise because they are visitor-facing URL segments.

| Enforcement |
| --- |
| ✅ `naming.suffixes.lint` (app-scoped; checks forbidden suffix tokens in `src/pages/` and `src/styles/` per RFC-0020) |

### Rule: visitor routes live under `[lang]/`

All visitor-facing `.astro` route files must sit under `src/pages/[lang]/`.

```
src/pages/
  [lang]/
    index.astro
    about.astro
    services/
      index.astro
      [slug].astro
  llms.txt.ts
  llms-full.txt.ts
```

### Rule: machine-readable endpoints at pages root

Non-HTML endpoints such as `llms.txt.ts` and `llms-full.txt.ts` live directly under `src/pages/`, not inside `[lang]/`.

### Rule: no AGENTS.md inside `src/pages/`

Astro treats any Markdown file in `src/pages/` as a routable page during build. Keep guidance in the nearest parent AGENTS.md instead.

### Rule: filename casing

- Route files: `kebab-case.astro` or `[param].astro`
- Dynamic params: `[slug]`, `[lang]`, `[branche]` — always lowercase, always square brackets

| Enforcement                                                                              |
| ---------------------------------------------------------------------------------------- |
| ✅ `naming.pages.lint` (app-scoped; checks top-level structure and dynamic param casing) |

---

## Layer 2 — Content (`src/content/`)

### Rule: page content mirrors route structure without `[lang]`

```
Route:   src/pages/[lang]/services/web-development.astro
Content: src/content/pages/{lang}/services/web-development.md
```

The `{lang}` segment in content is the actual language code (e.g., `de`, `en`), not a dynamic param — it is a real directory.

### Rule: component content mirrors component path without `[lang]`

```
Component: src/components/section/hero-section.astro
Content:   src/content/components/{lang}/section/hero-section.md
```

### Rule: content filenames match the corresponding route or component filename

- Page content: `kebab-case.md` matching the route file's basename
- Component content: `kebab-case.md` matching the component's **logical** basename (without layer suffix)

### Rule: language segment is a two-letter code directory

Content entries live inside `{lang}/` directories where `lang` is a two-letter ISO language code (e.g., `de`, `en`, `es`). No hyphens, no full locale codes at this level.

### Rule: skip folders starting with `-` or `old-`

Files and directories whose name starts with `-` or `old-` are excluded from all content collection scans and validation.

| Enforcement                                                                         |
| ----------------------------------------------------------------------------------- |
| ✅ `content.validate` (skips `-` and `old-` prefixed entries)                       |
| 🔜 `naming.content.lint` — enforce filename casing and language directory structure |

---

## Layer 3 — Components (`src/components/`)

### Rule: all non-section component files end with `-component` (RFC-0020)

Every `.astro` file anywhere under `src/components/` that is **not** inside a path segment named `section` must end with the `-component` suffix. This applies at root level and inside any named subdirectory (e.g., `effects/`, `funding/`, `logo/`):

```
src/components/header-component.astro                             ✅
src/components/footer-component.astro                             ✅
src/components/effects/shadow-text-component.astro                ✅
src/components/funding/program-card-component.astro               ✅
src/components/logo/telegram-component.astro                      ✅
src/components/header.astro                                       ❌  missing -component suffix
src/components/effects/shadow-text.astro                          ❌  missing -component suffix
```

Exception: `layout.astro` inside `src/components/layouts/` is the Class 4 layout singleton and is exempt.

Forbidden-suffix-token rule (`-page`, `-section`, `-style` before `-component`) applies **only** to root-level files. Files in subdirectories must carry `-component` but may have stems that include `-section` or other tokens (e.g., `funding-advisor-section-component.astro` is valid inside `funding/`).

The **logical identity** used in `componentPath` references (content YAML, dispatcher keys, feature graph) stays suffix-free (e.g., `"header"`, `"footer"`). Only the physical filename carries the suffix.

The same `-component` suffix must appear consistently across all four mirrored files:

```
src/components/footer-component.astro                    ← .astro (physical)
src/styles/components/footer-component.css              ← CSS  (physical)
src/content/components/{lang}/footer-component.md       ← content (physical)
src/content/schemas/components/footer.ts                ← schema key (logical)
```

### Rule: section component files end with `-section` (RFC-0020)

All `.astro` files under `src/components/section/` must end with the `-section` suffix:

```
src/components/section/hero-section.astro           ✅
src/components/section/navigation-section.astro     ✅
src/components/section/donation-use-section.astro   ✅
```

### Rule: forbidden tokens in component layer

- Files in `src/components/` **root** must **not** have `-page`, `-section`, or `-style` as the last token before `-component` in their filename stem.
- Files in `src/components/section/` must **not** contain `-page`, `-component`, or `-style` in their filename.
- Files in `src/components/` **subdirectories** (non-`section`) are only required to end with `-component`; no forbidden-token restriction applies to their stem.

### Rule: section components live in `section/`

Reusable page-building-block components that accept `lang`, `sectionNumber?`, and `pageOverride?` always live under `src/components/section/`.

### Rule: generated icon components live in `packages/ui/src/icons/gen/`

Do not hand-author files in the generated `gen/` subdirectory. Only the `icons.generate` kernel command may write there.

### Rule: AGENTS.md is excluded from all component checks

`AGENTS.md` files at any nesting level inside `src/components/` are unconditionally excluded from all Site OS validation commands.

### Rule: `src/layouts/` must contain exactly `layout.astro` (RFC-0020)

`src/layouts/` is a singleton layer: only `layout.astro` is permitted as a file-level entry. Any additional `.astro` or other source file at the root of `src/layouts/` is a violation. Subdirectories are reserved for future multi-layout patterns (require a separate accepted RFC).

```
src/layouts/layout.astro     ✅  only permitted file-level entry
src/layouts/admin.astro      ❌  unexpected extra layout
```

| Enforcement |
| --- |
| ✅ `naming.components.lint` (app-scoped; checks file type placement in `src/components/`) |
| ✅ `naming.suffixes.lint` (app-scoped; checks `-component` / `-section` suffix contracts per RFC-0020) |
| ✅ `naming.layouts.lint` (app-scoped; enforces `src/layouts/` singleton contract per RFC-0020) |

---

## Layer 4 — Schemas (`src/content/schemas/`)

### Rule: schema path mirrors content path without the language segment

```
Content: src/content/pages/{lang}/services/web-development.md
Schema:  src/content/schemas/pages/services/web-development.ts

Content: src/content/components/{lang}/section/hero-section.md
Schema:  src/content/schemas/components/section/hero-section.ts
```

### Rule: one schema module per mirrored content identity

Do not create grouped schema bundles as the primary source of truth. Each schema module corresponds to one content identity path.

### Rule: schema filenames match content filenames exactly

If the content file is `web-development.md`, the schema is `web-development.ts`. If the content file is `hero-section.md`, the schema is `hero-section.ts`.

### Rule: dispatcher files are named `{domain}-dispatcher.ts`

```
src/content/schemas/pages-dispatcher.ts
src/content/schemas/components-dispatcher.ts
```

| Enforcement                                                                    |
| ------------------------------------------------------------------------------ |
| 🔜 `naming.schemas.lint` — verify schema path mirrors content path             |
| 🔜 `mirroring.validate` — verify component/content/schema triples are complete |

---

## Layer 5 — Styles (`src/styles/`)

### Rule: global styles live in `global.css`

The single entry point for shared base classes and design token definitions is `src/styles/global.css`.

### Rule: component styles live in `src/styles/components/`

One CSS file per component, using the component's kebab-case name:

```
src/styles/components/header.css
src/styles/components/footer.css
src/styles/components/section/hero-section.css
```

### Rule: page styles live in `src/styles/pages/`

One CSS file per route, using the route's kebab-case name:

```
src/styles/pages/home.css
src/styles/pages/about.css
src/styles/pages/services/web-development.css
```

### Rule: component CSS files end with `-component` or `-section` (RFC-0020)

CSS files under `src/styles/components/` carry the same layer suffix as their `.astro` mirror:

```
src/styles/components/header-component.css       ✅  mirrors src/components/header-component.astro
src/styles/components/footer-component.css       ✅
src/styles/components/section/hero-section.css   ✅  mirrors src/components/section/hero-section.astro
src/styles/components/header.css                 ❌  missing -component suffix
```

### Rule: no `-style` token in non-component style filenames

Files in `src/styles/` outside `src/styles/components/` (e.g., `src/styles/pages/`, `src/styles/global.css`) must not contain `-style` in the filename stem.

### Rule: no custom properties outside the `--ds-*` namespace

All CSS custom property declarations must use the `--ds-` prefix. No raw namespace custom properties are allowed.

| Enforcement |
| --- |
| ✅ `tokens.ds.lint` |
| ✅ `tokens.colors.lint` |
| ✅ `naming.styles.lint` (app-scoped; checks CSS files live under `src/styles/` and `global.css` exists) |
| ✅ `naming.suffixes.lint` (app-scoped; enforces -component/-section suffix contract in `src/styles/components/`; forbids `-style` elsewhere in `src/styles/` per RFC-0020) |

---

## Layer 6 — Assets (`src/assets/`)

### Rule: managed images live in `src/assets/images/`

Visitor-facing images are placed here and referenced through Astro's `<Image />` component or equivalent optimized image pipeline.

### Rule: icon source files live in `src/assets/icons/`

Source icon assets that feed the generated icon pipeline (e.g., LordIcon JSON files) live here. The `icons.generate` command reads from this directory.

### Rule: icon source filenames are the canonical icon identifier

The icon source filename (without extension) becomes the generated component's name. Do not rename icon source files after components are generated; run `icons.clean` and `icons.generate` instead.

| Enforcement                                                                               |
| ----------------------------------------------------------------------------------------- |
| ✅ `assets.structure.lint` (app-scoped; checks raster images are in `src/assets/images/`) |

---

## Layer 7 — Scripts / Kernel tools (`tools/`)

### Rule: app kernel tools live in `tools/`

Every app that participates in the OS has a `tools/` directory containing:

```
tools/
  kernel.config.ts       ← app entry point for the OS
  modules/               ← domain modules (check, service, sync, integrity, ...)
  runtime/               ← command handler implementations
```

### Rule: module filenames use `{domain}.module.ts`

```
tools/modules/check.module.ts
tools/modules/service.module.ts
tools/modules/sync.module.ts
tools/modules/integrity.module.ts
```

### Rule: runtime handler files use `{domain}.ts`

```
tools/runtime/check.ts
tools/runtime/service.ts
tools/runtime/sync.ts
tools/runtime/integrity.ts
tools/runtime/app.ts      ← path helpers shared across handlers
```

### Rule: command names use dot-namespaced lowercase

```
content.validate
tokens.ds.lint
icons.generate
integrity.init
```

Domain comes first, then the verb or noun. Verbs: `validate`, `lint`, `generate`, `clean`, `sync`, `init`, `update`, `verify`, `sign`.

| Enforcement |
| ----------- |
| 📖 Doc only |

---

## Three-way mirroring contract

For any component that owns visitor-facing copy, three files must exist and their paths must align:

```
src/components/{path}/{Name}.astro
src/content/components/{lang}/{path}/{Name}.md
src/content/schemas/components/{path}/{Name}.ts
```

Where `{path}` is the same relative subpath in all three locations, and `{Name}` is the same PascalCase identifier.

**Test:** if a component renders any of the following, it is content-driven and must participate in mirroring: headings, paragraphs, button labels, CTA labels, navigation labels, aria labels intended for visitors, repeated structured copy.

| Enforcement                                                            |
| ---------------------------------------------------------------------- |
| 🔜 `mirroring.validate` — verify all three files exist and paths align |

---

## What the OS enforces today vs what is documentation-only

| Rule | OS Command | Status |
| --- | --- | --- |
| Page frontmatter has `title` and `metaDescription` | `content.validate` | ✅ Now |
| No hardcoded copy in Astro templates | `thin-copy.validate` | ✅ Now |
| `--ds-*` prefix on all CSS custom properties | `tokens.ds.lint` | ✅ Now |
| No raw hex/rgba colors in CSS | `tokens.colors.lint` | ✅ Now |
| No underscores in filenames across `apps/` and `packages/` | `naming.convention.lint` | ✅ Now |
| Component content file ↔ schema file triad completeness | `mirror.triad.validate` | ✅ Now |
| Dispatcher registrations match actual content and schema files | `dispatcher.sync.validate` | ✅ Now |
| No `<style>` blocks or inline `style=` in page route files | `route.thin.validate` | ✅ Now |
| `featureFlag:` YAML values match keys defined in `features.ts` | `feature.visibility.validate` | ✅ Now |
| Visitor routes under a `[param]/` top-level dir; dynamic params lowercase | `naming.pages.lint` | ✅ Now |
| No CSS or Markdown co-located with component sources in `src/components/` | `naming.components.lint` | ✅ Now |
| All CSS files under `src/styles/`; `global.css` exists | `naming.styles.lint` | ✅ Now |
| Raster images only in `src/assets/images/` | `assets.structure.lint` | ✅ Now |
| All `src/components/` `.astro` files (non-`section` path) end with `-component` at any depth; `section/` files end with `-section` | `naming.suffixes.lint` | ✅ Now (RFC-0020) |
| `src/styles/components/` root `.css` files end with `-component`; `section/` end with `-section` | `naming.suffixes.lint` | ✅ Now (RFC-0020) |
| `src/content/components/{lang}/` root `.md` files end with `-component` (except `layout.md`) | `naming.suffixes.lint` | ✅ Now (RFC-0020) |
| `src/content/components/{lang}/section/` `.md` files end with `-section` | `naming.suffixes.lint` | ✅ Now (RFC-0020) |
| No forbidden layer tokens in `src/pages/`; no `-style` in `src/styles/` outside components/ | `naming.suffixes.lint` | ✅ Now (RFC-0020) |
| Suffix-aware component path resolution in quartet mirror and feature graph checks | `mirror.quartet.validate`, `feature.graph.validate` | ✅ Now (RFC-0020) |
| `src/layouts/` contains exactly one file-level entry: `layout.astro` | `naming.layouts.lint` | ✅ Now (RFC-0020) |
| Content filename matches route filename | `naming.content.lint` | 🔜 Phase 6 |
| Schema path mirrors content path | `naming.schemas.lint` | 🔜 Phase 6 |
| Three-way mirroring completeness | `mirroring.validate` | 🔜 Phase 6 |
