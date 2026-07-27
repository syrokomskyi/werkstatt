---
id: RFC-0023
title: "Introduce Uni UI Ontology and manifest-driven component registry"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-24
updatedAt: 2026-04-24
implementedAt: 2026-04-24
closedAt:
supersedes: []
supersededBy:
amendedBy:
  - RFC-0376
related:
  - DNA-1
  - DNA-4
  - DNA-5
  - DNA-8
  - DNA-9
  - DNA-10
  - DNA-16
  - RFC-0007
  - RFC-0009
  - RFC-0011
  - RFC-0012
  - RFC-0013
  - RFC-0014
  - RFC-0018
  - RFC-0019
  - RFC-0020
  - RFC-0022
  - RFC-0024
commands:
  proposed:
    - business.profile.validate # pending — not yet implemented
    - ontology.enums.validate   # pending — not yet implemented
  added:
    - business.profile.validate
    - manifest.contract.validate
    - mirror.quintet.validate
    - uni.registry.build
    - uni.registry.validate
  changed:
    - dispatcher.sync.validate
    - feature.graph.validate
    - mirror.quartet.validate   # Wave 7: also scans packages/ui/src/{sections,components}/
  removed: []
appsImpacted:
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - ontology
  - tokens
  - business
  - ui
  - share
  - site-kernel-checks
  - site-kernel-codegen
  - site-kernel-content
successSignals:
  - "Every section and component in `packages/ui/` and `apps/*/src/components/` ships a colocated `manifest.yaml` carrying its `semanticId`, `layer`, `role`, `intent[]`, `industryFit[]`, `contentSchemaKey`, and `version`."
  - "A single `uni.registry.json` at the workspace root is deterministically generated from all manifests and consumed by AI agents, validators, and the dispatcher as the only source of UI discovery."
  - "Closed enums (`SemanticRole`, `ComponentRole`, `Industry`, `Layer`) live in `@gogol/ontology` and extending them is a superseding RFC, not a local code change."
  - "Every client site is described through `@gogol/business` schemas: company, web, contact, location, legal, compliance, external-services, services, offers, trust, faq. Content of these schemas remains app-local."
  - "New client apps added to `apps/*` compose pages exclusively from `@gogol/ui` sections and components; only content, tokens overrides, and app-specific scripts are app-local."
  - "Design tokens are declared once in `@gogol/tokens` and consumed by every app; raw `--ds-*` declarations no longer live in `apps/*/src/styles/`."
nonGoals:
  - "Do not introduce Cloudflare Durable Objects or an edge-runtime registry — the registry is a build-time artifact."
  - "Do not introduce poetic codenames (Vega, Europa, Charon) for existing components. `cosmicName` equals the current kebab-case `semanticId` until an explicit naming RFC supersedes this rule. (`cosmicName` is retained as a manifest field for spec compatibility but is not populated with distinct values at MVP.)"
  - "Do not retain cosmic vocabulary (star/planet/moon) as layer values — this RFC renames them to `page/section/component` to match the technical file layout."
  - "Do not introduce a fourth hierarchy layer (Asteroid / Element). Standalone utility elements are flagged via `standalone: true` on a component manifest."
  - "Do not add long-term archival (PDF/A, 3-2-1 snapshots). Invariance is guaranteed by `manifest.yaml` plus SemVer."
  - "Do not move canonical content (including business content) out of `apps/*/src/content/`. Content stays app-local; only schemas, loaders, UI, tokens, and ontology are shared."
  - "Do not add Biomes (contextual token/preference presets) in this RFC. Biomes remain a deferred hypothesis until a second live client drives the requirement."
  - "Do not rewrite JSON manifests from the external research spec — webgogol adopts the *concepts* of the Cosmic UI Ontology v1 research doc and rebrands the implementation as the **Uni UI Ontology** (Universe / Unique). `cosmos.*` identifiers become `uni.*`; `manifest.json` becomes `manifest.yaml`."
---

# RFC-0023: Introduce Uni UI Ontology and manifest-driven component registry

## Context

The platform is about to absorb three additional client sites: two whose structure closely mirrors `apps/nicaragua-projekt` and one external greenfield project that will be rewritten from scratch. Today, every reusable UI element lives inside `apps/nicaragua-projekt/src/components/`, every content schema lives inside `apps/nicaragua-projekt/src/content/schemas/components/`, and every design token is declared inline in `apps/nicaragua-projekt/src/styles/global.css`. A rich business-description vocabulary exists in `apps-todo/main/src/content/schemas/business/` and its loader `apps-todo/main/src/utils/business-content.ts` but is trapped inside the legacy apps. There is no shared UI surface, no shared business vocabulary, and no machine-readable index of what UI exists.

The external research pass distilled as _Cosmic UI Ontology v1_ (see `Process/Research/2026-04-22 Переиспользование - Экосистема/4 Check & Finalyse - Perplexity Deep Research.md`) answered the cross-cutting question: what should the reusable layer look like so that AI agents, contracts, and multi-client deployment remain coherent across 10+ years. This RFC adopts the _concepts_ of that specification into the webgogol-4 vocabulary under the brand **Uni UI Ontology** (a name that captures both _Universe_ of reusable elements and _Unique_ identification of each one). It fixes every enum value against the current 13-section / 8-component reality of `nicaragua-projekt`, promotes the business layer from `apps-todo` into a first-class shared package, and defines the rollout that prepares `apps/*` for the incoming clients.

**Naming alignment with the source spec.** The source spec uses cosmic metaphors (stars, planets, moons, cosmos) throughout. This RFC retains the spec's _concepts_ and _invariants_ but substitutes a technical vocabulary that matches the webgogol file layout:

