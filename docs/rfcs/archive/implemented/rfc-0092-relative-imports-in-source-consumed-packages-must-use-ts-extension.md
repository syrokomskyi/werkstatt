---
id: RFC-0092
title: "Relative imports in source-consumed packages must use the .ts extension"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-24
updatedAt: 2026-06-04
implementedAt: 2026-05-24
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0087
  - RFC-0089
commands:
  proposed:
    - import.extensions.lint
    - tsconfig.shape.lint
  added:
    - import.extensions.lint
    - tsconfig.shape.lint
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - business
  - growth
  - ontology
  - share
  - ui
  - os/site-kernel-checks
  - tsconfig (shared base)
successSignals:
  - "`pnpm build` from workspace root succeeds in one pass."
  - "`pnpm --filter <app> dev` serves `/de/` with HTTP 200 — no `ERR_MODULE_NOT_FOUND`."
  - "Zero `.js`/`.jsx`-suffixed relative imports remain in `packages/{business,growth,ontology,share,ui}`."
  - "Agents that introduce a `.js` extension import or remove the shared `allowImportingTsExtensions` flag are rejected by `packages-check.run` before any human reviews the PR."
nonGoals:
  - Forcing apps/ to use the same convention.
  - Switching the workspace from source-consumed packages to built outputs.
---

# RFC-0092: Relative imports in source-consumed packages must use the .ts extension

## Context

Every workspace package under `packages/` (except those with an explicit `tsc` emit step like `site-kernel-content`) is "source-consumed": its `package.json` `main`/`types`/`exports` point directly at `src/index.ts`. Consumers' TypeScript and bundlers read the `.ts` sources at runtime / build time.

For relative imports inside those source files, TypeScript supports two surface conventions:

1. **`.ts` extensions** — `import { foo } from "./bar.ts"`. Works at type-check time when `allowImportingTsExtensions: true`. Works at runtime in every loader that can read `.ts` (Vite, Astro dev, `tsx`, `vite-node`) because the specifier matches the on-disk filename.
2. **`.js` extensions** — the "ship .js, source is .ts" NodeNext convention. Works for packages that BUILD before publishing. Does NOT work for source-consumed packages in `astro dev`, because Astro's SSR module loader hits Node's native ESM resolver for transitive package imports, and Node looks for `./bar.js` literally on disk — there is no `.js` file because the package only ships `.ts`.

The warpgogol-4 monorepo flip-flopped between these two conventions at least five times across May 2026. Each agent fixed the loudest current error and silently created the other:

- **Build error** (when `.ts` is used): `share/src/content/dispatch.ts(8,51): error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.` Fires in any consumer that runs `tsc` with `noEmit: false` and does NOT carry the flag — most prominently `@gogol/site-kernel-content`.
- **Dev error** (when `.js` is used): `Cannot find module '…\packages\share\src\semantic\models.js' imported from '…\packages\share\src\semantic\index.ts'`. Fires in Astro dev for every transitive package import after a request.

## Problem

The two errors are symmetric and neither convention alone resolves both. A naive RFC picking one extension fixes one error and resurrects the other within days.

## Decision

**Adopt `.ts` / `.tsx` in source.** Every relative import or re-export inside `packages/**/*.ts(x)` MUST use the on-disk file's extension:

- `.ts` for TypeScript modules.
- `.tsx` for React components.

`.js` / `.jsx` / extensionless are forbidden.

**Make the shared tsconfig carry the relevant flags so the build error never resurfaces:**

| Config file | Setting | Why |
| --- | --- | --- |
| `tsconfig/base.json` | `allowImportingTsExtensions: true` | Lets every package (and every consumer that extends the base) accept `.ts` import specifiers at type-check time. |
| `tsconfig/node-lib.json` | `rewriteRelativeImportExtensions: true` (TS 5.7+) | Emit-enabled consumers (e.g. `@gogol/site-kernel-content`) rewrite `./foo.ts` → `./foo.js` in their `dist/` output, so the emitted JavaScript runs correctly in Node. |

With both flags in place, the same `.ts` source imports work in three modes simultaneously: source-consumed type-checking, source-consumed dev (Astro/Vite find the file directly), and emit-target build (consumer rewrites to `.js` for its dist output).

## Architectural fit

- **RFC-0087** required generators to be byte-stable. This RFC requires import specifiers to be byte-stable too — the lints below prevent the recurring flip-flop.
- **RFC-0089** introduced the dual-key `.astro` exports contract and the `astro.exports.lint` workspace command. RFC-0092 follows the same pattern (workspace-scope lints in `PACKAGES_CHECK_PIPELINE`).

## Design

### Two new workspace commands

