# `@warpgogol/werkstatt-game` — Agent Guide

RFC-0777: Werkstatt game plugin — Phaser turborepo stack. Implements the `werkstatt/plugin@1` contract for game projects using Phaser + Vite + Turborepo.

**Workspace type:** Package

This is a **package** workspace. Expose stable typed APIs. Do not import from apps or services.

## RFC-0855 transition

The Phaser profile identity and stack behavior survive, but the checked-in `werkstatt/plugin@1` entry is a pre-cutover fact. Convert hooks, validators, adapters, and invariants into versioned lifecycle-managed capabilities only when the corresponding RFC-0855 packet is sealed. Do not add a plugin compatibility adapter, import this package into the engine, or enable untrusted production artifacts. Packet 230 owns deletion of the old plugin entry.

## Plugin contract

| Field | Value |
| --- | --- |
| `schema` | `werkstatt/plugin@1` |
| `id` | `werkstatt-game` |
| `profileId` | `phaser-turborepo` |
| `moduleLoaders` | `checks`, `onboarding` |
| `deployAdapters` | `github-pages`, `cloudflare-pages` |
| `hooks` | `build`, `checkGate`, `releaseEvidence`, `scaffoldProject` |
| `paths` | `src` (contentDir), `dist` (distDir), `phaser.config.ts` + `src/main.ts` (entryPoints) |
| `invariants` | GAME-01..04 |

## Module layout

| Module | File | Description |
| --- | --- | --- |
| Plugin entry | `src/index.ts` | `werkstattGamePlugin` export |
| Path conventions | `src/paths/phaser-paths.ts` | Phaser path constants |
| Invariants | `src/invariants/game-invariants.ts` | GAME-01..04 declarations |
| Assets validator | `src/checks/assets-validate.ts` | `game.assets.validate` (GAME-02) |
| Scenes validator | `src/checks/scenes-validate.ts` | `game.scenes.validate` (GAME-01) |
| Bundle validator | `src/checks/bundle-validate.ts` | `game.bundle.validate` (GAME-03) |
| Secret scan | `src/checks/secret-scan.ts` | `game.secret.scan` (GAME-04) |
| Check gate | `src/checks/index.ts` | Runs all 4 validators in checkGate |
| Check module | `src/checks/module.ts` | Kernel module registering validators |
| Build hook | `src/build/vite-build.ts` | `hooks.build` — runs `vite build` |
| GitHub Pages | `src/deploy/github-pages.ts` | `deployAdapters["github-pages"]` |
| Cloudflare Pages | `src/deploy/cloudflare-pages.ts` | `deployAdapters["cloudflare-pages"]` |
| Scaffold | `src/onboarding/scaffold-project.ts` | `hooks.scaffoldProject` |
| Onboarding module | `src/onboarding/module.ts` | Kernel module registering scaffold command |
| Release evidence | `src/release-evidence/game-evidence.ts` | `hooks.releaseEvidence` |

## Stack invariants

| ID | Invariant | Enforced by |
| --- | --- | --- |
| GAME-01 | Every scene in `src/scenes/` must be registered in `phaser.config.ts` | `game.scenes.validate` |
| GAME-02 | Every asset referenced by a scene must exist in `src/assets/` and be listed in the asset manifest | `game.assets.validate` |
| GAME-03 | Bundle size must not exceed the declared budget (default 5 MB gzipped) | `game.bundle.validate` |
| GAME-04 | No hardcoded API keys or secrets in game source — enforced by secret scan in checkGate | `game.secret.scan` |

## Check gate composition

`checkGate` runs all 4 validators in sequence:
1. `game.assets.validate` — asset manifest completeness
2. `game.scenes.validate` — scene registry consistency
3. `game.bundle.validate` — bundle size budget
4. `game.secret.scan` — hardcoded secret detection

All must pass for checkGate to succeed.

## Credential injection

Deploy adapters read credentials from `systems/registry.yaml` channel config, never from environment variables directly:

- **github-pages**: `deploy.github.token` (GitHub access token), `deploy.github.repo` (optional, e.g. `user/repo`)
- **cloudflare-pages**: `deploy.cloudflare.apiToken`, `deploy.cloudflare.accountId`, `deploy.cloudflare.projectName`

## Bundle measurement

`game.bundle.validate` measures gzipped bundle size by:
1. Listing all files in `dist/`
2. Gzipping each file individually using `node:zlib.gzipSync`
3. Summing the gzipped sizes
4. Comparing the total against `bundleBudget` from `phaser.config.ts` (default: 5242880 bytes = 5 MB)

## Scripts

| Script        | Command                                   |
| ------------- | ----------------------------------------- |
| `build`       | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `build:check` | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `test`        | `vitest run`                              |
| `test:watch`  | `vitest`                                  |

## Publication

This package is published via repo-extract (RFC-0773). See `extract.config.yaml` for the extraction configuration. The package MUST NOT be published without operator approval.
