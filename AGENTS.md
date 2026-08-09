# `@warpgogol/werkstatt` — Agent Guide

RFC-0770: Werkstatt engine plugin contract and validation. Defines the `werkstatt/plugin@1` contract types, plugin registry, and the `werkstatt.plugin.validate` command.

**Workspace type:** Package

This is a **package** workspace. Expose stable typed APIs. Do not import from apps or services.

## Entry points

| Entry point | Module |
| --- | --- |
| `@warpgogol/werkstatt` | `./src/index.ts` |
| `@warpgogol/werkstatt/plugin` | `./src/plugin-contract.ts` |
| `@warpgogol/werkstatt/os/werkstatt-plugin-module` | `./os/werkstatt-plugin.module.ts` |

## Scripts

| Script | Command |
| --- | --- |
| `build:check` | `tsc --noEmit` |
| `test` | `vitest run --passWithNoTests` |
| `test:watch` | `vitest` |

## Dependencies

**Workspace:**

- `@warpgogol/site-kernel`

**External:**

- `tsx` `^4.20.0`
- `yaml` `^2.9.0`

## Package architecture

- This package owns the plugin contract types (`WerkstattPlugin`, `WerkstattPluginHooks`, `PluginRegistry`) and the `werkstatt.plugin.validate` command.
- The package is stack-agnostic (DNA-64). It MUST NOT import stack plugins or stack-specific packages.
- The `DeployAdapterFactory` type is a placeholder (`unknown`) — the exact shape is re-homed by RFC-0772 when the full engine package is composed.
- The validate handler uses the pure function + thin kernel handler pattern: `validatePlugin` is the pure function, `forgeWerkstattPluginModule` is the kernel adapter.
