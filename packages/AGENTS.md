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
- Shared UI assets that are reused by multiple apps belong in `packages/werkstatt-site/src/domain/ui`, not in app-local folders.
- **Node-only modules (`node:fs/promises`, `node:path`, etc.) MUST NOT be re-exported from shared barrel files** (`index.ts`) that are imported by client-side code. Vite dev mode does not tree-shake barrel exports — the entire barrel is loaded, pulling Node-only modules into the client bundle and causing "Module node:fs/promises has been externalized for browser compatibility" errors. Use a dedicated subpath export (e.g. `@warpgogol/werkstatt-site/ontology/schemas/manifest-resolver`) for modules that import Node-only APIs. Node-side consumers import from the subpath; client-side consumers import pure schemas from the main barrel.
- **`createRequire(import.meta.url)` under pnpm strict isolation**: when using `createRequire(import.meta.url)` to read a dependency's `package.json` (e.g., `playwright/package.json`, `crawlee/package.json`), that dependency MUST be declared as a direct dependency in the package's `package.json`. pnpm's strict dependency isolation prevents `createRequire` from resolving transitively-available packages, even if they are installed in `node_modules`. Add the dependency (version `*` is acceptable for metadata-only reads) before using `createRequire` to read its `package.json`.
- **Cross-package imports of specific modules (not the barrel) require a subpath export.** When package B imports a specific module from package A (e.g. `import { helper } from "@warpgogol/werkstatt-site/checks/methodologies-config"`), package A MUST declare that subpath in its `package.json` `exports` field. Without the subpath export, pnpm strict isolation produces `Cannot find module '@warpgogol/package-A/module-name'`. Add the subpath export before adding the import.
- **Do not export Zod schemas or types without at least one consumer.** Speculative exports (schemas defined "for future use" but not imported anywhere) are dead code. Define schemas internally, and only add an `export` when another module actually imports it. This applies to both barrel exports and subpath exports.
- **Do not duplicate canonical regex patterns across packages.** When a regex pattern (e.g. `BRACELESS_SCAN_PATTERN`, `PURE_REF_PATTERN`) is defined in `@warpgogol/werkstatt-site/share`, import it from there — do not redefine it elsewhere. Duplicated copies diverge over time (e.g. the field path pattern `[a-zA-Z0-9_.-]+` was fixed to `[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*` in share to avoid matching trailing sentence periods, but copies in checks and codegen kept the old pattern). If the pattern is not exported, add a subpath export and import it.
- **`ecosystem.commit` runs `pnpm install` as a post-commit deps status check.** When deleting packages, remove all references to them from every `package.json` in the workspace (root, `packages/*/`, `services/*/`, `missions/*/workpiece/`) before running `ecosystem.commit`. Otherwise `pnpm install` fails with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`, the post-commit hook crashes, and the commit appears to succeed but is not recorded. Verify with `pnpm install --no-frozen-lockfile` first.

## Comment safety

- **Never write glob patterns containing `*/` inside `/* */` block comments** (e.g. `MODULE_CONTRACT`, `CHANGE_SUMMARY`). The `*/` sequence in `**/*.css` prematurely terminates the comment, causing TypeScript parse errors. Write "CSS files" or use `*.css` without the `**/` prefix instead.

## Generated file writes

- Always use `writeFileIfChanged` from `@warpgogol/werkstatt` (re-exported from `@warpgogol/forge/utils`, RFC-0345) for generated file writes — both text and binary. It accepts `string | Uint8Array` and skips the disk write when content is byte-identical to the existing file.
- Do NOT use raw `writeFile` from `node:fs/promises` for generated files. Raw `writeFile` always writes, creating git churn and LFS bloat on every regeneration cycle.
- For binary generated files (PNG, icons), pass `Buffer` directly — `writeFileIfChanged` compares bytes via `Buffer.compare`.

## Ownership boundaries

### RFC-0855 transition boundary

RFC-0855 supersedes the one-plugin architecture as the target but does not authorize immediate source edits. Follow `docs/plans/agent-runtime-certification/program.yaml` one sealed packet at a time. Current `werkstatt/plugin@1` files remain truthful pre-cutover code facts until packet 230 removes them; do not add new dependencies or compatibility layers around that contract. Engine-owned component graph, lifecycle, grants/effects, isolation, certification, and evolution contracts belong in `@warpgogol/werkstatt`; stack packages contribute profile-selected capabilities without engine back-imports. A package change outside the active packet allow-list is forbidden even when it appears necessary for compilation.

| Package | Responsibility |
| --- | --- |
| `werkstatt` | RFC-0769/0772: Werkstatt engine — stack-agnostic lifecycle platform. Consolidates kernel runtime, missions, mirrors (Sternsystem), releases, Leitstand, Bordbuch, Notausgang, artifact store, evidence, fingerprint, integrity, observability, agent-gate, changelog, operations schemas, and workshop scaffolding (RFC-0779). Plugin contract (`werkstatt/plugin@1`) and registry in `src/plugin-contract.ts` and `src/plugin-registry.ts`. `werkstatt.autonomy.validate` enforces DNA-64 (no stack plugin imports). See `packages/werkstatt/AGENTS.md` for entry points. |
| `werkstatt-site` | RFC-0774/0775: Werkstatt site plugin — Astro stack engine modules and domain layer. Consolidates `site-kernel-astro`, `site-kernel-checks`, `site-kernel-codegen`, `site-kernel-content`, `site-kernel-onboarding`, `site-kernel-audit`, `site-kernel-check-warpgogol`, `site-kernel-changelog` renderers, `site-kernel-deploy`, and 27 domain packages (share, ui, ontology, tokens, pbp, growth, integration, chat, surface, passport, nebula, star-map, faq, content-source, check-core, check-runner, observability, studio-gate, agent-gate, geo, pbp-rate-adapters, growth-adapter-matomo, integration-adapter-stripe, integration-adapter-supabase-crm, chat-adapter-null, chat-adapter-uchat, warpgogol-skills) into a single plugin package implementing `werkstatt/plugin@1` with `profileId: "astro-typescript-turborepo"`. See `packages/werkstatt-site/AGENTS.md` for entry points and domain module map. |
| `werkstatt-game` | RFC-0777: Werkstatt game plugin — Phaser turborepo stack. Implements `werkstatt/plugin@1` with `profileId: "phaser-turborepo"`. Provides Phaser path conventions, game validators, Vite build hook, GitHub Pages and Cloudflare Pages deploy adapters, `scaffoldProject` hook, and `releaseEvidence` hook. Enforces GAME-01..04 invariants. |
| `werkstatt-video` | RFC-0778: Werkstatt video plugin — Editframe stack. Implements `werkstatt/plugin@1` with `profileId: "editframe"`. Provides video composition validation, render hooks, and deploy adapters. |
| `forge` | Portable governance skills and command modules (RFC-0374). `src/` is portable (no kernel imports); `os/compass/` and `os/werkstatt/` are fully autonomous (RFC-0556 — handlers inlined, no `@warpgogol/*` imports); other `os/` modules may use dynamic kernel imports. Exports `forgeRfcModule`, `forgeWorkflowModule`, `forgeNamingModule`, `forgeCompassModule`, `forgeWerkstattModule`, `forgeCoreModule`, `forgeSessionModule`, `forgeMissionModule`, `forgeExplorationModule`, `forgeNotesModule` and 46 skills. |

- App-specific paths, content contracts, and business rules should stay in the app unless they have become stable shared abstractions.
- Generated icon trees under `packages/werkstatt-site/src/domain/ui/src/icons/gen/**` must be treated as derived output.

## Cosmic-name maps in `share`

`packages/werkstatt-site/src/domain/share/src/page.ts` is the **single source of truth** for the cosmicName → import-path mapping consumed by `buildPage()`:

- `PLANET_IMPORT_PATHS` — every Planet (section archetype) PLUS the five PASSPORT-RESERVED moons that are invoked as page-blocks on `cosmic/passport` and `cosmic/star-map` routes.
- `MOON_IMPORT_PATHS` — only Moons used as **shell-level components** (background, header, footer slots in `system.md pages[].shell`).

When adding a section to `packages/werkstatt-site/src/domain/ui/src/sections/<slug>/`, register its `cosmicName` (which lives in `<slug>-section.manifest.yaml`) in `PLANET_IMPORT_PATHS`. When adding a shell-eligible component, register it in `MOON_IMPORT_PATHS`. A name in a manifest without a matching entry in these maps fails at runtime with `[buildPage] No component import path registered for ...`.

The five passport-reserved moons (`Methone`, `Despina`, `Klarissa`, `Bianca`, `Adrastea`) are reserved only for the five passport components in `packages/werkstatt-site/src/domain/ui/src/components/{passport-header,pulsar,passport-score-grid,passport-provenance,passport-star-map}/`. Do not assign them to any other component manifest.

## Constellation slots — one cosmicName per slot

Constellation YAMLs in `packages/werkstatt-site/src/domain/ontology/constellations/*.yaml` declare an ordered sequence of slots. **Each slot accepts exactly one `cosmicName`** — the schema is `cosmicName: PlanetName`, never `PlanetName | PlanetName[]` and never an array. Schema simplicity is the contract.

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

See `packages/werkstatt-site/src/onboarding/AGENTS.md` for the full onboarding specification. Key components: site families catalog (`packages/werkstatt-site/src/domain/ontology/site-families/<id>/`), section archetype catalog (`packages/werkstatt-site/src/domain/ontology/archetypes/sections/<id>.yaml`), extended biome schema (`packages/werkstatt-site/src/domain/ontology/biomes/<id>.yaml`), pipelines (`APPS_CHECK_PIPELINE`, `PACKAGES_CHECK_PIPELINE`, `APPS_BUILD_PREPARE_PIPELINE`), and generation-first apps (RFC-0078). All validated by their respective `*.contract.validate` commands.

## File naming

- All source files in `packages/*` use **kebab-case**: `checks.ts`, `compass.ts`, `structure.ts`.
- **No underscores** in filenames. Hyphens separate words for lowercase files.
- Exception: files containing `config` or `module` in the name follow their ecosystem convention.
- Exception: ALLCAPS documentation files (`AGENTS.md`, `README.md`) are intentionally uppercase.

Enforced by `naming.convention.lint` (workspace-scoped OS command) and `naming.pages.lint` (app-scoped). Full naming rules: `packages/werkstatt/src/kernel/docs/naming-conventions.md`.

## Implementation rules

- Do not hardcode one app's file layout into generic package APIs unless the package is explicitly an adapter for that layout.
- **Cookies are forbidden** repository-wide. No package may read, write, or depend on `document.cookie`, `Set-Cookie`, or cookie-parsing libraries. Use `localStorage` (client) or `unstorage` (server) for persistence.
- When a package generates boilerplate into `apps/*`, keep the generator thin: store multi-line templates under `src/templates/<generator-name>/`, mirror the target app path in the template path, and prefer token replacement over inline string builders.
- `werkstatt-site` onboarding should write only the minimal app skeleton and client-editable seed content directly; engineering-only routes, styles, scripts, public infrastructure, and `tools/` wiring should be delegated to shared generators such as `werkstatt-site/codegen` and `werkstatt` `kernel.wire`.
- **Animated icon + text alignment (RFC-0100):** whenever a section or component renders an animated icon (e.g. LordIcon) next to text in a flex row, set `align-items: center` on the flex container so the icon and text are vertically centered relative to each other. Do not use `align-items: flex-start` for this pattern. Default icon size is **24 px** when no explicit `size` is provided by content; content authors may override via `icon.size`. All list-based sections use `StandardListItem[]` with optional per-item `icon?: VendorIconConfig`; no section-level icon fallbacks.
- In `packages/werkstatt-site/src/domain/ui/src/components/<slug>/`, a new shared component is not complete until it has its colocated `.manifest.yaml`; agents must add the manifest in the same change as the new `.astro` file and follow the nearest `packages/werkstatt-site/src/domain/ui/AGENTS.md` component contract.
- **Ports & adapters (growth / content-source / integration / chat).** A vendor capability is a closed port contract + one adapter package per vendor + a closed id catalog. Never import a vendor SDK in `apps/*` or in section code — vendor specifics live ONLY in the adapter package. Unknown ids `console.warn` + no-op (enum-dispatch). To add a vendor: add the adapter package + the catalog entry; sections, routes, and validators are unchanged.
  - **New chat vendor (RFC-0175):** implement `ChatWidgetAdapter` (`load()` injects the vendor script lazily; `open()`); add the id to `CHAT_ADAPTER_IDS`; register a STATIC `import()` in the **host's** adapter-loader map (the chat-widget section client passes `ChatAdapterLoaders` to `bindChatLauncher`). The loader map lives in the host (`@warpgogol/werkstatt-site/ui`), NOT in `@warpgogol/werkstatt-site/chat` — the port module must not depend on the adapter modules (that would form a workspace cycle). `load()` MUST be called only after user activation — never render the vendor `<script>`/iframe in server output (RFC-0177 `consent.activation.validate`). Options in `system.md integrations.chat` are PUBLIC only — no secrets.
  - **New destination (RFC-0176):** implement `DestinationAdapter` (`kind`, `vendor`, `requiredSecrets`, `route(event, secrets)`) in `@warpgogol/werkstatt-site/share/integration`, register it in `DESTINATION_ADAPTERS`, and add the kind/vendor to the catalog. `gogol-adapter` reads secrets via the injected bag (never `astro:env` in the adapter). The delivery queue is in-flight only — never persist event payloads (no lead/conversation datastore; RFC-0177 clause 4). Credentials/OAuth tokens MAY be stored server-side; visitor PII may NOT.
  - **Programmatic Surface — a route-source port (RFC-0192..0199).** `@warpgogol/werkstatt-site/surface` is a closed port (`PageSurfaceProvider` + axis-generic engine), not a vendor port: it contributes generated routes to the registry alongside authored `system.md pages[]`, gated by the single `pseo` entitlement. Page families are **Blueprints** (`packages/werkstatt-site/src/domain/ontology/blueprints/*.yaml`) — the adapter layer; the engine is business-agnostic. **`@warpgogol/werkstatt-site/surface` MUST NOT depend on `@warpgogol/share`** — share consumes surface's route types, so a back-dependency forms a workspace cycle (verified by `turbo run build:check`). Surface therefore declares its own `PageEntry`/`SurfaceBlock`. Surface engine code is pure (no Astro, no Node I/O); all I/O lives in the `surface.*` kernel commands. Generated pages are baked block-declarative `PageEntry` objects — never hand-author them, never add a parallel render path, and never edit the generated `src/surface.generated.json` / `.surface-cache/` artifacts. See `packages/surface/README.md`.
  - **Variable-specifier dynamic imports (RFC-0486).** Variable-specifier dynamic imports (e.g. `import(_adapterSpecifiers[...])`) in `packages/*` MUST include `/* @vite-ignore */` inside the `import()` call, placed before the variable expression, to suppress Vite's "Unable to analyze dynamic import" warning. This is the official Vite mechanism for intentional dynamic imports that cannot be statically resolved.
- **`import.meta.env` is Vite-only.** Packages type-checked with `tsc --noEmit` outside Vite (e.g. `packages/werkstatt-site/src/domain/share`, `packages/werkstatt`) must not use `import.meta.env.DEV` or similar — `import.meta.env` is not typed in plain Node/tsc contexts and causes `Property 'env' does not exist on type 'ImportMeta'` build errors. Use `process.env.NODE_ENV !== "production"` instead, which works in both Vite and Node contexts. See `packages/werkstatt-site/src/domain/share/src/text-normalize.ts:538` for the corrected pattern.

## Universal authored import/export contract

- Every relative `import` or `export ... from` inside `packages/**/*.ts(x)` must use the on-disk `.ts` or `.tsx` extension: `./foo.ts`, never `./foo.js` or `./foo`.
- `tsconfig/base.json` enables `allowImportingTsExtensions`, and `tsconfig/node-lib.json` enables `rewriteRelativeImportExtensions`; build-emitting packages author `.ts` and let TypeScript rewrite emitted `dist/` imports to `.js`.
- Do **not** switch package source imports to `.js` to appease a local build error. Fix the package tsconfig shape so it extends the shared base or node-lib config.
- Package `exports` may still point to `dist/*.js` for build-backed runtime output, or to source `.ts` / `.astro` surfaces for source-consumed packages. This does not change the authored local-import rule.
- When changing generated app code, edit the owning template or generator in `packages/*`; do not hand-edit generated files in `apps/*`.
- Before editing a generated app file, identify its single owning command in `generator.ownership.lint` / `GENERATOR_OWNERSHIP_MAP`. Example: `apps/*/src/pages/[lang]/[...slug].astro` is owned by `routes.generate`, so changes belong in `packages/werkstatt-site/src/codegen/src/templates/app-boilerplate/src/pages/[lang]/[...slug].template.astro`, followed by regeneration.

## Shared helpers catalog — import, do not re-implement

RFC-0303 consolidated the fs/text primitives that used to be copy-pasted per file across the old `packages/os/*`. Import the canonical helper instead of writing a local `readdir` walker, existence check, JSON reader, line/column calculator, or workspace-package scanner:

| Helper | Import from | Notes |
| --- | --- | --- |
| `collectFiles(root, options)` | `@warpgogol/werkstatt-site/share/fs` | Recursive `readdir` walker. `options.extensions` filters by suffix; `options.ignore(name)` skips an entry by name (default: `-*`/`old-*`); `options.withDirs` includes directory paths too. Server-only. |
| `fileExists(path)` | `@warpgogol/werkstatt-site/share/fs` | Best-effort existence check (`stat`, `false` on any error). |
| `readJsonFile<T>(path)` | `@warpgogol/werkstatt-site/share/fs` | Reads and `JSON.parse`s a file; throws on missing file or parse error. |
| `readYamlFile<T>(path)` | `@warpgogol/werkstatt-site/share/fs` | Reads and `yaml.parse`s a file; throws on missing file or parse error. |
| `getLineColumn(text, index)` | `@warpgogol/werkstatt-site/share/text-position` | Pure, browser-safe offset → 1-based `{ line, column }`. |
| `collectMarkdownFiles(dir)` | `@warpgogol/werkstatt-site/content` | `.md`-only wrapper over `collectFiles`; keeps its existing name/signature. |
| `discoverWorkspacePackages(root)` | `@warpgogol/werkstatt` | Canonical pnpm-workspace-aware package discovery (returns `{ packages, diagnostics, ... }`). |

Two structural guard lints enforce this catalog and ratchet down the pre-RFC-0303 oversized-file backlog:

- **`fs.walk.lint` (WALK-01, error)** — fails when a `packages/` source file declares its own nested recursive `readdir` walker instead of importing `collectFiles`. If a walker genuinely has a different contract (e.g. it walks something other than the filesystem, or is intentionally depth-bounded), add a `// fs.walk.lint: allow — <reason>` comment directly above the declaration rather than duplicating the primitive.
- **`dedup.helper.lint` (DEDUP-01, error)** — fails when any identifier in the table above is re-declared locally (by name) instead of imported. A differently-named local wrapper that internally delegates to the canonical helper is fine.
- **`file.size.lint` (SIZE-01, warning)** — flags a `packages/` `.ts`/`.tsx` file exceeding 600 physical lines, against a shrink-only ratchet baseline (`file-size-lint.baseline.generated.yaml`). New files above threshold warn from day one; regenerate the baseline with `--write-baseline` after a split lands.

When you add a new cross-cutting build-time fs/text/workspace helper, add it to this table **and** to `dedup.helper.lint`'s reserved-identifier map (`packages/werkstatt-site/src/checks/src/dedup-helper-lint.ts`) so the next agent can't reintroduce the duplication class — never define it inline in a validator.

## Compass compliance

Compass source-file markup (`MODULE_CONTRACT` + `CHANGE_SUMMARY`, two-block contract per RFC-0348) is required for non-trivial authored files in `packages/` under the same policy as `apps/` — see `docs/source-markup.xml`.

**`MODULE_CONTRACT` accepts only `<purpose>` and `<non-goals>` child elements.** The fields `<keywords>` and `<responsibilities>` are forbidden (COMPASS-FORBIDDEN-01) — `compass.validate` rejects them. Do not add them when writing Compass headers manually.

Use these commands to apply or remove Compass markup across packages (RFC-0015):

```sh
rtk pnpm exec werkstatt run compass.annotate --packages
rtk pnpm exec werkstatt run compass.clear --packages
rtk pnpm exec werkstatt run compass.markup.migrate --packages   # v1 → v2 migration (RFC-0348)
rtk pnpm exec werkstatt run compass.invariant.add --file <path> --text "<invariant>"  # RFC-0351
```

`compass.annotate` is now deterministic (RFC-0350): it inserts `TODO(compass)` sentinel skeletons, not LLM-generated content. Fill the sentinels manually or via an agent.

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
- **RFC-0189 `ui.i18n.lint`:** Shared UI components in `packages/werkstatt-site/src/domain/ui/src/{sections,components}/` must not contain hardcoded human-readable strings. The validator scans `.astro` and `.ts` files for:
  - `I18N-01` — string literals with spaces and letters that are not routed through `resolveLabel`, `props`, or `siteLabels`.
  - `I18N-02` — `resolveLabel` fallbacks that contain full sentences (>3 words or sentence punctuation).
  - Agents must move hardcoded text into `site/{lang}/labels.md` or section props; empty-string fallbacks are acceptable only when the key is guaranteed to be present.
