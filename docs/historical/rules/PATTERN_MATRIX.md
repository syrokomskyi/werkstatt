# PATTERN MATRIX — concern to implementation map

> Use this matrix to answer two questions quickly: where does a responsibility live in the current project, and is that responsibility part of the portable DNA or only a local example?

---

## How to read this file

- **Concern** = an architectural responsibility
- **Current implementation point** = where that concern lives in this repository
- **DNA status** = whether the pattern must survive in any project built on this architecture
- **Portability note** = what may change when transplanting the pattern into another project

---

## Content loading and validation

| Concern | Current implementation point | DNA status | Portability note |
| --- | --- | --- | --- |
| Page content entries | `src/content/pages/{lang}/**/*.md` | **Core** | Content collections may broaden, but page-shell meaning must remain canonical. |
| Prose content entries | `src/content/prose/{lang}/**/*.md` | **Core** | Long-form prose with language fallback must remain. |
| Site shell labels | `src/content/site/{lang}/labels.md` | **Core** | Header/footer nav IDs and brand copy live in content. |
| Navigation labels and targets | `src/content/navigation/{lang}/navigation.md` | **Core** | Navigation owns labels, order, groups, and semantic targets. |
| Business data | `src/content/business/{lang}/**/*.md` | **Core** | Business data consumed by `@gogol/business`. |
| Route registry | `src/content/system.md` (`pages[].pageId` + `pages[].routes`) | **Core** | Single canonical manifest for routes, planets, and i18n. |

---

## Page ownership and routing

| Concern | Current implementation point | DNA status | Portability note |
| --- | --- | --- | --- |
| File-based visitor-facing routing | `src/pages/[lang]/**/*.astro` | **Core** | Folder depth may change; file-based route ownership should remain. |
| Build-time route generation policy | `getStaticPaths()` in route files reading `system.md` route registry | **Core** | The exact generation strategy may change only as a coordinated architectural decision. |
| Shared document shell | `src/layouts/layout.astro` | **Core** | The layout name may differ; one thin shared shell should remain. |
| Thin route composition | page routes under `src/pages/[lang]/` | **Core** | Individual page types may vary; routes must remain orchestrators. |
| Language redirect behavior | `src/middleware.ts` + middleware modules | **Project-level implementation of a core concern** | Another project may choose a different redirect mechanism, but language policy must remain explicit and centralized. |

---

## Components and sections

| Concern | Current implementation point | DNA status | Portability note |
| --- | --- | --- | --- |
| Section component location | `src/components/section/*.astro` | **Core** | Folder names may vary; sections as reusable page building blocks should remain. |
| Non-section reusable components | `src/components/*.astro` | **Core** | Exact component taxonomy may differ; ownership boundaries must remain. |
| Per-page copy deltas for reused sections | `pageOverride?: Partial<T>` pattern in section components | **Core** | The prop name may change; the concept of override-without-forking should remain. |
| Navigation rendering components | `src/components/header.astro`, `Footer.astro`, `Breadcrumbs.astro` | **Example built on core patterns** | Specific components change by project; content-driven navigation rendering remains portable. |
| Markdown body rendering | `src/components/MarkdownPage.astro` | **Reusable optional pattern** | Useful for long-form pages; another project may implement the same contract with a different component. |

---

## Styling system

| Concern | Current implementation point | DNA status | Portability note |
| --- | --- | --- | --- |
| Design token namespace | `--ds-*` tokens in `src/styles/global.css` and related stylesheets | **Core** | Token names may evolve carefully; tokenized styling as a rule must remain. |
| Global base classes | `src/styles/global.css` linked from `src/layouts/layout.astro` | **Core** | The exact import mechanism may vary; global shared classes must still load centrally. |
| Component styles | `src/styles/components/**` | **Core** | Folder structure may vary; styles must remain external to `.astro` files. |
| Page styles | `src/styles/pages/**` | **Core** | Optional for small pages, but page-level style ownership should stay explicit. |
| Visual theme variants | classes and tokens used throughout section/component CSS | **Example built on core patterns** | Themes and skins are project-specific; token-governed styling is the DNA. |

---

## Visibility and navigation policy

