# Packages Agent Guide

This file defines the shared instruction layer for reusable libraries under `packages/*`. Pair it with the root `AGENTS.md`, then prefer the closest package-level `AGENTS.md` if one exists.

For repository-wide, cross-workspace, architectural, shared-package, or high-risk tasks, read the root Compass documents in `docs/*.xml` (referenced from root AGENTS.md) before applying package-level rules.

## Scope

- This file applies to all workspaces in `packages/*`.
- Packages are reusable library code, not app-local implementation folders.
- Do not move app-specific content, routes, styles, or config into a package unless it is genuinely shared.

## Package architecture

- Keep packages app-agnostic and reusable across multiple sites.
- Expose stable, typed public APIs from package entrypoints.
- Keep package internals private unless there is a clear reuse need.
- Avoid importing from `apps/*` into `packages/*`.
- Prefer plain TypeScript and framework-neutral design in core packages.
- Framework adapters should stay thin and depend on the framework-free core, not the other way around.
- Shared UI assets that are reused by multiple apps belong in `packages/ui`, not in app-local folders.
- **Node-only modules (`node:fs/promises`, `node:path`, etc.) MUST NOT be re-exported from shared barrel files** (`index.ts`) that are imported by client-side code. Vite dev mode does not tree-shake barrel exports — the entire barrel is loaded, pulling Node-only modules into the client bundle and causing "Module node:fs/promises has been externalized for browser compatibility" errors. Use a dedicated subpath export (e.g. `@warpgogol/ontology/schemas/manifest-resolver`) for modules that import Node-only APIs. Node-side consumers import from the subpath; client-side consumers import pure schemas from the main barrel.
- **`createRequire(import.meta.url)` under pnpm strict isolation**: when using `createRequire(import.meta.url)` to read a dependency's `package.json` (e.g., `playwright/package.json`, `crawlee/package.json`), that dependency MUST be declared as a direct dependency in the package's `package.json`. pnpm's strict dependency isolation prevents `createRequire` from resolving transitively-available packages, even if they are installed in `node_modules`. Add the dependency (version `*` is acceptable for metadata-only reads) before using `createRequire` to read its `package.json`.
- **Cross-package imports of specific modules (not the barrel) require a subpath export.** When package B imports a specific module from package A (e.g. `import { helper } from "@warpgogol/site-kernel-checks/methodologies-config"`), package A MUST declare that subpath in its `package.json` `exports` field. Without the subpath export, pnpm strict isolation produces `Cannot find module '@warpgogol/package-A/module-name'`. Add the subpath export before adding the import.
- **Do not export Zod schemas or types without at least one consumer.** Speculative exports (schemas defined "for future use" but not imported anywhere) are dead code. Define schemas internally, and only add an `export` when another module actually imports it. This applies to both barrel exports and subpath exports.

## Generated file writes

- Always use `writeFileIfChanged` from `@warpgogol/site-kernel` (re-exported from `@warpgogol/forge/utils`, RFC-0345) for generated file writes — both text and binary. It accepts `string | Uint8Array` and skips the disk write when content is byte-identical to the existing file.
- Do NOT use raw `writeFile` from `node:fs/promises` for generated files. Raw `writeFile` always writes, creating git churn and LFS bloat on every regeneration cycle.
- For binary generated files (PNG, icons), pass `Buffer` directly — `writeFileIfChanged` compares bytes via `Buffer.compare`.

## Ownership boundaries

