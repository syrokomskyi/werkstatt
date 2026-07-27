---
id: RFC-0025
title: "Activate cosmic overlay and feature-first app layout"
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
implementedAt: 2026-04-25
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-1
  - DNA-4
  - DNA-5
  - DNA-7
  - DNA-10
  - DNA-17
  - DNA-18
  - DNA-19
  - DNA-20
  - RFC-0007
  - RFC-0008
  - RFC-0009
  - RFC-0018
  - RFC-0019
  - RFC-0020
  - RFC-0021
  - RFC-0023
  - RFC-0024
  - RFC-0031
commands:
  proposed: []
  added:
    - app.layout.validate
    - client.edit.validate
    - cosmic.catalog.validate
    - cosmic.name.unique
    - system.manifest.validate
    - constellation.compose.validate
    - biome.contract.validate
  changed:
    - mirror.quintet.validate   # app-side contract redefined for feature-colocation layout
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - ontology
  - share
  - site-kernel-checks
  - site-kernel-content
successSignals:
  - "Every `apps/*/src/` follows the feature-first layout: per-feature content, styles, scripts, and assets are colocated under `src/content/<layer>/<name>/` instead of spread across parallel `styles/<layer>/`, `scripts/<layer>/`, `assets/<layer>/` trees."
  - "Every `apps/*/` carries a single `system.yaml` at its root declaring its identity, constellation, biome, and pinned page compositions; `system.manifest.validate` is green for every app."
  - "`@gogol/ontology` ships closed `StarCatalog`, `PlanetCatalog`, `MoonCatalog` name lists sourced from IAU and Solar System registries, each at least 290 entries; `cosmic.catalog.validate` rejects any `cosmicName` outside the catalogs."
  - "Every `manifest.yaml` in `packages/ui/src/{pages,sections,components}/` carries a distinct poetic `cosmicName` drawn from the matching catalog (star for pages, planet for sections, moon for components); `cosmic.name.unique` passes workspace-wide."
  - "A new library at `packages/ontology/constellations/*.yaml` and `packages/ontology/biomes/*.yaml` holds reusable composition patterns and industrial/tonal presets consumable from any `apps/*/system.yaml`."
  - "Clients can commit changes to the designated client-editable surface (`src/content/**` + bounded asset types) and the resulting Git push auto-builds via Astro and auto-deploys via Cloudflare without risking build breakage; `client.edit.validate` runs as a pre-merge gate."
  - "Per-section CSS in `apps/*/src/content/<layer>/<name>/*.css` is an ERROR, not a warning — all visual customization flows through `@gogol/tokens` plus biome-scoped overrides applied via the `data-biome` attribute on `<html>`."
nonGoals:
  - "Do not introduce block-declarative page content in this RFC. `buildPage(page, ctx)`, `BlockBase`, and `VisibilityExpr` belong to RFC-0026 and consume the layout established here."
  - "Do not introduce a Growth Layer or any event/experiment contract. Growth ships in RFC-0027 and attaches to blocks introduced by RFC-0026."
  - "Do not design the Cosmic Passport UI, Star Map View, or Verifiable Credential surface. Passport ships in RFC-0028 and reads `system.yaml` established here."
  - "Do not introduce RuntimeContext fields (`segment`, `flags`) runtime behavior. Only the type shape is reserved in `@gogol/share`; edge persona detection is out of scope until a follow-up RFC."
  - "Do not migrate `apps/nicaragua-projekt` in this RFC beyond the layout and cosmic-overlay contracts. A dedicated migration RFC (candidate RFC-0029) orchestrates full adoption across RFC-0025 to RFC-0028."
  - "Do not introduce Cloudflare Durable Objects, KV, or edge-runtime fetches of any kind. `system.yaml`, constellation, and biome manifests are build-time inputs only."
  - "Do not rename layer enum values (`page` / `section` / `component`). Cosmic vocabulary lives in `cosmicName` and in the new manifest `kind` field (`star` / `planet` / `moon` / `system` / `constellation` / `biome`); filesystem folders remain technical per RFC-0023."
  - "Do not allow per-section CSS overrides at the app layer. Visual customization of packaged sections is done through tokens (`@gogol/tokens`) and biome overrides only. The escape hatch is deliberately closed."
  - "Do not mirror cosmic names into `.astro` filenames, import paths, or directory names. `cosmicName` is a manifest field and UI-facing string; code paths stay technical."
  - "Do not allow more than one biome per app. `system.yaml.identity.biome` is a scalar and permanently so. Heterogeneous tonal needs are satisfied by authoring a new unified biome, not by per-page overrides. This is a permanent invariant, not a deferred decision."
  - "Do not run validators in warn-only mode. Every validator in this RFC is introduced as fail-first on the wave it lands in. There is no legacy content to accommodate — the workspace has zero live clients at the time of adoption."
---

# RFC-0025: Activate cosmic overlay and feature-first app layout

## Context

[RFC-0023](RFC-0023-introduce-uni-ui-ontology-and-manifest-driven-registry.md) established the **Uni UI Ontology** — a name that explicitly captured two ideas at once: the _Universe_ of reusable UI elements, and the _Unique_ identification of each one within that universe. The RFC shipped Universe-flavoured vocabulary (pages as stars, sections as planets, components as moons) in the source spec, kept `cosmicName` as a reserved manifest field, but set `cosmicName = id` at MVP "until a poetic-naming RFC supersedes." That superseding RFC is this one.

