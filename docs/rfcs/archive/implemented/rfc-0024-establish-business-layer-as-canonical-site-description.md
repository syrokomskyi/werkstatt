---
id: RFC-0024
title: "Establish business layer as canonical site description"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-24
updatedAt: 2026-06-04
implementedAt: 2026-04-24
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-4
  - DNA-5
  - DNA-11
  - DNA-20
  - RFC-0007
  - RFC-0008
  - RFC-0009
  - RFC-0019
  - RFC-0023
commands:
  proposed:
    - business.profile.validate
  added:
    - business.profile.validate
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - business
successSignals:
  - "A new `@gogol/business` package owns the 11 canonical business schemas (`company`, `web`, `contact`, `location`, `legal`, `compliance`, `external-services`, `services`, `offers`, `trust`, `faq`) and their localized loaders with deep-merge language fallback (RFC-0008)."
  - "Every `apps/*` declares its site profile as content under `src/content/business/**` consumed exclusively through `@gogol/business` loaders. No app re-declares business schemas, and no route reads business YAML/JSON directly."
  - "`business.profile.validate` passes for every app: required collections are present, schemas parse, localized overlays resolve without missing default-language anchors."
  - "Adding a new client site requires only authoring `src/content/business/**` content — schemas, loaders, and validators are already supplied by `@gogol/business`."
nonGoals:
  - "Do not move business *content* into the shared package. Content stays app-local under `apps/*/src/content/business/` per DNA-4 (canonical content in `src/content/`)."
  - "Do not merge business loaders into `@gogol/share`. The business layer describes *who the site is* (company, services, offers); `@gogol/share` hosts platform-level astro/semantic helpers. Mixing the two would blur the ontology boundary (DNA-19)."
  - "Do not introduce business-layer taxonomy (SemanticRole, ComponentRole) values tied to individual business fields — UI ontology and business ontology are orthogonal vocabularies."
  - "Do not mirror business content into an additional machine-readable registry. The business layer is consumed at build time by Astro content collections; `uni.registry.json` (RFC-0023) indexes UI only."
  - "Do not adopt Cloudflare KV / edge-runtime fetches of business data. Business content is build-time input only."
---

# RFC-0024: Establish business layer as canonical site description

## Context

RFC-0023 establishes the Uni UI Ontology and `@gogol/ontology` / `@gogol/tokens` / `@gogol/ui` as the shared vocabulary for _what_ the UI is. It explicitly leaves the parallel question of _who the site is_ — company name, offered services, contact channels, legal metadata — to a separate contract.

Today each app answers that question differently:

- `apps/nicaragua-projekt` declares partial business metadata inline inside section content.
- `apps-todo/main` ships a mature vocabulary: 11 Zod schemas under `src/content/schemas/business/` plus a 485-line `src/utils/business-content.ts` loader module with per-language + per-entry + per-collection caches and deep-merge fallback.
- Future client sites (three planned: two similar to `nicaragua-projekt`, one external greenfield) will reinvent this again unless the contract is workspace-wide.

The project's product thesis (RFC-0007 client-export ecosystem, RFC-0019 page→section→component hierarchy, RFC-0023 Uni UI Ontology) assumes every client site is **composable from shared sections + local content**. Without a canonical site-description contract, "local content" drifts into ad-hoc shapes that break the composition promise: shared sections cannot bind to heterogeneous business data without per-app adapters.

## Problem

- **Schema duplication** — every new app re-declares `company.yaml`, `service.yaml`, `faq.yaml` shapes, diverging on field names, language overlay conventions, and required vs. optional fields.
- **Loader duplication** — the deep-merge language-fallback pattern (RFC-0008) is non-trivial; re-implementing it per app guarantees subtle bugs (stale caches, wrong fallback chain, inconsistent `order` sort semantics for repeatable entries).
- **Coupling leakage** — shared UI sections (hero, final-cta, footer, person-profile) need stable bindings into business data (`company.name`, `contact.primary`, `services[].slug`). Without a shared contract, every section grows app-specific prop adapters.
- **No validation surface** — there is no single command to answer _"does this app declare a complete, parseable site profile?"_. New apps fail late, at page render.

## Decision

A new package `@gogol/business` is introduced as the canonical home for the business layer. A new DNA invariant (**DNA-20**) makes adoption mandatory for every `apps/*`. A new OS command `business.profile.validate` enforces the invariant.