| Package | Responsibility |
| --- | --- |
| `site-kernel` | Framework-free runtime, discovery, registry, and CLI primitives |
| `forge` | Portable governance skills and command modules (RFC-0374). `src/` is portable (no kernel imports); `os/compass/` and `os/werkstatt/` are fully autonomous (RFC-0556 — handlers inlined, no `@warpgogol/*` imports); other `os/` modules may use dynamic kernel imports. Exports `forgeRfcModule`, `forgeWorkflowModule`, `forgeNamingModule`, `forgeCompassModule`, `forgeWerkstattModule`, `forgeCoreModule`, `forgeSessionModule`, `forgeMissionModule` and 35 skills. |
| `site-kernel-astro` | Astro-specific path conventions (thin adapter) |
| `site-kernel-content` | Markdown file collection, YAML frontmatter parsing, and semantic site model loading. Content reference resolution uses the RFC-0527 index-based resolver from `@warpgogol/share/content-reference` (RFC-0529). |
| `site-kernel-checks` | Content validation, Compass scaffolding inventory, and the `createStandardCheckModule` factory for zero-boilerplate app onboarding. See `packages/os/site-kernel-checks/docs/check-module-guide.md` for wiring instructions. |
| `site-kernel-codegen` | File generation: icons, open-source page, Compass backfill, content reference index (RFC-0527), content reference migration (RFC-0529) |
| `site-kernel-changelog` | AI-powered changelog generation pipeline |
| `site-kernel-deploy` | Workspace export to client directories |
| `site-kernel-integrity` | Build artifact hashing, signing, verification, and kernel-command adapters |
| `fingerprint` | RFC-0364 semantic fingerprint package and hash governance. Two entry points: `@warpgogol/fingerprint` (primitives — `byteHash`, `byteHashFile`, `stableStringify`, `stableJsonHash`, no parser deps) and `@warpgogol/fingerprint/semantic` (`fingerprintFile`, `fingerprintTree` with parser-backed normalizers for TypeScript, Astro, CSS, JSON, JSONC, YAML, Markdown). RFC-0656 adds `mode: "stable"` for deterministic dist tree hashing (PDF, source map, JSON timestamp normalization). All project hashes use this package; no ad hoc hashing helpers outside it. |
| `check-core` | Schema-and-logic package for the check-warpgogol ecosystem. Zod schemas for check runs, evidence graphs, reports, action packs, audience profiles, safety validation, and target configuration. Also exports deterministic builders (`makeCheckReport`, `makeAgentAction`, `makeAgentActionPack`, `renderReportHtml`, `makeRunArtifact`, `makeRunId`), diagnostic collectors (`collectDeterministicDiagnostics` etc.), run-path helpers (`runRelDir`, `runRelPath`, `findWorkspaceRoot`), and `containsSecretLikeText`. `findWorkspaceRoot` uses `node:fs` — Node-only; Cloudflare Workers consumers must read the env var directly. |
| `check-runner-node` | Playwright-based evidence capture for the check-warpgogol ecosystem. Exports `captureSiteEvidenceGraph` and `CHECK_RUNNER_INFO`. Uses `byteHash` from `@warpgogol/fingerprint` directly (prefixed format). |
| `site-kernel-handoff` | RFC-0221 internal site handoff: bundle validation, thin bundle packing (Compass-complete authored partition + golden validation pack), version-aware absorb with catch-up report, ecosystem version comparison, capability diffing, forward migrator registry, and materialization (inject authored set → delegate regen to `build.prepare`/`build.check` → golden-pack diff). RFC-0473: owns the canonical Bordbuch command family (`bordbuch.append`, `bordbuch.validate`, `bordbuch.status`, `bordbuch.generate`, `bordbuch.repair`, `bordbuch.commit`) in `src/bordbuch/`. |
| `site-kernel-audit` | Deterministic + LLM content audit engine (RFC-0074). Consumed by `site-kernel-checks`; not consumed by apps at build time |
| `share` | App-agnostic utilities: entity-ID normalization, i18n helpers, base schemas, browser scripts, `buildPage()`, and the `@warpgogol/share/integration` hub contracts (`IntegrationEvent`, destination/CRM adapters, QStash/Redis EU delivery, funnel + lifecycle). **Before writing any of these in an app, import from `@warpgogol/share`.** See `packages/share/AGENTS.md`. |
| `content-source` | RFC-0141 Content Source Provider port: the single named seam for where content + assets come from. Ships `ContentSourceProvider` / `AssetRef` / `ResolvedAsset` contracts + the reference filesystem adapter. Import `getEntry`/`getCollection` from `@warpgogol/content-source/astro`, never `astro:content`. |
| `ui` | Shared UI: LordIcon JSON assets, generated icon components, and promoted Astro sections/components in `src/sections/<name>/` and `src/components/<name>/`. Each subdir contains `.astro`, colocated `.css`, `.manifest.yaml`, and optionally `.client.ts` for component-scoped client scripts (RFC-0031). |
| `ontology` | Closed UI taxonomy: `UniLayer`, `UniIntent`, `UniIndustryFit` enums, `manifestSchema` Zod validator, cosmic catalogs, archetype registry (Zod-validated at import), and platform operations schemas (`@warpgogol/ontology/operations` — handoff, sternsystem, werkstatt, mission, release, leitstand, notausgang, materialization, artifact-store, naming-policy). **Add new intent/industry values here first; do not use freeform strings in manifests.** |
| `tokens` | CSS-first design token package. `src/tokens.css` exports `:root { --ds-* }` studio defaults. Per-app token overrides are forbidden — all visual variation flows through studio defaults + the declared biome. TypeScript `src/index.ts` exports `TOKEN_NAMES`, `TOKEN_CATEGORIES`, and `DesignToken` for tooling. |
| `pbp` | Public Business Profile (PBP) entity envelope, namespace constants, URI validation, schemas, loaders, compiler, and semantic projections (RFC-0399, `pbp/*@1`). Exports `PbpEntity`, `PbpEntityStatus`, `PbpGovernance`, `PbpEntityRef`, `PbpIdentityRelation`, `pbpSchemaId`, `validateSchemaId`, `validatePbpUri`. PBP is the canonical business layer (DNA-20 superseded by RFC-0471). `buildPageSemanticModel` and `buildPbpSemanticProfile` are exported from `@warpgogol/pbp/semantic-profile`. People records now live in a standalone `people` content collection (`src/content/people/{lang}/`). |
| `faq` | Pluggable FAQ content collection (RFC-0475). Zod schema (`faqSchema` with `.loose()`), Astro collection factory (`createFaqCollection`), loaders (`getFaqEntries`, `getFaqEntriesByTags`), and semantic mapping helper (`toSemanticFaqEntries`). Content lives at `src/content/faq/{lang}/`. Validated by `faq.validate` in `site-kernel-checks`. |
| `surface` | RFC-0192 Programmatic Surface route-source port: framework-free `PageSurfaceProvider` contract + axis-generic eligibility engine + Blueprint contract/assembly. Pure functions only — all I/O lives in the `surface.generate`/`surface.validate` kernel commands. `decision-composer.ts` centralizes all indexability gate logic (demand, evidence, substance, freshness, budget) via `composeIndexDecision` + pure `evaluate*Gate` functions. Governance and operational schema bags (breaker, evidence-records, fleet, governance, visibility, module-context) are re-exported as explicit named exports from `index.ts`; the former `governance/index.ts` sub-barrel was removed. `blueprint-types.ts` holds the Blueprint type definitions extracted from `blueprint.ts`. `geo.ts` renders Markdown twins via a `blockTwinRegistry` (extensible per block type). `surface.generate` (in `build.prepare`, after `entitlements.resolve`) expands entitled Blueprints into `src/surface.generated.json`; `@warpgogol/share` route registry folds those virtual entries in behind the `pseo` entitlement (fail-open). A generated page is an ordinary block-declarative `PageEntry`; never add a parallel render path. Blueprints live in `packages/ontology/blueprints/*.yaml` (RFC-0193). The consumer (`expandBlueprint` in `site-kernel-checks/src/surface-expand/expand.ts`) is an I/O orchestrator that calls pure pipeline stages from `pipeline.ts` — each stage is independently testable with in-memory data. RFC-0473: `@warpgogol/surface/io` exports I/O helpers (`loadSurfaceModuleContexts`, `readVisibilityOutcomes`) extracted from `site-kernel-checks` for cross-package reuse by `bordbuch.generate` in `site-kernel-handoff`. RFC-0492: `BlueprintLevel` includes optional `dossier?: BlueprintDossier` field for depth-1 industry dossier configuration (gate thresholds, claim restrictions, doorway/duplicate thresholds); `dossierSchema` (Zod) validates the block. RFC-0496: `BlueprintLevel` includes optional `service?: BlueprintServiceConfig` field for depth-1 service dossier configuration (gate thresholds, claim restrictions); `serviceSchema` (Zod) validates the block. `BlueprintLinking` includes optional `parent?: BlueprintLinkingParent` for cross-surface parent linking (e.g. website-service → website-local depth-1). |
| `growth` | Vendor-agnostic event/funnel/experiment runtime (RFC-0027). Apps call `emit()` only; `<GrowthProvider>` boots an adapter resolved from `system.md growth.vendor.adapter`. The null adapter is built-in (`src/null-adapter.ts`); the host (`<GrowthProvider>`) owns the static `import()` loader map (`GrowthAdapterLoaders`) so `@warpgogol/growth` never depends on adapter packages (no workspace cycle). `KNOWN_ADAPTER_IDS` in `src/adapter.ts` is the single source of truth — the validator `growth.vendor.resolve` in `site-kernel-checks` imports it directly. Keep the provider loader map in sync with `KNOWN_ADAPTER_IDS` when adding adapters. |
| `growth-adapter-matomo` | Concrete `GrowthAdapter` implementation for Matomo analytics over first-party proxy (RFC-0305). Resolved via static `import()` in the host's `GrowthAdapterLoaders` map (`provider.astro`); the app's `astro.config.mjs` may need a Vite alias when the adapter package is consumed via workspace symlinks. |
| `chat` (+ `chat-adapter-uchat` / `chat-adapter-null`) | RFC-0175 consent-gated chat widget port: `ChatWidgetAdapter` contract (self-describing via `requiredOptions` + `vendorOrigins`) + click-to-load loader + closed `CHAT_ADAPTER_IDS` + build-time `CHAT_ADAPTER_METADATA` catalog (for Node-side validators). Adapter packages depend on `chat`; the host (`@warpgogol/ui`) owns the static `import()` loader map. Never depend on an adapter from `chat` itself (workspace cycle). |
| `integration-adapter-stripe` | RFC-0191 Stripe billing adapter: webhook signature verify + `Stripe → IntegrationEvent` mapping (a first-party source) + an injectable billing client. No Stripe SDK (raw `fetch` + `node:crypto`); secrets are injected, never `astro:env`. Consumed by `@warpgogol/ui` (`/api/stripe-webhook`). |
| `integration-adapter-supabase-crm` | RFC-0176/0186 Supabase CRM-buffer `DestinationAdapter` (Lagebild MVP, `kind=crm`, `vendor=supabase-buffer`). Writes the event into the buffer + outbox; the shared `services/lagebild-sync-worker/` does the async Pipedrive sync. Never calls Pipedrive directly. |
| `passport` / `nebula` / `star-map` | Cosmic Passport pipeline (RFC-0028). `passport.emit` writes signed `dist/.well-known/cosmic-passport.json`; `nebula.compute` writes `nebula-score.json`; `star-map.render` writes `cosmic-star-map.svg`. |
| `agent-gate` | RFC-0290 Agent Surface runtime: a stateless MCP endpoint (pinned `PINNED_MCP_PROTOCOL_VERSION`, no SDK dependency) + direct HTTP action handlers, instantiated per site from its generated Agent Surface Manifest + active `packages/ontology/capabilities/*.yaml` records. `ports.ts` keeps the core framework-agnostic; `astro.ts` is the only astro-aware module (wires QStash publish + self-fetch knowledge reads). Never hand-edit the generated `src/pages/api/agent/**` route files in an app — they are thin re-exports from `@warpgogol/agent-gate/astro`, regenerated by `agent.routes.generate`. `agent.gate.fixtures.run` is the conformance regression gate for any protocol change. |
| `studio-gate` | RFC-0555 Studio Gate MCP server: stdio transport for site owner content editing with mission lifecycle. Exposes 12 tools (workpiece.read, workpiece.write, 10 mission/release/leitstand commands) via MCP. Proxies to Site OS commands via child_process. Uses `WERKSTATT_ROOT` env var. Injects `wg-site-content-edit` SKILL.md as `serverInfo.instructions`. ADR-0005: build-triggering tools (mission.validate, mission.build) are routed through an in-memory `BuildQueue` (semaphore-based, `STUDIO_GATE_BUILD_CONCURRENCY` env var, default 2) to limit concurrent builds per Werkstatt VM. Distinct from `agent-gate` (HTTP/JSON-RPC for public-facing agents). |
| `warpgogol-skills` | Warpgogol-specific skill pack (RFC-0539, private). Skills live under `skills/wg-*/` with the `wg-` prefix and are declared in `forge.yaml` `skillPacks`. `forge.init` syncs them to `.agents/skills/`; `forge.skill.validate` enforces SKILL-01..15; `forge.doctor` checks for stale copies. No standalone sync script — `forge.init` is the single sync path. |
| `os/site-kernel*` | Framework-free CLI core, content loaders, validators (DNA/biome/cosmic/system/manifest), codegen, changelog, deploy, integrity, onboarding scaffold. Each app embeds the kernel via `tools/kernel.config.ts`. |