| Source spec concept | webgogol identifier |
| --- | --- |
| Cosmic UI Ontology | **Uni UI Ontology** |
| `cosmos.registry.json` | **`uni.registry.json`** |
| `cosmos.registry.build` / `cosmos.registry.validate` | **`uni.registry.build` / `uni.registry.validate`** |
| Layer `"star" \| "planet" \| "moon"` | **`"page" \| "section" \| "component"`** |
| Registry fields `stars / planets / moons` | **`pages / sections / components`** |
| Authoring format `manifest.json` | **`manifest.yaml`** (see §Design) |
| Codename `cosmicName` | Retained as manifest field name for compatibility; value equals `id` until a naming RFC supersedes. |

## Problem

Nine unprotected invariants are forcing manual discipline today:

1. **No component identity beyond file path.** `componentId = "section/hero-section"` is a string derived from the dispatcher. There is no version, no role enum, no intent vector, no industry fit, and no machine-readable schema reference on the component itself.
2. **No cross-app UI surface.** `@gogol/ui` holds icons only. Every section/component implementation is trapped inside `apps/nicaragua-projekt`; porting it to the incoming clients requires copy-paste plus manual diff.
3. **Ontology vocabularies are implicit.** There is no enum for section roles, industries, or intent verbs. The only related enum, `sectionRoleSchema` in `apps/nicaragua-projekt/src/content/schemas/features.ts`, conflates broad kind (`navigation`, `content`, `cta`) with specific role and is scoped to a single app.
4. **Content schemas are app-local.** All Zod content schemas live under `apps/nicaragua-projekt/src/content/schemas/components/`. They cannot be imported by another app without rewriting paths.
5. **Design tokens are app-local.** 59 `--ds-*` custom properties live in `apps/nicaragua-projekt/src/styles/global.css`. A second app would duplicate or drift from the set.
6. **Dispatcher is not a registry.** `components-dispatcher.ts` resolves `componentId → Zod schema`. It does not carry intent, role, industry, or scoring metadata; AI agents cannot use it to select components.
7. **Feature graph cannot disambiguate alternatives.** RFC-0018 nodes reference a specific component path. There is no mechanism to say "render a hero for a nonprofit donation funnel" and let the system pick the best available section.
8. **Mirror Quartet (RFC-0009, RFC-0020) ends at `.astro + .md + schema + .css`.** It guarantees files exist and match suffixes; it does not capture semantic metadata per component.
9. **Business-description layer is fragmented.** `apps-todo/main/src/content/schemas/business/` (11 schemas), `apps-todo/main/src/utils/business-content.ts` (≈ 500 lines of localized loaders + caches + merge logic), and `apps-todo/my-main/src/configure/business/index.ts` encode the canonical "what is this business" vocabulary — but only the apps-todo projects can use them. New clients cannot describe themselves without copying hundreds of lines.

## Decision

The workspace adopts the **Uni UI Ontology** (derived from _Cosmic UI Ontology v1_ research, rebranded for webgogol use) as the canonical model for page-section-component reuse, plus a shared business-description layer. Four new / expanded packages, one promoted invariant, six new OS commands, and a workspace-level `uni.registry.json` artifact are introduced:

- **`@gogol/ontology`** — closed enums (`Layer`, `SemanticRole`, `ComponentRole`, `Industry`, `SectionKind`), open vocabulary (`Intent`), the Zod schema for `manifest.yaml`, migrated content schemas, navigation schemas, and the compatibility graph (`Tension` / `Relation`).
- **`@gogol/tokens`** — single canonical `--ds-*` declaration and its TypeScript mirror.
- **`@gogol/business`** — migrated schemas + loaders + Astro wiring helpers for the business-description layer (`company`, `web`, `contact`, `location`, `legal`, `compliance`, `external-services`, repeatable `services / offers / trust / faq`).
- **`@gogol/ui`** — expanded from icons-only to host `pages/`, `sections/`, and `components/`; each element ships a `manifest.yaml`.
- **Mirror Quintet (DNA-17):** every section and component carries a colocated `manifest.yaml` alongside its existing quartet files.
- **`uni.registry.json` (DNA-18):** the single machine-readable index of the UI surface, generated by `uni.registry.build`, validated by `uni.registry.validate`, and consumed by agents, dispatcher, and checks.
- **Closed vocabularies (DNA-19):** `Layer`, `SemanticRole`, `ComponentRole`, `Industry` are closed enums; extensions require a superseding RFC.
- **Business profile invariant (DNA-20):** every client site describes itself through the `@gogol/business` vocabulary; data remains app-local, schemas are shared.

The transformation is intentionally large. It is sequenced into eight waves (see **Rollout**) so each wave is independently reviewable and rollback-safe.

## Architectural fit

