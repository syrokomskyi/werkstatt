# Architecture DNA

This document records the stable architectural invariants ("DNA") for the Warpgogol monorepo. Each item is a machine-readable anchor that RFCs and OS commands reference by id (e.g. `DNA-4`). Agents MUST NOT delete or renumber items; add new entries only at the bottom. This is the **canonical** `DNA-N` registry — the cross-site prose companion at `packages/os/site-kernel/docs/architecture-dna.md` is a derived view. When an RFC establishes a new invariant (its body says "DNA-N established by this RFC"), append the matching `## DNA-N` entry here; `dna.registry.validate` (RFC-0158) enforces that the registry and the establishing RFCs stay in sync.

---

## DNA-1 · Monorepo boundary

Each deployable site is a Sternsystem registered in `systems-cache/{id}/system-config.yaml` (RFC-0790), with its own git repo, pin file, and mission workpiece. Shared reusable logic lives in `packages/*`. No site may import from another site at runtime. The `apps/*` directory is retired (RFC-0381); persistent deployable sites are materialized into `missions/` from Sternsystem data (RFC-0354..0356). **Transition note:** several DNA entries below (DNA-4, DNA-6, DNA-7, DNA-8, DNA-20, DNA-21, DNA-22, DNA-24, DNA-39, DNA-40) still reference `apps/*/` paths for historical reasons. Agents working on new sites should treat these paths as the materialized mission workpiece (`missions/<id>/workpiece/`) during the transition. The contracts themselves remain valid; only the physical path prefix is changing. Foundational invariant (pre-RFC, updated by RFC-0354, updated by RFC-0790).

## DNA-2 · pnpm workspace + Turborepo

Package manager is pnpm with a workspace root. Task orchestration uses Turborepo. All cross-workspace commands run from the repository root. Foundational invariant (pre-RFC).

## DNA-3 · Astro as the site framework

All visitor-facing apps use Astro. The framework version and adapter configuration are per-app and must not be coupled across apps. Foundational invariant (pre-RFC).

## DNA-4 · Canonical content in `src/content/`

All user-visible copy, configuration, and metadata live in `src/content/`. Page routes and components must not hard-code copy strings or configuration that belongs in the content layer. Foundational invariant (pre-RFC).

## DNA-5 · Component ↔ content ↔ schema mirror

For every content-driven component there must be: an `.astro` component file, a content `.md` file, and a TypeScript schema `.ts` file. The `mirror.quintet.validate` command enforces this contract (extended to Mirror Quintet by DNA-17, RFC-0023). Established by RFC-0009.

## DNA-6 · Kebab-case filenames

All filenames in `apps/` and `packages/` use kebab-case. No underscores, no `PascalCase` filenames. Enforced by `naming.convention.lint`. Foundational invariant (pre-RFC).

## DNA-7 · Thin routes

Route files in `src/pages/` are orchestrators only. They must not contain inline `<style>` blocks, hardcoded body copy, or layout logic beyond section composition. Enforced by `route.thin.validate`. Foundational invariant (pre-RFC).

## DNA-8 · Page → section → component → content hierarchy

Visitor-facing page bodies inside `<main>` are composed as an ordered list of section components. Each section renders one or more child components. Child components consume canonical content from `src/content/`. Routes must not render copy-owning or navigation components directly outside a section. Enforced by `structure.hierarchy.validate` (RFC-0019). Established by RFC-0019.

## DNA-9 · Page block/shell visibility model

Page, section, component, and content-element visibility is declared exclusively via page block configuration and shell settings (RFC-0047). Route-local `if` guards on feature flags are forbidden. The legacy feature graph (`src/content/features/`) is retired (RFC-0047) and no longer wired into any pipeline. Enforced by `feature.links.validate` and `feature.projections.validate`. Established by RFC-0018 (superseded by RFC-0019, carried forward through RFC-0047).

## DNA-10 · No hardcoded design tokens

CSS must use `--ds-*` custom properties only. Raw `rgba()` and `#hex` color values are forbidden in authored styles. Enforced by `tokens.ds.lint` and `tokens.colors.lint`. Foundational invariant (pre-RFC).

## DNA-11 · Language mirroring

Content pages that exist in the default language must be mirrored across all supported language directories (or explicitly marked as exempt). Enforced by `mirroring.validate`. Foundational invariant (pre-RFC).

## DNA-12 · Centralized visibility control (merged into DNA-9)

**Merged into DNA-9.** This entry is retained for traceability only — the content is fully covered by DNA-9 (Page block/shell visibility model). Do not reference DNA-12 as a separate invariant. Established by RFC-0018 (superseded by RFC-0019, carried forward through RFC-0047).

## DNA-13 · Disabled content must not leak

Semantic projections, breadcrumb targets, and navigation links must not resolve to disabled or invisible targets. Agents must ensure that when a page or block is hidden, all references to it from navigation, breadcrumbs, and JSON-LD are also removed or updated. Enforced by `feature.projections.validate` and `feature.links.validate`. Established by RFC-0018 (superseded by RFC-0019, carried forward through RFC-0047).

## DNA-14 · Breadcrumb labels are content-driven

Breadcrumb label text is resolved from the content layer (page title, `breadcrumbLabel`, or equivalent). Routes must not construct breadcrumb label strings inline. Placement and availability are controlled by the page block/shell visibility model (DNA-9). Established by RFC-0018 (superseded by RFC-0019, carried forward through RFC-0047).