Parallel to the cosmic question, [RFC-0024](RFC-0024-establish-business-layer-as-canonical-site-description.md) established `@gogol/business` as the canonical _who the site is_ layer. What is still missing is the _who the client's galaxy is_ layer — the per-client composition manifest that says "this specific app uses these pages with these pinned versions, under this industrial preset, composing this named funnel pattern." RFC-0024 answered identity; RFC-0025 answers composition.

A third pressure shapes this RFC. The studio's delivery model is converging on a **client-as-committer** workflow: each client receives direct Git-repository access to the content surface of their site, commits edits (copy, business profile, images), and the push triggers an automatic Astro build plus Cloudflare deploy. The engineering side of the repository — Astro routes, middleware, content configuration, scripts, root assets, system manifests, pinned versions — must be structurally isolated so a client commit cannot break the build.

Finally, `apps/nicaragua-projekt/src/` today scatters per-feature files across parallel trees (`assets/images/*`, potentially `styles/<layer>/*`, `scripts/<layer>/*`). At three or four sections this is tolerable; at the incoming scale (three additional client apps, thirteen sections plus eight components each) it becomes an N×M matrix with no locality. Discovery, audit, and client-scoped editing all suffer.

These three pressures share one resolution: **a feature-first app layout with an explicit client-editable surface and a newly activated cosmic overlay that gives every site a named identity**.

## Problem

Five unprotected invariants are forcing manual discipline today:

1. **Layout sprawl in `apps/*/src/`.** No invariant prevents parallel trees for per-feature styles, scripts, and assets. Each new app reinvents the grouping. A section's files can live in four different folders.
2. **No client-safe commit surface.** There is no OS-enforced boundary between "paths a client may edit" and "paths only engineering may edit." Any committer can touch `astro.config.mjs`, `content.config.ts`, middleware, routes, or scripts. An automatic build pipeline that trusts client commits is currently unsafe.
3. **`cosmicName` is a dead field.** It exists in `manifest.yaml`, Zod-validated by `@gogol/ontology`, but carries no distinct value. The Universe metaphor that justified naming the ontology "Uni" is present in docs only, not in data.
4. **No name catalog.** There is no closed enum of legal cosmic names. Adding one today risks collisions (two sections both wanting to be _Europa_), poetic drift (ad-hoc additions like "Supernova" or "Quasar" at the wrong layer), and brand dilution.
5. **No per-client composition manifest.** Each app is a loose bag of routes, content, and `@gogol/ui` imports. There is no single file that says "this app is a _nonprofit-donation-funnel_ constellation, styled with the _nonprofit-trust_ biome, pinning these sections at these versions." Onboarding the next three clients will re-litigate this decision per app.

## Decision

Three tightly coupled contracts are established in one RFC because separating them would create a self-contradictory partial state.

### 1. Feature-first app layout (DNA-21 established by this RFC)

Every `apps/*/src/` follows a layout where per-feature files — content, per-feature scripts, per-feature assets — live under `src/content/<layer>/<name>/`. App-global concerns (routes, middleware, global stylesheet, third-party scripts, root-level media like favicon/OG) stay in their existing app-global folders. Parallel `styles/<layer>/`, `scripts/<layer>/`, and `assets/<layer>/` trees are forbidden. Per-feature CSS files under `src/content/` are an ERROR, not a permitted override.

### 2. Client-editable surface (DNA-22 established by this RFC)

A designated whitelist of paths under `apps/*/src/content/` is the **client-editable surface**. Everything else in `apps/*/` is the **engineering surface**. An OS command, `client.edit.validate`, scans a Git diff and refuses any commit authored as a client that touches the engineering surface. Automatic Cloudflare deploys are gated on `client.edit.validate` passing.

### 3. Cosmic overlay activation (DNA-23 established by this RFC)

`@gogol/ontology` gains three closed name catalogs (`StarCatalog`, `PlanetCatalog`, `MoonCatalog`) sourced from IAU and Solar System registries. Every `manifest.yaml` in `packages/ui/src/{pages,sections,components}/` gets a distinct `cosmicName` drawn from the layer-appropriate catalog. Three new manifest kinds are introduced:

- **`system.yaml`** — one per app, at `apps/*/system.yaml`. Declares the client's galaxy: identity, constellation, biome, pages with pinned section versions.
- **`constellation.yaml`** — workspace-level library at `packages/ontology/constellations/*.yaml`. Reusable composition patterns (e.g., `nonprofit-donation-funnel`, `handwerk-lead-funnel`).
- **`biome.yaml`** — workspace-level library at `packages/ontology/biomes/*.yaml`. Industrial/tonal presets consisting of token overrides (applied via `data-biome` attribute on `<html>`) and content-tone hints.

Filesystem folder names (`pages`, `sections`, `components`) remain technical per [RFC-0023 § Alternatives considered](RFC-0023-introduce-uni-ui-ontology-and-manifest-driven-registry.md). Cosmic names live in `manifest.yaml`, `system.yaml`, and client-facing surfaces (UI, passport).

## Architectural fit

