---
id: RFC-0200
title: "Add a People module: canonical person records, an embeddable People section, and gated per-member profile pages"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-17
updatedAt: 2026-06-17
implementedAt: 2026-06-17
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0115
amendedBy:
  - RFC-0513
related:
  - RFC-0008
  - RFC-0024
  - RFC-0048
  - RFC-0112
  - RFC-0115
  - RFC-0143
  - RFC-0148
  - RFC-0152
  - RFC-0163
  - RFC-0167
  - RFC-0169
  - RFC-0192
  - RFC-0199
commands:
  proposed:
    - people.validate
    - person.create
  added:
    - people.validate
    - person.create
  changed:
    - apps-check.run
    - entitlements.validate
    - section.scaffold
  removed: []
appsImpacted:
  - apps/nicaragua-projekt
  - apps/warpgogol-com
  - apps/*
packagesImpacted:
  - packages/business
  - packages/ui
  - packages/share
  - packages/ontology
  - packages/os/site-kernel-checks
  - packages/os/site-kernel-codegen
successSignals:
  - "A site describes each human once (one Person record per language) and that single record feeds the People section, the optional dedicated team page, the optional per-member profile page, and all Person/Organization JSON-LD — with no inline duplication and no per-app route glue."
  - "An author (human or AI agent) can place a People section on ANY page, pick specific members by slug (e.g. who built this product / whom to contact), and visitors click through to a member's profile page when one exists."
  - "Per-member profile pages are a sellable upsell gated by the `team.profiles` entitlement; the People section, the team page, and all people JSON-LD remain in the free baseline."
  - "people.validate enforces the Person contract and join apps-check.run, so agent-authored people content is machine-checkable and self-correcting."
nonGoals:
  - "Do not gate the People section, the dedicated team page, or any Person/Organization JSON-LD behind an entitlement — only per-member profile pages are paid."
  - "Do not keep any legacy people surface: the `team` section, the `founder-trust-card` section, inline `members[]` block props, the route-level bio-merge hack, and `company.brand.founders`/`company.boardMembers` are removed (no backward compatibility)."
  - "Do not author one .md file per member profile page — profile pages are virtual routes materialized from the Person records (the route-source pattern, RFC-0192)."
  - "Do not build org-chart, hierarchy, vCard export, or per-member blogs in the first cut."
---

# RFC-0200: Add a People module: canonical person records, an embeddable People section, and gated per-member profile pages

## Context

Both shipping sites already present "the people behind the business", but each does it differently and redundantly:

- **nicaragua-projekt** renders a `team` section on its About page ([`about-us.md`](../../apps/nicaragua-projekt/src/content/pages/de/about-us.md)) whose `members[]` (name, role, image) are **inlined per page file per language**, while the bios live separately in `business/{lang}/team/{slug}.md` ([`martina-morich.md`](../../apps/nicaragua-projekt/src/content/business/de/team/martina-morich.md)), and a **per-app route hack** in [`[lang]/[...slug].astro`](../../apps/nicaragua-projekt/src/pages/[lang]/[...slug].astro) stitches the bios back into the block by matching `slug` and the hardcoded cosmic planet name `"Mimas"`.
- **warpgogol-com** renders a solo "about me" via a bespoke `founder-trust-card` section ([`home.md`](../../apps/warpgogol-com/src/content/pages/de/home.md)) with its own fields (name, location, yearsExperience, statement, image, cta).
- Independently, **governance identity** lives in `company.brand.founders[]` and `company.boardMembers[]` ([`company.md`](../../apps/nicaragua-projekt/src/content/business/de/company.md)), which feed `buildSiteSemanticProfile` → Organization/Person JSON-LD ([`semantic-profile.ts`](../../packages/business/src/semantic-profile.ts)).

The platform already has every building block this module needs: the business content layer with RFC-0008 deep-merge localization and RFC-0024 schema dispatch, the Image Provider Port (RFC-0152), the corrected JSON-LD pipeline (RFC-0163) and shared org-profile assembler (RFC-0148), the route-source / virtual-route pattern (RFC-0192) with entitlement gating (RFC-0169), per-language localized slugs (RFC-0048/RFC-0199), and the section scaffold (RFC-0112). What is missing is the **composition of these into one coherent, agent-buildable, sellable People module**.

## Problem

- **One human is described up to five times.** `company.brand.founders`, `company.boardMembers`, `business/{lang}/team/{slug}.md` (bio only), inline block `members[]` (image/role), and `founder-trust-card` props are five disconnected shapes for the same entity, kept in sync by hand.
- **The section cannot load its own data.** The `team` section ([`team-section.astro`](../../packages/ui/src/sections/team/team-section.astro)) renders whatever `members[]` the page inlines; bios are injected by a brittle, app-specific route hack keyed on a cosmic planet name. This breaks the "sections are data-driven, routes are thin" contract and cannot be reused on an arbitrary page.
- **Member images bypass the Image Provider Port.** Inline `image` values are raw `/src/content/business/de/assets/*.webp` paths (RFC-0152 violation), and the `en` page even points at the `de` asset directory.
- **There is no per-member page and no module boundary.** Nothing lets a visitor open a single person, nothing lets a product page reference specific contributors, and there is nothing to package and gate as a paid capability.
- **It is not authorable by contract.** Because identity is spread across inline props + hidden route glue, an AI agent cannot add a person, place the section, or enable a profile page from a single validated schema.

## Decision

A **People module** is introduced. Its data layer is one **canonical Person record** per human per language; its presentation layer is one **People section** (placeable on any page, with a single-person "spotlight" mode) plus optional **per-member profile pages** materialized as virtual routes.

1. **Canonical Person records (free, core).** `apps/*/src/content/business/{lang}/people/{slug}.md` replaces `business/{lang}/team/`. One record carries identity, role, photo (Image Provider Port token), bio, governance `affiliations`, lifespan, and the optional spotlight/page fields. `company.brand.founders` and `company.boardMembers` are **removed**; founders/board/team for Organization/Person JSON-LD are **derived** from `affiliations`. All people JSON-LD stays ungated.
2. **People section (free, core).** A new `people` section replaces both `team` and `founder-trust-card`. It **loads Person records itself** from a build-time enumerator and accepts a `select` (explicit `slugs[]`, or `affiliation`, or all) plus an optional intro prose ref. It supports a `grid` layout and a single-person `spotlight` layout (absorbing the founder-trust-card visual). When a shown person has a live profile page, the card links to it.
3. **Per-member profile pages (paid, gated by `team.profiles`).** Persons with `page.enabled: true` are materialized as **virtual routes** from the Person records (the RFC-0192 route-source pattern, sourced from the content collection — no per-member `.md` files). The route-registry merge folds them in behind the new `team.profiles` entitlement; the page handler synthesizes a `person`-archetype page from the record and emits a `ProfilePage` + `Person` (`mainEntity`, `og:type=profile`) node.
4. **Agent-buildable by contract.** Closed Zod + manifest schemas, registry `intent`/`industryFit`, a `section.scaffold` `people` template, a `person.create` scaffold command, a `people.validate` check in `apps-check.run`, and AGENTS.md authoring docs make the whole module composable by an AI agent from machine-checkable contracts.

All legacy surfaces (the `team` section, `founder-trust-card`, inline `members[]`, the route hack, and the denormalized `company` people fields) are deleted. No backward compatibility is kept.

## Architectural fit

- **RFC-0115 (amended):** RFC-0115 migrated the `team`/PersonProfile portrait to `<SectionImage>`/`ImageFade`. This RFC supersedes the `team` section's inline-member data model with the canonical Person record and the data-driven `people` section; the PersonProfile portrait + `ImageFade` work is retained.
- **RFC-0008 / RFC-0024:** Person records are a repeatable business schema with RFC-0008 deep-merge localization and RFC-0024 dispatch — reusing the existing loader, cache, and validation infrastructure ([`loaders.ts`](../../packages/business/src/loaders.ts), [`dispatcher.ts`](../../packages/business/src/dispatcher.ts)).
- **RFC-0148 / RFC-0163:** founders/board/team are projected into the shared `buildOrganizationProfile` ([`organization-profile.ts`](../../packages/share/src/semantic/organization-profile.ts)) and the corrected JSON-LD pipeline; the `person` page adds a `ProfilePage` + `Person` node.
- **RFC-0152:** member photos are content-asset tokens resolved through the Image Provider Port / `<ResponsiveImage>` — never raw `/src` paths.
- **RFC-0192 / RFC-0169:** per-member pages reuse the virtual-route + entitlement-gate mechanism (`getRouteRegistry` merge in [`routes.ts`](../../packages/share/src/astro/routes.ts)) exactly as Programmatic Surface and Blog do — but sourced directly from the `people` collection (no pre-materialized JSON artifact; people are few).
- **RFC-0048 / RFC-0199:** profile-page slugs are per-language localized segments.
- **RFC-0167 (Blog):** this module mirrors Blog's shape — a content archetype + JSON-LD node + entitlement gate + a `*.validate` check that joins `apps-check.run` — and follows its precedent of spreading across `ui`/`share`/`business`/`ontology`/`checks` rather than a standalone package.
- **RFC-0112 / RFC-0143:** the section gains a per-archetype scaffold template; the `person.create` scaffold is content-driven, single-owner, and idempotent.

## Design

### CLI surface

```sh
# Validate the People contract for one app (or all). Joins apps-check.run.
pnpm exec site-kernel run people.validate --app nicaragua-projekt --json
pnpm exec site-kernel run people.validate --all