## DNA-15 · Scripts follow placement contract

Client-side JavaScript follows the RFC-0011 placement contract: no large inline `<script>` blocks in routes, all non-trivial app-global scripts extracted to `src/scripts/`. Bounded feature-scoped `*.client.ts` files under `src/content/**/` are formalized by RFC-0031 (implemented 2026-04-27) without weakening the app-global script boundary. Enforced by `scripts.placement.validate`. Established by RFC-0011, amended by RFC-0031.

## DNA-16 · Semantic layer shares topology with navigation

Semantic outputs (JSON-LD, sitemaps, structured breadcrumb data) must be derived from the same page topology and visibility state used for navigation rendering. Agents must use `getRouteRegistry()` from `@warpgogol/share` as the single source of route topology — they must not construct parallel page-structure models for semantic output. Established by RFC-0012.

## DNA-17 · Uni manifest contract (Mirror Quintet)

Every page, section, and component file (`.astro` under `packages/ui/sections/**`, `packages/ui/components/**`, `packages/ui/pages/**`) ships a colocated `manifest.yaml` declaring at minimum its `id`, `cosmicName`, `layer` (`"page" | "section" | "component"`), `semanticId`, `role`, `version`, `intent[]`, `industryFit[]`, and `contentSchemaKey`. This extends the Mirror Quartet (DNA-5, RFC-0009, RFC-0020) into a Mirror Quintet.

**Package-side Quintet** (enforced by `manifest.contract.validate` and `mirror.quintet.validate`): `.astro` component + `manifest.yaml` + content schema in `@warpgogol/ontology` + `.css` + content `.md` template.

**App-side Quintet** (enforced by `mirror.quintet.validate`, extended by RFC-0025): page route (Astro, thin) + content-collection schema (ontology) + manifest (`packages/ui`) + per-feature content bundle (`src/content/<layer>/<name>/`) + `system.md` composition pin.

`cosmicName` is drawn from the layer-appropriate closed catalog (`StarCatalog` for pages, `PlanetCatalog` for sections, `MoonCatalog` for components) and must be globally unique within its layer. The `manifest.yaml` is authoritative; TypeScript types are generated from it. Enforced by `manifest.contract.validate`, `mirror.quintet.validate` (RFC-0023), and `cosmic.catalog.validate` / `cosmic.name.unique` (RFC-0025). Established by RFC-0023.

## DNA-18 · Uni registry is the single UI index

`uni.registry.yaml` at the workspace root is the only machine-readable index of the UI surface (pages, sections, components, constellations, compatibility). It is deterministically generated from every `manifest.yaml` by `uni.registry.build`, validated by `uni.registry.validate`, and consumed by AI agents, the component dispatcher, and OS checks. The registry is never hand-edited; drift between registry and manifests fails `build.check` (RFC-0023). Established by RFC-0023.

## DNA-19 · Closed ontology vocabularies

`SemanticRole`, `ComponentRole`, `Industry`, and `Layer` are closed enums exported from `@warpgogol/ontology`. Adding, removing, or renaming a value requires a superseding RFC; no local code change may extend them. `Intent` is an open vocabulary (typed as `string` with a known-good list) to allow language about user goals to evolve without RFC ceremony (RFC-0023). Established by RFC-0023.

## DNA-20 · Business layer is the canonical site description (SUPERSEDED by RFC-0471)

**Superseded.** The `@warpgogol/business` package has been deleted (RFC-0471). All sites now use `@warpgogol/pbp` (Public Business Profile, `pbp/*@1`) as the canonical business layer. PBP content lives under `src/content/business-profile/{lang}/` with entity-typed schemas. People records live in a standalone `people` content collection (`src/content/people/{lang}/`). Semantic model building (`buildPageSemanticModel`, `buildPbpSemanticProfile`) is exported from `@warpgogol/pbp/semantic-profile`. Established by RFC-0024; superseded by RFC-0469 (cutover) and RFC-0471 (deletion).

## DNA-21 · Feature-first app layout

Every site workspace follows a feature-first layout: per-feature content, scripts, and assets colocate under `src/content/<layer>/<name>/` (`.md`, optional `.client.ts`, optional `assets/` subdirectory). App-global concerns live in their canonical folders (`src/styles/`, `src/scripts/`, `src/pages/`, `src/middleware/`). Parallel `src/styles/<layer>/`, `src/scripts/<layer>/`, and `src/assets/images/` trees are **forbidden**. Per-feature CSS files under `src/content/` are an **error**, not a warning — all visual customisation flows through `@warpgogol/tokens` and biome-scoped overrides. `src/content/**/assets/` is the canonical editable source-asset surface (RFC-0031, implemented 2026-04-27); `public/` is reserved for direct-URL passthrough artifacts. Enforced by `app.layout.validate` and `assets.structure.lint` (RFC-0025, amended by RFC-0031). Established by RFC-0025.

## DNA-22 · Client-editable surface whitelist

Every site workspace has an explicit client-editable surface: `src/content/{business-profile,pages,sections,components,features,people}/**`, `src/content/**/assets/**` (whitelisted media extensions), `src/content/**/*.client.ts` (bounded feature-scoped client scripts, formalized by RFC-0031), and two keys in `system.md` (`identity.biome`, `release.passportEnabled`). All other paths are the engineering surface. A client commit that touches the engineering surface is rejected by `client.edit.validate` before the Cloudflare auto-deploy runs. Agents operating in a client-commit context MUST refuse to modify the engineering surface even when asked. Partial-`system.md` edits are verified by parsing both YAML revisions and diffing key sets. `Change-Scope: engineering` commit trailer (restricted to CODEOWNERS engineering team) bypasses the gate. Enforced by `client.edit.validate` (RFC-0025, amended by RFC-0031). Established by RFC-0025.

