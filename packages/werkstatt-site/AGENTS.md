# `@warpgogol/werkstatt-site` — Agent Guide

RFC-0774/0775: Werkstatt site plugin — Astro stack engine modules and domain layer. Consolidates `site-kernel-astro`, `site-kernel-checks`, `site-kernel-codegen`, `site-kernel-content`, `site-kernel-onboarding`, `site-kernel-audit`, `site-kernel-check-warpgogol`, `site-kernel-changelog` renderers, and `site-kernel-deploy` (RFC-0774) plus 27 domain packages (RFC-0775) into a single plugin package implementing `werkstatt/plugin@1`.

**Workspace type:** Package

This is a **package** workspace. Expose stable typed APIs. Do not import from apps or services.

## Entry points

| Entry point                                        | Module                                  |
| -------------------------------------------------- | --------------------------------------- |
| `@warpgogol/werkstatt-site`                        | `./src/index.ts` (plugin entry point)   |
| `@warpgogol/werkstatt-site/paths`                  | `./src/paths/index.ts`                  |
| `@warpgogol/werkstatt-site/content`                | `./src/content/index.ts`                |
| `@warpgogol/werkstatt-site/codegen`                | `./src/codegen/index.ts`                |
| `@warpgogol/werkstatt-site/checks`                 | `./src/checks/index.ts`                 |
| `@warpgogol/werkstatt-site/checks/module`          | `./src/checks/module.ts`                |
| `@warpgogol/werkstatt-site/checks/check-warpgogol` | `./src/checks/check-warpgogol/index.ts` |
| `@warpgogol/werkstatt-site/onboarding`             | `./src/onboarding/index.ts`             |
| `@warpgogol/werkstatt-site/onboarding/module`      | `./src/onboarding/module.ts`            |
| `@warpgogol/werkstatt-site/testing`                | `./src/testing/index.ts`                |
| `@warpgogol/werkstatt-site/testing/module`         | `./src/testing/module.ts`               |
| `@warpgogol/werkstatt-site/testing/smoke`          | `./src/testing/smoke/index.ts`          |
| `@warpgogol/werkstatt-site/testing/contract`       | `./src/testing/contract/index.ts`       |
| `@warpgogol/werkstatt-site/testing/e2e`            | `./src/testing/e2e/run-e2e-tests.ts`    |
| `@warpgogol/werkstatt-site/audit`                  | `./src/audit/index.ts`                  |
| `@warpgogol/werkstatt-site/changelog`              | `./src/changelog/index.ts`              |
| `@warpgogol/werkstatt-site/deploy`                 | `./src/deploy/index.ts`                 |

## Scripts

| Script        | Command                                   |
| ------------- | ----------------------------------------- |
| `build`       | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `build:check` | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `test`        | `vitest run`                              |
| `test:watch`  | `vitest`                                  |

## Package architecture

- This package owns the Werkstatt site plugin: Astro path conventions, content validation, codegen, onboarding, audit, check-warpgogol, changelog renderers, and deploy adapter.
- The plugin implements `werkstatt/plugin@1` (RFC-0770) with `profileId: "astro-typescript-turborepo"`.
- The plugin registers site-stack engine modules via `moduleLoaders` and provides deploy adapters.
- RFC-0776 completed the migration: old packages (`packages/os/site-kernel-*`) are deleted. All imports now go through `@warpgogol/werkstatt-site` subpath exports.
- Engine→stack imports are inverted through plugin hooks (RFC-0774/0775).

## Module layout

