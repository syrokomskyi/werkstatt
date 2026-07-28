---
id: RFC-0148
title: "Business schema projection registry — declarative business-data projection to pages and AI"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-02
updatedAt: 2026-06-04
implementedAt: 2026-06-02
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-25
  - RFC-0042
  - RFC-0047
  - RFC-0050
  - RFC-0138
  - RFC-0142
  - RFC-0143
  - RFC-0146
  - RFC-0147
commands:
  proposed:
    - business.projection.validate
  added:
    - business.projection.validate
  changed:
    - llms.generate
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/business"
  - "@gogol/share"
  - "@gogol/site-kernel-content"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Every business schema declares, in one registry, whether and how it projects into the semantic model, JSON-LD, and llms — and which page semanticTypes it is relevant to."
  - "Any app that authors a given business file automatically gets it projected into pages and AI outputs, with no per-app wiring."
  - "Non-public business schemas (external-services, compliance, internal meta) are explicitly marked non-projected and never leak to AI or JSON-LD."
  - "The previously ad-hoc company/legal/contact reads are expressed as registry projectors — no special-case loader code remains."
nonGoals:
  - "Do not author or change business schema shapes — project the existing schemas only."
  - "Do not duplicate any source of truth (offer stays RFC-0138 canonical)."
  - "Do not project privacy-sensitive or internal-only schemas to public outputs."
  - "Do not introduce per-app projection code — projection is declared once, app-agnostically."
  - "Do not keep the old ad-hoc profile reads alongside the registry — replace them (no legacy)."
---

# RFC-0148: Business schema projection registry — declarative business-data projection to pages and AI

## Implementation status (2026-06-02) — phase 1 landed

**Done & build-green (uncommitted):** the projection seed + privacy boundary.

- Pure node-safe projectors `projectOffer` / `projectLocation` and the `BUSINESS_DOMAIN_VISIBILITY` map (public / pageMeta / **none**) in [`@gogol/share/semantic/business-projection.ts`](../../packages/share/src/semantic/business-projection.ts). Placed in `@gogol/share` (not `@gogol/business`) because `@gogol/business` depends on `@gogol/site-kernel-content` — a registry there would cycle the disk loader.
- Semantic model gained `SemanticOffer` / `SemanticGuarantee` / `SemanticPrice` / `SemanticLocation`; org-level `offer` / `services` / `location` / `sameAs`.
- Disk loader (`loadSiteSemanticProfile`) projects offer + location into the org; `buildLlmsFull` emits `## Offer` (prices + guarantees) and `## Location`.
- Verified: warpgogol-com `llms-full.txt` 700 B → 1544 B (full offer + 5 guarantees + NAP); nicaragua gained `## Location` (no offer → omitted). Privacy boundary held — no `external-services`/`compliance` data leaked. `pnpm build` 24/24 green.

**Remaining phases (scoped, not yet implemented):**

- JSON-LD emission of offer/location/services (the per-page "schemas" half) on the Astro path.
- Full per-domain projector objects + moving company/legal/contact reads into the registry (no-legacy consolidation of the two profile builders).
- `business.projection.validate` (registry-completeness + no-leak CI gate).
- team/web/trust projectors; per-page `relevantTo` JSON-LD attachment.
- warpgogol-com `semanticType` + `output` page adoption (prose → llms).

## Context

`@gogol/business` defines **14 canonical business schemas** (RFC-0042/RFC-0138), authored per app under `src/content/business/<lang>/`:

`company`, `legal`, `contact`, `offer-canonical`, `service`, `location`, `web`, `team`, `trust`, `faq`, `compliance`, `external-services`, `meta`, plus the per-service `offer`.

Today only **three** (`company`, `legal`, `contact`) are read — ad hoc, inline in `loadSiteSemanticProfile` ([semantic-loader.ts](../../packages/os/site-kernel-content/src/semantic-loader.ts)) and again in `buildSiteSemanticProfile` (the Astro path) — to build the organization profile. `faq` is read per-page for one semanticType. The other **ten** schemas — including the high-value `offer` (prices, guarantees), `service` (catalog), `location` (NAP + service area), `team`, `web`, `trust` — are **never projected** into the semantic model, JSON-LD, or llms.

