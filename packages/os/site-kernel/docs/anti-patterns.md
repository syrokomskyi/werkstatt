# Anti-Patterns — Forbidden Patterns That Break Architectural Portability

> **Scope.** These anti-patterns are forbidden in every site under `apps/*`. Each one breaks the architectural DNA — the portable structure of routes, content, schemas, components, styles, config, and semantic outputs. If a proposed change matches any item below, redesign it before proceeding.
>
> **Automation.** The _Automatable?_ column indicates whether the pattern can be caught by a kernel OS command now or in phase 2.

---

## AP-1 — Hardcoding visitor-facing copy in routes or components

**Example of violation:**

```astro
<h2>Our Services</h2>
<button aria-label="Contact us">...</button>
```

**Why it breaks DNA:**

- Bypasses canonical content in `src/content/`.
- Breaks reuse and localization.
- Creates hidden copy drift that validation cannot catch.

**Correct direction:**

- Keep canonical copy in `src/content/`.
- Component `.md` files hold generic defaults; project-specific section copy belongs in the page frontmatter under `componentOverrides` (RFC-0004).
- Load content through shared content infrastructure (Astro content APIs, component-content helpers).

| Automatable? | OS Command           |
| ------------ | -------------------- |
| ✅ Now       | `thin-copy.validate` |

---

## AP-2 — Creating a parallel content system

**Examples of violation:**

- `.json` files inside `src/content/`
- Ad hoc data registries under `src/data/`
- Component-local constants that duplicate content entries
- Hidden AI-only content trees separate from visitor-facing content

**Why it breaks DNA:**

- Creates multiple sources of truth.
- Bypasses schema validation and established content loaders.
- Makes semantic outputs unreliable.

**Correct direction:**

- One canonical content system in `src/content/`.
- Schema-validate all entries.
- No parallel data trees.

| Automatable? | OS Command                                                                     |
| ------------ | ------------------------------------------------------------------------------ |
| 🔜 Phase 2   | `naming.content.lint` — flag `.json` files and unexpected directory structures |

---

## AP-3 — Skipping three-way mirroring for a component with copy

**What is required:** Any component that owns visitor-facing copy must have all three files aligned:

```
src/components/{path}/{Name}.astro
src/content/components/{lang}/{path}/{Name}.md
src/content/schemas/components/{path}/{Name}.ts
```

**Why it breaks DNA:**

- Component content becomes unvalidated.
- Canonical meaning gets buried in component code.
- Localization and reuse break silently.

**Correct direction:**

- Before writing a component with any inline labels, headings, or CTA text, create the full mirror first.

| Automatable? | OS Command           |
| ------------ | -------------------- |
| 🔜 Phase 2   | `mirroring.validate` |

---

## AP-4 — Letting routes become content containers

**Examples of violation:**

- Large inline arrays of card data in a route file
- Hardcoded breadcrumb labels in a route
- Route-local navigation maps
- Page-local schema fragments built inline

**Why it breaks DNA:**

- Pages stop being thin orchestrators.
- Reusable logic becomes trapped in one route.
- Maintenance requires touching route files for copy changes.

**Correct direction:**

- Keep routes as orchestrators: load content, compose sections, pass props.
- Move copy to `src/content/`, navigation to config helpers, schemas to `src/content/schemas/`.

| Automatable? | OS Command |
| --- | --- |
| ✅ Now (partial) | `thin-copy.validate` — flags inline copy in routes |
| 🔜 Phase 2 | `thin-routes.validate` — detect inline arrays, ad hoc link maps, inline schema logic |

---

## AP-5 — Scattering feature visibility logic across pages and components

**Example of violation:**

```ts
const showBanner = Astro.url.searchParams.get("beta") === "1";
```

**Why it breaks DNA:**

- Visibility becomes untestable and inconsistent.
- Navigation, UI, and semantic outputs drift apart.
- Disabling a page or section requires hunting across many files.

**Correct direction:**

- Define visibility centrally in `src/configure/features.ts`.
- Read it through shared helpers.

| Automatable? | OS Command           |
| ------------ | -------------------- |
| 📖 Doc only  | Architectural review |

---