- App-specific paths, content contracts, and business rules should stay in the app unless they have become stable shared abstractions.
- Generated icon trees under `packages/ui/src/icons/gen/**` must be treated as derived output.

## Cosmic-name maps in `share`

`packages/share/src/page.ts` is the **single source of truth** for the cosmicName → import-path mapping consumed by `buildPage()`:

- `PLANET_IMPORT_PATHS` — every Planet (section archetype) PLUS the five PASSPORT-RESERVED moons that are invoked as page-blocks on `cosmic/passport` and `cosmic/star-map` routes.
- `MOON_IMPORT_PATHS` — only Moons used as **shell-level components** (background, header, footer slots in `system.md pages[].shell`).

When adding a section to `packages/ui/src/sections/<slug>/`, register its `cosmicName` (which lives in `<slug>-section.manifest.yaml`) in `PLANET_IMPORT_PATHS`. When adding a shell-eligible component, register it in `MOON_IMPORT_PATHS`. A name in a manifest without a matching entry in these maps fails at runtime with `[buildPage] No component import path registered for ...`.

The five passport-reserved moons (`Methone`, `Despina`, `Klarissa`, `Bianca`, `Adrastea`) are reserved only for the five passport components in `packages/ui/src/components/{passport-header,pulsar,passport-score-grid,passport-provenance,passport-star-map}/`. Do not assign them to any other component manifest.