| Concern | Current implementation point | DNA status | Portability note |
| --- | --- | --- | --- |
| Header nav filter | `src/content/site/{lang}/labels.md` (`header.navIds`) | **Core** | Explicit nav ID list; header does not auto-show all navigation items. |
| Footer nav filter | `src/content/site/{lang}/labels.md` (`footer.navIds`) | **Core** | Explicit nav ID list separate from header. |
| Navigation labels and targets | `src/content/navigation/{lang}/navigation.md` | **Core** | Labels, order, groups, and semantic targets by `pageId`. |
| Canonical route registry | `src/content/system.md` (`pages[].routes`) | **Core** | Language-keyed public slugs; navigation does not own route slugs. |
| Content-driven nav labels | `site/{lang}/labels.md` + `navigation/{lang}/navigation.md` | **Core** | Actual labels and menus are project-specific; storage location principle must remain. |

---

## Semantic layer and machine-readable outputs

| Concern | Current implementation point | DNA status | Portability note |
| --- | --- | --- | --- |
| Portable semantic contracts | `src/semantic/models.ts` | **Core** | Contracts will differ by domain, but typed semantic normalization must remain. |
| Stable semantic IDs | `src/semantic/ids.ts` | **Core** | ID conventions may change by project; centralization must remain. |
| Cross-page semantic extraction | `src/semantic/extract.ts`, `src/semantic/site-profile.ts` | **Core** | Exact file split may vary; shared entity facts must not be duplicated across pages. |
| Page semantic composition | `src/semantic/pages.ts` | **Core** | Another project may use adapters per page type; page meaning must still normalize before projection. |
| JSON-LD builders | `src/semantic/jsonld.ts`, `src/semantic/jsonld/*` | **Core** | Builder topology may evolve; projection-based architecture must remain. |
| LLM-oriented text projections | `src/semantic/llms.ts`, `src/pages/llms.txt.ts`, `src/pages/llms-full.txt.ts` | **Core** | Output names may vary; machine-readable outputs must still derive from the same semantic source. |
| Thin structured data delivery | `src/components/seo/structured-data.astro` + `src/layouts/layout.astro` | **Core** | The delivery component may be renamed; delivery boundaries must remain thin. |
| Semantic drift validation | `scripts/check/validate-semantic-drift.ts` | **Core for larger projects** | Small projects may add this later, but once semantic topology grows, drift checks become mandatory. |

---

## Scripts and operational tooling

| Concern | Current implementation point | DNA status | Portability note |
| --- | --- | --- | --- |
| Service/generation script boundary | `scripts/service/**` | **Core** | Folder names may vary; responsibility split must remain. |
| Validation/check script boundary | `scripts/check/**` | **Core** | Exact checks evolve; validation concerns must remain separated from generation scripts. |
| TypeScript script runtime | `package.json` scripts invoking `tsx` | **Core in this architecture** | Another project may use a different TS runtime, but direct unmanaged script execution should be avoided. |

---

## Interactivity and heavy dependencies

| Concern | Current implementation point | DNA status | Portability note |
| --- | --- | --- | --- |
| Hydrated islands for interaction | React/TSX components mounted with Astro client directives | **Core** | Another UI library may be used, but interactivity must stay behind explicit hydration boundaries. |
| Heavy browser-only effect isolation | dedicated effect wrappers / islands rather than shell imports | **Core** | File names and wrappers may change; heavy dependencies must remain isolated. |
| Shared client state | project-specific stores/patterns when needed | **Optional pattern** | State management choice can vary as long as it does not leak into the static shell architecture. |

---

## Assets and presentation systems

| Concern | Current implementation point | DNA status | Portability note |
| --- | --- | --- | --- |
| Raster image policy | `image-usage.md` + content-local `assets/` + Astro `<Image />` | **Core project rule** | Optimized assets colocated with owning content domain (`pages/`, `prose/`, `site/`, `business/`). |
| Icon system policy | `icon-usage.md` + generated icon components | **Core project rule** | Another project may swap icon sources, but generated/managed icon components should remain preferred over emoji or inline SVG. |

---

## What is example-only in the current project

The following are examples built on the DNA, not the DNA itself:

- the specific set of section components in `packages/ui/src/sections/`
- the specific pages currently present under `src/content/pages/{lang}/`
- the current brand assets and icon sets
- the current optional generated open-source page pattern
- the exact design language, imagery, and copy structure of the current brand

If those can be replaced while the route/content/system.md/semantic relationships remain intact, they are examples, not architecture.