## AP-6 — Leaving dead links to disabled targets

**What happens:** A page or section is disabled but still visible in header, footer, cards, breadcrumbs, `llms.txt`, or other discovery surfaces.

**Why it breaks DNA:**

- UI and configuration disagree.
- Semantic/discovery outputs become untrustworthy.
- SEO and LLM outputs point to pages that no longer exist for visitors.

**Correct direction:**

- When disabling a page, update the feature flag and verify it disappears from all navigation, cards, sitemaps, and semantic outputs before committing.

| Automatable? | OS Command                 |
| ------------ | -------------------------- |
| 📖 Doc only  | Manual cross-surface check |

---

## AP-7 — Using raw href strings as canonical navigation truth

**Examples of violation:**

- Storing environment-dependent hrefs as the primary source in content
- Duplicating path rules inside multiple components

**Why it breaks DNA:**

- Href resolution logic becomes fragmented and inconsistent.
- Changing a route requires hunting across content, components, and config.

**Correct direction:**

- Store semantic targets in content where appropriate.
- Resolve real href values and visibility centrally in navigation helpers (`src/configure/navigation.ts` or equivalent).

| Automatable? | OS Command        |
| ------------ | ----------------- |
| 📖 Doc only  | Navigation review |

---

## AP-8 — Using inline styles or non-token CSS values

**Examples of violation:**

- Inline `<style>` blocks in `.astro` files
- Inline `style="..."` attributes
- Raw hex colors: `color: #3b82f6`
- Raw rgba values: `background: rgba(0, 0, 0, 0.5)`
- Hardcoded spacing, radii, or shadows

**Why it breaks DNA:**

- Bypasses token enforcement.
- Reduces reuse.
- Hides styling policy in markup.
- Makes design changes require hunting across component files.

**Correct direction:**

- Keep styles in `src/styles/`.
- Use only `--ds-*` tokens for all design values.

| Automatable? | OS Command                                  |
| ------------ | ------------------------------------------- |
| ✅ Now       | `tokens.ds.lint` — enforces `--ds-*` naming |
| ✅ Now       | `tokens.colors.lint` — rejects raw hex/rgba |

---

## AP-9 — Treating components as feature registries, routers, or semantic builders

**What is forbidden:**

- Components that quietly define page feature flags
- Components that implement canonical URL policy
- Components that act as page registries
- Components that compose cross-page JSON-LD inline

**Why it breaks DNA:**

- Ownership boundaries collapse.
- Feature logic becomes coupled to presentation.
- Reuse becomes fragile.

**Correct direction:**

- Components deliver UI structure and render already-resolved data.
- Feature decisions: `src/configure/features.ts`.
- Semantic outputs: `src/semantic/`.

| Automatable? | OS Command                |
| ------------ | ------------------------- |
| 📖 Doc only  | Component boundary review |

---

## AP-10 — Importing heavy interactive dependencies into the static shell

**Examples of violation:**

- Importing `three`, `@react-three/fiber`, or similar heavy browser-first dependencies from `.astro` shells or generic server-side utilities

**Why it breaks DNA:**

- Destroys performance budgets.
- Leaks client complexity into the server/static layer.

**Correct direction:**

- Isolate heavy interactivity inside dedicated hydrated islands or effect wrappers.
- Heavy browser dependencies must never appear in server-rendered module paths.

| Automatable? | OS Command                                                         |
| ------------ | ------------------------------------------------------------------ |
| 🔜 Phase 2   | `hydration.validate` — detect heavy imports in server-side modules |

---

## AP-11 — Expanding language generation or route strategy locally

**Examples of violation:**

- Changing `getStaticPaths()` language behavior for one route only
- Introducing SSR or non-prefixed content routes without updating the rest of the system

**Why it breaks DNA:**

- Route generation, middleware, sitemap, canonical URLs, and content availability are coordinated concerns.
- A local change silently breaks other surfaces.

**Correct direction:**

- Language and route generation strategy changes require a coordinated architectural review of the whole pipeline.

| Automatable? | OS Command           |
| ------------ | -------------------- |
| 📖 Doc only  | Architectural review |

---

## AP-12 — Modifying middleware casually

