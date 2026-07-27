---
id: RFC-0509
title: "Team hub page — /team/ root index route and participant directory"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-24
updatedAt: 2026-07-24
implementedAt: 2026-07-24
enhancedAt: 2026-07-24
supersedes: []
supersededBy:
amends:
  - RFC-0200
amendedBy:
  - RFC-0513
related:
  - RFC-0008
  - RFC-0024
  - RFC-0192
  - RFC-0200
  - RFC-0478
  - RFC-0479
  - RFC-0480
  - RFC-0508
  - RFC-0510
  - RFC-0511
  - RFC-0512
  - RFC-0513
satisfies:
  - DNA-24
  - DNA-39
breaksC: true
versionBump: minor
commands:
  proposed:
    - team.hub.validate
  added:
    - team.hub.validate
  changed:
    - surface.contract.validate
    - public.infrastructure.generate
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-content"
  - "@gogol/ui"
successSignals:
  - "The /team/ route (DE: /team/, UK: /komanda/) renders a team hub page — not a 404."
  - "The hub page emits CollectionPage JSON-LD as the primary type with a breadcrumb trail Home → Team."
  - "The hub renders four sections: hero (Verantwortung bei Webgogol), Verantwortliche Personen (people section filtered to active public humans), Teams und Funktionen (organization units), KI-Agenten (AI agents)."
  - "The hub lists only participants with visibility: public and status: active — draft, private, suspended, and former participants are excluded."
  - "The hub uses a compact list layout with links to individual profile pages — not a large portrait grid."
  - "The existing /team/andrii-syrokomskyi/ profile route is preserved and linked from the hub."
  - "The founder page (/gruender/ DE, /zasnovnyk/ UK) is retired and redirects to /team/andrii-syrokomskyi/."
  - "team.hub.validate enforces the hub layout, participant visibility filter, and section structure."
  - "The url-schema.yaml C-contract includes the /team/ and /komanda/ route patterns."
nonGoals:
  - "Does not define the Participant data model — that is RFC-0508."
  - "Does not define the human profile page structure — that is RFC-0510."
  - "Does not define the AI-agent profile page structure — that is RFC-0511."
  - "Does not define JSON endpoints or Schema.org for profiles — that is RFC-0512."
  - "Does not implement search, filtering, or pagination — the participant count is small (1–20); a simple list suffices for v1."
  - "Does not create sub-routes for organization units (/team/einheiten/) — deferred to a future RFC when units exist."
---

# RFC-0509: Team hub page — /team/ root index route and participant directory

## Context

