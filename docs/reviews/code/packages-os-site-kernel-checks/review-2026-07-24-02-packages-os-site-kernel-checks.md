---
reviewId: REVIEW-CODE-2026-07-24-01
date: 2026-07-24
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 10f78005d...HEAD
filesReviewed:
  - packages/ontology/src/external-surfaces/url-schema.yaml
  - packages/ontology/src/schemas/system/manifest.ts
  - packages/os/site-kernel-checks/src/team-hub.ts
  - packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts
  - packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts
  - packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts
  - packages/os/site-kernel-content/src/system-manifest.ts
  - packages/ui/src/sections/people/people-section.astro
  - docs/technology.xml
---

# Code Review: 10f78005d...HEAD (RFC-0509 team hub page)

### Verdict: Needs revision

Three findings require fixes before merge: a schema validation gap allowing `status: 301` without a `to` target (silently redirects to `/`), a `hasPeople` guard that applies globally instead of team-hub-only as the RFC scopes it, and hardcoded site-specific slugs in a shared-package validator.

### Mechanical floor

Pass — all five affected packages (`@warpgogol/ontology`, `@warpgogol/site-kernel-checks`, `@warpgogol/site-kernel-codegen`, `@warpgogol/site-kernel-content`, `@warpgogol/ui`) pass `build:check` (tsc --noEmit).

### Axis A — Structural correctness

- **A-1: Schema allows `status: 301` without `to`, producing a silent redirect to `/`.**
  `packages/ontology/src/schemas/system/manifest.ts:439-442` — the `retiredRoutes` schema makes `to` optional for all statuses:
  ```ts
  status: z.union([z.literal(410), z.literal(301)]),
  to: z.string().min(1).optional(),
  ```
  No `.refine()` or `.superRefine()` enforces `to` when `status: 301`. In `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts:233-236`, when `status === 301 && !entry.to`, the code falls through to the default `return /${slug}/* / ${entry.status}` — emitting `/slug/* / 301`, which redirects to `/` (site root). This is a silent data-loss redirect. The schema should use a discriminated union or `.refine()` to make `to` required when `status: 301`.

- **A-2: `hasPeople` guard is global, not team-hub-scoped.**
  `packages/ui/src/sections/people/people-section.astro:71` — `const hasPeople = people.length > 0;` wraps the entire `SectionShell` unconditionally. RFC-0509 §"Empty section handling" says: "when selectPeople returns an empty array **and the section is on the team hub page**, the entire section is suppressed." The implementation does not check for the team hub page — it suppresses any people section with zero matches on any page. The home page's `founder` spotlight block (`de/home.md:376-401`) selects by slug `andrii-syrokomskyi`; if the people collection is temporarily empty during development, the section silently disappears instead of showing the heading. The global behavior is arguably better, but it is a scope deviation from the RFC spec. Either amend the RFC to acknowledge the global behavior or scope the guard to the team hub page.

### Axis B — DNA alignment

No issues. The `url-schema.yaml` addition follows the Layer C contract (RFC-0480). The `manifest.ts` schema extension is a clean backward-compatible union. The `people-section.astro` change does not violate any DNA invariant — it uses existing `SectionShell`/`SectionHeader` primitives and does not introduce hardcoded tokens or copy.

### Axis C — Ecosystem fit

- **C-1: Hardcoded site-specific slugs in shared-package validator.**
  `packages/os/site-kernel-checks/src/team-hub.ts:75-86` — the validator hardcodes `slug: "gruender"` and `slug: "zasnovnyk"` to check for the founder redirect. These are warpgogol-com-specific DE/UK slugs. `packages/os/site-kernel-checks` is a shared package consumed by all sites. A different site with a team page and a retired founder page using different route slugs (e.g. `founder` in English) would get false negatives. The validator should either (a) check that *all* `founder`-page route slugs from `system.md` appear in `retiredRoutes` with `status: 301`, or (b) accept that this validator is warpgogol-com-specific and document it. Similarly, `team-hub.ts:136` hardcodes `["de", "uk"]` for the navigation check — this should derive from the site's supported languages.