| Existing invariant | How this RFC extends it |
| --- | --- |
| **DNA-1** (monorepo boundary) | Preserved. Sections move from `apps/nicaragua-projekt/src/components/` into `packages/ui/src/sections/`; no `apps → apps` imports. |
| **DNA-4** (canonical content in `src/content/`) | Preserved and reinforced. Section content, page content, and business content remain app-local per spec §11. Only schemas, loaders, UI rendering, tokens, and ontology leave the app. |
| **DNA-5** (component/content/schema mirror) | Extended. Mirror Quartet → Mirror Quintet: the fifth file is `manifest.yaml`. `mirror.quartet.validate` evolves into `mirror.quintet.validate`. |
| **DNA-8** (page → section → component hierarchy) | The `Layer` enum (`"page" \| "section" \| "component"`) codifies exactly this hierarchy at the vocabulary level. No new layer is introduced. |
| **DNA-9** (feature graph visibility) | Extended. A feature-graph node may declare `role: SemanticRole` instead of a hard component path; the registry resolves the best match. |
| **DNA-10** (no hardcoded tokens, `--ds-*` only) | Reinforced. Tokens relocate from `apps/*` to `@gogol/tokens`; `tokens.ds.lint` and `tokens.colors.lint` keep their enforcement surface. |
| **DNA-16** (semantic topology shared with navigation) | Preserved. `uni.registry.json` is an additional read-only projection in the sense of RFC-0012 / RFC-0022, not a parallel model. |
| **RFC-0007** (client-export ecosystem isolation) | Reinforced. Each client app depends on `@gogol/ui`, `@gogol/ontology`, `@gogol/tokens`, `@gogol/business` only; cross-client bleed becomes impossible. |
| **RFC-0009 / RFC-0020** (quartet + suffix contracts) | Superseded in practice by Mirror Quintet. Suffix rules continue unchanged: `-section.astro`, `-component.astro`, `*.md`, `*.ts`, plus the new `manifest.yaml`. |
| **RFC-0011** (script placement) | Preserved. Component-scoped client scripts relocate to `packages/ui/src/{layer}/{name}/{name}.client.ts`; app-specific scripts remain in `apps/*/src/scripts/`. |
| **RFC-0012 / RFC-0013** (semantic layer, universal footer) | Business layer feeds semantic projections: JSON-LD Organization / LocalBusiness / Service / FAQPage are derived from `@gogol/business` loaders + content. |
| **RFC-0018** (feature graph) | Extended, not replaced. Feature graph keeps visibility; registry adds component discovery. |
| **RFC-0022** (shared package for semantic/astro infra) | Complementary. `@gogol/share` keeps runtime helpers and semantic projections; `@gogol/ontology` carries UI vocabulary; `@gogol/business` carries business vocabulary. The three packages never duplicate a type. |

## Design

### Closed enums (authoritative for all waves)

These values are frozen against the current `apps/nicaragua-projekt` surface. Extensions require a superseding RFC.

```ts
// @gogol/ontology/enums/layer.ts — technical, matches folder layout
export const LayerValues = ["page", "section", "component"] as const;
export type Layer = (typeof LayerValues)[number];

// @gogol/ontology/enums/semantic-role.ts — one role per section
export const SemanticRoleValues = [
  "hero",
  "dna",
  "problem",
  "approach",
  "impact",
  "women",
  "transparency",
  "donation-use",
  "social-proof",
  "final-cta",
  "team",
  "markdown",
  "navigation",
] as const;
export type SemanticRole = (typeof SemanticRoleValues)[number];

// @gogol/ontology/enums/component-role.ts — one role per component (moon-equivalent)
export const ComponentRoleValues = [
  "header",
  "breadcrumbs",
  "footer",
  "brand-label",
  "copyright",
  "lang-switcher",
  "footer-promo",
  "person-profile",
] as const;
export type ComponentRole = (typeof ComponentRoleValues)[number];

// @gogol/ontology/enums/industry.ts — closed, English identifiers, German display labels
export const IndustryValues = [
  "trades-and-construction",   // "Handwerk & Bau"
  "local-services",            // "Lokale Dienstleistungen"
  "consulting-and-coaching",   // "Beratende Berufe (Consulting & Coaching)"
  "legal-services",            // "Recht & Kanzleien"
  "non-profit",                // "Non-Profit & Vereine"
  "creative-studios",          // "Kreative Branchen & Studios"
] as const;
export type Industry = (typeof IndustryValues)[number];

// SaaS / digitale Produkte are NOT an industry in the ontology.
// They are referenced in marketing copy as an adjacent offering.

// @gogol/ontology/enums/section-kind.ts — broad category (renamed from sectionRoleSchema)
export const SectionKindValues = [
  "navigation", "hero", "content", "supporting", "cta", "custom",
] as const;
export type SectionKind = (typeof SectionKindValues)[number];

// @gogol/ontology/enums/intent.ts — OPEN vocabulary; string[] with known-good list
export const KnownIntentValues = [
  "convert", "inform", "trust", "engage",
  "donate", "contact", "legal-comply", "explain",
] as const;
export type Intent = (typeof KnownIntentValues)[number] | (string & {});
```

Three notes on the enum shapes:

- **`sectionRoleSchema`** in `apps/nicaragua-projekt/src/content/schemas/features.ts` (today: `"navigation" | "hero" | "content" | "supporting" | "cta" | "custom"`) is a broad _kind_, not a specific _role_. It is renamed to `sectionKindSchema` and moves to `@gogol/ontology`. The specific role lives in `SemanticRole`. A feature-graph node may carry both (`kind` optional, `role` required once adopted).
- **`Intent` is open by design.** Closing it would freeze language used to describe user goals; intent evolves faster than roles.
- **`person-profile`** stays a component (not a section) even though it is only used inside `team-section` today. Its reusability across future apps (about pages, testimonial lists) justifies component status.

### `manifest.yaml` — authoring format

YAML is authoritative for manifests. TypeScript types (`UniManifest`, `PageManifest`, `SectionManifest`, `ComponentManifest`) are generated from the Zod schema in `@gogol/ontology/schemas/manifest.ts` via `site-kernel-codegen`. The registry (`uni.registry.json`) is derived from manifests and remains JSON for mechanical consumption by AI agents.

**Why YAML for manifests:** human-authored, benefits from comments and multi-line strings, consistent with Astro content-collections frontmatter (already YAML). **Why JSON for the registry:** machine-generated, optimized for agent consumption, detects drift byte-for-byte.