## Constellation slots — one cosmicName per slot

Constellation YAMLs in `packages/ontology/constellations/*.yaml` declare an ordered sequence of slots. **Each slot accepts exactly one `cosmicName`** — the schema is `cosmicName: PlanetName`, never `PlanetName | PlanetName[]` and never an array. Schema simplicity is the contract.

If a constellation should accept more than one Planet at the same narrative position (e.g. an "approach-style card grid" slot AND an alternative "feature-list" slot), model them as **two separate slots** in sequence, each marked `optional: true`. Validators report missing optional slots as warnings, so a page may include either, both, or neither without failing the build.

```yaml
# ✅ Correct — two optional slots, content picks one
slots:
  - cosmicName: Titan
    label: Approach (card grid)
    optional: true
    rationale: ...
  - cosmicName: Mimas
    label: Team (alternative narrative)
    optional: true
    rationale: ...

# ❌ Wrong — never use arrays/unions for cosmicName
slots:
  - cosmicName: [Titan, Mimas]   # FORBIDDEN
```

Removed/legacy archetypes: `dna-section` (cosmicName `Io`) was a test scaffold and is gone. The `Io` entry in `PlanetCatalog` is preserved (real Jovian moon name) but is intentionally unmapped in `PLANET_IMPORT_PATHS`. Do not reintroduce a `dna-section`; if you need a similar narrative slot, use `approach-section` (Titan).