## DNA-23 · Cosmic overlay

`@warpgogol/ontology` exports three closed name catalogs — `StarCatalog` (pages), `PlanetCatalog` (sections), `MoonCatalog` (components) — sourced from IAU and Solar System registries. Every `manifest.yaml` in `packages/ui/src/{pages,sections,components}/` carries a distinct `cosmicName` drawn from the layer-appropriate catalog. Cosmic names are manifest/YAML fields and UI-facing strings only; import paths, filesystem paths, and directory names remain technical. Three new manifest kinds are introduced: `system.md` (per-app galaxy binding — identity, biome, constellation, version pins), `constellation.yaml` (reusable ordered section composition patterns at `packages/ontology/constellations/`), and `biome.yaml` (industrial/tonal token presets at `packages/ontology/biomes/`). One biome per app is a permanent invariant. Catalogs are DNA-19 closed enums — extension requires a superseding RFC. Enforced by `cosmic.catalog.validate`, `cosmic.name.unique`, `biome.contract.validate`, `system.manifest.validate`, and `constellation.compose.validate` (RFC-0025). Established by RFC-0025.

## DNA-24 · Block-declarative pages

Every page content entry under `apps/*/src/content/pages/**/<slug>.md` (or `<lang>/<slug>.md`) is a **frontmatter-only document** with shape `kind: page`, `cosmicStar`, `title`, `description`, `lang`, `blocks[]`. No markdown body is permitted — prose content lives in separate `src/content/prose/<slug>.<lang>.md` entries referenced via `blocks[].props.contentRef`. Each `blocks[].type` is a `PlanetName` drawn from the `PlanetCatalog` and must also appear in `system.md pages[route].planets[]` for the owning page's route. Markdown bodies in page entries fail `mirror.quintet.validate` and `page.block.validate`. Established by RFC-0026.

## DNA-25 · Single `buildPage` pipeline

`@warpgogol/share` exports a single build-time pipeline: `buildPage(entry: PageEntry, ctx: RuntimeContext, options?) → Promise<ResolvedPage>`. Every page route calls it once per locale; no route hand-assembles block composition. The pipeline evaluates block visibility, resolves component import paths, and returns a typed `ResolvedPage` with `ResolvedBlock[]` in document order. Cross-reference checks (star/route coherence, system.md pin list, propsSchema validation) are the responsibility of `page.block.validate` running in `build.check`. Routes that do not call `buildPage` fail `page.pipeline.contract`. Established by RFC-0026.

## DNA-26 · Unified `VisibilityExpr` grammar and `RuntimeContext` shape

One grammar for visibility, one type for runtime context, both in `@warpgogol/share`. `VisibilityExpr` is a closed discriminated union (`feature | locale | segment | flag | all | any | not`); adding a case requires a superseding RFC. `RuntimeContext` has exactly three fields: `locale` (active), `segment` (reserved, always `null` at MVP), `flags` (reserved, always `{}` at MVP). `EMPTY_RUNTIME_CONTEXT(locale)` is the only constructor at MVP. No workspace code may produce a non-null `segment` or non-empty `flags` without a superseding RFC — enforced by `runtime.context.shape`. Feature-graph visibility and block-level visibility share the same grammar via `VisibilityExprSchema` from `@warpgogol/share`. Established by RFC-0026.

---

## Historical / Reclassified (DNA-27..34) — NOT BINDING

> **⚠ AGENTS: Do not reference DNA-27..34 as active invariants.** These entries were reclassified from binding architectural invariants to product features by RFC-0161. They are retained for traceability only. New RFCs must not reference them as active DNA. Treat them as product features governed by their respective RFCs (RFC-0027, RFC-0028).

## DNA-27 · Typed event catalog

`packages/ontology/growth/events/*.yaml` is the closed, workspace-scoped catalog of growth events; every event carries a typed payload schema and emissions reference the event id. `growth.events.validate` rejects calls to unregistered ids. Established by RFC-0027. **Reclassified to feature (RFC-0161)** — governed as a product feature by RFC-0027, not enforced as binding DNA.

## DNA-28 · Content-declared funnels

`packages/ontology/growth/funnels/*.yaml` holds reusable funnel graphs — ordered event sequences with attribution hints — as a workspace library consumed by apps via `system.yaml.growth.funnels`. Established by RFC-0027. **Reclassified to feature (RFC-0161)** — governed as a product feature by RFC-0027, not enforced as binding DNA.

## DNA-29 · Client-editable experiments

`apps/<app>/src/content/growth/experiments/*.md` is the per-app experiment library; experiments are authored content (variants, allocation, target metric), not code. Established by RFC-0027. **Reclassified to feature (RFC-0161)** — governed as a product feature by RFC-0027, not enforced as binding DNA.

## DNA-30 · Vendor-agnostic `GrowthAdapter`

Analytics and experiment vendors sit behind a closed `GrowthAdapter` interface in `@warpgogol/growth`; vendor selection is CMS/content-driven, never hardcoded in app or component source. Established by RFC-0027. **Reclassified to feature (RFC-0161)** — governed as a product feature by RFC-0027, not enforced as binding DNA.