```yaml
# packages/ui/src/sections/hero-section/manifest.yaml
id: hero-section
cosmicName: hero-section        # equal to id until a poetic-naming RFC supersedes
layer: section                   # "page" | "section" | "component"
semanticId: section.hero         # "{layer}.{role}" or "{layer}.{role}.{variant}"
role: hero                       # SemanticRole | ComponentRole (enum-checked at validate)
version: 1.0.0                   # SemVer; see §SemVer

standalone: false                # true → service-only element (icons, dividers)
intent:
  - convert
  - trust
industryFit:
  - non-profit
useWhen:
  - first-section
  - high-intent-traffic
avoidWhen:
  - kind: industry.mismatch
    values: [saas, legal-services]
wireframePatterns:
  - hero-centered
  - hero-split
variants:
  - default
requiredComponents: []           # other components this section must compose
optionalComponents: []
contentSchemaKey: HeroSectionContent
tokens:
  - color.brand.primary
  - spacing.section.xl
scoringWeights:
  intentMatch: 30
  industryMatch: 20
  wireframeMatch: 25
  roleMatch: 15
  variantPenalty: -10
```

### Target package layout

```
packages/
├── ontology/                               ← NEW
│   ├── package.json
│   └── src/
│       ├── index.ts
│       ├── enums/
│       │   ├── layer.ts
│       │   ├── semantic-role.ts
│       │   ├── component-role.ts
│       │   ├── section-kind.ts             ← renamed from sectionRoleSchema
│       │   ├── industry.ts
│       │   └── intent.ts
│       ├── schemas/
│       │   ├── manifest.ts                 ← Zod validator for manifest.yaml
│       │   ├── tension.ts                  ← Relation / Tension types
│       │   ├── content/                    ← migrated content schemas (18)
│       │   │   ├── hero-section.ts
│       │   │   ├── dna-section.ts
│       │   │   ├── ... (all 18)
│       │   │   └── index.ts                ← ContentSchemaMap
│       │   └── navigation/                 ← migrated from configure/navigation.ts
│       │       └── index.ts
│       ├── compatibility.ts                ← initial Relation[] (may be empty)
│       ├── constellations.ts               ← pre-assembled page compositions
│       └── registry-types.ts               ← UniRegistry, SearchParams, ScoringExplanation
│
├── tokens/                                 ← NEW
│   ├── package.json
│   └── src/
│       ├── tokens.css                      ← migrated from nicaragua global.css
│       └── index.ts                        ← programmatic token list
│
├── business/                               ← NEW (from apps-todo)
│   ├── package.json
│   └── src/
│       ├── index.ts
│       ├── schemas/                        ← 11 Zod schemas from apps-todo
│       │   ├── company.ts
│       │   ├── web.ts
│       │   ├── contact.ts
│       │   ├── location.ts
│       │   ├── legal.ts
│       │   ├── compliance.ts
│       │   ├── external-services.ts
│       │   ├── service.ts
│       │   ├── offer.ts
│       │   ├── trust.ts
│       │   └── faq.ts
│       ├── dispatcher.ts                   ← parseBusinessEntryData, KnownBusinessSchemaId
│       ├── loaders/                        ← localized loaders with caching + merge
│       │   └── index.ts                    ← getBusinessCompany, …Web, …Services, etc.
│       └── astro/
│           └── content-config.ts           ← createBusinessCollection({ loader })
│
└── ui/                                     ← EXPANDED (icons unchanged)
    ├── package.json                        ← adds ./pages/*, ./sections/*, ./components/*
    └── src/
        ├── icons/                          ← unchanged
        ├── pages/                          ← new (empty at MVP; apps keep routes)
        ├── sections/                       ← 13 sections migrated from nicaragua
        │   └── hero-section/
        │       ├── hero-section.astro
        │       ├── manifest.yaml
        │       ├── hero-section.css
        │       └── hero-section.client.ts  ← optional per-component script
        └── components/                     ← 8 components migrated from nicaragua
            └── header-component/
                ├── header-component.astro
                ├── manifest.yaml
                └── header-component.css
```

Directory names use the technical vocabulary (`pages/`, `sections/`, `components/`). The `Layer` enum in `manifest.yaml` uses the same vocabulary.

### Axis disposition matrix

Every axis present in `apps/nicaragua-projekt` has a single documented destination:

