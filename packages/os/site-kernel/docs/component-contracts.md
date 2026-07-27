# Component Contracts — Cross-Site Component Architecture

> **Scope.** This document defines portable contracts for structural components, content-driven components, sections, layout primitives, and hydrated islands in every site under `apps/*`. A component's own implementation may not bypass these contracts; site-level AGENTS.md may add stricter rules.

---

## Core rule

A component is a **delivery unit of UI structure**.

Depending on its class, it may own: markup, local composition, externally imported CSS, accessibility wiring, typed props, hydration boundaries for interactive islands.

**A component must not silently become:**

- A hidden content source
- A page-level router
- A feature registry
- A schema builder
- A place for raw hardcoded visitor-facing copy when canonical content is required

---

## Component classes

### Class 1 — Pure structural component

**Examples:** wrappers, grids, cards that receive all copy as props, visual separators, layout primitives

**May own:** markup structure, CSS import, accessibility relationships from props, composition of children.

**May skip three-way mirroring:** Yes, if it has no visitor-facing copy, no inline labels, and no hidden semantic facts.

**Must not:** Hardcode labels, aria text, or CTA copy; read content collections directly unless that is its documented role.

### Class 2 — Content-driven reusable component

**Examples:** header, footer, CTA block, stat block, testimonials block

**Owns:** Stable UI structure, loading canonical copy from content, rendering schema-validated data.

**Required mirror (COMPONENT-QUARTET-MIRROR):**

```
src/components/{Name}.astro                   ← always required (Q-01)
src/content/components/{lang}/{Name}.md       ← always required
src/content/schemas/components/{Name}.ts      ← always required
src/styles/components/{Name}.css              ← always required (Q-04)
public/scripts/{Name}.js                      ← only when @client-script: required (Q-02)
```

**Must not:** Pull unrelated page logic, become responsible for feature definition.

### Class 3 — Section component

A section is a content-driven component designed for page composition.

**Canonical locations:**

```
src/components/section/{Name}.astro                  ← always required (Q-01)
src/content/components/{lang}/section/{Name}.md      ← always required
src/content/schemas/components/section/{Name}.ts     ← always required
src/styles/components/section/{name}.css             ← always required (Q-04)
public/scripts/section/{name}.js                     ← only when @client-script: required (Q-02)
```

**Typical props:** `lang`, `sectionNumber?`, `pageOverride?`

**Owns:** One section-level UI pattern, loading its default content, optionally merging page-specific overrides, section-level accessibility ids and structure.

**Content model (RFC-0004):**

- Section `.md` files contain **generic defaults** (stubs) that work for any project.
- **Project-specific copy** is provided via `componentOverrides` in the page `.md` frontmatter. The page route extracts the override and passes it as `pageOverride`.
- Do not put project-specific visitor-facing copy in section `.md` files. Keep them portable.

**Must not:** Decide whether it exists on a page (that belongs to route + feature config), own page-shell semantics, introduce page-specific variants when `pageOverride` is enough, contain project-specific copy in its `.md` default content.

### Class 4 — Layout component

**Examples:** `layout.astro`, shell components that wrap the whole document or major subsections

**Owns:** Document shell, shared metadata delivery, stylesheet wiring, slots for page content, delivery of already-built semantic outputs.

**Must not:** Normalize content meaning on its own, hardcode page-local facts that belong in routes or semantic adapters, become a dumping ground for unrelated utilities.

**Script rules (RFC-0011):**

- Only **Class S-2** (layout-global) scripts are permitted in `layout.astro`.
- S-2 scripts must use Astro's native `<script>` with `import`, or `<script is:inline src="/scripts/layout/{name}.js" defer>` for vanilla JS.
- **Bare `<script is:inline>` blocks exceeding 5 lines are forbidden** in any Class 4 component (AP-19).
- **`public/scripts/components/` paths must never appear in `layout.astro`** (AP-18). Those are Class S-1 and must live in their owning component.

### Class 5 — Navigation component

**Examples:** header, footer, breadcrumb UI, menu drawers

**Owns:** Rendering labels and resolved links, accessibility of navigation controls, display logic based on already-resolved link registries or content.

**Must not:** Become the source of truth for visitor-facing labels, resolve raw business visibility if a central config exists.

### Class 6 — Hydrated island

**Examples:** accordion, tabs, search UI, calculators, lightweight interactive widgets

**Owns:** Client-side interactivity, browser-only state, event handling, minimal hydration boundary.

**Must not:** Leak heavy interactive dependencies into the non-interactive shell, replace canonical content as the only source of meaning, be embedded in page code when it deserves a dedicated component boundary.

---

## Quartet mirroring test (RFC-0009)

Apply this test to determine whether a component requires mirroring:

