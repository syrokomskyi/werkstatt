---
id: RFC-0389
title: "Full boilerplate generation for mission materialization"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-15
updatedAt: 2026-07-15
enhancedAt: 2026-07-15
implementedAt: 2026-07-15
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0356
amendedBy: []
related:
  - DNA-47
  - RFC-0356
  - RFC-0355
  - RFC-0078
  - RFC-0029
  - RFC-0030
satisfies:
  - DNA-47
commands:
  proposed: []
  added: []
  changed:
    - mission.materialize
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/site-kernel-handoff"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-onboarding"
  - "@gogol/site-kernel-astro"
successSignals:
  - "mission.materialize produces a Werkstück with a full package.json (all workspace dependencies, build scripts, deploy scripts) instead of a 4-key stub"
  - "mission.materialize produces a Werkstück with a full astro.config.mjs (Cloudflare adapter, React integration, Vite config, env schema) instead of an empty defineConfig"
  - "mission.materialize produces a Werkstück with wrangler.jsonc, tsconfig.json, .gitignore, postcss.config.cjs, and .github/workflows/deploy.yml from onboarding templates"
  - "mission.materialize runs codegen generators (routes, overlay pages, global styles, scripts orchestrator, public infrastructure, i18n middleware, agents docs) against the staging Werkstück"
  - "mission.materialize runs kernel.wire against the staging Werkstück to produce tools/kernel.config.ts and tools/modules/*.ts"
  - "The materialized Werkstück is buildable with `pnpm --filter <id> build` without manual file additions"
  - "mission.validate passes on the fully materialized Werkstück"
  - "The materialization report lists all generated boilerplate files"
nonGoals:
  - "Does not change the mission lifecycle state machine — that is RFC-0355"
  - "Does not change the Sternsystem bundle contract — that is DNA-44 / RFC-0354"
  - "Does not change the version-compare matrix or migrator chain — that is RFC-0356 §1.1 steps 3-6"
  - "Does not change the staging directory or atomic rename mechanism — that is RFC-0356 §1.1 step 10 and DNA-51"
  - "Does not generate Ed25519 passport keypairs — that is onboarding.scaffold responsibility only; missions materialize from existing Sternsystem bundles"
  - "Does not create seed content pages (home.md, labels.md, navigation.md) — those are Sternsystem data owned by the pinned bundle"
  - "Does not change the build.prepare pipeline or build.check pipeline — those operate on the materialized Werkstück after mission.materialize completes"
---

# RFC-0389: Full boilerplate generation for mission materialization

## Context

RFC-0356 §1.1 steps 7-8 mandate that `mission.materialize` generates runtime boilerplate (`package.json`, `astro.config.*`, `wrangler.*`, `tsconfig.*`, route stubs, env schema, build scaffolding) and regenerates derived artifacts (all `*.generated.*` files, Compass regions, entitlements, env schema, biome CSS, surface, etc.) from the pinned platform.

The current implementation in `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` (lines 180-198) replaces this with **minimal inline stubs**: a 4-key `package.json` (`name`, `type`, `private`, `version`, `scripts.dev/build/preview`) and an empty `astro.config.mjs` (`export default defineConfig({})`). This makes the materialized Werkstück non-buildable — it lacks workspace dependencies, the Cloudflare adapter, React integration, Vite configuration, env schema, wrangler config, tsconfig path aliases, and all generated route/style/script/middleware files.

The `@gogol/site-kernel-codegen` package already provides the full generator set: `runGenerateRoutes`, `runGenerateOverlayPages`, `runGenerateGlobalStyles`, `runGenerateScriptsOrchestrator`, `runGeneratePublicInfrastructure`, `runGenerateApiRoutes`, `runGenerateI18nMiddleware`, `runGenerateAgentsDocs`, `runFontsImportsGenerate`. The `@gogol/site-kernel-onboarding` package provides proven templates for `package.json`, `astro.config.mjs`, `wrangler.jsonc`, `tsconfig.json`, `.gitignore`, `postcss.config.cjs`, and `.github/workflows/deploy.yml`. The `onboarding.scaffold` command already demonstrates the correct integration pattern: write template files, then run the codegen generator sequence, then run `kernel.wire`.

## Problem

The minimal stub approach violates DNA-47 (Materialization) and RFC-0356 §1.1 steps 7-8:

1. **Non-buildable Werkstück.** The materialized Werkstück cannot be built, previewed, or validated without manual file additions. `mission.validate` (which runs `app.contract.full`) fails immediately because the Werkstück has no routes, no styles, no middleware, no content config, and no env schema.

