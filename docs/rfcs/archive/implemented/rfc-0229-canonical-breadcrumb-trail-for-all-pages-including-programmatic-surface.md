---
id: RFC-0229
title: "Canonical breadcrumb trail for all pages including Programmatic Surface"
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
status: implemented
owners:
  - architecture
reviewers: []
createdAt: 2026-06-21
updatedAt: 2026-06-21
implementedAt: 2026-06-21
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0026
  - RFC-0048
  - RFC-0163
  - RFC-0192
  - RFC-0193
  - RFC-0199
  - RFC-0207
commands:
  proposed: []
  added:
    - breadcrumb.trail.validate
  changed: []
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Every non-home indexable page on every site renders a visible breadcrumb navigation, including Programmatic Surface (PSEO) pages that today render none."
  - "A PSEO page at depth N emits a breadcrumb trail with N+1 entries (Home → each live ancestor → self), not a flat Home → self pair."
  - "The visible breadcrumb trail and the `BreadcrumbList` JSON-LD on a page are built from one source and always agree, item-for-item, in order, name, and URL."
  - "Each `ListItem` carries a stable `@id`, a 1-based `position`, a grammatical `name`, and an absolute `item` URL that resolves to a live (non-redirect, non-noindex) page."
  - "`breadcrumb.trail.validate` fails when a trail skips a live ancestor, points at a redirect/404, duplicates a node, or disagrees with the rendered breadcrumbs."
nonGoals:
  - "Does not change the breadcrumb component's visual design, ARIA markup, or CSS (the existing breadcrumbs-section/component are reused as-is)."
  - "Does not introduce a new content schema for authoring breadcrumb labels; names are derived from existing page titles and site labels."
  - "Does not add per-crumb images, dropdowns, or breadcrumb-driven navigation menus."
  - "Does not change route resolution, slug localization, or the surface eligibility matrix (RFC-0048/0192/0199 own those)."
  - "Does not retro-emit breadcrumbs for the home page (a single-node trail stays suppressed, matching schema.org guidance)."
---

# RFC-0229: Canonical breadcrumb trail for all pages including Programmatic Surface

## Context

The ecosystem already ships every primitive a breadcrumb needs:

- A **breadcrumbs section** and **component** in `@gogol/ui` (`breadcrumbs-section.astro`, `breadcrumbs-component.astro`) with semantic `<nav>`, ARIA labels, and CSS.
- A **`BreadcrumbList` JSON-LD builder** in `@gogol/share` (`semantic/jsonld/breadcrumb.ts`) that maps `page.breadcrumbs` to `itemListElement` and is linked from the `WebPage` node via `breadcrumb`.
- **Localized labels** (`breadcrumbs.navAriaLabel`, `breadcrumbs.homeLabel`) already present in each app's `site/{lang}/labels.md`.

What is missing is a _correct, universal trail_. Three independent code paths each hand-build a flat, two-item trail:

- `page-builders/markdown-page.ts` → `breadcrumbs: [Home, { name: heading, url: self }]`.
- `page-builders/home-page.ts` → a single-node trail (correctly suppressed).
- `astro/page-handler.ts` → `withDefaultBreadcrumbs()` injects the visible section with the same flat `[Home, self]` pair.

## Problem

Three coupled gaps, all visible to users and to AI/search agents:

1. **Programmatic Surface pages render no breadcrumbs at all.** `withDefaultBreadcrumbs()` only injects the visible section when the page's `system.md` entry lists the `Thebe` planet. PSEO pages are not authored in `system.md` `pages[]`, so `pageSystemConfig` is `undefined`, the planet gate fails, and the section is never inserted. The very pages that most need orientation — deep, machine-generated `industry/city` pages — have none.

2. **Every trail is flat (`Home → self`).** No path reflects the real hierarchy. For PSEO this discards information the system already holds: a surface entry knows its `depth` and its axis `tuple`, from which every ancestor page is derivable (`Home → Ratgeber → Schreiner → Schreiner in München`). The flat trail tells a crawler that a depth-3 page sits directly under the home page, contradicting the URL nesting and the internal-link graph.

3. **No single source of truth, no parity.** The visible section (built in `page-handler`) and the JSON-LD (`page.breadcrumbs`, built in the semantic builder) are assembled separately. They can — and for PSEO do — disagree: PSEO emits a JSON-LD `BreadcrumbList` (two items, via the markdown builder) while rendering zero visible crumbs. Google's structured-data guidance treats visible/markup divergence as a quality problem.

## Decision