## Onboarding-time ecosystem extensions (RFC-0071..0078)

See `packages/os/site-kernel-onboarding/AGENTS.md` for the full onboarding specification. Key components: site families catalog (`packages/ontology/site-families/<id>/`), section archetype catalog (`packages/ontology/archetypes/sections/<id>.yaml`), extended biome schema (`packages/ontology/biomes/<id>.yaml`), pipelines (`APPS_CHECK_PIPELINE`, `PACKAGES_CHECK_PIPELINE`, `APPS_BUILD_PREPARE_PIPELINE`), and generation-first apps (RFC-0078). All validated by their respective `*.contract.validate` commands.

## File naming

- All source files in `packages/*` use **kebab-case**: `checks.ts`, `compass.ts`, `structure.ts`.
- **No underscores** in filenames. Hyphens separate words for lowercase files.
- Exception: files containing `config` or `module` in the name follow their ecosystem convention.
- Exception: ALLCAPS documentation files (`AGENTS.md`, `README.md`) are intentionally uppercase.

Enforced by `naming.convention.lint` (workspace-scoped OS command) and `naming.pages.lint` (app-scoped). Full naming rules: `packages/os/site-kernel/docs/naming-conventions.md`.

## Implementation rules

- Do not hardcode one app's file layout into generic package APIs unless the package is explicitly an adapter for that layout.
- **Cookies are forbidden** repository-wide. No package may read, write, or depend on `document.cookie`, `Set-Cookie`, or cookie-parsing libraries. Use `localStorage` (client) or `unstorage` (server) for persistence.
- When a package generates boilerplate into `apps/*`, keep the generator thin: store multi-line templates under `src/templates/<generator-name>/`, mirror the target app path in the template path, and prefer token replacement over inline string builders.
- `site-kernel-onboarding` should write only the minimal app skeleton and client-editable seed content directly; engineering-only routes, styles, scripts, public infrastructure, and `tools/` wiring should be delegated to shared generators such as `site-kernel-codegen` and `site-kernel` `kernel.wire`.
- **Animated icon + text alignment (RFC-0100):** whenever a section or component renders an animated icon (e.g. LordIcon) next to text in a flex row, set `align-items: center` on the flex container so the icon and text are vertically centered relative to each other. Do not use `align-items: flex-start` for this pattern. Default icon size is **24 px** when no explicit `size` is provided by content; content authors may override via `icon.size`. All list-based sections use `StandardListItem[]` with optional per-item `icon?: VendorIconConfig`; no section-level icon fallbacks.
- In `packages/ui/src/components/<slug>/`, a new shared component is not complete until it has its colocated `.manifest.yaml`; agents must add the manifest in the same change as the new `.astro` file and follow the nearest `packages/ui/AGENTS.md` component contract.
- **Ports & adapters (growth / content-source / integration / chat).** A vendor capability is a closed port contract + one adapter package per vendor + a closed id catalog. Never import a vendor SDK in `apps/*` or in section code — vendor specifics live ONLY in the adapter package. Unknown ids `console.warn` + no-op (enum-dispatch). To add a vendor: add the adapter package + the catalog entry; sections, routes, and validators are unchanged.
  - **New chat vendor (RFC-0175):** implement `ChatWidgetAdapter` (`load()` injects the vendor script lazily; `open()`); add the id to `CHAT_ADAPTER_IDS`; register a STATIC `import()` in the **host's** adapter-loader map (the chat-widget section client passes `ChatAdapterLoaders` to `bindChatLauncher`). The loader map lives in the host (`@warpgogol/ui`), NOT in `@warpgogol/chat` — the port package must not depend on the adapter packages (that would form a workspace cycle). `load()` MUST be called only after user activation — never render the vendor `<script>`/iframe in server output (RFC-0177 `consent.activation.validate`). Options in `system.md integrations.chat` are PUBLIC only — no secrets.
  - **New destination (RFC-0176):** implement `DestinationAdapter` (`kind`, `vendor`, `requiredSecrets`, `route(event, secrets)`) in `@warpgogol/share/integration`, register it in `DESTINATION_ADAPTERS`, and add the kind/vendor to the catalog. `gogol-adapter` reads secrets via the injected bag (never `astro:env` in the adapter). The delivery queue is in-flight only — never persist event payloads (no lead/conversation datastore; RFC-0177 clause 4). Credentials/OAuth tokens MAY be stored server-side; visitor PII may NOT.
  - **Programmatic Surface — a route-source port (RFC-0192..0199).** `@warpgogol/surface` is a closed port (`PageSurfaceProvider` + axis-generic engine), not a vendor port: it contributes generated routes to the registry alongside authored `system.md pages[]`, gated by the single `pseo` entitlement. Page families are **Blueprints** (`packages/ontology/blueprints/*.yaml`) — the adapter layer; the engine is business-agnostic. **`@warpgogol/surface` MUST NOT depend on `@warpgogol/share`** — share consumes surface's route types, so a back-dependency forms a workspace cycle (verified by `turbo run build:check`). Surface therefore declares its own `PageEntry`/`SurfaceBlock`. Surface engine code is pure (no Astro, no Node I/O); all I/O lives in the `surface.*` kernel commands. Generated pages are baked block-declarative `PageEntry` objects — never hand-author them, never add a parallel render path, and never edit the generated `src/surface.generated.json` / `.surface-cache/` artifacts. See `packages/surface/README.md`.
  - **Variable-specifier dynamic imports (RFC-0486).** Variable-specifier dynamic imports (e.g. `import(_adapterSpecifiers[...])`) in `packages/*` MUST include `/* @vite-ignore */` inside the `import()` call, placed before the variable expression, to suppress Vite's "Unable to analyze dynamic import" warning. This is the official Vite mechanism for intentional dynamic imports that cannot be statically resolved.