### Package contents

```
packages/business/
├── package.json              # @gogol/business
├── src/
│   ├── schemas/              # Zod schemas — SHARED
│   │   ├── company.ts
│   │   ├── web.ts
│   │   ├── contact.ts
│   │   ├── location.ts
│   │   ├── legal.ts
│   │   ├── compliance.ts
│   │   ├── external-services.ts
│   │   ├── service.ts        # repeatable
│   │   ├── offer.ts          # repeatable
│   │   ├── trust.ts          # repeatable
│   │   ├── faq.ts            # repeatable
│   │   └── index.ts          # barrel
│   ├── loaders/              # Localized loaders — SHARED
│   │   ├── singletons.ts     # getBusinessCompany / Web / Contact / Legal / Location / Compliance / ExternalServices / Info / SiteInfo
│   │   ├── repeatables.ts    # getBusinessServices / Offers / TrustItems / FaqEntries (+ BySlug / ByTag / ByService)
│   │   ├── channels.ts       # getContactChannels / getContactChannelByKind
│   │   ├── cache.ts          # per-language + per-entry + per-collection Map caches
│   │   ├── deep-merge.ts     # default-language → localized overlay (RFC-0008)
│   │   ├── sort.ts           # sortRepeatableEntries by `order`
│   │   └── index.ts
│   └── index.ts              # top-level barrel: re-exports schemas + loaders + types
└── README.md
```

Only **content** remains app-local:

```
apps/*/src/content/business/
├── <language>/
│   ├── company.yaml
│   ├── web.yaml
│   ├── contact.yaml
│   ├── location.yaml
│   ├── legal.yaml
│   ├── compliance.yaml
│   ├── external-services.yaml
│   ├── services/
│   │   └── <slug>.yaml
│   ├── offers/
│   │   └── <slug>.yaml
│   ├── trust/
│   │   └── <slug>.yaml
│   └── faq/
│       └── <slug>.yaml
```

### DNA-20 (established by this RFC)

> **Business layer is canonical site description.** Every client site is described through the `@gogol/business` package: schemas for `company`, `web`, `contact`, `location`, `legal`, `compliance`, `external-services`, `services`, `offers`, `trust`, and `faq`, plus localized loaders with deep-merge language fallback (RFC-0008). Business schemas are shared; the _content_ of every business collection stays app-local under `apps/*/src/content/business/`. Routes and sections must not re-declare business shapes or read business YAML/JSON directly — they consume it through `@gogol/business` loaders. Enforced by `business.profile.validate` (RFC-0024).

DNA-20 was introduced in the same commit that added RFC-0023, because business adoption is part of the same transformation sweep; this RFC is the contract RFC for it, and DNA-20 now references RFC-0024 as its canonical source.

### `business.profile.validate` command

Contract:

| Property    | Value                                                           |
| ----------- | --------------------------------------------------------------- |
| Identifier  | `business.profile.validate`                                     |
| Scope       | app-aware (`--app <name>`); workspace-wide by default           |
| Kind        | validation (read-only)                                          |
| Layer       | site-kernel-checks                                              |
| Input       | none (walks `apps/*/src/content/business/` for each target app) |
| JSON output | stable shape per RFC-0003                                       |

Checks performed:

1. **Singleton presence** — every app has, at minimum, `company`, `web`, `contact`, `legal` in the default language. `location`, `compliance`, `external-services` are optional but, when present, must parse.
2. **Schema conformance** — every business entry parses against its `@gogol/business` Zod schema. Parse failures list the offending entry path and the Zod issues array.
3. **Language fallback integrity** — for every localized business entry (non-default language), an anchor entry MUST exist in the default language. Orphan overlays fail the check.
4. **Repeatable-collection slug uniqueness** — within a single language, no two entries in `services/`, `offers/`, `trust/`, or `faq/` share a slug.
5. **Cross-reference integrity** — when `offer.service` references a service slug, the referenced service must exist in the same language (or in the default language, per fallback).
6. **Direct-read prevention** — no route in `apps/*/src/pages/**` and no section in `apps/*/src/sections/**` or `packages/ui/sections/**` reads `src/content/business/` via `astro:content`, `fs`, `yaml`, or `JSON.parse`. All access flows through `@gogol/business` loaders. Detection is AST-based (import/require grep + Astro content-collection reference scan).