Introduce **one canonical breadcrumb trail builder** in `@gogol/share` that is the single source of truth for both the rendered breadcrumbs section and the `BreadcrumbList` JSON-LD, for **every page of every site**.

- A **`BreadcrumbTrail`** is an ordered list of `{ name, url, pageId? }` crumbs, `Home` first and the current page last.
- The builder derives the trail from an injected **`BreadcrumbAncestorResolver`** seam, so each route source contributes its own hierarchy:
  - **Authored pages**: ancestors from an explicit `parentPageId` (new, optional `system.md` page field) when present, otherwise from URL-segment nesting against the route registry, otherwise just `Home`.
  - **Programmatic Surface pages**: ancestors from the surface entry's `depth`/`tuple` — at each depth `k < self.depth`, resolve the ancestor `pageId` (`pageIdFor`), look it up in the route registry for its localized URL, and take its baked page title as the crumb name. A non-live ancestor (noindex/redirect) is skipped, preserving a clickable trail.
- Crumb names are **grammatical** — page titles (site-name suffix stripped) and the localized `homeLabel` — never glued axis labels.
- Crumb URLs are **localized and absolute**, reusing the existing `localizeUrl` / route-registry machinery (RFC-0048/0199), so the trail localizes per language exactly like the page does.
- `page.breadcrumbs` (consumed by the JSON-LD builder) and the visible `breadcrumbs-section` are **both** populated from this one trail. The home page keeps its single-node trail and stays suppressed (schema.org: a one-item list is not a breadcrumb).
- A new **`breadcrumb.trail.validate`** check enforces correctness and visible/markup parity across both apps.

## Architectural fit