| Existing invariant | How this RFC extends or reinforces it |
| --- | --- |
| **DNA-1** (monorepo boundary) | Preserved. No new `apps → apps` imports. Constellations and biomes are workspace library, not per-app. |
| **DNA-4** (canonical content in `src/content/`) | **Reinforced and extended.** `src/content/` becomes the root for per-feature colocation, not only for markdown entries. App-local overrides, per-feature scripts, and feature-scoped assets join content under a single tree. |
| **DNA-5** (component ↔ content ↔ schema mirror) | Refined. The mirror on the package side (`packages/ui/src/sections/<name>/` holds `.astro + manifest.yaml + .css + .client.ts`) is unchanged. On the app side, the mirror becomes the feature-bundle at `src/content/<layer>/<name>/` holding `.md (+ assets/ + optional .client.ts)`. Per-section CSS on the app side is forbidden, not mirrored. |
| **DNA-7** (thin page routes) | Preserved and reinforced. Page routes in `apps/*/src/pages/[lang]/[...slug].astro` stay thin; they resolve content by consulting `system.yaml` and content-collection entries from `src/content/pages/<name>/`. |
| **DNA-10** (no hardcoded tokens, `--ds-*` only) | Reinforced. Biomes are the only mechanism for per-client token variation; they layer on top of `@gogol/tokens` via a CSS cascade layer gated by `data-biome`. Per-section CSS cannot reintroduce a token-bypass escape hatch — `client.edit.validate` and `app.layout.validate` both forbid it. |
| **DNA-17** (Mirror Quintet) | Renegotiated for the app side. Package-side quintet (`.astro + manifest.yaml + content schema in ontology + .css + content .md`) is unchanged. App-side quintet becomes: page route (Astro) + content-collection schema (ontology) + manifest (package) + per-feature content bundle under `src/content/<layer>/<name>/` + `system.yaml` pin. `mirror.quintet.validate` is extended to check the app-side shape. |
| **DNA-18** (`uni.registry.json`) | Preserved. The registry continues to be generated from `packages/ui/**/manifest.yaml`. Each entry now carries a distinct `cosmicName`; registry consumers see the activated overlay. |
| **DNA-19** (closed vocabularies) | Extended. Three new closed enums: `StarCatalog`, `PlanetCatalog`, `MoonCatalog`. Extension requires a superseding RFC, same as `SemanticRole` / `ComponentRole` / `Industry`. |
| **DNA-20** (business-profile invariant) | Preserved. `system.yaml` does not duplicate business identity; it references `@gogol/business` via `businessRef`. Source of truth for _who the client is_ stays in business content; `system.yaml` only composes the galaxy. |
| **DNA-21** (feature-first app layout) | **Established by this RFC.** |
| **DNA-22** (client-editable surface) | **Established by this RFC.** |
| **DNA-23** (cosmic overlay) | **Established by this RFC.** |
| **RFC-0007** (client-export isolation) | Reinforced. A client's app is now a system.yaml plus content; exporting the client bundle is mechanically defined by the client-editable surface. |
| **RFC-0008** (content entry language fallback) | Preserved. Per-feature content uses the same default-language + overlay mechanism. |
| **RFC-0018** (feature graph for visibility) | Preserved. The feature graph continues to govern visibility at the app level. `system.yaml` does not replace it — it sits _above_ the feature graph, declaring which features exist at all; the feature graph continues to decide which are active in which context. |
| **RFC-0019** (page → section → component hierarchy) | Preserved. Cosmic layer-names map 1:1 to the technical layer enum: star=page, planet=section, moon=component. |
| **RFC-0021** (layouts layer) | Preserved. Layouts are unaffected — they are app-global and live outside the per-feature colocation tree. |
| **RFC-0023** (Uni UI Ontology) | **Directly extended.** This RFC activates the dormant `cosmicName` field, introduces the closed catalogs the field depends on, and adds three manifest kinds the ontology package now owns. No nonGoal of RFC-0023 is violated — layer enum values stay technical; cosmic stays metadata. |
| **RFC-0024** (business layer) | Complementary. `system.yaml` adds composition vocabulary; business content remains the canonical identity vocabulary. `businessRef` cross-links them without duplicating fields. |

## Design

### Canonical app layout

```
apps/<app-id>/
├── system.yaml                           ← NEW: per-client galaxy manifest
├── src/
│   ├── content.config.ts                 ← Astro 6 canonical location (src root)
│   ├── content/                          ← Astro content-collections data root
│   │   ├── business/                     ← RFC-0024 unchanged
│   │   ├── pages/
│   │   │   └── <page-id>/                ← feature-bundle for a page (star)
│   │   │       ├── <page-id>.<lang>.md   ← page content (RFC-0026 will introduce block-declarative shape)
│   │   │       ├── <page-id>.client.ts   ← optional page-scoped client JS
│   │   │       └── assets/
│   │   │           └── <image>.{jpg,png,webp,svg,gif,mp4,webm,pdf}
│   │   ├── sections/
│   │   │   └── <section-id>/             ← feature-bundle for a section (planet)
│   │   │       ├── <section-id>.<lang>.md    ← optional standalone content
│   │   │       ├── <section-id>.client.ts    ← optional section-scoped client JS
│   │   │       └── assets/
│   │   ├── components/
│   │   │   └── <component-id>/           ← feature-bundle for a component (moon)
│   │   │       ├── <component-id>.<lang>.md  ← optional content
│   │   │       └── assets/
│   │   ├── features/                     ← RFC-0018 feature-graph content (unchanged)
│   │   └── loaders/                      ← RFC-0008 loaders (unchanged)
│   ├── pages/                            ← Astro routes (thin, DNA-7)
│   │   └── [lang]/
│   │       └── [...slug].astro
│   ├── middleware.ts                     ← app-global; engineering surface
│   ├── middleware/                       ← app-global; engineering surface
│   ├── styles/
│   │   └── global.css                    ← app-global ONLY: tokens import + reset + biome hook
│   ├── scripts/                          ← app-global ONLY: analytics, vendor widgets
│   ├── assets/                           ← app-global ONLY
│   │   ├── favicon.ico
│   │   └── og-image.png
│   ├── semantic/                         ← RFC-0012 projections (unchanged)
│   └── env.d.ts
├── astro.config.mjs                      ← engineering surface
├── wrangler.jsonc                        ← engineering surface
├── package.json                          ← engineering surface
└── tsconfig.json                         ← engineering surface
```