## DNA-31 · Cosmic Passport as build output

Every build of every app emits `dist/.well-known/cosmic-passport.json` — one document consolidating build provenance and the app's cosmic composition. Established by RFC-0028. **Reclassified to feature (RFC-0161)** — governed as a product feature by RFC-0028, not enforced as binding DNA.

## DNA-32 · Star Map View as SSG-rendered SVG

`@warpgogol/star-map` compiles `system.yaml` plus the registry of packaged manifests into a deterministic SVG (constellation → stars → planets → moons), emitted as a file and embedded in the `/cosmic/star-map` page. Edges represent composition, not dependency. Established by RFC-0028. **Reclassified to feature (RFC-0161)** — governed as a product feature by RFC-0028, not enforced as binding DNA.

## DNA-33 · Nebula Score as composite quality metric

`@warpgogol/nebula` computes a 0–100 composite quality score from four weighted pillars, giving each app a single comparable health number. Established by RFC-0028. **Reclassified to feature (RFC-0161)** — governed as a product feature by RFC-0028, not enforced as binding DNA.

## DNA-34 · Verifiable Credential signing + `/.well-known/` discovery

Each app has an Ed25519 keypair (private key in CI secrets, public key committed under `public/.well-known/`); the build signs the passport's provenance + composition subset as a W3C VC (`Ed25519Signature2020`). `passport.verify` confirms the signature against the published key; `passport.key.rotate` re-keys and re-signs. Established by RFC-0028. **Reclassified to feature (RFC-0161)** — governed as a product feature by RFC-0028, not enforced as binding DNA.

## DNA-35 · `app.contract.full` as the canonical readiness signal

A single command runs every workspace and per-app validator in dependency order, aggregates results, and exits zero only if all are green — the single source of truth for "is this app ready to deploy." Established by RFC-0029 (carried forward into the RFC-0070 onboarding lifecycle).

## DNA-36 · `@warpgogol/site-kernel-onboarding` package

The OS package that owns the onboarding lifecycle — input/brief contracts, phase outputs, and app scaffolding. Established by RFC-0029 (extended by RFC-0070 and the RFC-0135/0136 amend lifecycle).

## DNA-37 · Universal Section Props Contract

Every section component in `packages/ui/src/sections/` accepts a single unified `SectionProps` interface, so sections compose through one runtime contract instead of bespoke per-section prop shapes and renderer conditionals. Established by RFC-0035.

## DNA-38 · Standardized authored section-content contracts

Reusable authored structures (beginning with list-based sections) use canonical, package-owned item objects rather than section-local string arrays or ad-hoc icon props, so content shape is enforced by the shared package, not re-invented per section. Established by RFC-0100.

## DNA-39 · Route registry is a merge of route sources

The route registry (`@warpgogol/share` `getRouteRegistry()`) is a merge of route sources, not a 1:1 view of authored pages. Authored `system.md pages[]` are one source; the Programmatic Surface is a second, contributing build-time-materialized virtual routes (`src/surface.generated.json`) behind the `pseo` entitlement. All downstream machinery — `getStaticPaths`, sitemap, hreflang, the page handler — iterates the merged registry. Agents must not add route sources by hand-editing `getStaticPaths` or creating standalone route files — new route sources integrate through the registry with zero per-route code. Generated pages are baked block-declarative `PageEntry` objects served through the same `buildPage` pipeline as authored pages. Established by RFC-0192.

## DNA-40 · Env-example and deploy-script contract

Every `systems/*`, `services/*`, and root project that reads environment variables from `process.env` (or `astro:env/server`, `astro:env/client`) MUST ship a `.env.example` file in its project root with every variable documented by a preceding `#` comment and a `# How to obtain:` instruction line. `README.md` files MUST NOT duplicate env-variable tables — they reference `.env.example` instead. `systems/*` and `services/*` projects with `.env.example` MUST have `.env` on disk (local development + deploy). `systems/*/package.json` MUST contain the six canonical deploy scripts (`build:main`, `build:alt`, `deploy:main`, `deploy:alt`, `build:deploy:main`, `build:deploy:alt`). `deploy:main` and `deploy:alt` MUST use `--secrets-file .env`. `services/*/package.json` deploy scripts MUST use `--secrets-file .env`. All deploy scripts MUST be prefixed with `deploy.preflight`. Enforced by `env.contract.validate`, `env.local.check`, `deploy.scripts.validate`, and `deploy.preflight`. Established by RFC-0346, updated by RFC-0388, simplified by RFC-0761, extended with dev channel by RFC-0806. RFC-0806 adds `wrangler.dev.jsonc` + `.env.dev.example` for dev-channel deploys and replaces per-service deploy scripts with `deploy:dev` / `deploy:prod` / `rollback` scripts that proxy to `leitstand.service.dev-deploy`, `leitstand.service.promote`, and `leitstand.service.rollback`. RFC-0807 adds mandatory OTLP env vars (`WARPGOGOL_OTLP_ENDPOINT`, `WARPGOGOL_OTLP_TOKEN`) to all `services/*` `.env.example` files, enforced by `service.otlp.validate` (OTLP-01, OTLP-02, OTLP-03).

## DNA-41 · Property-based testing for pure functions

Pure functions with verifiable algebraic properties (idempotency, round-trip, immutability, commutativity, associativity, monotonicity, reflexivity, antisymmetry, distributivity, invariance) MUST be covered by property-based tests using `fast-check`. The test runner for all workspace packages is `vitest`. PBT tests live in `*.pbt.test.ts` files. Selection criteria and agent guidance are defined in RFC-0347. Enforced through agent discipline and code review (no OS command). Established by RFC-0347.