| Module | Source (RFC-0774) | Plugin contract slot |
| --- | --- | --- |
| `src/paths/` | `site-kernel-astro` | `paths: StackPathConventions` |
| `src/checks/` | `site-kernel-checks` | `moduleLoaders` (validators), `hooks.checkGate` |
| `src/codegen/` | `site-kernel-codegen` | `moduleLoaders`, `hooks.materialize` |
| `src/content/` | `site-kernel-content` | `moduleLoaders` (collections, system.md) |
| `src/onboarding/` | `site-kernel-onboarding` | `hooks.scaffoldProject`, templates |
| `src/audit/` | `site-kernel-audit` | `moduleLoaders` |
| `src/checks/check-warpgogol/` | `site-kernel-check-warpgogol` | `moduleLoaders` (check-warpgogol ecosystem) |
| `src/deploy/` | `site-kernel-deploy` | `deployAdapters` |
| `src/changelog/` | `site-kernel-changelog` renderers | `moduleLoaders` |
| `src/testing/` | RFC-0825: post-deploy smoke testing, RFC-0827: site-service contract testing, RFC-0828: site E2E testing with Playwright | `moduleLoaders` (smoke run commands, contract validate/list, E2E run command) |

## Check commands

Notable check commands registered by this package:

- `template.imports.validate` (RFC-0557) — validates template imports against root devDependencies.
- `workpiece.imports.validate` (RFC-0557) — validates workpiece imports against root node_modules.
- `template.deps.drift` (RFC-0800) — compares `dependencies` and `devDependencies` between workpiece `package.json` and `package.template.json`. Emits `TEMPLATE-DEPS-DRIFT-01` for version mismatches and `TEMPLATE-DEPS-DRIFT-02` for missing files. Integrated into `SITES_BUILD_CHECK_PIPELINE` as a safety net for the auto-sync in `mission.close`.
- `template.peer-deps.validate` (RFC-0815) — validates peer dependency constraints in `package.template.json` by resolving the dependency tree via `pnpm install --dry-run --strict-peer-dependencies` in a temp directory. Strips `workspace:*` deps before resolution. Emits `PEER-01` (peer constraint violated), `PEER-02` (template missing), `PEER-03` (resolution failed, warning). Integrated into `SITES_BUILD_CHECK_PIPELINE` after `template.deps.drift`.
- `deployment.gate.validate` (RFC-0803) — validates that non-gated pages do not reference gated pages in navigation, block props, or breadcrumb parent chains. Emits `GATE-01` (navigation), `GATE-02` (block props), `GATE-03` (parentPageId). Integrated into `SITES_BUILD_CHECK_PIPELINE`.
- `ownership.generator.cross-check` (RFC-0810) — cross-references app-scoped `.generate` commands against `GENERATOR_OWNERSHIP_MAP`. Emits `OWN-XCHECK-01` (uncovered generator), `OWN-XCHECK-02` (phantom command reference), `OWN-XCHECK-03` (missing or non-existent module path). Integrated into `SITES_BUILD_PREPARE_PIPELINE` and `SITES_BUILD_PREPARE_DEV_PIPELINE` before `ownership.sync.validate`.
- `contract.validate` (RFC-0827) — validates site-service contract schemas are valid Zod, have both request and response, and are referenced by both site-side and service-side code. Emits CONTRACT-01 (invalid Zod), CONTRACT-02 (missing schema), CONTRACT-03 (site-side not referenced, warning), CONTRACT-04 (service-side not referenced, warning), CONTRACT-05 (one-sided reference, warning). Integrated into `PACKAGES_CHECK_PIPELINE`.
- `contract.list` (RFC-0827) — lists all registered site-service contracts with id, name, direction, version, and description.
- `image.delivery.validate` (RFC-0830) — scans rendered HTML in dist/client/ for responsive srcset presence (IMG-DELIVERY-01), compression budget (IMG-DELIVERY-02), and LCP image optimization attributes via fetchpriority marker (IMG-DELIVERY-04). Supports `image-delivery.config.yaml` escape hatch for per-image rule overrides. Integrated into `SITES_CHECK_POSTBUILD_PIPELINE` after `cloudflare.assets.validate`.

## Domain layer (RFC-0775)

The `src/domain/` directory consolidates 27 site-specific domain packages into a single plugin package. Each domain module is accessible via subpath exports (e.g. `@warpgogol/werkstatt-site/share`, `@warpgogol/werkstatt-site/ui`).