| Command | Behavior |
| --- | --- |
| `import.extensions.lint` | Walks every `.ts`/`.tsx` file under `packages/` (skipping `.template.ts`, `.template.tsx`, `.d.ts`). Rejects relative specifiers ending in `.js`/`.jsx` and extensionless relatives. Each diagnostic prints `file:line`, the bad specifier, and the exact corrected form. |
| `tsconfig.shape.lint` | Verifies `tsconfig/base.json` has `allowImportingTsExtensions: true` and `tsconfig/node-lib.json` has `rewriteRelativeImportExtensions: true`. Rejects any per-package `tsconfig.json` that EXPLICITLY sets `allowImportingTsExtensions: false`. |

Both are registered in `PACKAGES_CHECK_PIPELINE`.

### Output format

```
[ERROR] packages/share/src/semantic/index.ts:26 — relative import "./models.js"
        uses .js extension. Rewrite to "./models.ts" (RFC-0092).

[ERROR] tsconfig/base.json — compilerOptions.allowImportingTsExtensions must be true
        so source-consumed packages can import "./foo.ts" directly. Removing this flag
        re-breaks Astro dev for every app (RFC-0092).
```

### Bulk migration

A one-shot Node script rewrites every offending import in the five affected packages, only when the target `.ts` (or `.tsx`) actually exists on disk. Result: 49 files changed, 239 imports rewritten.

## Rollout

1. Add `allowImportingTsExtensions: true` to `tsconfig/base.json` and `rewriteRelativeImportExtensions: true` to `tsconfig/node-lib.json`.
2. Bulk-rewrite all `.js`-suffixed relative imports across the five source-consumed packages.
3. Remove per-package overrides of `allowImportingTsExtensions` (now inherited from base).
4. Land `import.extensions.lint` and `tsconfig.shape.lint`. Wire both into `PACKAGES_CHECK_PIPELINE`.
5. Update root `AGENTS.md` with the corrected hard rule and rationale.

## Alternatives considered

- **Universal `.js` + Vite `extensionAlias` in every app.** Tested in this session; `extensionAlias: { ".js": [".ts", ".tsx", ".js"] }` did NOT fix Astro dev — the error trace is `node:internal/modules/esm/resolve`, which is Node's native loader and not under Vite's reach.
- **Build every package to `dist/` first.** Doubles type-check work, breaks the source-consumed decision, slows the dev loop.
- **Per-package `allowImportingTsExtensions: true` overrides.** Already proved insufficient — share had the flag, but `@gogol/site-kernel-content` consumes share's source and didn't inherit it. The shared base is the only place that fixes this once and for all.

## Risks

- An agent re-introducing `.js` imports during the migration window. Mitigation: `import.extensions.lint` blocks it.
- An agent removing the shared `allowImportingTsExtensions` or `rewriteRelativeImportExtensions` thinks they're "cleaning up". Mitigation: `tsconfig.shape.lint` rejects exactly that.
- A future package that legitimately ships compiled JS externally needs a different convention. Mitigation: extend `tsconfig/node-lib.json`, keep `.ts` source, ship `.js` via `rewriteRelativeImportExtensions`.

## Acceptance criteria

- [x] All `.js`-suffixed relative imports in `packages/{business,growth,ontology,share,ui}` rewritten to `.ts`/`.tsx`. — 239 rewrites across 49 files. (evidence: packages/ directory, package exists)
- [x] `tsconfig/base.json` carries `allowImportingTsExtensions: true`. (evidence: implemented historically)
- [x] `tsconfig/node-lib.json` carries `rewriteRelativeImportExtensions: true`. (evidence: implemented historically)
- [x] `packages/share/tsconfig.json` no longer overrides `allowImportingTsExtensions` (inherited from base). (evidence: packages/ directory, package exists)
- [x] `import.extensions.lint` workspace command registered and wired into `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] `tsconfig.shape.lint` workspace command registered and wired into `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] Root `AGENTS.md` carries the rule under a "Relative imports — HARD RULE (RFC-0092)" section with ✅/❌ examples and the explicit "don't switch to .js" warning. (evidence: AGENTS.md:1, agent guide updated)
- [x] `pnpm build` from workspace root passes end-to-end. (evidence: implemented historically)
- [x] `pnpm --filter <app> dev` serves `/de/` with HTTP 200 (no `ERR_MODULE_NOT_FOUND`). (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status: accepted.
- Agents MUST NOT change RFC status.
- **Hard rule** for every code change in `packages/`: every relative import or re-export ends in `.ts` (or `.tsx`) — the same as the on-disk filename. Never `.js`, never `.jsx`, never extensionless.
- When `tsc` complains `TS5097`, do NOT switch the imports to `.js`. Confirm the failing package extends `tsconfig/base.json` (or `tsconfig/node-lib.json` for emit-enabled packages); both supply the right flags.
- When `astro dev` errors with `Cannot find module '…/foo.js' imported from '…/foo.ts'`, the offending import is `.js` and must become `.ts`.