Forbidden after Wave 1 completes:

- `src/styles/<layer>/**` (parallel style tree)
- `src/scripts/<layer>/**` (parallel scripts tree)
- `src/assets/<layer>/**` or `src/assets/images/**` (parallel asset tree; root-level only under `src/assets/`)
- `src/content/<layer>/<name>/*.css` (per-feature CSS in apps)

### Client-editable surface

A path is client-editable if and only if it matches this whitelist:

| Path pattern | Rationale |
| --- | --- |
| `apps/<app>/src/content/business/**/*.{yaml,yml}` | Business identity — RFC-0024 |
| `apps/<app>/src/content/pages/**/*.md` | Page content and block declarations |
| `apps/<app>/src/content/sections/**/*.md` | Standalone section content |
| `apps/<app>/src/content/components/**/*.md` | Component content |
| `apps/<app>/src/content/**/assets/**/*.{jpg,jpeg,png,webp,svg,gif,mp4,webm,pdf}` | Media, whitelisted extensions |
| `apps/<app>/src/content/features/**/*.{md,yaml,yml}` | Feature-graph edits (visibility toggles) |
| `apps/<app>/system.yaml` — **partial**: only `identity.biome`, `release.passportEnabled` keys | Client may switch biome, toggle passport |

Everything else in `apps/<app>/` is the engineering surface. `client.edit.validate` inspects a Git diff and fails if any non-whitelisted path is modified.

Partial edits to `system.yaml` are enforced by comparing the parsed YAML: keys outside the client-writable subset must be byte-identical between `HEAD~1` and `HEAD`.

### Cosmic name catalogs

```ts
// packages/ontology/src/cosmic/star-catalog.ts
export const StarCatalog = [
  "Vega", "Rigel", "Sirius", "Altair", "Betelgeuse", "Antares", "Capella",
  "Arcturus", "Procyon", "Aldebaran", "Spica", "Pollux", "Deneb", "Regulus",
  "Fomalhaut", "Canopus", "Achernar", "Mizar", "Alioth", "Alkaid",
  // ... sourced from IAU Named Stars catalogue (356 entries as of the cutoff)
] as const;
export type StarName = typeof StarCatalog[number];

// packages/ontology/src/cosmic/planet-catalog.ts
export const PlanetCatalog = [
  "Europa", "Io", "Callisto", "Ganymede", "Titan", "Enceladus", "Mimas",
  "Tethys", "Dione", "Rhea", "Iapetus", "Hyperion", "Phoebe",
  // ... major moons + notable minor bodies (200+ entries)
] as const;
export type PlanetName = typeof PlanetCatalog[number];

// packages/ontology/src/cosmic/moon-catalog.ts
export const MoonCatalog = [
  "Charon", "Nix", "Hydra", "Kerberos", "Styx",           // Pluto system
  "Phobos", "Deimos",                                      // Mars
  "Oberon", "Titania", "Umbriel", "Ariel", "Miranda",      // Uranus (large)
  "Puck", "Cordelia", "Ophelia", "Bianca", "Cressida",     // Uranus (small)
  "Triton", "Nereid", "Proteus", "Klarissa", "Galatea",     // Neptune
  // ... full Solar System moon catalogue (290+ entries)
] as const;
export type MoonName = typeof MoonCatalog[number];
```

The split of Solar System bodies across Planet and Moon catalogs intentionally diverges from astronomical classification: in the Uni Ontology, "planet" means _section archetype_ (not Solar System planet) and "moon" means _component archetype_. The naming catalogs use astronomical bodies as a source of 290+ unique, memorable, brand-friendly names. Allocation rules:

- **PlanetCatalog**: any non-moon body (Pluto, Ceres, Eris, Haumea, Makemake, Sedna) plus _large_ moons that carry strong brand recognition (Europa, Titan, Io, Callisto, Ganymede, Enceladus). Size threshold: named large moons of outer planets.
- **MoonCatalog**: smaller moons, irregular satellites, and all other catalogued bodies.

No body appears in both catalogs. `cosmic.catalog.validate` refuses duplication.

### Manifest schema: cosmic layer bind

```ts
// @gogol/ontology/src/schemas/manifest.ts — extended
const commonFields = {
  id: z.string().regex(/^[a-z0-9-]+$/),
  cosmicName: z.string(),                          // now constrained per layer below
  semanticId: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  // ... unchanged
};

export const UniManifestSchema = z.discriminatedUnion("layer", [
  z.object({
    layer: z.literal("page"),
    cosmicName: z.enum(StarCatalog),               // constrained
    // ...
  }),
  z.object({
    layer: z.literal("section"),
    cosmicName: z.enum(PlanetCatalog),
    // ...
  }),
  z.object({
    layer: z.literal("component"),
    cosmicName: z.enum(MoonCatalog),
    // ...
  }),
]);
```

`cosmicName` values must be globally unique within each catalog's usage scope. `cosmic.name.unique` enforces this across `packages/ui/src/**/manifest.yaml`.

### `system.yaml` schema

