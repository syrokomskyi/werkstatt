# Scaling Playbook — Growing a Site Without Breaking the DNA

> **Scope.** This document describes how to grow any site in `apps/*` from a small prototype to a large content system without changing the core mental model. The DNA — the relationships between routes, content, schemas, components, styles, config, and semantic outputs — must survive at every stage.

---

## Core scaling principle

Scale by adding **more content and more compositions**, not by inventing parallel architectures.

As a project grows, these relationships must remain stable:

| Layer             | Owns                           |
| ----------------- | ------------------------------ |
| Routes            | Orchestration                  |
| Content           | Canonical meaning              |
| Schemas           | Validation                     |
| Components        | UI structure                   |
| Styles            | Visual implementation          |
| Config            | Visibility and href resolution |
| Semantic builders | Machine-readable projections   |

---

## Stage 1 — 1 to 10 pages

At this scale, most growth comes from adding standard visitor-facing pages.

**Typical work:**

- Add route files under `src/pages/[lang]/`
- Add mirrored page content under `src/content/pages/{lang}/`
- Add mirrored page schemas under `src/content/schemas/pages/`
- Register schemas in the pages dispatcher
- Compose pages from existing sections first

**Rule:** If a new page needs many brand-new sections, ask first whether existing section patterns can be reused with different content or `pageOverride`.

**Primary risk:** Hardcoding copy or section data in routes because it feels faster.

**OS commands to run:**

```sh
site-kernel run content.validate --site <name>
site-kernel run thin-copy.validate --site <name>
```

---

## Stage 2 — 10 to 50 pages

At this scale, page **archetypes** matter more than page count.

**Common archetypes to establish:**

- Standard content pages
- Long-form Markdown pages
- Listing pages
- Detail pages
- Generated pages

**Rules to reinforce:**

- Keep archetypes explicit; avoid page-specific one-off components unless structure is genuinely novel
- Move shared navigation and visibility policy into central helpers early
- Introduce breadcrumbs and shared page-shell patterns before local variations proliferate
- Establish the semantic layer before it becomes hard to retrofit

**Primary risk:** Every subpage starts becoming a bespoke mini-framework.

**OS commands to run:**

```sh
site-kernel pipeline build.check --site <name>
```

---

## Stage 3 — 50 to 200 pages

At this scale, dynamic routes, directory pages, and programmatic content usually appear.

**Typical additions:**

- Dynamic route files with `getStaticPaths()`
- Entity collections for repeatable content types
- Listing + detail page pairs
- Richer sitemap generation
- Stronger semantic discovery outputs

**Rules:**

- Dynamic routes must still resolve canonical content through validated collections
- Listing and detail pages must share the same visibility rules as static pages
- Programmatically generated pages must still enter the standard content/schema/navigation pipeline
- Do not create a separate architecture for "SEO pages" or generated pages

**Primary risk:** Introducing a second content system for large-scale or generated pages.

---

## Stage 4 — 200 to 1000+ pages

At large scale, the architecture survives only if governance becomes explicit.

**Required reinforcements:**

- Stricter schema discipline
- Stronger content contracts by page archetype
- Semantic drift checks
- Systematic navigation registries
- Clear publication and visibility rules
- Stronger asset and performance policy

**What changes at this stage:** Not the DNA itself — only the amount of automation and validation surrounding it.

**Primary risk:** Architectural drift caused by many small local exceptions.

**OS commands to run regularly:**

```sh
site-kernel pipeline build.check --site <name>
site-kernel run tokens.ds.lint --site <name>
site-kernel run tokens.colors.lint --site <name>
```

---

## Scaling reusable sections and components

When a project grows, section count increases faster than component quality unless reuse is managed deliberately.

**Reuse rule:**

| Situation                                  | Action                                 |
| ------------------------------------------ | -------------------------------------- |
| Same meaning structure + different copy    | Reuse the component; vary content      |
| Same structure + different page emphasis   | Use `pageOverride` or normalized props |
| Meaningfully different structure or schema | Create a new component                 |

**Signals that a section should stay shared:**

- Only headings, labels, or items differ
- Layout remains substantially the same
- Accessibility structure remains the same

**Signals that a new component is justified:**

- Different information architecture
- Different schema shape
- Different interaction model
- Different accessibility contract

---

## Scaling the content model

As content grows:

- Keep one canonical content system
- Prefer adding collections or schemas over adding ad hoc data files
- Use path structure as identity where possible
- Keep generated content entering the same canonical pipeline

**Do not scale by:**

- Embedding large content payloads in routes
- Creating shadow registries in components
- Splitting meaning across Markdown, JSON, and inline constants without a contract

---

## Scaling feature visibility

At small scale, visibility is a convenience. At large scale, visibility is infrastructure.

**As the site grows:**

- Keep page flags and section flags separate
- Add shared section keys when the same section pattern appears across pages
- Ensure navigation registries consume the same feature decisions as routes
- Ensure semantic outputs consume the same visibility policy

If a page disappears from UI but survives in breadcrumbs, cards, sitemaps, or `llms.txt`, scaling discipline has already failed.

---

## Scaling the design system

Visual complexity may increase, but style governance must remain simple.

**Rules:**

- Add new design tokens centrally (in `src/styles/global.css` or equivalent)
- Do not create local token namespaces inside components
- Keep component and page styles in `src/styles/`
- Preserve one approved mechanism for global base classes

Complex layouts are allowed. Untracked design values are not.

---

## Scaling the semantic layer

At small scale, semantic outputs may be modest. At large scale, they become a critical consistency surface.

**As the site grows:**

- Expand typed semantic contracts rather than ad hoc output code
- Keep stable IDs centralized in `src/semantic/ids.ts`
- Derive all machine-readable outputs from normalized meaning
- Share visibility rules with navigation and UI
- Add drift checks whenever semantic topology grows more complex

---

## What must survive at every scale

These nine properties must hold at every size. If any one breaks, the site has not scaled — it has forked into a weaker architecture:

1. File-based page ownership under `src/pages/`
2. Canonical meaning in `src/content/`
3. Three-way mirroring for copy-owning components
4. Thin routes that orchestrate rather than contain
5. Styles in `src/styles/` using `--ds-*` tokens only
6. Centralized visibility and navigation policy
7. Projection-based semantic outputs
8. `lang` propagation through page composition
9. Interactivity isolated behind hydration boundaries