## DNA-42 · Compass markup contract

Every authored source file in `apps/` and `packages/` that requires semantic scaffolding MUST carry exactly two Compass blocks: `MODULE_CONTRACT` (with `<purpose>` ≥ 10 words and ≥ 1 `<non-goals>` item) and `CHANGE_SUMMARY` (with ≥ 1 item, max 30 total items). Files with risk class `high` MUST have ≥ 1 inline `@ai-invariant` line. Forbidden: `MODULE_MAP`, `keywords`, `responsibilities`, `COMPASS_BLOCK` anchors. Scaffolding mode: `standard` (authored) or `none` (generated/excluded). Enforced by `compass.validate`, managed by `fo-compass-annotate` skill / `compass.summary.trim`. Established by RFC-0348, amended by RFC-0538.

## DNA-43 · Compass semantic-truth audit

Every authored file with risk-class-dependent scaffolding (RFC-0348) undergoes periodic semantic-truth audit: the file's MODULE_CONTRACT and CHANGE_SUMMARY prose are compared to the actual code to verify they remain true. Audit cadence is per-file revision counter (≥ 30 commits since last audit, default threshold). Commands `compass.audit.plan` (work-order), `compass.audit.record` (verdict), `compass.audit.baseline` (seed), `compass.audit.validate` (report overdue). Ledger: `docs/compass-audit-ledger.generated.json`. Gate: warn in `build.check`, hard fail in QA/release (`--strict`). Semantic judgment is by an AI agent in-session (no LLM in command). Established by RFC-0352.

## DNA-44 · Sternsystem bundle contract

A Sternsystem is a durable, independently versioned, data-only site bundle stored in its own git repo outside the monorepo workspace. It carries authored content, data sidecars, provenance, static assets, Bordbuch history, a persistent version pin (`system.pin.json`) that records the platform version, commit, RFC head, and `platformSemanticHash`, and per-system configuration files `system-config.yaml` (static config) and `system-state.yaml` (mutable state) discovered via convention in `systems-cache/{id}/` (RFC-0790). **Agents must not place** runtime scripts, `package.json`, `tsconfig.json`, astro configs, generated route stubs, or deployable source code into a Sternsystem repo — these belong to the platform and are materialized at build time. Sternsystem ids are kebab-case, lowercase, latin-only. After the Werkstatt migration completes, persistent deployable sites no longer live in `apps/`; they are materialized into `missions/` from Sternsystem data. Enforced by `sternsystem.validate` and `sternsystem.pin`. Established by RFC-0354, updated by RFC-0790.

## DNA-45 · Fleet registry

Each Sternsystem is discovered via convention-based per-system files in `systems-cache/{id}/`: `system-config.yaml` (static config: id, cosmicStar, mirrors, pinnedPlatform, status, deployment, cloudflareZoneId) and `system-state.yaml` (mutable state: currentMission, lastRelease, lastPropagated). The `systems/registry.yaml` fleet registry is retired (RFC-0790); `discoverSystems` reads `systems-cache/*/system-config.yaml` as the single source of truth for fleet state. Service registrations live in `services/registry.yaml`. Enforced by `sternsystem.validate` and `sternsystem.list`. Established by RFC-0354, updated by RFC-0790.

## DNA-46 · Mission lifecycle

Every change to a Sternsystem passes through a mission — an ephemeral lifecycle container (open → closed/aborted). A mission has a unique six-digit id (`<system-id>-m<NNNNNN>`), a brief, an operation id, a pin at open time, exactly one mutable non-canonical disposable Werkstück in `workpiece/`, and zero or one immutable non-canonical disposable Distribution in `distribution/`. Only one open mission may exist per Sternsystem at a time. Every mission is recorded in the Sternsystem's Bordbuch (`systems-cache/{id}/bordbuch/events.ndjson`), an append-only hash-chained log that records both lifecycle events (mission open/close/abort, deployment, release) and runtime operational events (PSEO breaker trips, autonomy demotions, IndexNow submissions). Enforced by `mission.open`, `mission.reconcile`, `mission.close`, `mission.abort`, `bordbuch.validate`, and `bordbuch.generate`. Established by RFC-0355, extended by RFC-0473, updated by RFC-0790.

## DNA-47 · Materialization

A mission's Werkstück is materialized from the Sternsystem's pinned data bundle, with runtime scaffolding generated from the pinned platform unless the mission explicitly targets a catch-up upgrade. Materialization reuses RFC-0221 migration machinery where appropriate, but durable Sternsystem repos remain data-only. The Werkstück is validated by `app.contract.full`, may produce a local Distribution, and must be reconciled before the mission closes. After app extraction validates, the source `apps/<id>` workspace is removed rather than kept as legacy compatibility. Enforced by `mission.materialize`, `mission.validate`, `mission.preview`, `mission.build`, and `mission.reconcile`. Established by RFC-0356.

## DNA-48 · Release discipline