**Examples of violation:**

- Reordering middleware without reviewing the full request pipeline
- Adding heavy imports or blocking logic to middleware

**Why it breaks DNA:**

- Middleware runs on every request.
- Architectural assumptions about redirects and request flow can silently break.

**Correct direction:**

- Treat middleware as architectural infrastructure, not convenience code.
- Any middleware change requires reviewing the full request pipeline.

| Automatable? | OS Command           |
| ------------ | -------------------- |
| 📖 Doc only  | Architectural review |

---

## AP-13 — Adding redundant frontmatter discriminators

**Example of violation:**

```yaml
pageType: "service"
```

when the content path already encodes that identity (`src/content/pages/{lang}/services/`).

**Why it breaks DNA:**

- Duplicates identity in multiple places.
- Creates drift risk when path and discriminator disagree.

**Correct direction:**

- Let path structure and collection boundaries do the discrimination.
- Use `pageType` or similar discriminators only when the path cannot encode the distinction.

| Automatable? | OS Command                                                                 |
| ------------ | -------------------------------------------------------------------------- |
| 🔜 Phase 2   | `naming.content.lint` — flag redundant discriminators detectable from path |

---

## AP-14 — Building machine-readable outputs from UI instead of meaning

**Examples of violation:**

- Generating JSON-LD inside sections or reusable components
- Deriving structured data from rendered markup
- Maintaining separate AI-only facts outside canonical content

**Why it breaks DNA:**

- Semantics drift from visible meaning.
- Cross-page entities lose stable identity.
- LLM and search outputs disagree with what visitors see.

**Correct direction:**

- Normalize canonical meaning in `src/semantic/`.
- Build projections from that normalized model.
- JSON-LD delivery must happen in layout-level thin delivery components.

| Automatable? | OS Command                |
| ------------ | ------------------------- |
| 🔜 Phase 2   | `semantic.drift.validate` |

---

## AP-15 — Using visitor-facing decorative emoji, Unicode symbols, or raw inline SVG

**Examples of violation:**

- Emoji in visitor-facing UI copy (✓, →, ★)
- Unicode arrows or checkmarks as decorative icons
- Raw inline SVG where an approved generated icon component exists

**Why it breaks DNA:**

- Bypasses the project icon system.
- Creates inconsistent visual language.
- Icon updates require manual find-and-replace instead of regenerating.

**Correct direction:**

- Use generated icon components according to the icon usage guide.
- Run `icons.generate` to update the icon set.

| Automatable? | OS Command                                                 |
| ------------ | ---------------------------------------------------------- |
| 🔜 Phase 2   | `thin-copy.validate` extended with emoji/raw SVG detection |

---

## AP-16 — Skipping `lang` propagation

**Example of violation:**

```astro
<HeroSection />
<Footer />
```

when the route already resolved `lang`.

**Why it breaks DNA:**

- Components silently fall back to defaults.
- Future localization becomes brittle.
- Components become implicitly coupled to a single language.

**Correct direction:**

- Pass `lang={lang}` from route to layout to every child that accepts it.
- If a component does not accept `lang`, consider whether it should.

| Automatable? | OS Command                                                                       |
| ------------ | -------------------------------------------------------------------------------- |
| 🔜 Phase 2   | `lang.validate` — detect components that accept `lang` but are called without it |

---

## AP-17 — Putting project-specific copy in component `.md` files

**Examples of violation:**

- Section `.md` file contains organization name, city, registration number, or domain-specific descriptions
- Component default content references a specific project, country, or partner by name

**Why it breaks DNA:**

- Component defaults lose portability — they cannot be reused by another project as-is.
- Content ownership splits: some project text in pages, some in components.
- Localization requires editing both page and component `.md` files.

**Correct direction:**

- Keep component `.md` files as **generic stubs** with placeholder or universal defaults.
- Put all project-specific section copy in the page frontmatter under `componentOverrides` (RFC-0004).
- Site-wide components (header, footer, layout, breadcrumbs) are exempt because their content is the same on every page.

| Automatable? | OS Command                                                                  |
| ------------ | --------------------------------------------------------------------------- |
| 🔜 Phase 2   | `component-content.portability` — detect project-specific terms in defaults |