**If a component renders any of the following, it is content-driven and must mirror:**

- Headings
- Paragraphs
- Button labels
- CTA labels
- Navigation labels
- Aria labels or hidden helper text intended for visitors
- Repeated structured copy: features, FAQs, stats, cards, steps

**If a component only receives already-prepared text via props and does not own canonical copy, it may remain purely structural.**

### Mirroring path rules (COMPONENT-QUARTET-MIRROR)

For component `src/components/{path}/{Name}.astro` that owns copy:

```
src/components/{path}/{Name}.astro             ← Q-01: always required
src/content/components/{lang}/{path}/{Name}.md ← always required
src/content/schemas/components/{path}/{Name}.ts ← always required
src/styles/components/{path}/{name}.css        ← Q-04: always required
public/scripts/{path}/{name}.js                ← Q-02: only when @client-script: required
```

The `{path}` subpath and `{Name}` filename must be identical across all present legs.

**Script naming rule:** `public/scripts/` mirrors the `src/styles/components/` hierarchy exactly. The script stem must equal the `.astro` stem. A mismatch (`copyright-year-sync.js` for `copyright.astro`) is a violation caught by `mirror.quartet.validate`.

**Client-script directive:** Add `// @client-script: required` as a comment in the `.astro` file to declare that a `public/scripts/` entry is required for this component.

**Automated enforcement:** Run `pnpm exec site-kernel run mirror.quartet.validate --site <app>` to check all four legs. See `packages/os/site-kernel-checks/docs/check-module-guide.md` for per-rule remediation.

---

## CSS contract

Every component must follow these style boundaries:

- Styles live in `src/styles/`, never inline in `.astro` files
- Components import external CSS files (`import "../styles/components/name.css"` or equivalent)
- Only `--ds-*` tokens define design values
- `.astro` files do not contain `<style>` blocks or `style="..."` attributes
- Shared base classes belong in `src/styles/global.css`, not copy-pasted across component CSS files

---

## Accessibility contract

Components are responsible for local accessibility correctness:

**Responsible for:**

- Correct heading relationships inside the component
- Correct button labels
- Correct form labels
- Correct `aria-labelledby` / `aria-describedby` wiring when needed
- Semantic HTML first; ARIA second

**Not responsible for:**

- Inventing canonical content separate from visible text
- Hiding critical meaning only in ARIA strings absent from canonical content

---

## Prop contract rules

A component prop should be one of:

- Context from above such as `lang`
- Display modifiers such as theme variants or section numbers
- Already-normalized data prepared by a route or helper
- Override data explicitly documented as an escape hatch (`pageOverride?`)

**Avoid props that are hidden architecture leaks:**

- `rawHrefMap`
- `pageType`
- Giant untyped `data` objects
- Duplicate copies of content already in `src/content/`
- Booleans that recreate feature registry logic ad hoc

---

## Reuse rules

**Create a new component when:**

- The markup pattern is genuinely reusable
- The schema shape differs enough from existing components
- The visual structure cannot be represented as an override of an existing component
- The page would otherwise repeat non-trivial UI blocks inline

**Reuse an existing component when:**

- Only headings, labels, items, or CTA text differ
- `pageOverride` or normalized props are sufficient
- The difference is visual styling, not meaning structure

Do not create a new component just because one page needs a different sentence.

---

## Signals that a component is drifting

Redesign when any of these appear:

- The component contains hardcoded copy and content loading at the same time
- The component resolves multiple unrelated feature flags
- The component contains route-like conditional branches
- The component generates JSON-LD or cross-page entity facts
- The component keeps growing new variant props that really describe different abstractions
- The component duplicates styles or markup already stabilized elsewhere

---

## Definition of done for a new component

A component is correctly integrated when **all** of the following are true:

- [ ] Its class is clear: structural, content-driven, section, layout, navigation, or island
- [ ] Its source of truth for copy is explicit (generic defaults in `.md`, project-specific in page `componentOverrides`)
- [ ] Mirroring exists when required (COMPONENT-QUARTET-MIRROR: `.astro` + content + schema + CSS; script when declared)
- [ ] `// @client-script: required` is present in `.astro` if and only if a `public/scripts/` entry exists
- [ ] Its props are typed and minimal
- [ ] Its CSS lives in `src/styles/components/`; no inline styles
- [ ] It does not own page-level or site-level policy by accident
- [ ] `mirror.quartet.validate` passes with exit 0 after the component is wired
- [ ] Another project could transplant the component pattern without transplanting domain copy
- [ ] If the component has a `public/scripts/` entry (S-1), the `<script src>` tag is inside the component file, not in `layout.astro`
- [ ] `scripts.placement.validate` passes with exit 0 (RFC-0011)