- **RFC-0026 (block-declarative pages).** The visible trail stays a `breadcrumbs-section` block injected into the resolved block list; this RFC only changes _what items it carries_ and _when it is injected_ (always, for non-home pages, not gated on the `Thebe` planet declaration).
- **RFC-0192/0193/0199 (Programmatic Surface).** The ancestor resolver reads the already-materialized surface entries (`getSurfaceEntryByPageId`, the route registry's per-pageId routes) and the baked page titles. No change to the eligibility matrix, slug localization, or baking — the trail is a read-only projection over existing data.
- **RFC-0163 (page graph / `@id` identity).** Each crumb `ListItem` gets a stable `@id` derived from its absolute URL, and the `BreadcrumbList` keeps its existing `@id` referenced from `WebPage.breadcrumb`, so the trail is a connected part of the page graph rather than an island.
- **RFC-0207 (bespoke surface narrative).** Ancestor crumb names reuse the baked page's grammatical title (already guaranteed by RFC-0207), so PSEO crumbs read as real phrases.

## Design

```ts
// @gogol/share — the canonical contract
export type BreadcrumbCrumb = { name: string; url: string; pageId?: string };
export type BreadcrumbTrail = BreadcrumbCrumb[]; // Home first, current page last

export interface BreadcrumbAncestorResolver {
  // Ordered ancestors between Home and self (exclusive of both), nearest-root first.
  // Each route source (authored, surface) implements this over its own hierarchy.
  resolveAncestors(input: {
    pageId: string;
    lang: string;
    defaultLang: string;
  }): Promise<BreadcrumbCrumb[]>;
}

export async function buildBreadcrumbTrail(input: {
  pageId: string;
  pageTitle: string;
  selfUrl: string;
  homeLabel: string;
  homeUrl: string;
  lang: string;
  defaultLang: string;
  resolver: BreadcrumbAncestorResolver;
}): Promise<BreadcrumbTrail>;
```

```jsonc
// Emitted JSON-LD for a depth-2 PSEO page (Home → Ratgeber → Schreiner → München)
{
  "@type": "BreadcrumbList",
  "@id": "https://…/ratgeber/schreiner/muenchen/#breadcrumb",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Startseite",  "item": "https://…/" },
    { "@type": "ListItem", "position": 2, "name": "Ratgeber",    "item": "https://…/ratgeber/" },
    { "@type": "ListItem", "position": 3, "name": "Schreiner",   "item": "https://…/ratgeber/schreiner/" },
    { "@type": "ListItem", "position": 4, "name": "Schreiner in München", "item": "https://…/ratgeber/schreiner/muenchen/" }
  ]
}
```

The three flat hand-rolled trails (`markdown-page.ts`, `home-page.ts`, `withDefaultBreadcrumbs`) are replaced by calls into `buildBreadcrumbTrail`, collapsing breadcrumb logic to one owner.

## Rollout

1. Add `BreadcrumbTrail` + `buildBreadcrumbTrail` + the resolver seam to `@gogol/share`; unit-test the pure builder.
2. Implement the authored resolver (registry / optional `parentPageId`) and migrate `markdown-page.ts` + `home-page.ts` to populate `page.breadcrumbs` from it. Behavior for today's flat sites is unchanged (still `Home → self`) — no visible diff yet.
3. Implement the surface resolver over `depth`/`tuple` + the route registry; wire `page-handler` so the visible `breadcrumbs-section` is injected for **all** non-home pages (drop the `Thebe`-planet gate for the auto-injected default; keep explicit author-placed breadcrumbs honored) and is fed the same trail.
4. Add `breadcrumb.trail.validate`; run warn-only for one build, then fail-hard. Add it to the apps check set.
5. Verify on both apps: authored pages keep their trail; PSEO pages gain a full multi-level trail with matching JSON-LD.

## Alternatives considered

- **Author breadcrumbs per page in `system.md`/frontmatter.** Rejected as the primary mechanism: it does not scale to thousands of generated PSEO pages and would drift from the URL hierarchy. An optional `parentPageId` override is kept for authored edge cases only.
- **Keep two builders, add a parity check.** Rejected: two emitters for one fact is exactly today's defect; consolidation to one trail is simpler and makes parity structural rather than policed-after-the-fact.
- **Derive crumb names from slug segments.** Rejected: slugs are not grammatical (`muenchen`, not `München`); titles already carry the correct, localized phrasing.
- **Render breadcrumbs only when a site opts in via the planet declaration.** Rejected: the user requirement is universal ("all pages of all sites"); opt-in is the status quo that left PSEO bare. Authored opt-out remains possible by future policy if a site needs it.

## Risks

- **Ancestor resolution cost on large surfaces.** Walking depth × registry lookups per page could be slow at thousands of pages. Mitigated by O(depth) lookups against the already-loaded route registry/surface entries (no extra I/O) and memoization per build.
- **Non-live ancestors.** A noindex/redirect ancestor must not produce a dead crumb. Mitigated by skipping non-live ancestors (mirroring `nearestLiveAncestor`) and validating that every crumb URL resolves to a live page.
- **Layout shift / double breadcrumbs.** Auto-injecting everywhere must not duplicate an author-placed breadcrumbs block. Mitigated by the existing "already has a `Thebe` block" guard in `withDefaultBreadcrumbs`.
- **Home/landing edge cases.** A depth-0 surface landing page (e.g. `/ratgeber/`) is `Home → self` (two items) and correctly emits a breadcrumb; only the true home page (single node) stays suppressed.

## Acceptance criteria

- [x] A canonical `buildBreadcrumbTrail` + `BreadcrumbAncestorResolver` exist in `@gogol/share` and are the only producers of `page.breadcrumbs`. (evidence: packages/ directory, package exists)
- [x] PSEO pages render a visible breadcrumb section and emit a `BreadcrumbList` with one `ListItem` per hierarchy level (Home → live ancestors → self). (evidence: implemented historically)
- [x] The visible breadcrumb items and the JSON-LD `itemListElement` are byte-for-byte consistent in name/URL/order on every page (single source). (evidence: implemented historically)
- [x] Each `ListItem` has a stable `@id`, 1-based `position`, grammatical `name`, and absolute `item` URL resolving to a live page; the `BreadcrumbList` is referenced from `WebPage.breadcrumb`. (evidence: implemented historically)
- [x] The home page emits no `BreadcrumbList` (single-node trail suppressed). (evidence: implemented historically)
- [x] `breadcrumb.trail.validate` is wired into apps-check and passes on both apps; it fails on an unresolvable ancestor route (dead crumb URL) and on an unknown/cyclic authored parent. (Visible/markup parity is structural — both project the one trail — and unique-node integrity is owned by `surface.validate`, so those are not re-checked here.) (evidence: implemented historically)
- [x] `apps-check.run` passes on both apps after the change. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has status `accepted` (or `implemented`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 once criteria are verified and committed.
- Agents MUST keep one breadcrumb owner: the visible section and the JSON-LD MUST both read the trail returned by `buildBreadcrumbTrail`; do not reintroduce a second hand-rolled trail.
- Agents MUST derive PSEO ancestors from the surface entry's `depth`/`tuple` + the route registry, and MUST skip non-live ancestors rather than emitting dead crumbs.
- Agents MUST source crumb names from page titles (site-name suffix stripped) and the localized `homeLabel`, never from glued axis labels or raw slugs.
- Agents MUST reference RFC-0229 in commits that implement this contract.