2. **Missing workspace dependencies.** The stub `package.json` declares zero dependencies. The Werkstück cannot resolve `@gogol/ui`, `@gogol/share`, `astro`, `@astrojs/cloudflare`, `react`, or any other required package. `pnpm install` in the workpiece would install nothing.

3. **Missing Astro configuration.** The stub `astro.config.mjs` has no adapter, no React integration, no Vite config, no env schema, no image service, and no session driver. Astro build would fail or produce incorrect output.

4. **Missing deployment config.** No `wrangler.jsonc` is generated. The Werkstück cannot be deployed even for alt-channel preview.

5. **Missing TypeScript config.** No `tsconfig.json` is generated. Path aliases (`@schemas/*`, `@styles/*`, `@gogol/ui`, `@gogol/share`) are unresolved.

6. **Missing tools/ wiring.** No `tools/kernel.config.ts` or `tools/modules/*.ts` are generated. The Werkstück cannot run `site-kernel` commands.

7. **Missing generated routes and middleware.** No `src/pages/[lang]/[...slug].astro`, `src/pages/index.astro`, `src/pages/404.astro`, `src/middleware.ts`, `src/content.config.ts`, `src/env.d.ts` are generated.

8. **Missing generated styles and scripts.** No `src/styles/global.css`, `src/styles/local.css`, `src/scripts/layout-orchestrator.ts` are generated.

9. **Missing public infrastructure.** No `public/_headers`, `public/_redirects`, `public/.assetsignore` are generated.

10. **Inconsistency with onboarding.** Sites created via `onboarding.scaffold` receive full boilerplate. Sites materialized via `mission.materialize` receive stubs. This creates a two-tier system where mission Werkstücke are second-class citizens.

## Decision

`mission.materialize` generates full runtime boilerplate into the staging Werkstück by reusing the template set from `@gogol/site-kernel-onboarding` and the codegen generator sequence from `@gogol/site-kernel-codegen`, following the same pattern already proven in `onboarding.scaffold`.

## Architectural fit

- **DNA-47 (Materialization)** — This RFC fulfills the materialization contract that DNA-47 and RFC-0356 §1.1 steps 7-8 specify: "generate `package.json`, `astro.config.*`, `wrangler.*`, `tsconfig.*`, route stubs, env schema, and other build scaffolding from pinned platform templates" and "regenerate all `*.generated.*` files, Compass regions, entitlements, env schema, biome CSS, surface, etc."

- **RFC-0078 (Generation-first template discipline)** — The codegen generators are the canonical source of generated files. `mission.materialize` must use them, not inline stubs.

- **RFC-0029 / RFC-0030 (Onboarding scaffold)** — The scaffold's `runScaffoldGeneratorSequence` demonstrates the correct integration pattern. `mission.materialize` adapts this pattern for mission-scoped Werkstücke.

- **DNA-51 (Werkstatt consistency primitives)** — Staging directory and atomic rename are preserved. Full boilerplate generation happens inside the staging directory before the atomic rename to `workpiece/`.

- **Site OS operator model** — `mission.materialize` remains a workspace-scoped command. It constructs an app-scoped `KernelRuntimeContext` for the staging Werkstück (same pattern as `onboarding.scaffold` lines 194-198) so that codegen generators can call `requireAstroSitePaths(context)`.

## Design

### CLI surface

No CLI surface changes. `mission.materialize` keeps its existing flags:

```sh
pnpm exec site-kernel run mission.materialize \
  --mission <mission-id> \
  [--report-only] \
  [--json]
```

### Template-driven boilerplate generation

The implementation replaces the inline stub generation (current lines 180-198 in `mission-materialize.ts`) with a sequence of template writes and codegen generator calls, mirroring `onboarding.scaffold`:

#### Step 1: Write template files into staging directory

Read templates from `@gogol/site-kernel-onboarding/src/templates/` and apply token substitution. The token set is derived from the Sternsystem pin and mission manifest:

| Template | Token source |
| --- | --- |
| `package.template.json` | `manifest.systemId` → `{{CLIENT_ID}}`, pin domain → `{{DOMAIN}}` |
| `runtime/astro.config.template.mjs` | pin domain → `{{DOMAIN}}`, `manifest.systemId` → `{{CLIENT_ID}}` |
| `wrangler.template.jsonc` | `manifest.systemId` → `{{CLIENT_ID}}` |
| `tsconfig.template.json` | no tokens (static) |
| `runtime/gitignore.template` | no tokens (static) |
| `runtime/postcss.config.template.cjs` | no tokens (static) |
| `runtime/github-deploy.template.yaml` | `manifest.systemId` → `{{CLIENT_ID}}`, pin domain → `{{DOMAIN}}` |