- **Compass sync**: `docs/technology.xml` is updated for `team.hub.validate` and `_redirects` 301 generation. Good.

### Axis D — Forward-only compliance

No issues. The `founder` page is removed, not maintained behind a flag. The `retiredRoutes` schema is extended in place — no parallel interpretation. The 410 tombstone path is preserved for existing entries.

### Axis E — Agent-facing clarity

- **E-1: RFC `to` field spec vs implementation drift.**
  RFC-0509 §"Redirect mechanism" says: "The `to` field is a pageId reference (resolved by the route registry to the localized route)." The schema comment in `manifest.ts:435` says "redirect target pageId." But the implementation in `app-boilerplate-helpers.ts:234` treats `to` as a raw URL path (`entry.to.replace(/^\/+|\/+$/g, "")`), and `system.md:17` stores `/team/andrii-syrokomskyi` (a URL path, not a pageId like `participant:andrii-syrokomskyi`). An agent reading the RFC would write `to: participant:andrii-syrokomskyi` and get a broken redirect to `/participant:andrii-syrokomskyi`. The RFC body, schema comment, and implementation are out of sync. The `to` field is a URL path, not a pageId — the RFC text should be corrected.

- **MODULE_CONTRACT**: `team-hub.ts` carries `MODULE_CONTRACT` and `CHANGE_SUMMARY`. Good.

### Axis F — Pragmatism

- **F-1: `team.hub.validate` hardcodes `["de", "uk"]` language list.**
  `packages/os/site-kernel-checks/src/team-hub.ts:136` — `for (const lang of ["de", "uk"])` for the navigation check. This should derive from the site's supported languages (e.g. `getSupportedLanguages(manifest)` from `app-boilerplate-helpers.ts`). A site with `de, en` or `de, uk, en` would get incomplete navigation checks.

### Axis G — Blind spots

- **G-1: 301 redirect target not validated for existence.**
  The `to` field is a URL path, but no validator checks that the target route actually exists in the route registry. A typo in `to: /team/andri-syrokomskyi` (missing `i`) would produce a redirect to a 404. `team.hub.validate` checks that the redirect entry exists in `retiredRoutes` but does not resolve the target. This is a minor risk for a small site but worth noting.

### Spec compliance

| Requirement from RFC-0509 | Status | Evidence |
| --- | --- | --- |
| `/team/` and `/komanda/` route patterns in url-schema.yaml | Done | `url-schema.yaml:51-62` |
| `retiredRoutes` schema supports `status: 301` with `to` | Partial | `manifest.ts:439-442` — no refine enforcing `to` when 301 |
| `buildRetiredPageRoutesBlock` emits 301 redirects | Done | `app-boilerplate-helpers.ts:233-236` |
| `team.hub.validate` enforces hub structure | Done | `team-hub.ts:46-161` — but hardcoded slugs (C-1) |
| `people-section.astro` suppresses empty sections | Partial | Global guard instead of team-hub-scoped (A-2) |
| `to` field is a pageId resolved by route registry | Missing | Implementation treats `to` as raw URL path (E-1) |
| Navigation `founder` → `team` replacement | Done | `team-hub.ts:136-157` checks navigation |
| Compass docs synced | Done | `docs/technology.xml` updated |

### Questions for the author

1. Should the `retiredRoutes` schema use a discriminated union (`status: 301 → to: required`, `status: 410 → to: forbidden`) instead of a loose optional `to`? The current schema silently produces a redirect to `/` when `to` is missing.
2. Is the global `hasPeople` guard intentional, or should it be scoped to the team hub page as the RFC specifies? If intentional, amend the RFC text.
3. Can `team.hub.validate` derive the founder slugs from the `founder` page's `routes` in `system.md` rather than hardcoding `gruender`/`zasnovnyk`?