# Scaffold a new canonical Person record (+ asset placeholder, optional profile-page opt-in).
pnpm exec site-kernel run person.create --app warpgogol-com --slug andrii-syrokomskyi --lang de --page
```

### TypeScript contracts

```ts
// packages/business/src/schemas/person.ts — the single canonical Person shape.
export const PERSON_AFFILIATIONS = ["founder", "board", "team", "patron", "author"] as const;

export const personSchema = z.object({
  slug: z.string(),
  name: z.string(),
  role: z.string().optional(),                 // localized job title / function
  photo: z.string().optional(),                // RFC-0152 content-asset TOKEN (never a /src path)
  bio: z.string().optional(),                  // localized, multi-paragraph
  affiliations: z.array(z.enum(PERSON_AFFILIATIONS)).default([]),
  order: z.number().int().nonnegative().optional(),
  lifespan: z
    .object({ born: z.union([z.string(), z.number()]).optional(), died: z.union([z.string(), z.number()]).optional() })
    .strict()
    .optional(),
  // Spotlight fields (absorb founder-trust-card; rendered only in layout: "spotlight").
  location: z.string().optional(),
  statement: z.string().optional(),
  stats: z.array(z.object({ label: z.string(), value: z.string() }).strict()).optional(),
  cta: z.object({ label: z.string(), target: z.string() }).strict().optional(),
  sameAs: z.array(z.string().url()).optional(), // → Person.sameAs (entity grounding)
  // Per-member profile-page opt-in (gated by `team.profiles`).
  page: z.object({ enabled: z.boolean().default(false) }).strict().optional(),
});
export type PersonData = z.infer<typeof personSchema>;