A release is a promoted, immutable artifact produced from a validated mission. It has a six-digit id (`<system-id>-r<NNNNNN>`), RFC-0269 behavior snapshots (readable and production), a snapshot diff, advisory quality report, release manifest, a durable RFC-0363 artifact reference for the production `dist`, and a public `build-identity.json` written into `dist/client/.well-known/` (RFC-0608). The release state machine is `prepared → ready → alt-deployed → promoted → rolled-back` (RFC-0628 removes `dev-deployed` — workpiece-based dev deploys do not enter the release state machine). A release cannot be marked ready unless: (1) the behavior snapshot diff passes (structural parity between readable and production builds), (2) migrator validation passes, (3) the version-compare verdict is not refuse-downgrade, (4) the Bordbuch is consistent, and (5) the release artifact is stored and hash-verified. Enforced by `release.prepare`, `release.ready`, and `release.validate`. Established by RFC-0357, updated by RFC-0608, RFC-0627, and RFC-0628.

## DNA-49 · Fleet propagation (Leitstand)

The Leitstand is the fleet operation component that deploys published releases to Sternsystem deployment targets via adapter plugins (cloudflare-workers, null). Propagation uses a three-channel model (`dev` for development, `alt` for staging, `main` for production); `leitstand.dev-deploy` deploys the active mission's workpiece to `dev` (building from source, writing preliminary + final `build-identity.json` with deterministic `distTreeHash`, capturing `commitSha` from workpiece HEAD, running the Axiom verification gate via `mission.check --external-preview`, and post-processing the evidence capsule with `commitSha` — no registry or bordbuch writes); RFC-0649: `leitstand.dev-deploy` treats CDN purge failure as fatal (stops before Axiom gate) and verifies CDN freshness by fetching `build-identity.json` from the CDN URL and comparing `distTreeHash` against the local build-identity before running the Axiom gate; for `null` adapter, purge and freshness check are skipped; `leitstand.propagate` requires `published` state with zero-error Axiom evidence where the evidence capsule's `missionId` and `commitSha` match the release manifest, verifies the dev deployment's `build-identity.json` (`missionId`, `commitSha`, `distTreeHash`, `siteContentHash`) against the release manifest, and deploys to `alt`; promoting to `main` requires a healthy `alt` propagation of the same release with live build-identity verification (`releaseId`, `distTreeHash`, `behaviorSnapshotHash`, `siteContentHash`). Build-identity verification is required at every promotion step. The release state machine (`prepared → published → alt-deployed → promoted → rolled-back`) tracks deployment phases (RFC-0628 removes `dev-deployed` — dev deploys are workpiece-based and ephemeral). `leitstand.propagate` no longer accepts `--channel` — use `leitstand.promote` for main deployment. Propagation is gated on the release being in the correct state, preflight checks passing, and a deployment lock being available. Health checks include per-route content verification via `@warpgogol/fingerprint` HTML normalization that binds the live site to the behavior snapshot. Rollback auto-detects the channel from the release state, redeploys a previous published artifact from the release store, and auto-steps the release state one step back in the deployment chain (`promoted` → `alt-deployed`, `alt-deployed` → `published`). Deployment state and secret references, never secret values, are tracked in the registry's `deployment` block with per-channel `lastPropagated` entries. Enforced by `leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote`, `leitstand.status`, `leitstand.rollback`, and `leitstand.health`. Established by RFC-0358, updated by RFC-0379, RFC-0608, RFC-0627, RFC-0628, and RFC-0634.

## DNA-50 · Notausgang export

The Notausgang is the emergency exit export for a Sternsystem: a self-contained package with data-only authored site sources, a `dist` restored from the published release artifact, Bordbuch NDJSON, pin, artifact manifest, behavior snapshots, and an export manifest. Studio integrations are nulled by default through declarative integration inventories, with documented exceptions and secondary secret scanning. The export includes a README for serving the `dist/` directory immediately, but rebuilding requires an external compatible platform. Enforced by `notausgang.export` and `notausgang.validate`. Established by RFC-0359.

## DNA-51 · Werkstatt consistency primitives

Werkstatt commands that mutate registry, mission, release, deployment, artifact, or Bordbuch state use shared lock, idempotency, and atomic staging primitives (RFC-0362). Enforced by `werkstatt.lock.status`, `werkstatt.lock.recover`, and `werkstatt.operation.validate`. Established by RFC-0362.

## DNA-52 · Release artifact store

Ready release artifacts are durable, content-addressed records in the Werkstatt artifact store, not incidental local `releases/<id>/dist` folders. Release, deployment, rollback, and Notausgang workflows resolve artifacts through the store and verify artifact manifests, dist tree hashes, behavior snapshot hashes, and retention rules. Enforced by `artifact.store.put`, `artifact.store.get`, `artifact.store.validate`, and `artifact.store.gc`. Established by RFC-0363.

## DNA-53 · Semantic fingerprint governance

All project hashes for platform, content, release artifacts, snapshots, and generated manifests use the shared `@warpgogol/fingerprint` package. The package provides deterministic byte, tree, stable JSON/JSONC/YAML/Markdown, source, Astro, CSS, and package semantic fingerprints. New ad hoc direct hashing helpers are forbidden outside the package and audited by `fingerprint.usage.lint`. Established by RFC-0364.

## DNA-54 · Forge bindings contract

Canonical forge skill bodies (`packages/forge/skills/**/*.md`) must not contain hardcoded project-specific literals (commands, paths, terminology) in instruction lines. Project-specific values are declared in the `bindings` section of `forge.yaml` and referenced by key (e.g. `ref(forge.yaml bindings.commands.validateRfc)`). Enforced by `forge.skill.validate` (SKILL-11) and `forge.doctor` (bindings validation). Established by RFC-0393.

## DNA-55 · Spec vendoring contract