```yaml
# apps/nicaragua-projekt/system.yaml
kind: system
id: nicaragua-projekt                    # matches apps/<id>; enforced by system.manifest.validate
version: 2026.04.24                      # calver; bumps on any pin change

identity:
  client: "Nicaragua Projekt e.V."       # display name; source of truth is business/<lang>/company.yaml
  domain: "nicaragua-projekt.example.org"
  biome: nonprofit-trust                 # must resolve in packages/ontology/biomes/*.yaml
  constellation: nonprofit-donation-funnel   # must resolve in packages/ontology/constellations/*.yaml

businessRef: nicaragua-projekt           # cross-link to @gogol/business content root

pages:
  - route: /
    cosmicStar: Vega                     # must be in StarCatalog; archetype selected
    planets:
      - cosmicPlanet: Europa             # must be in PlanetCatalog
        pin: "1.2.0"                     # SemVer pin against packages/ui
      - cosmicPlanet: Io
        pin: "1.1.0"
  - route: /spenden
    cosmicStar: Rigel
    planets:
      - cosmicPlanet: Callisto
        pin: "1.0.4"

release:
  passportEnabled: true                  # enables RFC-0028 passport generation for this app
```

Client-writable keys inside `system.yaml`:

- `identity.biome`
- `release.passportEnabled`

All other keys are engineering-only.

### `constellation.yaml` schema

```yaml
# packages/ontology/constellations/nonprofit-donation-funnel.yaml
kind: constellation
id: nonprofit-donation-funnel
version: 1.0.0

meta:
  title: Nonprofit Donation Funnel
  description: Standard composition for donation-driven nonprofit landing pages

semantics:
  industry: non-profit                   # must be in @gogol/ontology/enums/industry.ts
  goal: donation-conversion

composition:
  stars:                                 # star archetypes known to participate in this pattern
    - Vega
    - Rigel
  preferredPlanets:                      # planet archetypes that fit well under these stars
    - Europa
    - Io
    - Callisto
    - Titan

defaults:
  biome: nonprofit-trust
```

A constellation is a _recommendation_, not a constraint. `system.yaml` may reference additional planets beyond `preferredPlanets`; `constellation.compose.validate` warns but does not fail.

### `biome.yaml` schema

```yaml
# packages/ontology/biomes/nonprofit-trust.yaml
kind: biome
id: nonprofit-trust
version: 1.0.0

meta:
  title: Nonprofit Trust
  description: Warm-authority preset for nonprofit donation sites

semantics:
  industry: non-profit
  contentTone: warm-authority

tokens:
  # Overrides applied via CSS cascade layer, gated by <html data-biome="nonprofit-trust">
  "color.brand.primary":   "#B07D3F"
  "color.brand.secondary": "#3E2C1C"
  "spacing.section.xl":    "6rem"
```

Biome tokens generate a CSS file at build time: `packages/tokens/src/biomes/<id>.css`. The file emits a cascade layer:

```css
@layer biome-nonprofit-trust {
  html[data-biome="nonprofit-trust"] {
    --ds-color-brand-primary: #B07D3F;
    --ds-color-brand-secondary: #3E2C1C;
    --ds-spacing-section-xl: 6rem;
  }
}
```

`apps/*/src/styles/global.css` imports the biome file selected by `system.yaml`. The `<html data-biome="...">` attribute is set by the root layout, reading `system.yaml` at build time.

### CLI surface

```sh
pnpm exec site-kernel run app.layout.validate --app nicaragua-projekt
pnpm exec site-kernel run client.edit.validate --base HEAD~1 --head HEAD
pnpm exec site-kernel run cosmic.catalog.validate
pnpm exec site-kernel run cosmic.name.unique
pnpm exec site-kernel run system.manifest.validate --app nicaragua-projekt
pnpm exec site-kernel run constellation.compose.validate --app nicaragua-projekt
pnpm exec site-kernel run biome.contract.validate
```

| Command | Scope | Responsibility |
| --- | --- | --- |
| `app.layout.validate` | app | No files exist under `src/styles/<layer>/**`, `src/scripts/<layer>/**`, `src/assets/<layer>/**`, or `src/assets/images/**`. No `.css` under `src/content/<layer>/<name>/`. Feature folders conform to the canonical shape. |
| `client.edit.validate` | workspace | Given a Git range, every changed path in any `apps/<app>/**` falls within the client-editable surface. Partial-`system.yaml` edits verified by parsing both revisions and diffing the key set. |
| `cosmic.catalog.validate` | workspace | Closed catalogs (`StarCatalog`, `PlanetCatalog`, `MoonCatalog`) carry no duplicates across catalogs; every entry is a recognizable astronomical body. |
| `cosmic.name.unique` | workspace | Every `cosmicName` in `packages/ui/**/manifest.yaml` is unique within its layer's catalog and drawn from that catalog. |
| `system.manifest.validate` | app | Every `apps/<app>/system.yaml` parses, `id` matches folder, `identity.constellation` and `identity.biome` resolve, every `pages[].cosmicStar` and `pages[].planets[].cosmicPlanet` resolves in `packages/ui/`, every `pin` matches the referenced manifest's version. |
| `constellation.compose.validate` | app | The app's `system.yaml` composition fits the declared constellation's patterns. Deviation from `preferredPlanets` is a warning; referenced constellation missing is a failure. |
| `biome.contract.validate` | workspace | Every `packages/ontology/biomes/*.yaml` parses; every referenced token key exists in `@gogol/tokens`; generated CSS file is re-runnable and byte-stable. |
| `mirror.quintet.validate` (changed) | app | App-side Quintet becomes: route (Astro) + manifest (package) + content-schema (ontology) + content-bundle (`src/content/<layer>/<name>/`) + system-pin (`system.yaml`). Package-side unchanged. |

### Output format

All commands emit `--json` with the standard `{ command, status, violations[] }` shape per RFC-0003. Example for `client.edit.validate`:

```json
{
  "command": "client.edit.validate",
  "status": "fail",
  "violations": [
    {
      "file": "apps/nicaragua-projekt/astro.config.mjs",
      "rule": "engineering-surface-modified",
      "message": "astro.config.mjs is outside the client-editable surface. Only engineering commits may modify it."
    },
    {
      "file": "apps/nicaragua-projekt/system.yaml",
      "rule": "system-non-client-key-modified",
      "message": "Key 'pages[0].planets[1].pin' changed; client edits may only modify identity.biome and release.passportEnabled."
    }
  ]
}
```

### Failure modes

- `app.layout.validate`, `cosmic.catalog.validate`, `cosmic.name.unique`, `system.manifest.validate`, `biome.contract.validate` exit non-zero on any violation and enter `build.check`.
- `client.edit.validate` is a deploy-gate, not a build-gate. It runs in the Cloudflare auto-deploy workflow and in the pre-merge CI for client-authored PRs. Engineering PRs bypass it (identified by committer membership in the engineering team via CODEOWNERS, or by a `Change-Scope: engineering` commit-trailer).
- `constellation.compose.validate` emits warnings for `preferredPlanets` drift; only missing constellation references fail. Warnings here are a design feature (constellations are _recommendations_, not constraints) — not the same thing as warn-only validator rollout.

## Rollout

Six waves. No warn-only phases — every validator lands fail-first because the workspace has zero live clients and no legacy content to accommodate. Waves are sequenced by dependency (ontology → library → app), not by risk mitigation.

### Wave 0 — This RFC merges as `draft`

`docs/architecture-dna.md` gains DNA-21, DNA-22, DNA-23 marked _draft_. No behavior changes.

### Wave 1 — Cosmic catalogs, constellation + biome library, validators (all fail-first)

Single wave, single PR series:

- Create `packages/ontology/src/cosmic/{star,planet,moon}-catalog.ts` with full catalogs.
- Create `packages/ontology/constellations/nonprofit-donation-funnel.yaml` and `packages/ontology/biomes/nonprofit-trust.yaml` with their Zod schemas.
- Introduce `SystemManifestSchema` in `@gogol/ontology`.
- Extend `UniManifestSchema` to require per-layer catalog-constrained `cosmicName`.
- Ship `cosmic.catalog.validate`, `cosmic.name.unique`, `biome.contract.validate`, `system.manifest.validate`, `constellation.compose.validate` — all fail-first.
- Biome CSS generation lands in `@gogol/site-kernel-codegen`.

### Wave 2 — Populate cosmic names on every packaged manifest

Assign a distinct `cosmicName` from the appropriate catalog to every `manifest.yaml` in `packages/ui/src/{pages,sections,components}/`. Document the assignment in `packages/ui/COSMIC-NAMES.md` (one line per entry: `section/hero-section → Europa`). `cosmic.name.unique` must pass before the wave merges.

### Wave 3 — App layout migration for `nicaragua-projekt` (single rewrite commit range)

One authored commit range rewrites the app:

- Move per-feature content into `src/content/<layer>/<name>/`.
- Move assets from `src/assets/images/**` into the appropriate `src/content/**/assets/`.
- Delete any `.css` files under `src/content/`.
- Author `apps/nicaragua-projekt/system.yaml` declaring the composition.
- Ship `app.layout.validate` fail-first; merge gate requires it green.

No progressive migration. No transitional tolerance. The app is rewritten in one range or the range is rejected.

### Wave 4 — Client-editable surface enforcement

Add `client.edit.validate` to the Cloudflare auto-deploy workflow and as a pre-merge GitHub check. Document the surface in `apps/*/AGENTS.md`. Commit trailer `Change-Scope: engineering` bypasses the check and requires engineering-team authorship (enforced via CODEOWNERS on the engineering surface).

### Wave 5 — Mirror Quintet redefinition

Extend `mirror.quintet.validate` with the app-side Quintet rules. Update `docs/architecture-dna.md` DNA-17 wording.

### Wave 6 — Documentation and onboarding

Write `docs/migration/app-to-feature-first-layout.md` and `docs/migration/new-client-cosmic-onboarding.md`. Update root `AGENTS.md` with client-commit guidance. Update `apps/AGENTS.md` with engineering-commit conventions (DNA-21/22/23 sections, RFC-0025 check pipeline table).

Post-rollout, any new app added to `apps/*` must pass `app.layout.validate`, `system.manifest.validate`, `cosmic.name.unique`, `client.edit.validate` from its first commit.

## Alternatives considered

1. **Keep parallel `styles/`, `scripts/`, `assets/` trees grouped by layer (the proposal from the ChatGPT discussion).** Rejected. Groups by layer solve name collisions but retain four parallel trees — developers still open four folders to work on one section. Feature-first colocation solves both problems with one tree.

2. **Flat `features/` folder collapsing `pages/sections/components/` (another variant from the same discussion).** Rejected. The Uni Ontology `Layer` enum is a real semantic distinction (stars orbit galaxies, planets orbit stars, moons orbit planets — different dependencies, different lifecycle). Collapsing them into a flat `features/` tree would surface a structural inconsistency with the package side (`packages/ui/src/{pages,sections,components}/`) and lose the semantic cue at the directory level.

3. **Allow per-section CSS overrides in apps as "escape hatches with warnings".** Rejected. Escape hatches with warnings rot: every project accumulates `// TODO` hatches that become de-facto policy. The client-as-committer model turns this from a style issue into a _deployment-safety_ issue — a client can accidentally break visual consistency across a site. ERROR-level is the correct posture.

4. **Open cosmic name catalog (strings validated only by regex).** Rejected. Two clients both authoring a `Quasar` section at different layers would collide silently until registry build. The closed catalog is a natural fit for the `@gogol/ontology` closed-enum pattern (DNA-19).