// packages/share/src/semantic/models.ts — SemanticPerson gains grounding fields.
export type SemanticPerson = {
  name: string;
  role?: string;
  description?: string;
  isDeceased?: boolean;           // derived from lifespan.died
  birthDate?: string;             // RFC-0200
  deathDate?: string;             // RFC-0200
  image?: string;                 // RFC-0200 absolute URL → Person.image
  sameAs?: string[];              // RFC-0200 → Person.sameAs
  profileUrl?: string;            // RFC-0200 absolute URL of the person's profile page, when live
};
// SemanticPageType gains "person"; OgType already includes "profile".

// packages/ui/src/sections/people/people-section.types.ts — the data-driven section.
export interface PeopleSelect {
  slugs?: string[];                          // explicit ordered subset (product-page / contact use case)
  affiliation?: (typeof PERSON_AFFILIATIONS)[number];
  all?: boolean;
}
export interface PeopleSectionContent {
  header: Omit<SectionHeaderProps, "sectionNumber" | "id">;
  intro?: { contentRef: string };            // optional вступительное слово (prose ref)
  layout?: "grid" | "spotlight";             // spotlight = single featured person
  select: PeopleSelect;
  showRole?: boolean;
  linkToProfile?: boolean;                   // card links to the person's profile page when live
  defaultImageFade?: ImageFade;              // RFC-0115 primitive, retained
  background?: SectionBackground;
  effects?: EffectAssignment[];
  density?: SectionDensity;
  tone?: SectionTone;
}