The domain is resolved from the Sternsystem's `system.md` manifest (`identity.domain`) or from the pin file. If the domain is not available, the `SITE_LINE` token falls back to a commented-out `site:` line (same pattern as `onboarding.scaffold`).

#### Step 2: Run `kernel.wire` against the staging Werkstück

`kernel.wire` generates `tools/kernel.config.ts`, `tools/modules/check.module.ts`, `tools/modules/service.module.ts`, `tools/modules/deploy.module.ts`, and `tools/runtime/*.ts` from the Sternsystem's `system.md`. This requires constructing an app-scoped `KernelRuntimeContext` pointing at the staging directory.

The pattern from `onboarding.scaffold` (lines 181-198) is reused:

```ts
const generatorInput: KernelCommandInput = {
  argv: [`--app=${manifest.systemId}`, `--domain=${domain}`],
  args: [],
  flags: { app: manifest.systemId, domain },
};

// Construct app-scoped context for the staging Werkstück.
// DiscoveredSiteWorkspace has fields: name, directory, toolsDirectory,
// configPath?, packageName? — no source or missionId fields (see types.ts).
const stagingSiteWorkspace: DiscoveredSiteWorkspace = {
  name: manifest.systemId,
  directory: stagingDir,
  toolsDirectory: path.join(stagingDir, "tools"),
  packageName: manifest.systemId,
};

const appContext: KernelRuntimeContext = {
  ...context,
  site: stagingSiteWorkspace,
  siteExplicit: true,
};

await runKernelWire(generatorInput, appContext);
```

#### Step 3: Run codegen generator sequence

Run the same generator sequence as `onboarding.scaffold`'s `runScaffoldGeneratorSequence` (lines 200-208), adapted for the staging context:

```ts
await runGenerateAgentsDocs(generatorInput, appContext);
await runGenerateOverlayPages(generatorInput, appContext);
await runGenerateRoutes(generatorInput, appContext);
await runGenerateApiRoutes(generatorInput, appContext);
await runGenerateGlobalStyles(generatorInput, appContext);
await runFontsImportsGenerate(generatorInput, appContext);
await runGenerateScriptsOrchestrator(generatorInput, appContext);
await runGeneratePublicInfrastructure(generatorInput, appContext);
await runGenerateI18nMiddleware(generatorInput, appContext);
```

Each generator calls `requireAstroSitePaths(context)` which resolves paths from `context.site.directory` (the staging directory). The generators read `src/content/system.md` (copied from the Sternsystem data set in step 5 of the materialization pipeline) and produce generated files into the staging directory. Generators that write to `src/pages/`, `src/styles/`, `src/scripts/`, etc. create these directories as needed via `fs.mkdir({ recursive: true })` — the staging directory starts with only the copied Sternsystem data paths (`src/content/`, `public/`, `provenance/`).

`kernel.wire` (step 2) uses `resolveWirePaths` which reads `context.site.directory` directly from the app-scoped context. It does NOT call `discoverSiteWorkspaces` internally — it trusts the context's `site` field. This is the same behavior `onboarding.scaffold` relies on when it constructs a synthetic context for a newly created `apps/<client>/` directory that has not yet been discovered by the workspace resolver.

#### Step 4: No passport keypair generation

Unlike `onboarding.scaffold`, `mission.materialize` does NOT generate an Ed25519 keypair. The Sternsystem's `public/.well-known/cosmic-passport-key.json` is part of the Sternsystem data set and is copied in the data-copy step (RFC-0356 §1.1 step 5). Private keys are never written to disk by either command.

### Dependency changes

`@gogol/site-kernel-handoff` must add the following workspace dependencies (it does NOT currently depend on them):

- `@gogol/site-kernel-codegen` — for importing `runGenerateRoutes`, `runGenerateOverlayPages`, `runGenerateGlobalStyles`, `runGenerateScriptsOrchestrator`, `runGeneratePublicInfrastructure`, `runGenerateApiRoutes`, `runGenerateI18nMiddleware`, `runGenerateAgentsDocs`, `runFontsImportsGenerate`.
- `@gogol/site-kernel-astro` — for `requireAstroSitePaths` used by all codegen generators.
- `@gogol/site-kernel-onboarding` — for accessing the shared template files (`package.template.json`, `astro.config.template.mjs`, etc.).