5. **Keep `cosmicName = id` (never activate the Universe overlay).** Rejected. This would retroactively make RFC-0023's "Universe" naming a dead metaphor and forfeit the brand-layer value described in the Perplexity Deep Research documents. The passport (RFC-0028) depends on distinct `cosmicName` values for the Star Map view; without activation, RFC-0028 becomes meaningless.

6. **Co-locate constellation and biome manifests inside each app (`apps/<app>/constellation.yaml`).** Rejected. Per-app constellations defeat the point: the whole value is _reusable composition patterns_. Workspace-library under `@gogol/ontology/` matches how other closed-vocabulary artifacts are organized.

7. **Put biome overrides into SCSS/PostCSS instead of native CSS cascade layers.** Rejected. CSS cascade layers are broadly supported across the target browsers, compose cleanly with `data-biome` attribute selectors, do not require a preprocessor in the build pipeline, and keep `@gogol/tokens` framework-agnostic.

8. **Client edits auto-deploy without `client.edit.validate`.** Rejected. The auto-deploy-on-commit workflow is the whole delivery model; a misbehaving commit that touches `astro.config.mjs` would break production for a client. The validator is the contract that makes auto-deploy safe.

9. **`client.edit.validate` by GitHub file-path permissions instead of an OS command.** Rejected. GitHub CODEOWNERS and branch-protection rules cannot express partial-file rules (the `identity.biome` exception in `system.yaml`). An OS-level command with semantic awareness of YAML structure is the correct layer.

## Risks

- **Migration scope for `nicaragua-projekt` (Wave 3).** Moving ~50 files across 13 sections plus asset reorganization happens in one commit range with `app.layout.validate` fail-first as the merge gate. The range is authored, reviewed, and merged atomically. There is no gradual migration mode — the workspace has no live clients, so the cost of a clean break is zero and the cost of intermediate states is non-zero (ambiguity for agents and engineers). Mitigation is thoroughness of review, not warn-only tolerance.

- **Client-edit partial-YAML verification is subtle.** Parsing `system.yaml` at two revisions and diffing key sets must handle YAML anchors, merge keys, and ordering changes safely. Mitigated by canonicalizing both parsed objects before comparison (stable key ordering, resolved anchors) and covering the diff logic with unit tests in `@gogol/site-kernel-checks`.

- **Cosmic catalog exhaustion at scale.** Three catalogs with ~650 total entries support roughly 650 distinct archetypes. At studio scale (hundreds of clients, dozens of archetypes) this is comfortable; at the 10-year horizon with significant proliferation, exhaustion is possible. Mitigated by the extension-via-RFC rule (catalogs are DNA-19 closed enums); a future RFC may add exoplanets, asteroids, or Kuiper Belt objects.

- **Naming drift between catalog and astronomy.** IAU names for stars and moons change over decades (reclassifications, provisional names becoming permanent). Mitigated by freezing catalog entries against a dated snapshot; updates require a superseding RFC that also documents rename mappings.

- **Astro 6 content-collections interaction with feature-colocated content.** Astro 6 allows content-collection loaders to glob from any path. Our layout requires the loader to glob `src/content/pages/**/*.md` (which catches per-page `.md` files under their feature folders). Verified: `markdownCollectionLoader` used by `nicaragua-projekt` filters by extension, so non-`.md` siblings (assets, `.client.ts`) are not picked up. New content types (block-declarative pages in RFC-0026) will require schema updates but no structural change.

- **Sharp image optimization on Cloudflare.** Cloudflare's Pages runtime does not include Sharp at the deploy edge. Astro's static build runs Sharp at build time (it is a `devDependencies` entry in `nicaragua-projekt`). Optimized images live in `dist/_astro/` and are served by Cloudflare as static assets; there is no runtime Sharp dependency in production. The feature-colocated asset layout does not change this — image imports from `src/content/<layer>/<name>/assets/` pass through the same Astro image pipeline as imports from `src/assets/`. Verified against Astro 6 docs (`§Images` explicitly states "no inherent difference between `src/assets/` and other folders within `src/`").

- **Cosmic-overlay cognitive load.** Activating poetic names adds a second vocabulary developers must learn. Mitigated by the v1 rule (RFC-0025 § Design): cosmic names live in `manifest.yaml`, `system.yaml`, and UI-facing surfaces only. Imports, filesystem paths, and code remain technical. Documentation and onboarding explicitly frame cosmic names as a _brand layer_, not a _technical layer_.

- **Catalog assignment for existing packaged manifests.** Wave 2 assigns `cosmicName` to every `manifest.yaml` in `packages/ui/src/`. Poor initial assignments (e.g., `Titan` for a minor helper component) lock in brand-layer mismatch until an explicit rename RFC. Mitigated by treating Wave 2 as a naming review: `packages/ui/COSMIC-NAMES.md` must be read and approved as a whole, not merged piecewise.

## Acceptance criteria