- **`import.meta.env` is Vite-only.** Packages type-checked with `tsc --noEmit` outside Vite (e.g. `packages/share`, `packages/os/*`) must not use `import.meta.env.DEV` or similar — `import.meta.env` is not typed in plain Node/tsc contexts and causes `Property 'env' does not exist on type 'ImportMeta'` build errors. Use `process.env.NODE_ENV !== "production"` instead, which works in both Vite and Node contexts. See `packages/share/src/text-normalize.ts:538` for the corrected pattern.

## Universal authored import/export contract

- Every relative `import` or `export ... from` inside `packages/**/*.ts(x)` must use the on-disk `.ts` or `.tsx` extension: `./foo.ts`, never `./foo.js` or `./foo`.
- `tsconfig/base.json` enables `allowImportingTsExtensions`, and `tsconfig/node-lib.json` enables `rewriteRelativeImportExtensions`; build-emitting packages author `.ts` and let TypeScript rewrite emitted `dist/` imports to `.js`.
- Do **not** switch package source imports to `.js` to appease a local build error. Fix the package tsconfig shape so it extends the shared base or node-lib config.
- Package `exports` may still point to `dist/*.js` for build-backed runtime output, or to source `.ts` / `.astro` surfaces for source-consumed packages. This does not change the authored local-import rule.
- When changing generated app code, edit the owning template or generator in `packages/*`; do not hand-edit generated files in `apps/*`.
- Before editing a generated app file, identify its single owning command in `generator.ownership.lint` / `GENERATOR_OWNERSHIP_MAP`. Example: `apps/*/src/pages/[lang]/[...slug].astro` is owned by `routes.generate`, so changes belong in `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/pages/[lang]/[...slug].template.astro`, followed by regeneration.