RFC-0200 introduced per-member profile pages as virtual routes under a localized base segment (`/team/` DE, `/komanda/ UK), sourced from the `people` collection. However, the base segment itself (`/team/`, `/komanda/`) returns 404 — there is no authored or generated index page at that route. Visitors who navigate to `/team/` see a 404 instead of a team directory.

An external expert review (file 16.1, section 4) identifies this as a systemic problem: the team module should be a **public responsibility registry** with a root index page that shows who (or what) carries responsibility at the organization, with sections for humans, AI agents, and teams.

## Problem

1. **`/team/` returns 404.** There is no authored page at the team base segment. The route registry only registers per-member profile routes (`/team/<slug>/`), not the base segment itself.

2. **No participant directory.** Visitors cannot discover who is on the team without knowing a specific person's slug. The home page has a `people` section with a spotlight on Andrii, but there is no dedicated team page.

3. **`/gruender/` (founder page) is redundant.** The founder page (`pages/{lang}/founder.md`) is a markdown block that renders `prose/founder` — a separate prose file. With the profile page system in place, the founder page duplicates the profile route. The expert recommends consolidating to the profile page.

4. **No hub for AI agents.** When AI-agent participants are added (RFC-0508, RFC-0511), there is no directory page to list them. The expert requires a visible separation between humans and AI agents.

## Decision

The team base segment (`/team/` DE, `/komanda/` UK) gains an **authored block-declarative hub page** (`pages/{lang}/team.md`) with `semanticType: collection` (reusing the existing CollectionPage-mapped type from RFC-0490). The hub renders four sections:

1. **Hero** — eyebrow, heading, lead text explaining the responsibility model
2. **Verantwortliche Personen** — a `people` section filtered to `participantType: human`, `visibility: public`, `status: active`, with `linkToProfile: true`
3. **Teams und Funktionen** — a `people` section filtered to `participantType: organization-unit`, `visibility: public`, `status: active` (empty for v1; renders nothing when no units exist)
4. **KI-Agenten** — a `people` section filtered to `participantType: ai-agent`, `visibility: public`, `status: active` (empty for v1; renders nothing when no AI agents exist)

### Route structure

| Route (DE) | Route (UK) | Source | Status |
| --- | --- | --- | --- |
| `/team/` | `/komanda/` | Authored page `pages/{lang}/team.md` | **New** |
| `/team/andrii-syrokomskyi/` | `/komanda/andrii-syrokomskyi/` | Virtual route from people collection | Existing (RFC-0200) |
| `/gruender/` | `/zasnovnyk/` | Authored page `pages/{lang}/founder.md` | **Retired** — redirect to `/team/andrii-syrokomskyi/` |

### Founder page retirement

The `founder` page (`pages/{lang}/founder.md`) and its prose file (`prose/{lang}/founder.md`) are removed. The `founder` pageId is removed from `system.md`. A redirect from `/gruender/` → `/team/andrii-syrokomskyi/` (DE) and `/zasnovnyk/` → `/komanda/andrii-syrokomskyi/` (UK) is registered.

The navigation entry `founder` (label: "Засновник" / "Gründer") is replaced by a `team` entry (label: "Команда" / "Team") pointing to the team hub page.

### Hub page structure (block-declarative YAML)

```yaml
---
kind: page
pageId: team
cosmicStar: Vega
title: "Хто несе відповідальність у Webgogol"
description: "Реєстр відповідальності: люди, команди та ШІ-системи, які беруть участь у роботі Webgogol."
lang: uk
blocks:
  - id: team-hero
    type: hero
    props:
      hideSectionNumber: true
      header:
        heading: "Хто несе відповідальність у Webgogol"
        level: 1
      tagline: >-
        Тут видно, які люди, команди та ШІ-системи беруть участь у роботі Webgogol,
        за що вони відповідають і хто відповідає за рішення.

  - id: team-humans
    type: people
    props:
      header:
        heading: "Відповідальні особи"
        subheading: "Люди, які відповідають за продукт, архітектуру та операції."
      layout: grid
      linkToProfile: true
      select:
        participantType: human
        status: active
        visibility: public

  - id: team-units
    type: people
    props:
      header:
        heading: "Команди та функції"
        subheading: "Організаційні підрозділи та функціональні одиниці."
      layout: grid
      select:
        participantType: organization-unit
        status: active
        visibility: public

  - id: team-ai-agents
    type: people
    props:
      header:
        heading: "ШІ-агенти"
        subheading: "ШІ-системи з визначеною функцією, обмеженнями та відповідальною людиною."
      layout: grid
      linkToProfile: true
      select:
        participantType: ai-agent
        status: active
        visibility: public
---
```

### People section `select` extension (RFC-0508 — already shipped)

RFC-0508 already extended the `people` section `select` prop with `participantType`, `status`, and `visibility` fields. The `PeopleSelect` interface and `selectPeople` function in `packages/share/src/astro/people.ts` already implement the filtering logic. No additional code changes are needed for the select extension — this RFC uses the existing filters.

### Empty section handling

When a `people` section's `select` matches zero participants (e.g. no AI agents exist yet), the section renders nothing — no heading, no empty state, no placeholder. The current `people-section.astro` renders the heading unconditionally when `props.header?.heading` is set, regardless of whether the filtered list is empty. This RFC adds a `hasPeople` guard to `people-section.astro`: when `selectPeople` returns an empty array, the entire section (including the heading and `SectionShell`) is suppressed. This guard applies globally to all `people` sections on all pages — an empty people section with a heading but no people below is worse than rendering nothing.

## Architectural fit

- **RFC-0200 (amended):** The People module's `people` section gains `participantType`/`status`/`visibility` filters. The profile-page virtual-route mechanism is unchanged. The team hub is a new authored page, not a virtual route.
- **RFC-0508:** The Participant data model provides the `participantType`, `status`, and `visibility` fields that the hub filters on.
- **RFC-0192:** The team hub is an authored page, not a generated surface — it does not use the Blueprint/virtual-route mechanism. It is registered in `system.md` like any other authored page.
- **RFC-0480:** `breaksC: true` — the `/team/` route is a new external surface (URL schema change). The `/gruender/` → `/team/andrii-syrokomskyi/` redirect is a URL change. The `url-schema.yaml` C-contract is updated.
- **DNA-24:** The hub is a block-declarative page using existing archetypes (`hero`, `people`).
- **DNA-39:** The route registry merge includes the new authored page via `system.md pages[]` (route source 1) alongside the existing virtual profile routes from `getParticipantProfileRoutes()` (route source 2). No registry code changes are needed — only a new `system.md` page entry.

## Design

### CLI surface

```sh
# Validate the team hub page structure and participant visibility.
pnpm exec site-kernel run team.hub.validate --site webgogol-com --json
```

### TypeScript contracts

The `PeopleSelect` interface and `selectPeople` function already ship the `participantType`, `status`, and `visibility` filters (implemented by RFC-0508 in `packages/share/src/astro/people.ts:156-189`). No TypeScript contract changes are needed in this RFC.

### File system responsibilities

| Path | Edit |
| --- | --- |
| `missions/webgogol-com-m000010/workpiece/src/content/pages/{de,uk}/team.md` | New authored team hub page |
| `missions/webgogol-com-m000010/workpiece/src/content/pages/{de,uk}/founder.md` | **Deleted** |
| `missions/webgogol-com-m000010/workpiece/src/content/prose/{de,uk}/founder.md` | **Deleted** |
| `missions/webgogol-com-m000010/workpiece/src/content/system.md` | Add `team` page entry (`semanticType: collection`); remove `founder` page entry; add `founder` to `retiredRoutes` with status `301` |
| `missions/webgogol-com-m000010/workpiece/src/content/navigation/{de,uk}/navigation.md` | Replace `founder` nav entry with `team` entry |
| `packages/ontology/src/external-surfaces/url-schema.yaml` | Add `/team/` and `/komanda/` route patterns |
| `packages/ontology/src/schemas/system/manifest.ts` | Extend `retiredRoutes` to a discriminated union: `status: 301` requires `to` (URL path), `status: 410` forbids `to` |
| `packages/os/site-kernel-checks/src/team-hub.ts` | New file: `team.hub.validate` |
| `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts` | Update `buildRetiredPageRoutesBlock` to emit 301 redirects when `retiredRoutes` entry has `status: 301` (with required `to`) |
| `packages/ui/src/sections/people/people-section.astro` | Add `hasPeople` guard: suppress entire section (including heading and `SectionShell`) when `selectPeople` returns `[]` — applies globally to all `people` sections |

### Redirect mechanism

The existing `retiredRoutes` field in `systemManifestSchema` (RFC-0487, `packages/ontology/src/schemas/system/manifest.ts:439`) is extended to support 301 redirects. The current schema only allows `status: 410` (Gone tombstones). This RFC adds `status: 301` with a required `to` field for the redirect target URL path:

```yaml
retiredRoutes:
  - slug: founder
    status: 301
    to: /team/andrii-syrokomskyi
```

The `to` field is a URL path (e.g. `/team/andrii-syrokomskyi`), not a pageId reference. The `buildRetiredPageRoutesBlock` function in `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts` is updated to emit `/<slug>/* /<target> 301` entries when `status: 301` is present, instead of `/<slug>/* / 410` tombstones. The redirect is emitted in the Cloudflare Pages `_redirects` file. The schema uses a discriminated union: `to` is required when `status: 301` and forbidden when `status: 410`.

### url-schema.yaml C-contract update

```yaml
# Added to routePatterns:
  - pattern: "/:locale?/team"
    params:
      locale:
        optional: true
        enum: [de, en]
    generated: false
  - pattern: "/:locale?/komanda"
    params:
      locale:
        optional: true
        enum: [uk]
    generated: false
```

### team.hub.validate rules

- The `team` page exists in `system.md` with `semanticType: collection`.
- The `team` page has at least three `people` blocks: one with `select.participantType: human`, one with `select.participantType: organization-unit`, one with `select.participantType: ai-agent`.
- All `people` blocks on the hub page have `select.visibility: public` and `select.status: active`.
- The `founder` pageId is absent from `system.md`.
- At least one `retiredRoutes` entry has `status: 301` (the founder redirect).
- The navigation has a `team` entry pointing to `pageId: team` (not `founder`).

All rules are errors (exit code 1). The `--json` output shape follows the standard kernel command envelope: `{ command, status, count, violations: [{ rule, file, message, severity }], exitCode, ok }`.

## Rollout

- **Phase 0 — Schema.** Extend `retiredRoutes` in `systemManifestSchema` to a discriminated union supporting `status: 301` with required `to` (URL path). Update `buildRetiredPageRoutesBlock` in `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts`.
- **Phase 1 — Hub page + founder retirement.** Create `pages/{lang}/team.md`. Delete `pages/{lang}/founder.md` and `prose/{lang}/founder.md`. Update `system.md` (add `team` page with `semanticType: collection`, remove `founder` page, add `founder` to `retiredRoutes` with `status: 301` and `to: /team/andrii-syrokomskyi`). Update navigation. Update `url-schema.yaml`. Add empty-list guard to `people-section.astro`.
- **Phase 2 — Validation.** Ship `team.hub.validate` and join `apps-check.run`.

## Alternatives considered

- **Generate the hub from the people collection (virtual route).** Rejected — the hub has authored content (hero text, section headings, subheadings) that is site-specific. An authored page is simpler and follows the block-declarative pattern. Virtual routes are for data-sourced pages without authored content.
- **Keep the founder page and add a separate team hub.** Rejected — the founder page is redundant with the profile page. The expert recommends consolidating. Keeping both creates duplicate content and confusing navigation.
- **Put the team hub under `/ueber-uns/` (about page).** Rejected — the expert recommends a dedicated `/team/` route. The about page (`ratgeber-redaktion`) has a different semantic type and purpose.

## Risks

- **Redirect from `/gruender/` may break existing links.** Mitigated by a 301 redirect to `/team/andrii-syrokomskyi/`. Search engines and inbound links are forwarded.
- **Empty AI-agent section.** When no AI agents exist, the section renders nothing. This is intentional — the section appears when the first AI agent is added.
- **Navigation change.** The "Засновник" / "Gründer" nav entry is replaced by "Команда" / "Team". This is a visible change for returning visitors.

## Acceptance criteria

- [x] `pages/{de,uk}/team.md` exists with the four-block structure (hero + 3 people sections). (evidence: missions/webgogol-com-m000010/workpiece/src/content/pages/{de,uk}/team.md, file existence verified)
- [x] `pages/{de,uk}/founder.md` and `prose/{de,uk}/founder.md` are deleted. (evidence: `ls` confirms all 4 files removed)
- [x] `system.md` has a `team` page entry with `semanticType: collection` and routes `de: team`, `uk: komanda`. (evidence: missions/webgogol-com-m000010/workpiece/src/content/system.md:560-568)
- [x] `system.md` has a `founder` entry in `retiredRoutes` with `status: 301` and `to: participant:andrii-syrokomskyi`. (evidence: system.md:15-20, retiredRoutes has gruender+zasnovnyk with status 301 and to paths)
- [x] `system.md` no longer has a `founder` page entry. (evidence: system.md pages[] search confirms no pageId: founder)
- [x] Navigation has a `team` entry (not `founder`). (evidence: navigation/{de,uk}/navigation.md, founder entry replaced with team)
- [x] `url-schema.yaml` includes `/team/` and `/komanda/` route patterns. (evidence: packages/ontology/src/external-surfaces/url-schema.yaml:51-62)
- [x] `team.hub.validate` passes and is registered in `apps-check.run`. (evidence: packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts:161-175, pipelines/sites-check-author.ts:169-170)
- [x] `/team/` (DE) and `/komanda/` (UK) render the hub page without 404. (evidence: system.md:560-568 registers team page with routes de: team, uk: komanda; catch-all `[...slug].astro` handles route; `team.hub.validate` passes; build.prepare succeeded — pre-existing ratgeber page.markdown.generate failure is unrelated)
- [x] `/gruender/` (DE) and `/zasnovnyk/` (UK) redirect to `/team/andrii-syrokomskyi/` and `/komanda/andrii-syrokomskyi/` respectively. (evidence: `public/_redirects` contains `/gruender/* /team/andrii-syrokomskyi 301` and `/zasnovnyk/* /komanda/andrii-syrokomskyi 301`)
- [x] `surface.contract.validate` passes with the updated C-contract. (evidence: `pnpm exec site-kernel run surface.contract.validate --site webgogol-com` exit code 0, 5 surfaces validated, 0 violations)
- [x] `people-section.astro` suppresses empty sections (heading + body) when `selectPeople` returns `[]`. (evidence: packages/ui/src/sections/people/people-section.astro:71,105,222 — hasPeople guard wraps entire SectionShell)
- [x] `rfc.validate` passes on this file before merging. (evidence: `pnpm exec site-kernel run rfc.validate RFC-0509` exit code 0)

## Implementation notes for agents

- Agents MUST create `pages/{lang}/team.md` with the four-block structure. Do not deviate from the block order (hero → humans → units → AI agents).
- Agents MUST delete `pages/{lang}/founder.md` and `prose/{lang}/founder.md` — do not leave orphan files.
- Agents MUST register the `founder` → `participant:andrii-syrokomskyi` redirect in `system.md` under `retiredRoutes` with `status: 301`.
- Agents MUST update navigation to replace the `founder` entry with `team`.
- Agents MUST NOT create sub-routes for organization units or AI agents in this RFC — those are deferred.
- Agents MUST set `select.visibility: public` and `select.status: active` on all people sections on the hub page.
- Agents MUST use `semanticType: collection` (not a new `team-hub` type) — the existing `collection` type already maps to `CollectionPage` JSON-LD.
- Agents MUST update `docs/technology.xml` and `docs/knowledge-graph.xml` to reflect the new `/team/` route and the `retiredRoutes` 301 extension.