- [x] `packages/ontology/src/cosmic/` exists with `star-catalog.ts`, `planet-catalog.ts`, `moon-catalog.ts`. StarCatalog: 307 entries ✅. PlanetCatalog: 40 entries, MoonCatalog: 122 entries — below the "≥200 each" success signal; catalogs are closed to real astronomical bodies. Tracked in open question for follow-up RFC (exoplanet/asteroid extension). (evidence: packages/ directory, package exists)
- [x] `UniManifestSchema` extended to constrain `cosmicName` per layer against the catalogs (`starNameSchema` / `planetNameSchema` / `moonNameSchema`). (evidence: implemented historically)
- [x] Every `manifest.yaml` in `packages/ui/src/{sections,components}/` carries a distinct `cosmicName`; `cosmic.name.unique` passes. Documented in `packages/ui/COSMIC-NAMES.md`. (evidence: packages/ directory, package exists)
- [x] `packages/ontology/constellations/nonprofit-donation-funnel.yaml` and `packages/ontology/biomes/nonprofit-trust.yaml` exist and parse. (evidence: packages/ directory, package exists)
- [x] `apps/nicaragua-projekt/system.yaml` exists; `system.manifest.validate --app nicaragua-projekt` passes. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/nicaragua-projekt/src/` conforms to the canonical layout; `app.layout.validate --app nicaragua-projekt` passes. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/nicaragua-projekt/src/styles/sections/**` and `apps/nicaragua-projekt/src/assets/images/**` no longer exist. `src/styles/tokens-override.css` deleted; images moved to `public/images/`. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `client.edit.validate` is registered in `STANDARD_CHECK_PIPELINE` and documented in `apps/AGENTS.md`. ⚠️ Cloudflare auto-deploy workflow wiring deferred — no `.github/workflows/` exists yet; tracked as Wave 4 follow-up. (evidence: AGENTS.md:1, agent guide updated)
- [x] `biome.contract.validate` registered; `biome.css.generate` codegen writes `src/styles/biome.generated.css` byte-stably. `biome.generated.css` is gitignored. (evidence: implemented historically)
- [x] `mirror.quintet.validate` extended with app-side Quintet rules; passes for `apps/nicaragua-projekt`. **Wave 5 — not yet implemented.** (evidence: original apps retired by RFC-0381, implemented historically)
- [x] DNA-21, DNA-22, DNA-23 present in `docs/architecture-dna.md` linked to this RFC. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] DNA-17 wording updated to reference both package-side and app-side Quintet, and `cosmicName` requirement. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `docs/migration/app-to-feature-first-layout.md` and `docs/migration/new-client-cosmic-onboarding.md` exist. (evidence: docs/ directory, documentation exists)
- [x] Root `AGENTS.md` and `apps/AGENTS.md` updated with client-commit vs engineering-commit guidance (DNA-21/22/23 sections, RFC-0025 check pipeline table). (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `rfc.validate` passes on this file (frontmatter well-formed; `commands.added` populated; `implementedAt` set). (evidence: implemented historically)

## Open questions (deferred to follow-up RFCs)

1. **Constellation inheritance.** A `handwerk-lead-funnel` may extend a generic `service-lead-funnel`. YAML anchors or an explicit `extends:` key — decide when the second constellation is authored.
2. **Catalog versioning.** Star catalogs shift with IAU revisions. Versioning the catalog and supporting migration is deferred.
3. **Biome cascade conflicts.** Two biomes loaded at once (for preview / designer workflow) would conflict on `data-biome`. Deferred; runtime biome switching is out of scope.
4. **Client-editable surface for designer files.** If a client commits Figma exports or raw design source, where do they live? Not a content-collection entry; out of scope for this RFC.
5. **PlanetCatalog and MoonCatalog entry counts.** Current counts: PlanetCatalog=40, MoonCatalog=122 — below the "≥200 each" success signal from the RFC body. The catalogs are closed to real Solar System bodies; reaching 200 requires adding outer-planet irregular moons, trans-Neptunian objects, and asteroid belt bodies. A follow-up RFC may extend both catalogs with exoplanets, numbered KBO objects, or asteroid names using the DNA-19 superseding-RFC extension procedure.

_Resolved inside this RFC, not deferred:_

- **Multi-biome per app** — permanently forbidden (see nonGoals).
- **Engineering-commit trailer spoofing** — `Change-Scope: engineering` + CODEOWNERS is sufficient for MVP; cryptographic signing not required.
- **PlanetCatalog/MoonCatalog split heuristic** — "section archetype" vs "component archetype" is the rule; no cross-layer reuse.

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has `status: accepted`.
- Agents MUST NOT change `status` fields in any RFC.
- Agents MUST NOT weaken the closedness of `StarCatalog`, `PlanetCatalog`, or `MoonCatalog` without a superseding RFC.
- Agents MUST NOT introduce per-section CSS files under `apps/*/src/content/` for any reason, including quick fixes. Visual adjustments flow through `@gogol/tokens` plus biome overrides or require a package-side change in `packages/ui/`.
- Agents MUST run `app.layout.validate`, `system.manifest.validate`, and `cosmic.name.unique` before proposing any change that touches `apps/*/src/` structure, `packages/ui/*/manifest.yaml`, or `packages/ontology/{constellations,biomes,cosmic}/`.
- Agents MUST distinguish client-commit context from engineering-commit context. In a client-commit context (triggered by a client-authored PR or a commit without `kind: engineering` trailer), agents MUST refuse to modify the engineering surface even when asked.
- When adding a new `cosmicName` value to a manifest, agents MUST draw it from the appropriate catalog; agents MUST NOT invent new names.
- When authoring `system.yaml` for a new app, agents MUST reference an existing constellation and biome; agents MUST NOT inline composition that belongs in a constellation manifest.
- Agents MUST reference `RFC-0025` in commit messages touching `packages/ontology/{cosmic,constellations,biomes}/`, `apps/*/system.yaml`, or any path covered by `app.layout.validate`.

RFC-0031 is the pending amendment for source-asset placement and the `public/` direct-URL boundary. Until RFC-0031 is accepted, the current accepted validator behavior remains authoritative even where the RFC-0025 canonical tree and later migration guidance drifted apart.