## Shared helpers catalog — import, do not re-implement

RFC-0303 consolidated the fs/text primitives that used to be copy-pasted per file across `packages/os/*`. Import the canonical helper instead of writing a local `readdir` walker, existence check, JSON reader, line/column calculator, or workspace-package scanner:

| Helper | Import from | Notes |
| --- | --- | --- |
| `collectFiles(root, options)` | `@warpgogol/share/fs` | Recursive `readdir` walker. `options.extensions` filters by suffix; `options.ignore(name)` skips an entry by name (default: `-*`/`old-*`); `options.withDirs` includes directory paths too. Server-only. |
| `fileExists(path)` | `@warpgogol/share/fs` | Best-effort existence check (`stat`, `false` on any error). |
| `readJsonFile<T>(path)` | `@warpgogol/share/fs` | Reads and `JSON.parse`s a file; throws on missing file or parse error. |
| `readYamlFile<T>(path)` | `@warpgogol/share/fs` | Reads and `yaml.parse`s a file; throws on missing file or parse error. |
| `getLineColumn(text, index)` | `@warpgogol/share/text-position` | Pure, browser-safe offset → 1-based `{ line, column }`. |
| `collectMarkdownFiles(dir)` | `@warpgogol/site-kernel-content` | `.md`-only wrapper over `collectFiles`; keeps its existing name/signature. |
| `discoverWorkspacePackages(root)` | `@warpgogol/site-kernel` | Canonical pnpm-workspace-aware package discovery (returns `{ packages, diagnostics, ... }`). |

Two structural guard lints enforce this catalog and ratchet down the pre-RFC-0303 oversized-file backlog:

- **`fs.walk.lint` (WALK-01, error)** — fails when a `packages/` source file declares its own nested recursive `readdir` walker instead of importing `collectFiles`. If a walker genuinely has a different contract (e.g. it walks something other than the filesystem, or is intentionally depth-bounded), add a `// fs.walk.lint: allow — <reason>` comment directly above the declaration rather than duplicating the primitive.
- **`dedup.helper.lint` (DEDUP-01, error)** — fails when any identifier in the table above is re-declared locally (by name) instead of imported. A differently-named local wrapper that internally delegates to the canonical helper is fine.
- **`file.size.lint` (SIZE-01, warning)** — flags a `packages/` `.ts`/`.tsx` file exceeding 600 physical lines, against a shrink-only ratchet baseline (`file-size-lint.baseline.generated.yaml`). New files above threshold warn from day one; regenerate the baseline with `--write-baseline` after a split lands.

When you add a new cross-cutting build-time fs/text/workspace helper, add it to this table **and** to `dedup.helper.lint`'s reserved-identifier map (`packages/os/site-kernel-checks/src/dedup-helper-lint.ts`) so the next agent can't reintroduce the duplication class — never define it inline in a validator.

## Compass compliance

Compass source-file markup (`MODULE_CONTRACT` + `CHANGE_SUMMARY`, two-block contract per RFC-0348) is required for non-trivial authored files in `packages/` under the same policy as `apps/` — see `docs/source-markup.xml`.

Use these commands to apply or remove Compass markup across packages (RFC-0015):

```sh
rtk pnpm exec site-kernel run compass.annotate --packages
rtk pnpm exec site-kernel run compass.clear --packages
rtk pnpm exec site-kernel run compass.markup.migrate --packages   # v1 → v2 migration (RFC-0348)
rtk pnpm exec site-kernel run compass.invariant.add --file <path> --text "<invariant>"  # RFC-0351
```

`compass.annotate` is now deterministic (RFC-0350): it inserts `TODO(compass)` sentinel skeletons, not LLM-generated content. Fill the sentinels manually or via an agent. `compass.landmarks` has been removed (RFC-0350).

`--packages` and `--site` are mutually exclusive. Existing `--site <name>` invocations are unchanged.

## Type-safety discipline