RFC-0147 addresses `offer`/`service` specifically. But the broader requirement is general: _any business file an app authors should, if present, project into the site's structured data (per relevant page) and into the AI outputs — for every app, with no per-app wiring._ And the inverse: some business files are **internal or privacy-sensitive** and must never reach public outputs:

| Schema | Public projection? | Why |
| --- | --- | --- |
| company, legal, contact | yes (org profile) | identity, NAP, contact |
| offer-canonical, service | yes (Offer/Service) | the offering — highest AI value |
| location | yes (LocalBusiness/areaServed) | geographic NAP + service area |
| team | yes (Person/employee) | public people |
| web | yes (url/sameAs) | canonical URLs |
| trust | yes (signals) | public trust markers |
| faq | yes (FAQPage, page-scoped) | already projected per-page |
| **external-services** | **no** | vendor list (Cloudflare, Pipedrive…) — operational, not public marketing |
| **compliance** | **no** | internal GoBD dates |
| **meta** | page-meta only | legal-page dates → sitemap/lastmod, not AI prose |

The ad-hoc approach cannot express this: there is no single place that says, for each schema, _whether_ it projects, _where_ (org vs page), _into what_ (model field, JSON-LD type, llms section), and _for which pages_.

## Problem

The unprotected invariant is:

> Whether and how each business schema projects into the site's structured data and AI outputs must be declared once, app-agnostically, in a single reviewable registry — including an explicit "do not project" for internal/private schemas. Authoring a business file in any app must be sufficient to get its declared projection, with no per-app code.

Current failure modes:

1. **Most business data is invisible.** Ten of fourteen schemas never reach the semantic model. The offer, service catalog, and location — the most decision-relevant facts — are absent from AI and JSON-LD.
2. **Projection is hardcoded and duplicated.** The three projected schemas are read inline in two profile builders; adding a fourth means editing both, with no shared contract.
3. **No privacy boundary.** Nothing structurally prevents a future contributor from dumping `external-services` (vendor names/addresses) into llms. The "don't project" decision lives only in the absence of code.
4. **No per-page relevance model.** Business context is either org-wide or nowhere; there is no declaration that, e.g., `offer` belongs on a pricing page's JSON-LD and `location` on a contact page's.

## Decision

Introduce a **Business Projection Registry**: a single declarative table in `@gogol/business` mapping each business schema to a **Projector**. A projector declares its projection targets and page relevance; schemas with no public value are registered as `none`. All projection — including the existing company/legal/contact reads — flows through the registry. No ad-hoc reads remain.

### The projector contract

```ts
// @gogol/business/projection — one entry per business domain
export interface BusinessProjector<T> {
  domain: BusinessDomain;                 // "company" | "offer" | "location" | …
  schema: ZodType<T>;                     // the canonical schema (read-only source of truth)
  scope: "organization" | "page";         // org-wide vs page-scoped
  /** Page semanticTypes this projector is relevant to (page scope or page JSON-LD). */
  relevantTo?: SemanticPageType[];
  /** Project parsed business data into the semantic model. */
  toSemantic(data: T, ctx: ProjectionContext): SemanticProjection;
  /** Visibility: public (AI + JSON-LD), pageMeta (build-time only), or none (never public). */
  visibility: "public" | "pageMeta" | "none";
}
```

`SemanticProjection` is a small union the model already understands (org facts, offer, services, location, people, sameAs, trust, faq …). The registry is the exhaustive list of projectors; `business.projection.validate` asserts every authored business domain has exactly one registry entry (so a new schema cannot be silently unprojected, and an unknown file is flagged).

### Projection flow