External specification packages are vendored as immutable snapshots under `docs/specs/<spec-id>/` with an integrity manifest (`integrity.yaml`, SHA-256 per file) and a machine-readable projection (`forge-spec.yaml`, schema `forge/spec@1`). The vendored spec is the single source of truth for its model — no copy of its content exists in RFCs. Spec decisions live in the spec namespace (`<spec-id>/ADR-NNN`) and are not imported into `docs/adrs/`. Changes flow only through the amendment mechanism (RFC-0397). Enforced by `spec.validate` (SPEC-01..07). Established by RFC-0394.

## DNA-56 · Studio Gate: MCP-mediated content editing

Site owner content editing passes through the Studio Gate — a stdio MCP server (`packages/studio-gate`) that projects `workpiece.read` and `workpiece.write` Site OS commands plus mission lifecycle commands (`mission.open`, `mission.materialize`, `mission.git.commit`, `mission.validate`, `mission.reconcile`, `mission.close`, `mission.abort`, `release.prepare`, `release.ready`, `leitstand.propagate`) as MCP tools. LLMs interacting with site content have no direct filesystem access — only MCP tools. DNA-22 (client-editable surface) is enforced at the command level: `workpiece.read` and `workpiece.write` reject paths outside the `clientEditable[]` whitelist before any file I/O occurs. The `wg-site-content-edit` skill provides the process layer (what to do, in what order, boundaries) as MCP `serverInfo.instructions`. Established by RFC-0555.

## DNA-57 · Dev/prod egress parity

The Astro dev server (`astro dev`, port 4321) MUST apply the same egress text normalization (RFC-0235) that the post-build `dist/` sweep applies to production output. Dev preview is what operators and authors see before publishing; it must reflect the published artifact as closely as possible. Build-time-only transforms that alter visible output (text normalization, and future transforms of the same class) MUST have a dev-mode equivalent so that what you see in dev is what you get in production. The dev adapter is a server-only Astro middleware that runs `normalizeHtml()` over the HTML response body, gated by `isAstroDev` so it never executes in production builds. Authored sources under `src/content/` are never modified — the dev adapter transforms output strings, same as the dist sweep. Established by this RFC.

## DNA-58 · Generated-file content determinism

Every text-based generated file committed to git must be byte-identical to what its owning generator would produce from current source data (after line-ending normalization). Content drift — a committed file whose content diverges from its generator's current output — is a violation. Binary files (PNG, ICO, WebP, MP4, WebM, JPG, JPEG, GIF, TIFF, HEIC, HEIF, SVG) are excluded; their determinism is covered by RFC-0602 and RFC-0603. Enforcement: `generated.drift.validate` (RFC-0601). Established by RFC-0607.

## DNA-59 · Evidence preservation

Axiom evidence from `mission.check` is preserved as an append-only archive in S3-compatible storage (Cloudflare R2) with timestamped keys. Raw artifacts are subject to lifecycle-based storage tier transition. The archive is queryable via R2 Data Catalog. Local evidence is ephemeral (latest run only); R2 is the durable history. Established by RFC-0650.

## DNA-60 · Knowledge entry schema and lifecycle contract

Knowledge files declared in skill `knowledge:` frontmatter use a structured entry format: each entry is a `### K-NNNN: title` heading followed by a `knowledge-entry` YAML metadata block and a markdown body. Metadata fields are layer-specific (L0/L1 forbid `confirmations`/`lastConfirmedAt`; L2 requires them). Entry identifiers (`K-NNNN`) are unique within a file; `supersedes` references resolve within the same file; `promotedTo` matches `shared/K-NNNN`. Knowledge-adjacent files (no `K-NNNN` headings, no layer preamble) are exempt. Enforced by `forge.skill.validate` (SKILL-19: schema validity, SKILL-20: identifier uniqueness) and `forge.doctor` (legacy-section counts). Established by RFC-0660.

## DNA-61 · Resolved content regression gate

Every route's resolved page content (block text after `resolveReferencesDeep` substitution, prose body text, FAQ Q&A pairs) is snapshot-hashed per-route and compared against a golden baseline stored in the cache clone. Content drift — a route whose resolved content differs from the golden snapshot — is a gate violation. The unit of measurement is the **route** (path); language is encoded in the route path via prefix (RFC-0160), not a separate dimension. The snapshot lives only in the cache clone's `.cache/content-regression/` directory, never committed to the workpiece git repo. Cold start (no golden snapshot) emits a warning and does not block the first mission; `mission.close` creates the baseline. Extends DNA-58 (generated-file content determinism) to resolved page content that has no registered generator. Enforcement: `content.regression.check` (RFC-0732). Established by RFC-0732.

## DNA-62 · Foundation File Integrity

Foundational repository files (templates, configuration files, structural directories) are protected from accidental deletion, move, or unauthorized modification by a pinned-files manifest (`.forge/pinned.yaml`) enforced at both the forge-command level and the git-commit level. Forge archive commands (`docs.archive`, `rfc.archive`, `adr.archive`, `plan.archive`, `audit.archive`, `session.archive`, `mission.archive`) check the manifest before moving files and skip pinned entries with a warning. A pre-commit hook and CI check (both shipped by forge) enforce the manifest on all commits. An `--allow-pinned-override <path>` flag provides an audited escape hatch for operator-directed changes to frozen files. Repositories without `.forge/pinned.yaml` are unaffected — protection is opt-in per repository. Enforcement: `forge pinned.validate`, `forge pinned.init` (RFC-0733). Established by RFC-0733.