### Domain modules

| Domain | Former package | Key exports |
| --- | --- | --- |
| `src/domain/tokens/` | `@warpgogol/tokens` | Design tokens, `TOKEN_NAMES`, `TOKEN_CATEGORIES` |
| `src/domain/geo/` | `@warpgogol/geo` | Geographic normalization, slug helpers |
| `src/domain/faq/` | `@warpgogol/faq` | FAQ collection schema, loaders |
| `src/domain/passport/` | `@warpgogol/passport` | Content passport signing, DHT, pipeline |
| `src/domain/content-source/` | `@warpgogol/content-source` | Content Source Provider port |
| `src/domain/check-core/` | `@warpgogol/check-core` | Check-warpgogol schemas, builders, diagnostics |
| `src/domain/check-runner/` | `@warpgogol/check-runner-node` | Playwright evidence capture |
| `src/domain/observability/` | `@warpgogol/observability` | Observability stack types |
| `src/domain/nebula/` | `@warpgogol/nebula` | Semantic computation, collection |
| `src/domain/star-map/` | `@warpgogol/star-map` | Star map rendering |
| `src/domain/surface/` | `@warpgogol/surface` | Surface module, I/O |
| `src/domain/studio-gate/` | `@warpgogol/studio-gate` | Studio Gate MCP server |
| `src/domain/ontology/` | `@warpgogol/ontology` | Closed UI taxonomy, cosmic catalogs, schemas |
| `src/domain/share/` | `@warpgogol/share` | App-agnostic utilities, schemas, semantic models |
| `src/domain/pbp/` | `@warpgogol/pbp` | Public Business Profile entity, compiler |
| `src/domain/pbp-rate-adapters/` | `@warpgogol/pbp-rate-adapters` | Rate source adapters (ECB) |
| `src/domain/growth/` | `@warpgogol/growth` | Growth analytics, adapters, provider |
| `src/domain/growth-adapter-matomo/` | `@warpgogol/growth-adapter-matomo` | Matomo adapter |
| `src/domain/integration/` | `@warpgogol/integration` | Integration port, CRM buffer |
| `src/domain/integration-adapter-stripe/` | `@warpgogol/integration-adapter-stripe` | Stripe adapter |
| `src/domain/integration-adapter-supabase-crm/` | `@warpgogol/integration-adapter-supabase-crm` | Supabase CRM adapter |
| `src/domain/chat/` | `@warpgogol/chat` | Chat port |
| `src/domain/chat-adapter-null/` | `@warpgogol/chat-adapter-null` | Null chat adapter |
| `src/domain/chat-adapter-uchat/` | `@warpgogol/chat-adapter-uchat` | uChat adapter |
| `src/domain/ui/` | `@warpgogol/ui` | UI components, sections, LordIcon assets |

### Intra-domain imports

Domain modules import from each other via subpath exports: `@warpgogol/werkstatt-site/<name>` (e.g. `@warpgogol/werkstatt-site/share/content`). Direct relative imports across domain boundaries are forbidden.

### Workshop-wide rewrite

RFC-0776 completed the import sweep. All packages and services now import from `@warpgogol/werkstatt` and `@warpgogol/werkstatt-site` subpath exports. Old `@warpgogol/<name>` packages are deleted.

### Consolidation gotchas (RFC-0775)

