# `@warpgogol/werkstatt` — Agent Guide

RFC-0769/0772: Werkstatt engine — stack-agnostic lifecycle platform. Consolidated from `packages/os/site-kernel`, `packages/os/site-kernel-handoff`, `packages/os/site-kernel-integrity`, `packages/os/site-kernel-observability`, `packages/os/site-kernel-changelog`, `packages/fingerprint`, `packages/agent-gate`, and `packages/ontology/operations` into a single engine package.

**Workspace type:** Package

This is a **package** workspace. Expose stable typed APIs. Do not import from apps or services.

## Entry points

| Entry point | Module |
| --- | --- |
| `@warpgogol/werkstatt` | `./src/index.ts` |
| `@warpgogol/werkstatt/plugin` | `./src/plugin-contract.ts` |
| `@warpgogol/werkstatt/plugin/invoke-hook` | `./src/plugin/invoke-hook.ts` |
| `@warpgogol/werkstatt/os/werkstatt-plugin-module` | `./os/werkstatt-plugin.module.ts` |
| `@warpgogol/werkstatt/os/werkstatt-autonomy-module` | `./os/werkstatt-autonomy.module.ts` |
| `@warpgogol/werkstatt/kernel` | `./src/kernel/index.ts` |
| `@warpgogol/werkstatt/kernel/*` | `./src/kernel/*` (all kernel subpath exports) |
| `@warpgogol/werkstatt/mission` | `./src/mission/index.ts` |
| `@warpgogol/werkstatt/sternsystem` | `./src/sternsystem/index.ts` |
| `@warpgogol/werkstatt/release` | `./src/release/index.ts` |
| `@warpgogol/werkstatt/leitstand` | `./src/leitstand/index.ts` |
| `@warpgogol/werkstatt/bordbuch` | `./src/bordbuch/index.ts` |
| `@warpgogol/werkstatt/notausgang` | `./src/notausgang/index.ts` |
| `@warpgogol/werkstatt/artifact-store` | `./src/artifact-store/index.ts` |
| `@warpgogol/werkstatt/evidence` | `./src/evidence/index.ts` |
| `@warpgogol/werkstatt/integrity` | `./src/integrity/index.ts` |
| `@warpgogol/werkstatt/observability` | `./src/observability/index.ts` |
| `@warpgogol/werkstatt/fingerprint` | `./src/fingerprint/index.ts` |
| `@warpgogol/werkstatt/fingerprint/semantic` | `./src/fingerprint/semantic.ts` |
| `@warpgogol/werkstatt/agent-gate` | `./src/agent-gate/index.ts` |
| `@warpgogol/werkstatt/changelog` | `./src/changelog/index.ts` |
| `@warpgogol/werkstatt/schemas` | `./src/schemas/index.ts` |
| `@warpgogol/werkstatt/handoff` | `./src/handoff/index.ts` |
| `@warpgogol/werkstatt/workshop` | `./src/workshop/index.ts` |
| `@warpgogol/werkstatt/workshop-module` | `./src/workshop/workshop.module.ts` |
| `@warpgogol/werkstatt/*-module` | `./src/*/*.module.ts` (all module entry points) |

## Scripts

| Script        | Command                                   |
| ------------- | ----------------------------------------- |
| `build`       | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `build:check` | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `test`        | `vitest run`                              |
| `test:watch`  | `vitest`                                  |

## Package architecture

- This package owns the Werkstatt engine: kernel runtime, missions, mirrors (Sternsystem), releases, Leitstand, Bordbuch, Notausgang, artifact store, evidence, deploy orchestration, werkstatt consistency primitives, fingerprint, integrity, observability, agent-gate, changelog, operations schemas, and workshop scaffolding (RFC-0779).
- The package is stack-agnostic (DNA-64). It MUST NOT import stack plugins.
- The plugin contract (`werkstatt/plugin@1`) and registry are in `src/plugin-contract.ts` and `src/plugin-registry.ts`.
- The `werkstatt.autonomy.validate` command (DNA-64 enforcement) scans `src/**` for forbidden `@warpgogol/*` imports.
- RFC-0776 completed the migration: old packages (`packages/os/site-kernel*`, `packages/fingerprint`, `packages/agent-gate`) are deleted. All imports now go through `@warpgogol/werkstatt` subpath exports.

## Autonomy guard

The `werkstatt.autonomy.validate` command enforces DNA-64. It scans `packages/werkstatt/src/**` for `@warpgogol/*` import specifiers. Exemptions:

- `@warpgogol/werkstatt` (self-imports)
- `@warpgogol/werkstatt-site/ontology`, `@warpgogol/werkstatt-site/share` (shared schema subpaths)
- `@warpgogol/forge` (governance)
- `@warpgogol/werkstatt-site/passport`, `@warpgogol/werkstatt-site/observability`, `@warpgogol/werkstatt-site/integration`, `@warpgogol/werkstatt-site/surface` (shared infrastructure subpaths)

Excludes: `node_modules/`, `tests/`, `tests-handoff/`, `*.test.ts`, `*.spec.ts`.