- **Never use `as any` to mask type errors when calling workspace-internal APIs** such as `executeKernelCommand`, `executeKernelPipeline`, or any shared-package public surface. These APIs have stable TypeScript types; `as any` is an anti-pattern that silently drops properties (e.g., passing `args:` instead of `argv:`) and causes runtime bugs that static analysis could have prevented.
- If the type system rejects a call, fix the call site or improve the shared type, never bypass with `as any`.
- ESLint enforces this: `local-rules/no-as-any` is `error` for all `packages/**/*.ts`. Run `pnpm lint:packages` to verify.

## Validation

- Run package-scoped validation from the repository root with `pnpm --filter <package> ...`.
- Prefer each package's own `build:check`, `build`, and `test` scripts.
- **Testing (RFC-0347):** All packages use `vitest` as the sole test runner and `fast-check` for property-based testing (DNA-41). Test files use `import { test, expect } from "vitest"` — never `node:test` or `node:assert/strict`. PBT files use the `.pbt.test.ts` suffix. See the root `AGENTS.md` "Testing policy" section for the full contract.

### Test file layout

- All test files **must** live in `src/tests/` inside each package — never at the package root or alongside source files.
- Unit test files use the `.test.ts` suffix; property-based test files use the `.pbt.test.ts` suffix.
- Each package with tests has a `vitest.config.ts` at its root specifying `environment: "node"` and `include: ["src/**/*.test.ts"]`.
- **Mock hygiene:** when replacing an import in source code, check that test mocks do not still mock the old function. `fo-review` flags dead mock entries as a structural finding (Axis A — Duplicated Code / dead code). Remove mock factory entries for functions that are no longer imported by the module under test.

### Test scripts and dependencies

- Every testable package declares `"test": "vitest run"` and `"test:watch": "vitest"` in `package.json` scripts.
- Dev dependencies: `vitest`, `fast-check`, `@types/node`, `typescript` (versions pinned per workspace).
- The `gogol.testSignal` field in `package.json` tracks coverage status:
  - `"signal": "direct"` — package has its own vitest tests that run directly.
  - `"signal": "skipped"` — tests are deferred; include `rationale` and `reviewAfter` fields.

### Adding tests to a new package

1. Add `vitest`, `fast-check`, `@types/node`, and `typescript` to `devDependencies`.
2. Add `"test": "vitest run"` and `"test:watch": "vitest"` to `scripts`.
3. Create `vitest.config.ts` with node environment and `src/**/*.test.ts` include pattern.
4. Create `src/tests/` directory and add `.test.ts` (unit) and/or `.pbt.test.ts` (PBT) files.
5. Update `gogol.testSignal` from `"skipped"` to `"direct"`.
6. Run `pnpm install` then `pnpm --filter <package> test` to verify.
7. Commit with a descriptive message listing test counts.

### PBT conventions

- Use `fc.assert(fc.property(arbitrary, predicate))` for property-based tests.
- Use `fc.string()` with `.map()` to sanitize characters that could break HTML/XML/regex (e.g. strip `<`, `>`, `"`, `'`).
- Use `fc.integer()`, `fc.float({ noNaN: true })`, `fc.record()`, `fc.array()`, `fc.constantFrom()` for structured inputs.
- Use `fc.anything()` cautiously — `stableStringify` and similar utilities may not handle `undefined`/`NaN`/functions.
- PBT tests should verify universal properties (determinism, bounds, invariants, round-trip) rather than specific cases.
- If a package change affects app consumers, validate the package first and then the affected apps.
- **Test temp directories:** Unit tests that create temp directories (via `mkdtemp`/`mkdtempSync`) MUST use the `tmp-*` naming pattern (e.g. `tmp-leitstand-XXXX-`, `tmp-close-evidence-XXXX-`). These directories are gitignored via `tmp-*/` in `.gitignore`. Agents MUST clean up `tmp-*` directories they create during a session — the session-end workflow automates this, but agents should also clean up manually if a session is not formally closed.
- **RFC-0189 `ui.i18n.lint`:** Shared UI components in `packages/ui/src/{sections,components}/` must not contain hardcoded human-readable strings. The validator scans `.astro` and `.ts` files for:
  - `I18N-01` — string literals with spaces and letters that are not routed through `resolveLabel`, `props`, or `siteLabels`.
  - `I18N-02` — `resolveLabel` fallbacks that contain full sentences (>3 words or sentence punctuation).
  - Agents must move hardcoded text into `site/{lang}/labels.md` or section props; empty-string fallbacks are acceptable only when the key is guaranteed to be present.