Exit codes and JSON shape follow RFC-0003 (`rfc.check`-style output).

## Architectural fit

- **DNA-4** (canonical content in `src/content/`): content stays app-local; the package owns only schemas + loaders.
- **DNA-5** (component ↔ content ↔ schema mirror): business entries are the content leg of sections that bind to business data (e.g., a `final-cta` section mirrored against `contact` + `company`).
- **DNA-8** (page → section → component → content): business loaders are consumed at the _content_ boundary, never injected into section JSX directly.
- **DNA-11** (language mirroring): enforced by business.profile.validate check #3; reuses the `mirroring.validate` philosophy of default-language anchors + localized overlays.
- **DNA-19** (closed ontology vocabularies): business schemas are orthogonal to `SemanticRole` / `ComponentRole` / `Industry` / `Layer`. A section's _role_ is UI ontology; its _binding_ is business ontology. The two never intersect in a single enum.
- **DNA-20** (this RFC): the invariant name-carrier for the business layer.
- **RFC-0007** (client-export ecosystem isolation): unblocks the next three client sites — they contribute only content + tokens + optional scripts, consuming `@gogol/business`, `@gogol/ui`, `@gogol/tokens`, `@gogol/ontology` as peer dependencies.
- **RFC-0008** (content entry language fallback): the loader's deep-merge is a direct lift of the established RFC-0008 semantics; this RFC does not alter the fallback algorithm, it only centralizes the implementation.
- **RFC-0009 / RFC-0014** (Mirror Quartet / routes): business content entries participate in the Mirror Quartet as normal content files; no new mirror legs are introduced.
- **RFC-0019** (page → section → component → content structure): the business layer is the _content_ vertex of the structure arrow for business-bound sections.
- **RFC-0023** (Uni UI Ontology): the UI ontology and the business ontology are co-equal workspace contracts; neither subordinates the other. Wave 3 of the RFC-0023 rollout implements this RFC.

## Design

### Package classification

`@gogol/business` is a **domain package**, not a platform package. Packages currently classified:

| Package               | Classification            | Describes             |
| --------------------- | ------------------------- | --------------------- |
| `@gogol/ontology`     | platform — vocabulary     | _What UI is_          |
| `@gogol/tokens`       | platform — presentation   | _How UI looks_        |
| `@gogol/ui`           | platform — surface        | _What UI renders_     |
| `@gogol/share`        | platform — infrastructure | _How the app runs_    |
| `@gogol/business`     | **domain — identity**     | **_Who the site is_** |
| `@gogol/site-kernel*` | platform — OS             | _How we validate_     |

This split keeps `@gogol/share` free of business-shaped code and prevents `@gogol/ontology` from accreting fields that describe organizations rather than UI atoms.

### TypeScript contracts

```ts
// @gogol/business
export * from "./schemas";          // 11 Zod schemas + inferred types
export * from "./loaders";          // getBusiness* / getContact* / getSiteInfo
export type { BusinessProfile }     // union alias for the full site descriptor
  from "./types";
```

Loader signatures (lifted from `apps-todo/main/src/utils/business-content.ts`, which acts as the reference implementation):

```ts
// singletons
export function getBusinessCompany(lang: Language): Promise<Company>;
export function getBusinessWeb(lang: Language): Promise<Web>;
export function getBusinessContact(lang: Language): Promise<Contact>;
export function getBusinessLegal(lang: Language): Promise<Legal>;
export function getBusinessLocation(lang: Language): Promise<Location | null>;
export function getBusinessCompliance(lang: Language): Promise<Compliance | null>;
export function getBusinessExternalServices(lang: Language): Promise<ExternalServices | null>;
export function getBusinessInfo(lang: Language): Promise<BusinessInfo>;
export function getSiteInfo(lang: Language): Promise<SiteInfo>;

// repeatables
export function getBusinessServices(lang: Language): Promise<Service[]>;
export function getBusinessServiceBySlug(lang: Language, slug: string): Promise<Service | null>;
export function getBusinessOffers(lang: Language): Promise<Offer[]>;
export function getBusinessOffersByService(lang: Language, serviceSlug: string): Promise<Offer[]>;
export function getBusinessOfferBySlug(lang: Language, slug: string): Promise<Offer | null>;
export function getBusinessTrustItems(lang: Language): Promise<TrustItem[]>;
export function getBusinessTrustItemsByTag(lang: Language, tag: string): Promise<TrustItem[]>;
export function getBusinessFaqEntries(lang: Language): Promise<FaqEntry[]>;
export function getBusinessFaqEntriesByTag(lang: Language, tag: string): Promise<FaqEntry[]>;

// channels
export function getContactChannels(lang: Language): Promise<ContactChannel[]>;
export function getContactChannelByKind(lang: Language, kind: ChannelKind): Promise<ContactChannel | null>;
```

