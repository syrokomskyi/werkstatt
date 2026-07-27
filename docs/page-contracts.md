# Page Contracts

This document defines the structural contracts for visitor-facing Astro page routes across `apps/*`. It is referenced by RFC-0019 and enforced by `structure.hierarchy.validate`.

> **RFC-0047 update:** The `src/content/features/` directory and `feature.graph.validate` are retired. Feature visibility and behavior policy now lives in `policy:` frontmatter within RFC-0047 content domains (RFC-0183). Page composition is declared in `src/content/system.md` and authored as block-declarative `pages/{lang}/*.md` files.

---

## PC-1 · Route file location

Visitor-facing routes live under `src/pages/[lang]/`. Dynamic path parameters use lowercase identifiers. Enforced by `naming.pages.lint`.

## PC-2 · Route file is an orchestrator

A route file (`*.astro`) inside `src/pages/[lang]/` is an orchestrator. It:

- computes page-level data (lang, slugs, SEO metadata)
- instantiates `<Layout>`, `<Header>`, `<Footer>`
- calls `buildPage()` from `@gogol/share/page` (DNA-25)
- renders resolved blocks inside `<main>`

It does **not**:

- contain inline `<style>` blocks
- hard-code body copy
- render copy-owning components directly (outside a section)
- render navigation components directly (outside a navigation section)

## PC-3 · Page body is a section sequence

Everything rendered inside `<main>` is a sequence of section components dispatched by `buildPage()`. There is no top-level prose, no bare component calls, and no structural markup that is not owned by a section. This is the core of the `page → section → component → content` hierarchy (DNA-8, RFC-0019).

## PC-4 · Navigation section

Breadcrumbs are automatic on every non-home page (RFC-0229):

- breadcrumbs are rendered through the shared breadcrumbs section component from `@gogol/ui`
- the breadcrumbs section is the first non-shell child of `<main>`, before any content section
- the shared page route pipeline builds ONE canonical trail (`Home → …ancestors… → current page`) and projects it into both the visible section and the `BreadcrumbList` JSON-LD — they never drift
- ancestors come from `pages[].parentPageId` (authored), the surface tuple depth (PSEO), or the About page (person profiles); page content does NOT declare a breadcrumbs block
- an explicit breadcrumbs block is an advanced override only; it suppresses the automatic trail
- the route must not import or render breadcrumb components directly

This is enforced by `structure.hierarchy.validate` (delegation) and `breadcrumb.trail.validate` (hierarchy integrity).

## PC-5 · Section ordering

The following ordering is recommended where sections are present:

1. `navigation` section (breadcrumbs) — always first if present
2. `hero` section
3. `content` / `supporting` sections
4. `cta` section — last if present

There is no hard ordering enforcement beyond the navigation section requirement.

## PC-6 · Block-declarative page composition

Every page is a frontmatter-only `.md` file in `pages/{lang}/` with shape `kind: page`, `cosmicStar`, `title`, `description`, `lang`, `blocks[]`. Each `blocks[].type` resolves to a section component from `@gogol/ui` via `PLANET_IMPORT_PATHS`. No markdown body is permitted — prose lives in `prose/{lang}/` and is referenced via `blocks[].props.contentRef` (DNA-24, RFC-0026).

Enforced by `page.block.validate`.

## PC-7 · Shell components are outside page body

`layout.astro`, `header.astro`, and `footer.astro` are shell components. They are instantiated at the route level but are **not** part of the page body section tree. They are governed by their own component contracts and shared feature declarations, not by the page hierarchy contract.

## PC-8 · Machine-readable endpoints are exempt

Routes under `src/pages/api/` or any route with `export const prerender = false` that serves a JSON/XML/text response are exempt from the page body hierarchy contract. `structure.hierarchy.validate` skips these automatically.