| Axis | Where now | Where it goes |
| --- | --- | --- |
| **UI render** (`.astro`) | `apps/*/src/components/**` | `packages/ui/src/{pages,sections,components}/{name}/{name}.astro` |
| **Manifest** (new) | — | Colocated: `packages/ui/src/{layer}/{name}/manifest.yaml` |
| **Content schemas** (Zod for section props) | `apps/*/src/content/schemas/components/` | `packages/ontology/src/schemas/content/` |
| **Content** (`.md` per section/page) | `apps/*/src/content/` | **stays app-local** (per spec §11) |
| **Tokens** (`--ds-*`) | `apps/*/src/styles/global.css` | `packages/tokens/src/tokens.css` |
| **Per-component CSS** | `apps/*/src/styles/components/` | Colocated: `packages/ui/src/{layer}/{name}/{name}.css` |
| **Shared scripts** (lenis, external-links) | `packages/share/src/scripts/` | **already shared; unchanged** |
| **Per-component client scripts** | `apps/*/src/scripts/` (mixed) | Colocated: `packages/ui/src/{layer}/{name}/{name}.client.ts` (optional) |
| **App-specific scripts** (analytics, vendor integrations) | `apps/*/src/scripts/` | **stays app-local** |
| **Assets — icons** | `packages/ui/src/icons/` | **already shared; unchanged** |
| **Assets — images/media** | `apps/*/src/assets/` | **stays app-local** (per-client imagery) |
| **Semantic** (JSON-LD, llms.txt, OG) | `apps/*/src/semantic/` + `packages/share/src/semantic/` | Shared helpers in `@gogol/share` (unchanged); app composes its own projections |
| **Business schemas** (Zod: company / web / contact / …) | `apps-todo/main/src/content/schemas/business/` | **`packages/business/src/schemas/`** |
| **Business dispatcher** (schema ID → schema) | `apps-todo/main/src/content/schemas/business-dispatcher.ts` | **`packages/business/src/dispatcher.ts`** |
| **Business content** (md/json per lang) | `apps-todo/main/src/content/business/{lang}/` | **stays app-local** (each client's identity) |
| **Configure — feature-graph runtime** | `apps/*/src/configure/feature-graph.ts` | `packages/share/src/feature-graph/` (pure resolver) |
| **Configure — navigation** | `apps/*/src/configure/navigation.ts` | Schemas → `@gogol/ontology`; data → app-local `src/content/navigation/` (RFC-0013 pattern) |
| **Configure — common** (defaults, language codes) | `apps/*/src/configure/common.ts` | **stays app-local** (each client sets own defaults) |
| **Dispatcher — components** | `apps/*/src/content/schemas/components-dispatcher.ts` | Rewired as thin facade over `UIRegistry` from `uni.registry.json` |
| **Dispatcher — pages** | `apps/*/src/content/schemas/pages-dispatcher.ts` | **stays app-local** (each client defines own routes) |
| **Dispatcher — layouts** | `apps/*/src/content/schemas/layouts-dispatcher.ts` | **stays app-local** |

### `uni.registry.json` (workspace root)

```json
{
  "version": "1.0.0",
  "generatedAt": "2026-04-24T12:00:00Z",
  "aiPrompt": "Select UI elements from the Uni UI Ontology. Prefer role + industryFit match. Validate content against contentSchemaKey.",
  "pages":      [],
  "sections":   [ /* all SectionManifest */ ],
  "components": [ /* all ComponentManifest */ ],
  "constellations": {
    "nonprofit-donation-funnel": {
      "description": "Standard composition for a donation-driven nonprofit landing page",
      "sections": ["hero-section", "dna-section", "problem-section", "approach-section",
                   "impact-section", "transparency-section", "donation-use-section",
                   "social-proof-section", "final-cta-section"],
      "defaults": { "industry": "non-profit" }
    }
  },
  "compatibility": []
}
```

### Business layer spec

`@gogol/business` encodes the "who is this site" vocabulary. It is the canonical complement to `@gogol/ontology` (which encodes "how is this site composed").

**Schemas (11)** migrate unchanged from `apps-todo/main/src/content/schemas/business/`: `company`, `web`, `contact`, `location`, `legal`, `compliance`, `external-services`, plus four repeatable groups: `services`, `offers`, `trust`, `faq`.

**Loaders** migrate unchanged from `apps-todo/main/src/utils/business-content.ts`: `getBusinessCompany`, `getBusinessWeb`, `getBusinessContact`, `getBusinessLegal`, `getBusinessLocation`, `getBusinessCompliance`, `getBusinessExternalServices`, `getBusinessServices`, `getBusinessService`, `getBusinessServiceBySlug`, `getBusinessTrustItems`, `getBusinessTrustItemsByTag`, `getBusinessOffers`, `getBusinessOffersByService`, `getBusinessOfferBySlug`, `getBusinessFaqEntries`, `getBusinessFaqEntriesByTag`, `getBusinessInfo`, `getContactChannels`, `getContactChannelByKind`, `getSiteInfo`. Caching semantics (per-language + per-entry + per-collection Maps) and deep-merge fallback (default language → localized overlay) are preserved byte-for-byte.

**Astro wiring helper** (`src/astro/content-config.ts`) exposes `createBusinessCollection({ loader })` so each client app registers the `business` collection with one line in its `src/content.config.ts`.

**Per-client content** lives in each app at `apps/{client}/src/content/business/{lang}/…` exactly as today; only schemas and loaders are shared.

**`business.profile.validate` (proposed)** — OS command that verifies a client app's business content satisfies the full schema vocabulary (no missing required blocks, all repeatable groups have at least one entry, language mirroring holds). Specified here as a goal; implementation deferred to a follow-up RFC.

### CLI surface

```sh
pnpm exec site-kernel run manifest.contract.validate --app nicaragua-projekt
pnpm exec site-kernel run mirror.quintet.validate --app nicaragua-projekt
pnpm exec site-kernel run ontology.enums.validate
pnpm exec site-kernel run uni.registry.build
pnpm exec site-kernel run uni.registry.validate
pnpm exec site-kernel run business.profile.validate --app nicaragua-projekt
```

| Command | Scope | Responsibility |
| --- | --- | --- |
| `manifest.contract.validate` | app | Every `*.astro` in `src/components/` and `packages/ui/{pages,sections,components}/**` has a sibling `manifest.yaml`; `manifest.role` ∈ enum; `contentSchemaKey` resolves in `@gogol/ontology`; `semanticId` matches `{layer}.{role}`. |
| `mirror.quintet.validate` | app | Supersedes `mirror.quartet.validate`. Quartet rules plus manifest presence. |
| `ontology.enums.validate` | workspace | No manifest in the workspace uses a `layer`, `role`, or `industry` value absent from `@gogol/ontology`. |
| `uni.registry.build` | workspace | Aggregates every manifest into `uni.registry.json`. Deterministic; output is stable under identical inputs. |
| `uni.registry.validate` | workspace | Current `uni.registry.json` matches the rebuilt one byte-for-byte (CI guard against drift). |
| `business.profile.validate` | app | App satisfies the `@gogol/business` schema vocabulary for its configured languages. Deferred — specified here, implemented in follow-up RFC. |
| `dispatcher.sync.validate` | app | Changed: component dispatcher must resolve from registry, not parallel to it. |
| `feature.graph.validate` | app | Changed: a node may carry `role: SemanticRole`; the validator resolves it through registry. |

### TypeScript contracts

```ts
// @gogol/ontology/src/schemas/manifest.ts
import { z } from "zod";
import { LayerValues } from "../enums/layer";
import { SemanticRoleValues } from "../enums/semantic-role";
import { ComponentRoleValues } from "../enums/component-role";
import { IndustryValues } from "../enums/industry";

const commonFields = {
  id: z.string().regex(/^[a-z0-9-]+$/),
  cosmicName: z.string(),
  semanticId: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  intent: z.array(z.string()),
  industryFit: z.array(z.enum(IndustryValues)),
  wireframePatterns: z.array(z.string()).default([]),
  variants: z.array(z.string()).default(["default"]),
  tokens: z.array(z.string()).default([]),
  scoringWeights: z.record(z.string(), z.number()).default({}),
};

export const UniManifestSchema = z.discriminatedUnion("layer", [
  z.object({
    layer: z.literal("section"),
    role: z.enum(SemanticRoleValues),
    contentSchemaKey: z.string(),
    standalone: z.literal(false).default(false),
    requiredComponents: z.array(z.string()).default([]),
    optionalComponents: z.array(z.string()).default([]),
    ...commonFields,
  }),
  z.object({
    layer: z.literal("component"),
    role: z.enum(ComponentRoleValues),
    standalone: z.boolean().default(false),
    contentSchemaKey: z.string().optional(),
    ...commonFields,
  }),
  z.object({
    layer: z.literal("page"),
    role: z.string(),                            // page-role vocabulary in a follow-up
    allowedSections: z.array(z.string()).default([]),
    contentSchemaKey: z.string().optional(),
    ...commonFields,
  }),
]);

export type UniManifest = z.infer<typeof UniManifestSchema>;
```

```ts
// @gogol/ontology/src/registry-types.ts
export interface UniRegistry {
  version: string;
  generatedAt: string;
  aiPrompt: string;
  pages: PageManifest[];
  sections: SectionManifest[];
  components: ComponentManifest[];
  constellations: Record<string, Constellation>;
  compatibility: Relation[];
}

export interface RegistrySearchParams {
  intent?: string[];
  industry?: Industry;
  wireframePattern?: string;
  layer?: Layer;
  role?: SemanticRole | ComponentRole;
}

export interface ScoringExplanation {
  totalScore: number;
  breakdown: Record<string, number>;
  filtersApplied: string[];
}
```

`UIRegistry.search / resolve / compose / registrySnapshot / explain` is implemented in `@gogol/share/src/registry/` against these types. The deterministic scoring algorithm (source spec §7.3) is mandatory; LLM re-ranking is an optional later addition.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/**` | Closed vocabularies, manifest schema, content schemas, navigation schemas, types. **Created by this RFC.** |
| `packages/tokens/**` | Canonical `--ds-*` declarations. **Created by this RFC.** |
| `packages/business/**` | Business-description schemas + loaders + Astro wiring. **Created by this RFC** (migrated from `apps-todo`). |
| `packages/ui/src/sections/**/manifest.yaml` | Per-section manifest. **Created by this RFC.** |
| `packages/ui/src/components/**/manifest.yaml` | Per-component manifest. **Created by this RFC.** |
| `uni.registry.json` (workspace root) | Generated by `uni.registry.build`. Never hand-edited. |
| `apps/nicaragua-projekt/src/components/**` | Emptied into `packages/ui/src/sections/*` and `packages/ui/src/components/*` during Wave 7. |
| `apps/nicaragua-projekt/src/content/schemas/components/**` | Removed; schemas live in `@gogol/ontology/src/schemas/content/`. |
| `apps/nicaragua-projekt/src/styles/global.css` | `--ds-*` declarations removed; file imports `@gogol/tokens/tokens.css`. |
| `apps/nicaragua-projekt/src/content/**` | Unchanged. Content stays app-local. |
| `apps/nicaragua-projekt/src/content/features/**` | Unchanged. Feature graph keeps visibility authority. |
| `apps-todo/main/src/content/schemas/business/**` | Migrated into `@gogol/business/src/schemas/`. Source folder remains in `apps-todo` until `apps-todo` is decommissioned. |

### SemVer for manifests

Per spec §9, SemVer rules for `manifest.version`:

| Change                                                             | Bump  |
| ------------------------------------------------------------------ | ----- |
| Visual / CSS refactor, no API change                               | PATCH |
| New `variants[]` entry, new optional component dependency          | MINOR |
| Change to `contentSchemaKey`, slot removal, required field removal | MAJOR |
| Rename of `id`                                                     | MAJOR |

Client apps pin `"@gogol/ui": "workspace:*"` today; once the monorepo has multiple clients, downstream pins become explicit (`^1.2.0`) and MAJOR bumps require a migration note.

### Output format

All six new commands emit `--json` aligned with existing kernel conventions:

```json
{
  "command": "manifest.contract.validate",
  "status": "fail",
  "violations": [
    {
      "file": "packages/ui/src/sections/hero-section/manifest.yaml",
      "rule": "role.enum.unknown",
      "message": "role 'landing-cta' is not a member of SemanticRole"
    }
  ]
}
```

### Failure modes

- `manifest.contract.validate`, `mirror.quintet.validate`, `ontology.enums.validate`, `uni.registry.validate` exit non-zero on any violation and become part of `build.check`.
- `uni.registry.build` always succeeds if inputs validate; its output is re-runnable and deterministic.
- Missing `manifest.yaml` during Wave 4 rollout is a **warning, not failure**, until Wave 4 is complete; then it graduates to fail-hard.
- `business.profile.validate` is introduced in warn-only mode until a follow-up RFC defines strict pass criteria.

## Rollout

Eight waves. Each wave is independently mergeable and reversible.

### Wave 0 — This RFC merges as `draft`; `architecture-dna.md` gains DNA-17, DNA-18, DNA-19, DNA-20 marked _draft_. No behaviour changes.

### Wave 1 — Ontology package skeleton

Create `packages/ontology/` with enums (`Layer`, `SemanticRole`, `ComponentRole`, `Industry`, `SectionKind`, `Intent`), `manifest.ts` Zod schema, empty `content/index.ts`, empty `compatibility.ts`, `registry-types.ts`. Add `ontology.enums.validate` as a no-op that passes.

### Wave 2 — Migrate content schemas

Move 18 Zod schemas from `apps/nicaragua-projekt/src/content/schemas/components/` into `@gogol/ontology/src/schemas/content/`. Populate `ContentSchemaMap`. Rewrite `components-dispatcher.ts` to import from `@gogol/ontology`. Delete the app-local schema folder. `dispatcher.sync.validate` continues to pass.

### Wave 3 — Business layer package

Create `packages/business/`. Migrate 11 schemas from `apps-todo/main/src/content/schemas/business/`. Migrate loaders from `apps-todo/main/src/utils/business-content.ts` (preserve caching + deep-merge semantics). Migrate dispatcher from `apps-todo/main/src/content/schemas/business-dispatcher.ts`. Expose `createBusinessCollection()` Astro wiring helper. Document intended use in `packages/business/AGENTS.md`.

### Wave 4 — Author manifests

Write `manifest.yaml` next to every `.astro` currently under `apps/nicaragua-projekt/src/components/` (13 sections + 8 components). Add `manifest.contract.validate` and graduate `mirror.quartet.validate` → `mirror.quintet.validate`. DNA-17 becomes enforced.

### Wave 5 — Build the registry

Add `uni.registry.build` and `uni.registry.validate`. Produce `uni.registry.json` at the workspace root; check it in. Implement `UIRegistry` in `@gogol/share/src/registry/`. Wire `build.check` to `uni.registry.validate`. DNA-18 becomes enforced.

### Wave 6 — Extract tokens

Create `packages/tokens/`, move `--ds-*` declarations from `apps/nicaragua-projekt/src/styles/global.css`, expose `@gogol/tokens/tokens.css`. Update `tokens.ds.lint` to tolerate `@import "@gogol/tokens/tokens.css"`. `nicaragua-projekt` passes `tokens.ds.lint` unchanged.

### Wave 7 — Promote components into `@gogol/ui`

Move `.astro` files from `apps/nicaragua-projekt/src/components/` into `packages/ui/src/sections/*/` and `packages/ui/src/components/*/` (colocated with their manifests from Wave 4 and CSS from apps). Rewrite `apps/nicaragua-projekt` imports to `@gogol/ui/sections/hero-section`, etc. `dispatcher.sync.validate` now resolves through the registry. At this point `apps/nicaragua-projekt/src/components/` is empty (or holds only documented app-local overrides).

### Wave 8 — Migration guides and new clients onboard

Write `docs/migration/client-app-to-uni.md` (for the two similar client apps) and `docs/migration/greenfield-to-uni.md` (for the external rewrite). Each new client app added to `apps/*` composes pages exclusively from `@gogol/ui`, declares its `industry`, registers `@gogol/business` collection, and provides its content.

Post-rollout, any new section or component proposed anywhere in the ecosystem must be added to `@gogol/ui` + `@gogol/ontology` in a single PR. App-local sections are disallowed unless explicitly exempted by a new RFC.

## Alternatives considered

1. **Rename `@gogol/ui` → `@gogol/icons` + create fresh `@gogol/ui`.** Rejected: the current `@gogol/ui` description already reads "Shared UI components and icons"; the package was designed to hold both. Avoiding the rename reduces churn on downstream imports.
2. **Keep `manifest.json` instead of `manifest.yaml`.** Rejected: YAML is more pleasant to hand-author (comments, multi-line strings), aligns with the Astro content-collections frontmatter format already in use, and Zod validates the parsed object identically. The JSON argument of the source spec ("AI agents read JSON") applies to the **registry** (which remains JSON), not to individual hand-authored manifests.
3. **Keep cosmic vocabulary (`star`, `planet`, `moon`, `cosmos.registry.json`).** Rejected: the webgogol file layout is already technical (`pages/sections/components`); mixing metaphors between filesystem and vocabulary costs cognitive load without adding value. The `Uni UI Ontology` brand preserves spec traceability while aligning vocabulary with implementation.
4. **`Intent` as a closed enum.** Rejected: intent vocabulary evolves faster than roles. Leaving it open avoids ceremony for every new verb.
5. **Introduce Asteroid / Element as a fourth layer.** Rejected by the source spec (§0). Standalone service elements use `standalone: true` on a component.
6. **Stateful registry via Cloudflare Durable Objects.** Rejected by the source spec (§0, §8.1). Static build-time registry is sufficient.
7. **Poetic codenames (Vega, Europa, Charon) now.** Rejected: dual naming is valuable when many variants of the same role exist. Today each role has one implementation. Defer to a naming RFC when variant count justifies the cognitive overhead.
8. **Business layer as part of `@gogol/share`.** Rejected: business is a first-class domain (11 schemas, rich loader logic, its own Astro collection). Housing it separately makes its boundaries (site-description vocabulary) obvious and keeps `@gogol/share` focused on cross-cutting helpers.
9. **Business layer as part of `@gogol/ontology`.** Rejected: ontology is about UI selection; business is about site description. Conflating them in one package would muddle responsibilities and inflate its API surface.

## Risks

- **Wave 7 blast radius.** Moving every section/component out of `apps/nicaragua-projekt` touches ~40 files in one commit range. Mitigation: run `mirror.quintet.validate`, `dispatcher.sync.validate`, `uni.registry.validate`, and a full `pnpm build` in CI before the Wave 7 PR merges.
- **YAML parsing ambiguities.** YAML has well-known coercion edge cases (unquoted numbers, booleans, null). Mitigation: Zod schema is strict; validator rejects surprising types; `manifest.contract.validate` emits `--json` errors with exact field paths.
- **Enum drift.** A new client app may push to add a role that is _almost_ one of the 13. Mitigation: DNA-19 requires a superseding RFC; the friction is intentional.
- **Feature-graph semantics split.** `kind` vs `role` on a section node risks confusing editors. Mitigation: `feature.graph.validate` emits a warning when both are set to incompatible values; documentation in RFC-0018 notes.
- **Business loader coupling to Astro runtime.** `@gogol/business/loaders` imports `astro:content`. Mitigation: declared as a peer dependency; package only runs inside Astro apps; non-Astro consumers (if any emerge) import `schemas/` only.
- **Client-export isolation regression.** RFC-0007 assumes each client builds independently. Mitigation: all four new/expanded packages are pure workspace packages with no runtime cross-coupling; `export:ecosystem` (when introduced per RFC-0007) copies only the subset a client uses.

## Acceptance criteria

- [x] `packages/ontology/` exists with closed enums, `manifest.ts` Zod schema, migrated content schemas, `ContentSchemaMap`, and types. (evidence: packages/ directory, package exists)
- [x] `packages/tokens/` exists with canonical `--ds-*` declarations. (evidence: packages/ directory, package exists)
- [x] `packages/business/` exists with 11 schemas, loaders, dispatcher, and `createBusinessCollection()` helper; loader cache + merge semantics preserved. (evidence: packages/ directory, package exists)
- [x] `packages/ui/` exposes `./pages/*`, `./sections/*`, `./components/*` subpath exports; each element ships `manifest.yaml`. (evidence: packages/ directory, package exists)
- [x] `uni.registry.json` lives at the workspace root and is byte-stable under repeated `uni.registry.build`. (evidence: implemented historically)
- [x] `manifest.contract.validate`, `mirror.quintet.validate`, `ontology.enums.validate`, `uni.registry.build`, `uni.registry.validate` are registered commands with documented `--json` output. (evidence: implemented historically)
- [x] `apps/nicaragua-projekt` builds, passes `grace:validate`, and has no `--ds-*` declaration left in its `src/styles/`. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/nicaragua-projekt/src/components/` is empty (or holds only documented app-local overrides). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/nicaragua-projekt` registers `@gogol/business` collection and loads business content through shared loaders. (evidence: packages/ directory, package exists)
- [x] DNA-17, DNA-18, DNA-19, DNA-20 are present in `docs/architecture-dna.md` with links to this RFC. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `docs/migration/client-app-to-uni.md` and `docs/migration/greenfield-to-uni.md` exist. (evidence: docs/ directory, documentation exists)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Open questions (deferred to follow-up RFCs)

These are called out explicitly by the source spec (§13) and are **not** blocking this RFC:

1. **Visual regression testing strategy** — Playwright vs Storybook test-runner; integration with Cloudflare Pages previews.
2. **Multibrand token overrides** — how `@gogol/tokens` supports per-client brand via CSS Custom Properties without introducing Biomes yet.
3. **Designer workflow for manifests** — who authors `manifest.yaml`, developer or designer; Figma plugin.
4. **Migration guide for MAJOR manifest bumps** — codemods vs manual notes.
5. **Registry performance at 300+ manifests** — indexing strategy if lookup cost grows.
6. **Graceful degradation when `UIRegistry.search` returns no match** — fallback composition policy.
7. **`business.profile.validate` strict criteria** — when does a client fail validation; which fields are mandatory in which industry.
8. **Per-component client script conventions** — lifecycle, hydration, bundling relative to Astro's island model.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change `status` fields in any RFC.
- Agents MUST run `ontology.enums.validate` and `manifest.contract.validate` before proposing changes to any `manifest.yaml`.
- When adding a new section or component, agents MUST add it to `@gogol/ui` with a manifest and an ontology entry in a single PR; app-local additions are forbidden unless a new RFC explicitly permits them.
- Agents MUST NOT weaken enum closedness (`Layer`, `SemanticRole`, `ComponentRole`, `Industry`) without a superseding RFC.
- Agents MUST preserve the `@gogol/business` loader caching and deep-merge semantics byte-for-byte when migrating from `apps-todo`. Functional parity is checked by behavioural tests, not just schema parity.
- When this RFC implements, agents MUST reference `RFC-0023` in commit messages touching `packages/ontology`, `packages/tokens`, `packages/business`, `packages/ui/src/{pages,sections,components}`, or `uni.registry.json`.