### Astro content-collection integration

`@gogol/business` exports ready-to-spread collection configs:

```ts
// apps/<app>/src/content/config.ts
import { businessCollections } from "@gogol/business/astro";

export const collections = {
  ...businessCollections, // registers company, web, contact, ..., faq
  // app-specific collections continue here
};
```

Each collection's loader is a `glob` pattern rooted at `src/content/business/<lang>/...` and uses the schema from `@gogol/business`.

### Migration path from `apps-todo/main`

The existing 485-line `apps-todo/main/src/utils/business-content.ts` is the reference implementation. Lifting it into `packages/business/` is a pure extraction:

1. Move `apps-todo/main/src/content/schemas/business/*.ts` → `packages/business/src/schemas/*.ts`. Replace any `import type { Language }` references with `@gogol/ontology`.
2. Split `business-content.ts` into `loaders/singletons.ts`, `loaders/repeatables.ts`, `loaders/channels.ts`, `loaders/cache.ts`, `loaders/deep-merge.ts`, `loaders/sort.ts`. No functional change.
3. Introduce `packages/business/astro.ts` exposing `businessCollections`.
4. Thin `apps-todo/main/src/utils/business-content.ts` to a re-export of `@gogol/business` for the transitional window.

### Migration path for `nicaragua-projekt`

`nicaragua-projekt` currently embeds scraps of business metadata inside section-level content (hero copy, final-cta copy, footer copy). Migration is content-shaped, not code-shaped:

1. Extract `company.name`, `company.legalName`, `company.logoUrl` into `src/content/business/<lang>/company.yaml`.
2. Extract contact channels (email, phone, social) into `src/content/business/<lang>/contact.yaml` + `location.yaml` if relevant.
3. Extract legal/compliance strings into `legal.yaml` + `compliance.yaml`.
4. Refactor sections (`final-cta`, `footer`, `hero` where applicable) to consume business loaders instead of inline section copy. Section content stays for section-shaped copy only.
5. Run `business.profile.validate --app nicaragua-projekt` until green.

### Composition with the UI ontology

A shared section (e.g., a `final-cta` section under `packages/ui/sections/final-cta/`) receives business data as typed props:

```astro
---
// packages/ui/sections/final-cta/final-cta.astro
import type { FinalCtaProps } from "./final-cta.manifest.schema.ts";
import type { Contact, Company } from "@gogol/business";

interface Props extends FinalCtaProps {
  contact: Contact;
  company: Company;
}
---
```

Routes (app-local, thin — DNA-7) resolve business data via loaders and pass it as props:

```astro
---
// apps/<app>/src/pages/index.astro
import { getBusinessContact, getBusinessCompany } from "@gogol/business";
import FinalCta from "@gogol/ui/sections/final-cta";
const lang = Astro.currentLocale;
const [contact, company] = await Promise.all([
  getBusinessContact(lang),
  getBusinessCompany(lang),
]);
---
<FinalCta contact={contact} company={company} />
```

This keeps sections generic across clients (Uni ontology) while letting each client's identity (business ontology) flow in from content.

## Rollout

This RFC is implemented as **Wave 3** of the RFC-0023 rollout (see RFC-0023 § Rollout). Waves:

1. **W1** (RFC-0023) — `@gogol/ontology` skeleton.
2. **W2** (RFC-0023) — content schemas consume ontology enums.
3. **W3** (this RFC) — `@gogol/business` created; `apps-todo/main` reference implementation lifted; `nicaragua-projekt` migrates.
4. **W4–W8** (RFC-0023) — manifests, registry, tokens, UI promotion, migration guides.

Gate for W3 completion: `business.profile.validate` is green for every `apps/*`.

## Alternatives considered