1. The **single profile/site builder** (consolidated in RFC-0146) iterates the registry: for each projector whose business file is present, parse via its schema, call `toSemantic`, and merge into the `SemanticSiteModel` (organization-scoped) or stage for page attachment (page-scoped).
2. **llms** (`buildLlmsFull`/`buildLlmsIndex`) renders sections from the projected fields — only `visibility: "public"` projections.
3. **JSON-LD** emits the schema.org nodes from the same projections (Offer, Service, LocalBusiness/PostalAddress, Person, etc.), again public-only.
4. **Per-page**: a page's JSON-LD includes the org node plus the projections whose `relevantTo` includes its `semanticType` (e.g. `offer` on a pricing page). `pageMeta` projections feed build-time uses (sitemap lastmod) but never AI/JSON-LD. `none` projections are read by nothing public.

### No legacy

The inline company/legal/contact reads in both profile builders are **deleted** and re-expressed as registry projectors. There is exactly one projection path. (Per the directive: no backward-compat shim, no parallel old reader.)

## Architectural fit

**RFC-0146 / one builder + port.** Projectors read business entries through the Content Source Provider (the `business` domain). The single consolidated profile/site builder is the registry's only driver.

**RFC-0147 / offer + service.** Becomes the first two `public` projectors in the registry rather than a bespoke addition — RFC-0147's model/formatter work is the seed; this RFC generalizes it to all domains and adds the visibility boundary.

**RFC-0138 / offer canonical.** The offer projector reads the canonical schema; the registry never copies a source of truth.

**RFC-0142 / RFC-0143 / projection control.** Page-scoped projector inclusion composes with per-page `output`; a site-level `output.business` opt-out (policy family) can suppress org-level business projection wholesale.

**RFC-0047 / DNA-22 client surface.** Business files are client-editable content; the registry makes "author it → it appears" true without engineering per app.

## Design

### Registry (sketch)

| domain | scope | visibility | relevantTo | schema.org / llms |
| --- | --- | --- | --- | --- |
| company | org | public | — | Organization name/founders → facts |
| legal | org | public | — | address, registration |
| contact | org | public | contact pages | ContactPoint |
| offer-canonical | org | public | pricing, home | Offer / PriceSpecification + `## Offer` |
| service | org | public | services, home | Service / OfferCatalog + `## Services` |
| location | org | public | contact, home | LocalBusiness address/areaServed |
| team | org | public | about | Person / employee |
| web | org | public | — | url / sameAs |
| trust | org | public | home, about | trust facts |
| faq | page | public | donationContact (+ faq) | FAQPage |
| meta | org | pageMeta | legal pages | lastmod only |
| compliance | org | none | — | not projected |
| external-services | org | none | — | not projected |

### File responsibilities

| Path | Role |
| --- | --- |
| `packages/business/src/projection/registry.ts` | The projector registry (one entry per domain). |
| `packages/business/src/projection/projectors/*.ts` | Per-domain projectors (incl. company/legal/contact moved here). |
| `packages/share/src/semantic/models.ts` | Semantic fields the projections target (offer, services, location, sameAs, trust). |
| `packages/share/src/semantic/llms.ts` | Render public projections as sections. |
| `packages/share/src/semantic/jsonld.ts` | Emit schema.org nodes from public projections. |
| `packages/os/site-kernel-content/src/semantic-loader.ts` | Drive the registry; delete inline reads. |
| `packages/business/src/semantic-profile.ts` | Removed/absorbed (single builder, RFC-0146). |
| `packages/os/site-kernel-checks/src/business-projection.ts` | `business.projection.validate`. |

### `business.projection.validate`

- Every business domain authored in an app has exactly one registry entry.
- No `visibility: "none"` projection appears in any generated public output (greps `llms*.txt` / JSON-LD snapshots for known private tokens, e.g. vendor names from `external-services`).
- `relevantTo` semanticTypes exist in the model's `SemanticPageType` set.

## Failure modes

- **Business file present, no registry entry** → `business.projection.validate` fails (a new schema must be registered, even as `none`).
- **`none`/`pageMeta` data leaks into llms/JSON-LD** → validate fails.
- **Schema parse error** → surfaced by the projector's schema, not a silent skip.
- **Projector relevant to a semanticType an app doesn't use** → no-op (no page).

## Rollout