// packages/share/src/astro/people-routes.ts — virtual-route enumerator (RFC-0192 pattern).
export interface PersonRouteEntry {
  pageId: string;                            // `person:<slug>`
  slug: string;                              // person slug
  routes: Record<string, string>;            // lang -> localized path (<teamBase>/<slug>)
}
export async function getPersonProfileRoutes(): Promise<PersonRouteEntry[]>;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/*/src/content/business/{lang}/people/*.md` | Canonical Person records (authored; client/agent-editable). Replaces `team/`. |
| `packages/business/src/schemas/person.ts` | `personSchema` (canonical). Replaces `schemas/team.ts`. |
| `packages/business/src/loaders.ts` | `getPeople`, `getPersonBySlug` (replace `getBusinessTeamMembers*`); `people/` prefix in the repeatable dispatch. |
| `packages/business/src/semantic-profile.ts` | Derive founders/board/team from `affiliations`; remove `company.brand.founders`/`boardMembers` reads. |
| `packages/business/src/schemas/company.ts` | Remove `brand.founders` and `boardMembers`. |
| `packages/ui/src/sections/people/**` | New `people` section (grid + spotlight), self-loading via `getPeople`, links to live profiles. |
| `packages/share/src/semantic/build-page.ts` | `person` semantic branch — attaches the profiled Person so a Person node emits (no separate page-archetype manifest: profile pages are synthesized as virtual routes, not authored pages). |
| `packages/share/src/astro/people-routes.ts` | Virtual-route enumerator for `page.enabled` persons. |
| `packages/share/src/astro/routes.ts` | Fold person routes into the registry behind the `team.profiles` gate (mirrors the pseo/surface merge). |
| `packages/share/src/astro/page-handler.ts` | Resolve a `person:<slug>` route's blocks from the Person record. |
| `packages/share/src/semantic/jsonld/person.ts` | Emit `birthDate`/`deathDate`/`image`/`sameAs` on the Person node. |
| `packages/share/src/semantic/jsonld/webpage.ts` | `person` → `@type ["WebPage","ProfilePage"]` with `mainEntity` → the profiled Person. |
| `packages/os/site-kernel-content/src/semantic-loader.ts` | Disk path: derive founders/board/team from `affiliations`; feed `person` profile pages to llms.txt + Markdown twins (team.profiles-gated). |
| `packages/os/site-kernel-checks/src/sitemap.ts` | Append profile-page clusters behind the `team.profiles` gate (disk/CLI). |
| `packages/os/site-kernel-checks/src/person-create.ts` | `person.create` scaffold command. |
| `packages/share/src/entitlement.ts` | Add `"team.profiles"` to `ENTITLED_FEATURES` + Stripe lookup map. |
| `packages/ontology/src/schemas/system.ts` | Add `"person"` to `semanticPageTypeSchema`. |
| `packages/os/site-kernel-checks/src/people.ts` | `people.validate`; registered in `apps-check.run`. |
| `packages/os/site-kernel-codegen/src/section-scaffold.ts` | `people` scaffold template; `person.create` scaffold. |
| `packages/ui/src/sections/founder-trust-card/**`, `packages/ui/src/sections/team/**` | **Deleted.** |
| `apps/*/src/pages/**/[...slug].astro` | Route bio-merge hack **deleted** (+ its codegen template). |

### Output format

```json
{
  "command": "people.validate",
  "status": "fail",
  "violations": [
    { "person": "de/people/jasmin-solfaghari", "rule": "missing-photo-asset", "message": "photo token 'jasmin' resolves to no content asset" },
    { "section": "de/home#founder", "rule": "unknown-person", "message": "select.slugs contains 'andrii' with no people/ record" },
    { "person": "de/people/katrin-hennings", "rule": "profile-page-unentitled", "level": "warn", "message": "page.enabled but app lacks team.profiles — no profile route will compile" }
  ]
}
```

### Failure modes

`people.validate` exits non-zero on: a Person `slug` whose default-language anchor is missing (RFC-0008); a `photo` token that resolves to no content asset; a `bio` empty for a person shown in a section or with `page.enabled`; an `affiliation` outside the enum; a `sameAs` that is not an absolute URL; a `people` section `select.slugs` entry with no matching record. It **warns** (does not fail) when a person has `page.enabled` but the app lacks the `team.profiles` entitlement (the profile route simply will not compile). It is a **no-op pass** when an app has no `people/` records and uses no `people` section. The `--json` form emits the violations array above; pretty output prints a grouped summary.

## Rollout

- **Phase 0 — Canonical Person records + governance rewire (ungated).** Add `personSchema` + `people/` loaders; rename both apps' `business/{lang}/team/` → `business/{lang}/people/` and enrich records (photo token, role, affiliations, lifespan, spotlight fields migrated out of `company`/`founder-trust-card`). Rewire `buildSiteSemanticProfile` to derive founders/board/team from `affiliations`; remove `company.brand.founders`/`boardMembers`. Extend `SemanticPerson` + the Person JSON-LD node. Ship `people.validate` v1 (record contract) and join `apps-check.run`.
- **Phase 1 — People section (ungated).** Add the `people` section (grid + spotlight), its manifest (`intent: introduce-team, humanise-brand, attribute-ownership, build-trust`), and uni.registry entry; reserve a new cosmic planet name. Migrate nicaragua's About to the new section (select by `affiliation`/`slugs`) and warpgogol's home to `layout: spotlight`. **Delete** `team` and `founder-trust-card` and the route bio-merge hack + its codegen template.
- **Phase 2 — Per-member profile pages (gated by `team.profiles`).** Add `getPersonProfileRoutes` + the route-registry merge behind the entitlement; add the page-handler `person:` branch and the `person` page archetype; emit `ProfilePage`/`Person`/`og:profile`; profile pages feed Markdown twins (RFC-0166) and the sitemap automatically. Activate `linkToProfile`. Extend `people.validate` with route/entitlement checks. Add `"team.profiles"` to the entitlement catalog + `entitlements.validate`.
- **Phase 3 — Agent buildability hardening.** Ship the `section.scaffold` `people` template + the `person.create` command; document the authoring surface in `apps/AGENTS.md` (add a person, place the section on any page, pick members by slug, enable a profile page, the gating); confirm deterministic `NEED_THIS_*` placeholders and registry discoverability.

The module ships **disabled-for-pages-by-default**: an app with no `people/` records compiles nothing new; the section and team page are available the moment records exist; profile pages compile only when both `page.enabled` and the `team.profiles` entitlement are present (fail-open when entitlements are unknown, matching RFC-0167/RFC-0192).

## Alternatives considered

- **Keep people data in `company.md` / extend the existing `team` schema in place.** Rejected — it preserves the inline-vs-bio split and the route hack, and keeps governance identity denormalized. The single canonical record is the whole point.
- **A standalone `@gogol/people` package.** Rejected for the first cut — like Blog (RFC-0167), People has no standalone runtime/port logic; it composes existing layers (business data, ui section, share routing/JSON-LD, checks). A package adds ceremony without a seam.
- **Author one `.md` page per member (the Blog-article path) for profile pages.** Rejected per the accepted decision — it duplicates each person's identity into a page file and forces hand-authoring N pages. Virtual routes sourced from the Person records (RFC-0192) keep a single source of truth.
- **A pre-materialized `people.generated.json` artifact (full Programmatic Surface machinery).** Rejected — people are few (5–50); the route-registry merge can enumerate the `people` collection directly at build time without a generate step, freshness budget, or substance scoring.
- **Gate the whole module (section + pages) behind one entitlement.** Rejected per the accepted decision — only per-member profile pages are paid; the section, the team page, and all people JSON-LD stay in the free baseline.

## Risks

- **Person-identity duplication regressing.** The canonical record must be the _only_ source; `blog.validate`-style enforcement (`people.validate`) plus the deletion of `company.brand.founders`/`boardMembers` prevents a parallel list reappearing.
- **Governance JSON-LD loss when the module's pages are off.** Mitigated by design: founders/board/team JSON-LD derive from the _records_, not the _paid pages_, so disabling `team.profiles` never removes Organization/Person markup.
- **Profile-route slug collisions / orphan links.** A profile slug is `<teamBase>/<person.slug>`; authored pages always win a slug collision (registry merge never overwrites), and `linkToProfile` renders a link only when the route is actually live + entitled (otherwise a plain card).
- **Agent misuse.** Because the schema is closed and validated and the scaffold emits `NEED_THIS_*` placeholders, an agent that omits a photo/bio or invents an affiliation fails `people.validate` with a precise rule rather than shipping broken markup.
- **Migration churn across two live apps.** Phased rollout keeps Phase 0/1 (records + section, ungated) independent of Phase 2 (paid pages); each phase leaves the build green.

## Acceptance criteria

- [x] `personSchema` + `PERSON_AFFILIATIONS` defined in `@gogol/business`; `getPeople`/`getPersonBySlug` loaders; `people/` registered in the repeatable dispatcher (replacing `team/`). (evidence: packages/ directory, package exists)
- [x] `company.brand.founders` and `company.boardMembers` removed; `buildSiteSemanticProfile` derives founders/board/team from `affiliations`; `SemanticPerson` + Person JSON-LD emit `birthDate`/`deathDate`/`image`/`sameAs`. **Both** the Astro and the disk (`semantic-loader.ts`) paths derive governance from affiliations. (evidence: implemented historically)
- [x] `people` section (grid + spotlight) self-loads records via a build-time enumerator; supports `select` by `slugs`/`affiliation`/`all` and `linkToProfile`; manifest + uni.registry entry added. **Scope notes:** the introductory word is composed as a preceding `markdown` block (not a section `intro` prop — avoids duplicating the prose pipeline); the cosmic planet is the reused `Mimas` (the `team`→`people` archetype rename) rather than a newly reserved name. (evidence: implemented historically)
- [x] `team` and `founder-trust-card` sections deleted; inline `members[]` block shape removed; the route-level bio-merge hack and its codegen template removed; both apps migrated (nicaragua About → `people` section; warpgogol home → `spotlight`). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Member photos resolve through the Image Provider Port (RFC-0152) via a `business/<lang>/assets/` token fallback; no raw `/src` image paths remain in people content. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `"person"` added to `semanticPageTypeSchema` / `SemanticPageType`; `getPersonProfileRoutes` + route-registry merge gate per-member pages behind `team.profiles`; the page handler synthesizes `person:<slug>` blocks from the record; pages emit `@type ["WebPage","ProfilePage"]` + `Person` `mainEntity` + `og:type=profile`, and feed the sitemap + Markdown twins + llms. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `"team.profiles"` added to `ENTITLED_FEATURES` + Stripe lookup map; `entitlements.validate` recognizes it (closed-catalog check); with the feature absent, no profile route compiles and the sitemap omits them (fail-open when entitlements unknown). Gating mirrors the verified blog/pseo pattern; warpgogol-com dogfoods `team.profiles`. (evidence: implemented historically)
- [x] `people.validate` registered and in `apps-check` (author phase); `--json` output stable; no-op pass when an app uses no people; warns (non-fatal) on a `page.enabled` record without the `team.profiles` entitlement. (evidence: implemented historically)
- [x] `person.create` scaffolds a record (optional `--page`) with `NEED_THIS_*` placeholders. **Scope note:** no bespoke `section.scaffold` _people_ template was added — the generic `composite` bodyKind scaffold already covers a people-style section; `person.create` is the people-specific scaffold. (evidence: implemented historically)
- [x] `apps/AGENTS.md` (and `packages/ui/AGENTS.md` for the section) document the People authoring surface for AI agents; `docs/COMMANDS.md` lists `people.validate` + `person.create`. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- A person is described **once**: edit `business/{lang}/people/<slug>.md`. Never reintroduce inline `members[]`, a `founders`/`boardMembers` list in `company.md`, or a route-level merge of bios into blocks.
- The `people` section is **data-driven**: it loads records itself from `select`. Do not inline name/role/photo/bio into the page file.
- Member `photo` is a **content-asset token** resolved through the Image Provider Port (RFC-0152) — never a `/src/content/...` path.
- A per-member profile page is a **virtual route** from a `page.enabled` record gated by `team.profiles` — never an authored `.md` page file and never ungated.
- To reference specific contributors on an arbitrary page (e.g. a product page), place a `people` section with `select.slugs: [...]` and `linkToProfile: true`.
- Run `people.validate --json` and resolve every violation before considering people content complete.
- Agents MUST NOT weaken `people.validate` or move people JSON-LD behind an entitlement without a superseding RFC.