---

## AP-18 — Loading a component-owned script from layout or a parent component

**Examples of violation:**

```astro
<!-- In layout.astro -->
<script is:inline src="/scripts/components/copyright.js" defer></script>
```

when `copyright.js` belongs to `copyright.astro`, not to the layout.

**Why it breaks DNA:**

- The script runs on every page, even when the component is absent.
- Wastes network bandwidth and parse time for pages that do not use the component.
- Violates colocation — the component's behavior is managed from a different file.
- Breaks RFC-0009 intent: `@client-script: required` declares the script belongs to the component, not to its consumers.

**Correct direction:**

- Place the `<script is:inline src="/scripts/components/{path}/{name}.js" defer>` tag inside the owning `.astro` component file.
- This is Class S-1 per RFC-0011 — script must be colocated with the component that owns it.

| Automatable? | OS Command                                             |
| ------------ | ------------------------------------------------------ |
| 🔜 Phase 2   | `scripts.placement.validate` (RFC-0011) — SP-01, SP-03 |

---

## AP-19 — Inline `<script is:inline>` block exceeding 5 lines in a layout component

**Example of violation:**

```astro
<!-- In layout.astro -->
<script is:inline>
  (() => {
    // ... 30+ lines of logic ...
  })();
</script>
```

**Why it breaks DNA:**

- Inline scripts are not cached by the browser — the full payload is retransmitted on every page load.
- Accumulating logic in layout makes it a "dumping ground for unrelated utilities" — violating the Class 4 layout contract.
- Growing inline blocks in layout are impossible to test, import, or reuse independently.

**Correct direction:**

- Move logic to `src/scripts/{name}.ts` (or a sub-module) and load via Astro's native `<script>` with `import` from `layout.astro`.
- For layout-global S-2 orchestrators, follow the `apps/main` pattern: `src/scripts/layout-scroll.ts` with `has()` DOM guards + `await import()` per sub-feature.
- `public/scripts/layout/` MUST NOT be used — S-2 scripts always go through `src/scripts/` and Astro bundling.
- This is Class S-2 per RFC-0011.

| Automatable? | OS Command                                      |
| ------------ | ----------------------------------------------- |
| 🔜 Phase 2   | `scripts.placement.validate` (RFC-0011) — SP-02 |

---

## Summary

| AP    | Pattern                                     | Current enforcement                       |
| ----- | ------------------------------------------- | ----------------------------------------- |
| AP-1  | Hardcoded copy in routes/components         | ✅ `thin-copy.validate`                   |
| AP-2  | Parallel content system                     | 🔜 Phase 2                                |
| AP-3  | Missing three-way mirroring                 | 🔜 Phase 2                                |
| AP-4  | Routes as content containers                | ✅ partial / 🔜 Phase 2                   |
| AP-5  | Scattered feature visibility                | 📖 Doc only                               |
| AP-6  | Dead links to disabled targets              | 📖 Doc only                               |
| AP-7  | Raw hrefs as navigation truth               | 📖 Doc only                               |
| AP-8  | Inline styles / non-token CSS               | ✅ `tokens.ds.lint`, `tokens.colors.lint` |
| AP-9  | Components as feature/semantic hubs         | 📖 Doc only                               |
| AP-10 | Heavy deps in static shell                  | 🔜 Phase 2                                |
| AP-11 | Local route strategy expansion              | 📖 Doc only                               |
| AP-12 | Casual middleware modification              | 📖 Doc only                               |
| AP-13 | Redundant frontmatter discriminators        | 🔜 Phase 2                                |
| AP-14 | Machine outputs from UI                     | 🔜 Phase 2                                |
| AP-15 | Emoji / Unicode / raw SVG icons             | 🔜 Phase 2                                |
| AP-16 | Missing `lang` propagation                  | 🔜 Phase 2                                |
| AP-17 | Project-specific copy in component defaults | 🔜 Phase 2                                |
| AP-18 | Component script loaded from layout         | 🔜 `scripts.placement.validate`           |
| AP-19 | Large inline script block in layout         | 🔜 `scripts.placement.validate`           |
