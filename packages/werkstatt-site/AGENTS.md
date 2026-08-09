# `@warpgogol/werkstatt-site` — Agent Guide

RFC-0774/0775: Werkstatt site plugin — Astro stack engine modules and domain layer. Consolidates `site-kernel-astro`, `site-kernel-checks`, `site-kernel-codegen`, `site-kernel-content`, `site-kernel-onboarding`, `site-kernel-audit`, `site-kernel-check-warpgogol`, `site-kernel-changelog` renderers, and `site-kernel-deploy` into a single plugin package implementing `werkstatt/plugin@1`.

**Workspace type:** Package

This is a **package** workspace. Expose stable typed APIs. Do not import from apps or services.

## Entry points

| Entry point | Module |
| --- | --- |
| `@warpgogol/werkstatt-site` | `./src/index.ts` (plugin entry point) |
| `@warpgogol/werkstatt-site/paths` | `./src/paths/index.ts` |
| `@warpgogol/werkstatt-site/content` | `./src/content/index.ts` |
| `@warpgogol/werkstatt-site/codegen` | `./src/codegen/index.ts` |
| `@warpgogol/werkstatt-site/checks` | `./src/checks/index.ts` |
| `@warpgogol/werkstatt-site/checks/module` | `./src/checks/module.ts` |
| `@warpgogol/werkstatt-site/checks/check-warpgogol` | `./src/checks/check-warpgogol/index.ts` |
| `@warpgogol/werkstatt-site/onboarding` | `./src/onboarding/index.ts` |
| `@warpgogol/werkstatt-site/onboarding/module` | `./src/onboarding/module.ts` |
| `@warpgogol/werkstatt-site/audit` | `./src/audit/index.ts` |
| `@warpgogol/werkstatt-site/changelog` | `./src/changelog/index.ts` |
| `@warpgogol/werkstatt-site/deploy` | `./src/deploy/index.ts` |

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
- Re-export shims in old packages (`packages/os/site-kernel-*`) preserve backward-compatible import paths during the transition period (RFC-0774 → RFC-0776).
- Full inversion of engine→stack imports through plugin hooks is deferred to RFC-0776.

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