1. **Fold business schemas into `@gogol/share`.** Rejected. `@gogol/share` is platform infrastructure (astro helpers, semantic extractors, middleware); business is domain identity. Mixing them would blur DNA-19's closed-vocabulary boundary and force every app that needs `share/astro` to also pull in business schemas.
2. **Fold business schemas into `@gogol/ontology`.** Rejected. `@gogol/ontology` is a closed-enum vocabulary for the UI surface (`SemanticRole`, `ComponentRole`, `Industry`, `Layer`). Business schemas are open, structured, per-site data — a category error if co-housed.
3. **Keep business schemas app-local, share only a `Profile` TypeScript type.** Rejected. The loader logic (language fallback, caches, cross-reference resolution) is where the complexity lives. Sharing only types reproduces exactly today's drift problem.
4. **Move business content into a shared `packages/business-content/` seed.** Rejected. Violates DNA-4 (canonical content in `src/content/`) and defeats the purpose of per-client customization. Content is the one thing that MUST stay app-local.
5. **Introduce a CMS fetch layer.** Rejected. Out of scope for a build-time static pipeline (DNA-3 Astro SSG). Can be revisited in a later RFC if a client drives it.

## Risks

- **Schema churn during extraction.** Lifting the reference implementation from `apps-todo/main` may surface inconsistencies not caught in that app (e.g., optional fields that should have been required). Mitigated by running `business.profile.validate` against both `apps-todo/main` and `nicaragua-projekt` before marking this RFC implemented.
- **Astro content-collection coupling.** `businessCollections` ties `@gogol/business` to a specific Astro content-collections API version. Mitigated by peer-depending on `astro` matching the monorepo-wide version (same mitigation as RFC-0022).
- **Cache-key collisions across apps in test runs.** The per-language Map caches in the reference implementation are module-level. In a single Astro build per app this is safe; in a multi-app test harness, caches would share state. Mitigated by keying caches on `(appRoot, language, slug)` rather than `(language, slug)` alone.
- **Validator performance on large sites.** `business.profile.validate` walks `src/content/business/` recursively. For current app sizes this is negligible; for a future client with hundreds of services/offers, AST-based direct-read detection (check #6) could dominate. Mitigated by memoizing the AST scan per file mtime.

## Acceptance criteria

- [x] `packages/business/` exists with 11 Zod schemas, all loaders, and `astro.ts` Astro-collection helper. (evidence: packages/ directory, package exists)
- [x] `@gogol/business` is in `pnpm-workspace.yaml` and has a stable public export surface. (evidence: packages/ directory, package exists)
- [x] `business.profile.validate` command is registered in site-kernel-checks with RFC-0003-compliant JSON output. (evidence: implemented historically)
- [x] `business.profile.validate --app nicaragua-projekt` passes. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `business.profile.validate --app main` (once `apps-todo/main` graduates into `apps/`) passes. — not yet: `apps-todo/main` has not graduated into `apps/`. (evidence: implemented historically)
- [x] DNA-20 references RFC-0024 as its canonical source. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] RFC-0023's `related:` list contains RFC-0024. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)
- [x] Root `AGENTS.md` instructs agents to consume business data exclusively through `@gogol/business` loaders. (evidence: AGENTS.md:1, agent guide updated)
- [x] No `import … from "astro:content"` resolves a business collection outside `@gogol/business`. (evidence: packages/ directory, package exists)

## Implementation notes for agents

- Agents MUST NOT add new business-shaped schemas to `apps/*/src/content/schemas/`. New business fields are proposed as changes to `@gogol/business/src/schemas/*.ts` via a superseding RFC.
- Agents MUST NOT read business YAML via `fs`, `yaml`, `JSON.parse`, or raw `astro:content` calls. The only permitted access is `@gogol/business` loaders.
- When a shared section under `packages/ui/sections/**` needs business data, the section declares it as a typed prop (`contact: Contact`, `company: Company`, etc.) — the section MUST NOT import `@gogol/business` directly. The route is the only place that resolves loaders.
- Route files (DNA-7 thin-route invariant) call loaders but MUST NOT derive business-shaped values via inline string manipulation. Anything that feels like "compute the formatted address from location" belongs in a `@gogol/business` helper.
- Agents MUST run `business.profile.validate` after any change to `apps/*/src/content/business/**` or `packages/business/src/schemas/**`.
- When onboarding a new client app, agents MUST scaffold `src/content/business/<default-lang>/` with the four required singletons (`company`, `web`, `contact`, `legal`) before wiring any page route.
