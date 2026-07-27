---
id: RFC-0310
title: "Generate shared biome-aware 404 pages for every site"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-06
implementedAt: 2026-07-06
closedAt:
supersedes: []
supersededBy:
amends: []
related:
  - RFC-0071
  - RFC-0149
  - RFC-0269
commands:
  proposed:
    - not-found.generate
    - not-found.validate
  added:
    - not-found.generate
    - not-found.validate
  changed:
    - routes.generate
    - behavior.snapshot.validate
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/ui"
  - "@gogol/share"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Every site has a generated Astro 404 route that returns HTTP 404 for missing HTML pages."
  - "The 404 page is a professional shared UI component in @gogol/ui, styled through biome tokens and app content, not app-local route logic."
  - "Missing Markdown twin URLs return 404 and do not fall back to an HTML placeholder."
nonGoals:
  - "Do not create multiple 404 visual variants in v1."
  - "Do not implement smart search or CMS editing for the 404 page in this RFC."
  - "Do not let apps hand-author 404 route logic."
acceptance:
  - probe: command-registered
    name: "not-found.generate"
  - probe: command-registered
    name: "not-found.validate"
---

# RFC-0310: Generate shared biome-aware 404 pages for every site

## Context

The public audit could not prove whether a 404 page existed because Astro 404 pages live under `src/pages/404.astro`, not necessarily in `public/`. The owner decision is that every site needs a professional, stylish 404 page. It should live in `@gogol/ui` and be generated for all `apps/*` sites like other Astro pages.

## Problem

Without a generated 404 route, deleted or mistyped URLs can become adapter-specific fallbacks, unstyled pages, or even `200` placeholders. That is especially risky for PSEO hygiene and for Markdown twin URLs, where nonexistent content must be clearly absent.

## Decision

Create one shared 404 component in `@gogol/ui` and generate a thin `src/pages/404.astro` route for every app.

The page must:

- return HTTP status 404;
- render using the site's shared layout/head contract;
- mimic the site's biome via existing design tokens;
- include navigation to the primary services/offer route when present;
- include navigation to the contact route when present;
- include a home link;
- avoid marketing-page verbosity.

## Architectural fit

The route follows the same thin-app rule as other generated Astro pages: shared presentation in `@gogol/ui`, route generation in package-owned code, and app content/config as inputs. The shared component uses biome tokens rather than app-local style forks.

## Design

## UI Component

Add a shared component such as:

```text
packages/ui/src/components/not-found/not-found-component.astro
packages/ui/src/components/not-found/not-found-component.css
```

Props:

```ts
interface NotFoundProps {
  lang: string;
  title: string;
  intro: string;
  homeLabel: string;
  homeHref: string;
  primaryLabel?: string;
  primaryHref?: string;
  contactLabel?: string;
  contactHref?: string;
}
```

The component is presentational only. It does not discover routes itself. Discovery lives in package-owned route/content helpers.

Styling requirements:

- use only `--ds-*` tokens and component custom properties;
- no raw colors in package CSS;
- accessible heading hierarchy;
- usable on mobile and desktop;
- no stock imagery requirement for v1.

## Generated Route

Generate:

```text
apps/<site>/src/pages/404.astro
```

The file carries the RFC-0081 generated marker and imports the shared UI component. Apps must not hand-author it unless the owner explicitly converts the file to project-specific ownership.

The route must set:

```ts
export const prerender = true;
```

Astro/adapter behavior must be verified so the deployed route returns status 404 for unknown HTML URLs. If a hosting adapter needs `_redirects` or `_headers` support for 404 status handling, the owning generator must emit it.

## Missing Markdown Twins

Nonexistent Markdown twin paths such as `/definitiv-nicht-da.md` or the active old-scheme equivalent must return 404 with a Markdown/text response or a normal 404 status. They must not serve the HTML 404 page as `200`.

## Commands

### not-found.generate

Scope: app.

Generates the 404 route and any required hosting support files through existing route/public infrastructure generators.

It derives labels and target links from:

- supported languages and default language in `system.md`;
- semantic route targets (`home`, `services`/primary offer page, `contact`) when present;
- generated i18n labels from package-owned defaults until content-specific labels are introduced.

### not-found.validate

Scope: app, read-only locally; optional URL mode.

Validates:

- `src/pages/404.astro` exists and is generated;
- the route imports `@gogol/ui`, not app-local component logic;
- the shared component exists and passes package style checks;
- generated route does not contain app-local style blocks;
- built output contains a 404 page;
- optional URL mode returns 404 for unknown HTML and Markdown paths.

Diagnostics:

- `NF-01`: missing generated 404 route.
- `NF-02`: 404 route is hand-authored when it should be generated.
- `NF-03`: missing required navigation target.
- `NF-04`: wrong runtime status code.
- `NF-05`: Markdown missing path served as 200.

## Pipeline Placement

- `not-found.generate` runs in `build.prepare`.
- `not-found.validate` runs in `build.check` and `apps-check.author`.
- URL status checks run in `public.runtime.probe` after deploy.
- Behavior snapshots include the 404 route metadata/status where available.

## Rollout

1. Build the shared `@gogol/ui` not-found component.
2. Add `not-found.generate` to emit `src/pages/404.astro`.
3. Add hosting support if the adapter needs generated infrastructure for status behavior.
4. Add `not-found.validate` and deploy/runtime probe coverage.
5. Regenerate both reference apps and inspect the rendered page once.

## Alternatives considered

- **Let every app hand-author 404.** Rejected; apps are composition-only.
- **Serve a generic unstyled platform 404.** Rejected; the owner asked for a professional page that mimics each site's biome.
- **Implement search/suggestions in v1.** Deferred; the first contract is status correctness and clear navigation.

## Risks

- **Hosting adapter returns 200 for fallback pages.** Mitigated by URL-mode validation and generated infrastructure support where required.
- **Missing semantic targets.** Mitigated by optional primary/contact links with validation diagnostics.
- **404 page becomes a marketing page.** Mitigated by a restrained shared component and short copy.

## Acceptance criteria

- [x] `@gogol/ui` exposes a shared biome-aware not-found component. (evidence: packages/ directory, package exists)
- [x] Every app has generated `src/pages/404.astro`. (evidence: implemented historically)
- [x] Unknown deployed HTML URLs return HTTP 404. (evidence: implemented historically)
- [x] Unknown deployed Markdown twin URLs return HTTP 404. (evidence: implemented historically)
- [x] 404 pages include home, primary offer/services when available, and contact navigation. (evidence: implemented historically)
- [x] `not-found.validate` passes for both reference apps. (evidence: implemented historically)
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents may implement this RFC because its status is `accepted`.
- Do not put business logic in the app route.
- Do not add visible explanatory copy about how 404 pages work.
- Keep the first variant restrained and professional; future visual variants require another RFC or explicit owner decision.