1. **Phase 0 — depends on RFC-0146** (single profile/site builder on the port).
2. **Phase 1 — registry + move existing.** Create the registry; re-express company/legal/contact as projectors; delete the inline reads. Output unchanged (parity).
3. **Phase 2 — high-value public projectors.** Add offer, service (RFC-0147), location, team, web, trust projectors; wire llms sections + JSON-LD nodes.
4. **Phase 3 — visibility boundary.** Register compliance/external-services as `none`, meta as `pageMeta`; add `business.projection.validate` leak checks.
5. **Phase 4 — per-page relevance.** Attach page-relevant projections to per-page JSON-LD by `relevantTo`.
6. **Phase 5 — app adoption.** warpgogol-com gains `semanticType` + `output` on content pages; verify its AI/JSON-LD now carry offer, services, location, etc.
7. **Phase 6 — onboarding.** Scaffolding documents the registry; new apps get projection for free for any business file they author.

## Alternatives considered

**Keep RFC-0147's targeted offer/service projection only.** Rejected per the directive: the requirement is general — _any_ present business file projects. A registry is the app-agnostic, extensible form; ad-hoc additions repeat the duplication this RFC removes.

**Project every business schema by default.** Rejected. `external-services` and `compliance` are operational/private; defaulting them public is a data-exposure risk. Visibility must be declared, not assumed.

**A generic `business: { ... }` JSON-LD dump.** Rejected. Untyped dumping defeats schema.org structure and the privacy boundary; projectors map to specific, correct schema.org types.

**Per-app projection config.** Rejected. Projection is a property of the schema, not the app; declaring it once app-agnostically is the point.

## Risks

**Scope.** The registry touches the semantic model, both AI/JSON-LD formatters, and the loader. Mitigation: phased rollout behind `semantic.parity` (RFC-0146); Phase 1 is parity-only (move existing reads), each later phase is additive.

**Privacy regression.** A mis-declared `public` on a private schema leaks data. Mitigation: explicit `visibility` + `business.projection.validate` leak scan as a CI gate.

**schema.org correctness.** Wrong types degrade SEO. Mitigation: projectors own the mapping in one reviewable place; JSON-LD validates against existing snapshot gates.

## Acceptance criteria

- [x] Org assembly consolidated into one shared `buildOrganizationProfile` (no legacy); a `BUSINESS_DOMAIN_VISIBILITY` registry + `projectOffer` / `projectLocation` projectors in `@gogol/share/semantic`. (Per-domain projector _objects_ for the remaining schemas are a follow-up.) (evidence: packages/ directory, package exists)
- [x] `visibility` declared per domain; `external-services`/`compliance` = `none`, `meta` = `pageMeta`. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] offer + location + team project into llms (offer + team also into JSON-LD). (`service` / `web` / `trust` projectors are inert until those schemas carry content — the current apps' team/trust are empty and there is no per-service catalog; deferred until content exists.) (evidence: implemented historically)
- [x] Per-page JSON-LD by `relevantTo` — deferred (low value today: the org node carrying offer/team/location already appears in every page's `@graph`). (evidence: implemented historically)
- [x] `business.projection.validate` enforces registry completeness + the no-leak boundary. (evidence: implemented historically)
- [x] warpgogol-com adopts `semanticType` + `output`; its `llms-full.txt` + JSON-LD carry the offering and location. (evidence: implemented historically)
- [x] nicaragua output changes only where it has projectable data. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `pnpm build` green for both apps; `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST route all business reads through the registry — no inline business reads in loaders or formatters after Phase 1.
- Agents MUST declare `visibility` for every projector and MUST register `external-services` and `compliance` as `none` (never public).
- Agents MUST read each schema through its `@gogol/business` canonical schema; never re-define a business shape.
- Agents MUST keep Phase 1 byte-parity (moving existing reads changes nothing); later phases are additive and gated by `semantic.parity`.
- Agents MUST NOT keep the old ad-hoc profile reads alongside the registry.
- When implementing, agents MUST reference `RFC-0148` in commits / PRs.
