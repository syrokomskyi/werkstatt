# `@warpgogol/werkstatt-phaser` — Agent Guide

Werkstatt Phaser plugin — Phaser + Vite + Turborepo stack. Implements the `werkstatt/plugin@1` contract for game projects using Phaser 3.x with Vite and Turborepo.

**Workspace type:** Package

This is a **package** workspace. Expose stable typed APIs. Do not import from apps or services.

## RFC-0855 program completion

All 25 packets (000–240) are completed. The Phaser profile identity and stack behavior survive. The checked-in `werkstatt/plugin@1` entry is a **legacy code fact** — it still loads and functions, but is architecturally superseded. Converting hooks, validators, adapters, and invariants into versioned lifecycle-managed capabilities requires a superseding RFC. Do not add a plugin compatibility adapter, import this package into the engine, or enable untrusted production artifacts.

## Plugin contract

| Field | Value |
| --- | --- |
| `schema` | `werkstatt/plugin@1` |
| `id` | `werkstatt-phaser` |
| `profileId` | `phaser-turborepo` |
| `moduleLoaders` | `checks` |
| `deployAdapters` | `github-pages`, `cloudflare-pages` |
| `hooks` | `build`, `checkGate`, `releaseEvidence`, `scaffoldProject` |
| `paths` | `src` (contentDir), `dist` (distDir), `phaser.config.ts` + `src/main.ts` (entryPoints) |
| `invariants` | PHASER-01..04 |

## Module layout

| Module | File | Description |
| --- | --- | --- |
| Plugin entry | `src/index.ts` | `werkstattPhaserPlugin` export |
| Path conventions | `src/paths/phaser-paths.ts` | Phaser path constants |
| Invariants | `src/invariants/phaser-invariants.ts` | PHASER-01..04 declarations |
| Assets validator | `src/checks/assets-validate.ts` | `phaser.assets.validate` (PHASER-02) |
| Scenes validator | `src/checks/scenes-validate.ts` | `phaser.scenes.validate` (PHASER-01) |
| Bundle validator | `src/checks/bundle-validate.ts` | `phaser.bundle.validate` (PHASER-03) |
| Secret scan | `src/checks/secret-scan.ts` | `phaser.secret.scan` (PHASER-04) |
| Check gate | `src/checks/index.ts` | Runs all 4 validators in checkGate |
| Check module | `src/checks/module.ts` | Kernel module registering validators |
| Build hook | `src/build/vite-build.ts` | `hooks.build` — runs `vite build` |
| GitHub Pages | `src/deploy/github-pages.ts` | `deployAdapters["github-pages"]` |
| Cloudflare Pages | `src/deploy/cloudflare-pages.ts` | `deployAdapters["cloudflare-pages"]` |
| Deploy types | `src/deploy/types.ts` | Shared `DeployResult` interface |
| Scaffold | `src/onboarding/scaffold-project.ts` | `hooks.scaffoldProject` |
| Release evidence | `src/release-evidence/phaser-evidence.ts` | `hooks.releaseEvidence` |
| Shared utils | `src/utils/list-files-recursive.ts` | Recursive file listing utility |

## Stack invariants

| ID | Invariant | Enforced by |
| --- | --- | --- |
| PHASER-01 | Every scene in `src/scenes/` must be registered in `phaser.config.ts` | `phaser.scenes.validate` |
| PHASER-02 | Every asset referenced by a scene must exist in `src/assets/` and be listed in the asset manifest | `phaser.assets.validate` |
| PHASER-03 | Bundle size must not exceed the declared budget (default 5 MB gzipped) | `phaser.bundle.validate` |
| PHASER-04 | No hardcoded API keys or secrets in game source — enforced by secret scan in checkGate | `phaser.secret.scan` |

## Check gate composition

`checkGate` runs all 4 validators in sequence:

1. `phaser.assets.validate` — asset manifest completeness
2. `phaser.scenes.validate` — scene registry consistency
3. `phaser.bundle.validate` — bundle size budget
4. `phaser.secret.scan` — hardcoded secret detection

All must pass for checkGate to succeed.

## Credential injection

Deploy adapters read credentials from `systems/registry.yaml` channel config, never from environment variables directly:

- **github-pages**: `deploy.github.token` (GitHub access token), `deploy.github.repo` (optional, e.g. `user/repo`)
- **cloudflare-pages**: `deploy.cloudflare.apiToken`, `deploy.cloudflare.accountId`, `deploy.cloudflare.projectName`

## Bundle measurement

`phaser.bundle.validate` measures gzipped bundle size by:

1. Listing all files in `dist/`
2. Gzipping each file individually using `node:zlib.gzipSync`
3. Summing the gzipped sizes
4. Comparing the total against `bundleBudget` from `phaser.config.ts` (default: 5242880 bytes = 5 MB)

## Scripts

| Script        | Command                                   |
| ------------- | ----------------------------------------- |
| `lint`        | `pnpm exec eslint "src/**/*.ts"`          |
| `typecheck`   | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `build`       | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `build:check` | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `test`        | `vitest run`                              |
| `test:watch`  | `vitest`                                  |

## Publication

This package is published via repo-extract (RFC-0773). See `extract.config.yaml` for the extraction configuration. The package MUST NOT be published without operator approval.