- **Relative imports break when files move between directory depths.** When moving a file from `src/archetype-registry.ts` to `src/domain/ontology/archetype-registry.ts`, relative imports like `../archetypes/index.json` must be recalculated — `..` now resolves one level higher. Use `./archetypes/index.json` instead.
- **Do not add `src/**/*.json` to `tsconfig.json` `include`** for this package. It contains 1167 LordIcon JSON assets; including them causes TSC to crash with SIGABRT (out of memory). `resolveJsonModule` resolves JSON imports without explicit inclusion — `src/**/*.ts` is sufficient.
- **Integration tests with isolated tsconfig must declare ambient stubs for Node modules.** When creating integration tests that generate files into a temp directory and run `tsc --noEmit` with `types: []` in the tsconfig (to exclude all `@types/*`), `skipLibCheck: true` does NOT help — `types: []` completely excludes `@types/node`, so `node:path`, `node:url`, and other Node builtins are unresolved. Declare `declare module "node:path" { ... }` ambient stubs in a `stubs.d.ts` file included by the temp tsconfig. See `src/codegen/tests/middleware-chain.integration.test.ts` (ADR-0039) for the reference pattern.
- **`vi.mock` paths are relative to the test file, not the module under test.** When mocking a module from a test in a subdirectory (e.g. `src/checks/tests/foo.test.ts` mocking `src/onboarding/templates.ts`), the `vi.mock` path must be resolved relative to the test file's location (`../../onboarding/templates.ts`), not relative to the module under test (`../onboarding/templates.ts`). Using the wrong relative path causes all tests to fail silently — the mock is never applied.

## Astro component rules

- **Astro module scripts (`<script>` without `is:inline`) cannot access frontmatter variables.** Variables like `lang`, `props`, or any frontmatter-defined name are `undefined` in module scripts because Astro bundles them separately from the component's server-side scope. To pass frontmatter values to client-side scripts, either: (1) use `define:vars={{ { lang } }}` on an `is:inline` script, or (2) read the value from the DOM at runtime (e.g. `document.documentElement.lang`). Discovered during RFC-0782: `initCurrencySelector(container, codes, lang)` threw `ReferenceError: lang is not defined` because `lang` was a frontmatter variable, not a module-scope variable.
- **Never use `/* @vite-ignore */` with variable module specifiers in Astro client scripts.** A variable specifier like `import(/* @vite-ignore */ specifiers["matomo"])` tells Vite to skip bundling, passing the bare module specifier (e.g. `@warpgogol/werkstatt-site/growth-adapter-matomo`) to the browser at runtime. The browser cannot resolve bare specifiers without an import map, causing `TypeError: Failed to resolve module specifier`. Always use static `import()` specifiers (e.g. `import("@warpgogol/werkstatt-site/growth-adapter-matomo")`) so Vite resolves the subpath export and code-splits the adapter into a resolvable async chunk. Discovered in `src/domain/growth/provider.astro` where the matomo adapter loader used `@vite-ignore` with a variable map — a leftover from when adapters were separate packages before the RFC-0775/0776 consolidation.

## Generated file loader rules

- **Loaders of generated files MUST emit `console.warn` on ENOENT with actionable fix instructions.** Loaders like `loadContentRefIndex` and `loadDerivedPrices` return `null` when the generated file is missing. Without a warning, the failure is silent — prices disappear, formula references stop resolving, and the developer has no idea why. Always include the file path, what breaks without it, and the command to regenerate it (e.g. `pnpm exec werkstatt run content.ref-index.generate --site <siteId>`). This is the safety net for direct `astro dev` runs that bypass `mission.preview`'s pre-dev check.

## Testing directory (RFC-0823, DNA-66)

The `src/testing/` directory hosts all workshop test definitions for the five-level testing pyramid:

| Subdirectory | Level | Contents |
| --- | --- | --- |
| `src/testing/unit/` | L1 | Unit tests for service internals |
| `src/testing/integration/` | L2 | Integration tests against dev-deployed Workers |
| `src/testing/contract/` | L3 | Zod contract schemas and bidirectional validation tests |
| `src/testing/e2e/` | L4 | Playwright E2E tests against dev-deployed sites |
| `src/testing/smoke/` | L5 | Smoke endpoint definitions (YAML) |
| `src/testing/helpers/` | — | Shared helpers: `dev-url-resolver.ts`, `test-env.ts`, `wait-for-deploy.ts` |

Tests are versioned with the platform and runnable against any deployment. The dev channel is the canonical test environment. Individual test levels are implemented by downstream RFCs 0824–0829.