## DNA-63 · Content regression review discipline

Content drift detected by the content regression gate (DNA-61) must be explicitly reviewed by the operator before the golden baseline is updated. The review manifest (`review.yaml`) is a plain YAML file in the mission evidence directory that lists every detected change with golden (old) and current (new) values, and a per-change decision: `accept` (legit change, update golden), `reject` (not intended, agent must revert source), or `fix` (needs correction, agent must apply `fixValue`). `mission.close` must not silently accept unreviewed drift — it blocks with CREG-05 if drift exists and no processed review manifest exists. The review manifest is the copy-paste handoff artifact between the operator and the AI agent: the operator fills in decisions, the agent reads the YAML and applies reverts/fixes to source content files. Enforcement: `content.regression.review.generate`, `content.regression.apply` (RFC-0734). Established by RFC-0734.

## DNA-64 · Engine/plugin/workshop boundary

The Werkstatt engine (`@warpgogol/werkstatt`) is stack-agnostic and MUST NOT import stack plugins. Stack-specific logic lives in plugin packages (`@warpgogol/werkstatt-<stack>`) bound to a forge stack profile. A workshop composes engine + exactly one plugin in `tools/kernel.config.ts`. The engine package contains: kernel runtime (registry, discovery, CLI, pipelines), missions, mirrors (Sternsystem), releases, Leitstand, Bordbuch, Notausgang, artifact store, evidence, deploy orchestration, werkstatt consistency primitives, fingerprint, integrity, observability. A plugin provides path conventions, validators, codegen, content handling, onboarding templates, deploy adapters, and stack invariants. Dependency inversion is enforced by an autonomy guard analogous to forge's. Established by RFC-0769.

## DNA-65 · RFC dependency and batch tracking

RFCs in a series declare direct implementation dependencies via the `dependsOn` frontmatter field (array of RFC-XXXX IDs) and batch identity via the `batch` field (kebab-case slug). `rfc.implement.stamp` enforces a hard block (RFC-IMP-07) when any `dependsOn` entry is not `implemented`. `rfc.validate` checks referential integrity (V-33) and slug format (V-34) as warnings. `rfc.list --batch <slug>` filters by batch. Dependencies are direct-only (not transitive). Both fields are optional — standalone RFCs need neither. Enforcement: `rfc.implement.stamp` (RFC-IMP-07), `rfc.validate` (V-33, V-34), `rfc.list` (--batch flag). Established by RFC-0795.

## DNA-66 · Workshop testing pyramid

The workshop enforces a five-level testing pyramid: L1 unit (pure functions and module internals), L2 integration (service ↔ external API against dev-deployed Workers), L3 contract (site ↔ service API schema validation), L4 end-to-end (Playwright user flows against dev-deployed sites), L5 smoke (post-deploy health and critical-path checks). All test definitions live in `packages/werkstatt-site/src/testing/` — not in `services/*` or mission workpieces — so tests are versioned with the platform and runnable against any deployment. The dev channel (`*.workers.dev` for services, dev-deployed site URL for sites) is the canonical test environment; tests execute against real deployed artifacts, not mocks or local simulators. Deployment pipeline commands (`leitstand.propagate`, `leitstand.promote`, `leitstand.service.promote`) verify test evidence from prior pipeline stages and block promotion when evidence is missing or failed. Established by RFC-0823.

## DNA-67 · Pre-deploy Lighthouse parity gate

Every Lighthouse audit that can be deterministically checked at build time MUST have a build-time validator in the Werkstatt pipeline. This prevents relying on post-deploy Lighthouse runs to catch issues that could be caught earlier. The coverage matrix is maintained in `docs/lighthouse-parity-matrix.yaml`. Enforcement: `lighthouse.validate`, `lighthouse.budget.check`. Established by RFC-0833.

## DNA-71 · Operator config file persistence

Root-level operator config files (`.lighthouse-budget-ignore`, `image-delivery.config.yaml`, `live-video-manifest.generated.yaml`, `dns-records.yaml`) are untracked artifacts persisted between workpiece and cache clone during `mission.close` / `mission.materialize`, following the same pattern as `.env*` files (RFC-0822). The `OPERATOR_CONFIG_FILES` constant declares the canonical list. `mission.close` persists them to the cache clone (untracked); `mission.materialize` restores them after `atomicMoveDir`. The `materialize.config.validate` check command verifies the list stays in sync. Established by RFC-0840.

## DNA-72 · Validator config location diagnostics

Validators that load configuration from non-obvious paths MUST emit a warning diagnostic when the config file is found in a likely-but-wrong location. This prevents silent failures where the operator creates a config file in the wrong directory and the validator ignores it. The first instance is `IMG-DELIVERY-CONFIG-01` (warning when `image-delivery.config.yaml` is in workpiece root but not in `src/`). Established by RFC-0841.

## DNA-73 · Sequential deployment pipeline enforcement

Deployment commands (`leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote`) MUST reject the `--all` CLI flag — deployment is always per-site, per-release. Each command MUST log its target channel and URL before executing. The pipeline is strictly sequential: `ready → dev-deployed → alt-deployed → main-deployed`. `leitstand.propagate` hardcodes channel `alt` (no `--channel` flag); `leitstand.promote` hardcodes channel `main`. The `leitstand.pipeline.check` command provides operators with pipeline state inspection. Established by RFC-0842.