The `@gogol/site-kernel` package (already a dependency) re-exports `runKernelWire` and `discoverSiteWorkspaces`, so no additional dependency is needed for `kernel.wire`.

### Template access mechanism

The `onboarding.scaffold` reads templates via `__dirname`-relative paths (`join(__dirname, "..", "src", "templates")`), which works because the templates are in the same package. Since `mission-materialize.ts` is in `@gogol/site-kernel-handoff`, it cannot use `__dirname`-relative paths to reach `@gogol/site-kernel-onboarding/src/templates/`.

The implementation exports `readTemplate` and `readRuntimeTemplate` helper functions from `@gogol/site-kernel-onboarding` (currently private to `scaffold.ts`). These functions use the existing `__dirname`-relative path resolution and return template content as strings. `mission-materialize.ts` imports them via the workspace dependency.

Alternatively, the implementation may use `import.meta.resolve` to locate the `@gogol/site-kernel-onboarding` package directory at runtime and construct template paths from it. Both approaches are valid; the exported-helper approach is preferred because it avoids runtime path resolution and keeps the template directory layout encapsulated.

### TypeScript contracts

No new types or interfaces are introduced. The existing `MissionMaterializeData` interface in `mission-materialize.ts` is updated to reflect the expanded `regeneration.regeneratedFiles` list (from `["package.json", "astro.config.mjs"]` to the full generated file set).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-onboarding/src/templates/package.template.json` | Read by mission.materialize for full package.json |
| `packages/os/site-kernel-onboarding/src/templates/runtime/astro.config.template.mjs` | Read by mission.materialize for full astro config |
| `packages/os/site-kernel-onboarding/src/templates/wrangler.template.jsonc` | Read by mission.materialize for wrangler config |
| `packages/os/site-kernel-onboarding/src/templates/tsconfig.template.json` | Read by mission.materialize for tsconfig |
| `packages/os/site-kernel-onboarding/src/templates/runtime/gitignore.template` | Read by mission.materialize for .gitignore |
| `packages/os/site-kernel-onboarding/src/templates/runtime/postcss.config.template.cjs` | Read by mission.materialize for postcss config |
| `packages/os/site-kernel-onboarding/src/templates/runtime/github-deploy.template.yaml` | Read by mission.materialize for deploy workflow |
| `packages/os/site-kernel-codegen/src/app-boilerplate.ts` | Codegen generators called by mission.materialize |
| `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` | Modified to call templates and codegen instead of inline stubs |
| `missions/<mission-id>/workpiece/` | Target directory for all generated boilerplate |
| `missions/<mission-id>/evidence/materialization-report.json` | Updated with full generated file list |

### Output format

The `--json` output shape remains the same. The `regeneration.regeneratedFiles` array expands to include all generated files:

```json
{
  "command": "mission.materialize",
  "status": "ok",
  "data": {
    "missionId": "warpgogol-com-m000001",
    "systemId": "warpgogol-com",
    "versionComparison": { "verdict": "in-sync", "..." : "..." },
    "migratorChain": [],
    "capabilityDiff": { "tier": "green", "items": [] },
    "regeneration": {
      "regeneratedFiles": [
        "package.json",
        "astro.config.mjs",
        "wrangler.jsonc",
        "tsconfig.json",
        ".gitignore",
        "postcss.config.cjs",
        ".github/workflows/deploy-warpgogol-com.yml",
        "tools/kernel.config.ts",
        "tools/modules/check.module.ts",
        "tools/modules/service.module.ts",
        "tools/modules/deploy.module.ts",
        "tools/runtime/app.ts",
        "tools/runtime/check.ts",
        "tools/runtime/service.ts",
        "AGENTS.md",
        "src/content/AGENTS.md",
        "src/styles/AGENTS.md",
        "src/content/pages/root-redirect.md",
        "src/pages/index.astro",
        "src/pages/[...slug].astro",
        "src/pages/[lang]/[...slug].astro",
        "src/pages/404.astro",
        "src/middleware.ts",
        "src/content.config.ts",
        "src/env.d.ts",
        "src/styles/global.css",
        "src/styles/local.css",
        "src/scripts/layout-orchestrator.ts",
        "public/_headers",
        "public/_redirects",
        "public/.assetsignore",
        "src/middleware/language-redirect.ts"
      ],
      "success": true
    },
    "materializedAt": "2026-07-15T..."
  }
}
```

### Failure modes

- **Missing `system.md` in Sternsystem data** — If the Sternsystem data copy (step 5) did not include `src/content/system.md`, the codegen generators will fail with "Cannot load system manifest". This is a Sternsystem validation error, not a materialization error. The error message should indicate that the Sternsystem bundle is incomplete.

- **Missing domain in pin/manifest** — If no domain is available, `public.infrastructure.generate` returns a warning (same as in `onboarding.scaffold`). The `SITE_LINE` token in `astro.config.mjs` falls back to a commented-out `site:` line. This is non-fatal; the Werkstück is still buildable but the canonical URL is unset.

- **Codegen generator failure** — If any generator in the sequence fails, the staging directory is cleaned up (existing atomic behavior in `mission-materialize.ts` lines 164-167 + the `finally` block). The error from the failing generator is propagated.

- **`kernel.wire` failure** — If `kernel.wire` fails (e.g., cannot read `system.md`), the staging directory is cleaned up. This is the same failure mode as in `onboarding.scaffold`.

### Staging and atomic rename

The existing staging directory and atomic rename mechanism (RFC-0356 §1.1 steps 4, 10; DNA-51) is preserved. All template writes and codegen generator calls happen inside the staging directory (`missions/<mission-id>/workpiece.staging-<operationId>/`). The atomic rename to `workpiece/` happens only after all generators succeed. This ensures a failed materialization never leaves a partial Werkstück.

### Materialization report

The materialization report at `missions/<mission-id>/evidence/materialization-report.json` is updated to list all generated boilerplate files in `regeneration.regeneratedFiles`, replacing the current `["package.json", "astro.config.mjs"]` stub list. The report schema (`schemaVersion: "1.0.0"`) is unchanged — the array simply expands.

## Rollout

- **Default behavior**: The full boilerplate generation is the default and only behavior. There is no opt-in flag. All missions materialized after this RFC is implemented receive full boilerplate.

- **Existing missions**: Missions that were materialized with the old stub approach and are still open must be re-materialized. The operator runs `mission.materialize --mission <id>` again, which replaces the Werkstück via atomic rename.

- **New missions**: All new missions automatically receive full boilerplate from the first `mission.materialize` call.

- **No pipeline changes**: The `build.prepare` and `build.check` pipelines are unchanged. They operate on the materialized Werkstück after `mission.materialize` completes. The codegen generators called during materialization are a subset of the `build.prepare` pipeline; running `build.prepare` later is idempotent and will not conflict (generators check for the GENERATED marker and skip or overwrite as appropriate).

- **Template drift**: The templates in `@gogol/site-kernel-onboarding/src/templates/` are the single source of truth for both `onboarding.scaffold` and `mission.materialize`. When a template changes, both paths benefit. No template duplication is introduced.

- **New workspace dependencies**: `@gogol/site-kernel-handoff` must add `@gogol/site-kernel-codegen`, `@gogol/site-kernel-astro`, and `@gogol/site-kernel-onboarding` as workspace dependencies. These are NOT transitive dependencies today — the handoff package depends only on `@gogol/fingerprint`, `@gogol/ontology`, `@gogol/share`, `@gogol/site-kernel`, `yaml`, and `zod`. The `@gogol/site-kernel` package re-exports `runKernelWire` and `discoverSiteWorkspaces` but does NOT re-export the codegen generator functions.

## Alternatives considered

1. **Run `build.prepare` pipeline instead of inline codegen calls.** Instead of calling individual codegen generators, run the full `SITES_BUILD_PREPARE_PIPELINE` against the staging Werkstück. Rejected because the pipeline includes validators (`yaml.contract.lint`, `manifest.contract.validate`, `mirror.quintet.validate`, `uni.registry.build`, `generated.files.validate`) that may fail on a freshly staged Werkstück before all generators have run. The pipeline is designed for an already-bootstrapped site, not for initial materialization. The correct pattern is the one `onboarding.scaffold` uses: write templates → run `kernel.wire` → run codegen generators → then the pipeline can run.

2. **Copy an existing app directory as a template.** Rejected because it violates the generation-first principle (RFC-0078) and would carry stale generated markers, app-specific content, and potential drift. Templates are the canonical source.

3. **Defer to a future `mission.scaffold` command.** Rejected because RFC-0356 §1.1 steps 7-8 already mandate that `mission.materialize` generates runtime boilerplate and regenerates derived artifacts. Creating a separate command would split the materialization contract and require two commands where one is specified.

4. **Generate only `package.json` and `astro.config.mjs` from templates, skip codegen.** Rejected because the Werkstück would still lack routes, middleware, styles, scripts, public infrastructure, and tools/ wiring. `mission.validate` would still fail. The codegen generators are fast and deterministic; there is no reason to skip them.

## Risks

- **Template token mismatch.** If the Sternsystem pin does not carry a domain (e.g., a Sternsystem registered without a domain), the `{{DOMAIN}}` token in `package.template.json` and `astro.config.template.mjs` would be unresolved. Mitigation: fall back to a placeholder domain or a commented-out site line (same pattern as `onboarding.scaffold` lines 312-314).

- **Codegen generator assumptions.** The codegen generators assume `src/content/system.md` exists and is a valid system manifest. If the Sternsystem data set is incomplete (missing `system.md`), generators will fail. Mitigation: validate `system.md` presence in the staging directory before running generators, with a clear error message.

- **Workspace resolution for staging directory.** The codegen generators call `requireAstroSitePaths(context)` which reads `context.site.directory`. The staging directory is not a real workspace member (it is not in `pnpm-workspace.yaml`). The implementation must construct a `DiscoveredSiteWorkspace` object pointing at the staging directory, same as `onboarding.scaffold` does for a newly created `apps/<client>/` directory before it is discovered by the workspace resolver.

- **Performance.** Running 9 codegen generators plus `kernel.wire` adds I/O and processing time to `mission.materialize`. In practice, each generator writes 1-7 files and completes in under 1 second. The total additional time is estimated at 3-8 seconds, which is acceptable for a command that already copies the full Sternsystem data set.

- **Agent misinterpretation.** An agent might assume the materialized Werkstück is a full workspace member and try to run `pnpm install` in it. The Werkstück resolves dependencies through the monorepo workspace, not through an independent `node_modules/`. This is already the case with the stub approach and is documented in RFC-0356 §1.2: "It resolves build dependencies through the pinned platform worktree (it does not maintain an independent `pnpm-lock.yaml` or `node_modules/`)."

## Acceptance criteria

- [x] `mission.materialize` writes `package.json` from `package.template.json` with all workspace dependencies, build scripts, and deploy scripts (evidence: implemented historically)
- [x] `mission.materialize` writes `astro.config.mjs` from `astro.config.template.mjs` with Cloudflare adapter, React integration, Vite config, and env schema import (evidence: implemented historically)
- [x] `mission.materialize` writes `wrangler.jsonc`, `tsconfig.json`, `.gitignore`, `postcss.config.cjs`, and `.github/workflows/deploy-<id>.yml` from onboarding templates (evidence: implemented historically)
- [x] `mission.materialize` runs `kernel.wire` against the staging Werkstück to generate `tools/` wiring (evidence: implemented historically)
- [x] `mission.materialize` runs the codegen generator sequence (routes, overlay pages, global styles, scripts orchestrator, public infrastructure, i18n middleware, agents docs, API routes, fonts imports) (evidence: implemented historically)
- [x] The materialized Werkstück passes `mission.validate` without manual file additions (evidence: implemented historically)
- [x] The materialization report lists all generated boilerplate files in `regeneration.regeneratedFiles` (evidence: implemented historically)
- [x] `rfc.validate` passes on this RFC file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT generate Ed25519 passport keypairs during `mission.materialize` — keypairs are onboarding-only. The Sternsystem's public key is part of the data set.
- Agents MUST NOT create seed content pages (`home.md`, `labels.md`, `navigation.md`, `business/*.md`) during `mission.materialize` — those are Sternsystem data owned by the pinned bundle.
- Agents MUST preserve the staging directory and atomic rename mechanism. All template writes and codegen calls happen inside the staging directory. The atomic rename to `workpiece/` happens only after all generators succeed.
- Agents MUST construct an app-scoped `KernelRuntimeContext` for the staging directory (same pattern as `onboarding.scaffold` lines 194-198) so that codegen generators can call `requireAstroSitePaths(context)`.
- Agents MUST NOT run the `build.prepare` pipeline inside `mission.materialize` — the pipeline is designed for already-bootstrapped sites. Use the `onboarding.scaffold` pattern instead: templates → `kernel.wire` → codegen generators.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
