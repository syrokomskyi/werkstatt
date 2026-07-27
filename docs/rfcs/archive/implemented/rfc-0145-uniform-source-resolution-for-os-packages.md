---
id: RFC-0145
title: "Uniform source resolution for OS packages — drop the dist indirection"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-02
updatedAt: 2026-06-04
implementedAt: 2026-06-02
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-25
  - RFC-0050
  - RFC-0077
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
  - webgogol-com
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-content"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-astro"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-onboarding"
  - "@gogol/site-kernel-integrity"
  - "@gogol/site-kernel-changelog"
  - "@gogol/site-kernel-deploy"
successSignals:
  - "OS (site-kernel*) packages resolve from src/index.ts, like @gogol/share / business / ontology / ui."
  - "A source edit to any OS package is reflected on the next kernel command with no rebuild."
  - "The app `prebuild` step no longer compiles nine kernel packages to dist before every build."
  - "Type safety is preserved via tsc --noEmit (build:check), not via emitted dist artifacts."
nonGoals:
  - "Do not change app-layer packages (@gogol/share, business, ontology, ui) — they already resolve from src."
  - "Do not drop type-checking — only drop JS emission as a runtime prerequisite."
  - "Do not change runtime behavior of any kernel command or the CLI entrypoint."
  - "Do not publish these packages to a registry — they remain private workspace packages."
  - "Do not introduce a bundler for OS packages."
---

# RFC-0145: Uniform source resolution for OS packages — drop the dist indirection

## Context

Workspace packages split into two resolution conventions:

| Family | `exports` target | Consumed by |
| --- | --- | --- |
| App-layer: `@gogol/share`, `@gogol/business`, `@gogol/ontology`, `@gogol/ui` | `./src/index.ts` | Astro/Vite (transpiles TS) + the tsx CLI |
| OS: `@gogol/site-kernel*` (9 packages) | `./dist/index.js` | the tsx CLI + `apps/*/tools/*.ts` |

The OS packages compile to `dist/` and the apps' `package.json` carries a `prebuild` that rebuilds all nine before every `astro build`:

```jsonc
"prebuild": "pnpm --filter @gogol/site-kernel-content build && pnpm --filter @gogol/site-kernel build && … (9 packages)"
```

Two facts make the `dist` layer unnecessary:

1. **The CLI already runs from source via tsx.** The kernel bin ([`packages/os/site-kernel/bin/site-kernel.mjs`](../../packages/os/site-kernel/bin/site-kernel.mjs)) registers `tsx/esm/api` and imports `../src/cli/index.ts` directly. It loads `.ts`. The only reason a cross-package import like `@gogol/site-kernel-content` lands on compiled JS is that the package's `exports` points at `dist/index.js`. Point it at `src/index.ts` and tsx strips types transparently — exactly as it already does for `@gogol/share`.
2. **No plain-Node consumer exists.** `apps/*/astro.config.mjs` imports only `@gogol/share`, `@gogol/ui`, `@gogol/business`, `@gogol/growth`, `@gogol/ontology`, `@gogol/tokens` — **no `site-kernel*`**. The kernel packages are consumed exclusively by the tsx CLI and by `apps/*/tools/*.ts`, which the same CLI runner loads. The workspace targets Node `>=24` (native TS type stripping) and already depends on `tsx ^4.22.4`.

So `dist` is a self-imposed indirection: the `exports` field forces it, and the `prebuild` keeps it warm.

## Problem

The unprotected invariant is:

> Editing a workspace TypeScript package must take effect on the next run without a manual rebuild. Resolution strategy must be uniform across the workspace, or the inconsistency itself becomes a correctness hazard.

Current failure modes:

1. **Stale-dist bug.** Editing an OS package's `src` has **no effect** until its `dist` is rebuilt, while editing `@gogol/share` takes effect immediately. The two behave oppositely. During the RFC-0142/0143 implementation this directly produced a wrong result — `llms.generate` reported the old 2 MB output until a full rebuild — costing a debugging cycle and risking a false "it doesn't work" conclusion.
2. **Prebuild tax.** Every app build compiles nine kernel packages first, even when unchanged, adding tsc invocations to the critical path.
3. **Split mental model.** Contributors must know which packages are "live from src" and which need a rebuild — undocumented tribal knowledge.
4. **Stale `.d.ts` risk.** Downstream type-checking reads `dist/*.d.ts`; if dist lags src, types and runtime disagree.

## Decision

Make OS packages resolve from source, like the app-layer packages, and keep type safety as a check rather than a runtime prerequisite.

1. **`exports` → `src/index.ts`.** Each `site-kernel*` package points `types` and `default` at `./src/index.ts` (mirroring `@gogol/share`). tsx (CLI) and Node `>=24` (tools) strip types at load.
2. **`build` becomes type-check, not emit.** The package `build` script becomes `tsc --noEmit` (or is folded into the existing `build:check`). CI keeps full type coverage; no `dist/` is produced or shipped.
3. **Drop the app `prebuild` dist compilation.** Apps no longer pre-compile the nine kernel packages. `build.prepare` runs the kernel commands directly via the tsx CLI against source.
4. **Delete `dist/` from the OS packages** and gitignore it (it is already build output, not source).
5. **Document the convention.** The workspace rule becomes: _all internal packages resolve from `src`; any consumer that runs under plain Node without tsx/native-strip must add its own build step._ Recorded in the Generator Contract / package docs.

## Architectural fit

**DNA-25 / thin delivery.** Reinforces it: heavy logic stays in packages, consumed as source, with no compiled-artifact ceremony — the same model `@gogol/share` already follows.

**RFC-0050 / kernel commands.** Unchanged behavior. Commands still load via the tsx CLI; only the resolution target moves from dist to src.

**RFC-0077 / remove legacy surfaces.** Continues the simplification line: removes a vestigial compiled layer that no consumer needs.

## Design

### Per-package change

```jsonc
// packages/os/site-kernel-content/package.json (representative)
{
  "exports": {
    ".": { "types": "./src/index.ts", "default": "./src/index.ts" }
  },
  "main": "./src/index.ts",
  "scripts": {
    // was: "build": "tsc -p tsconfig.build.json"
    "build": "tsc --noEmit -p tsconfig.json"
  }
}
```

`build` is intentionally kept as a script name so the turbo `build` graph and `build:check` continue to invoke type-checking for every OS package. The task no longer writes files; turbo caches the type-check result.

### App change

```jsonc
// apps/*/package.json — remove the prebuild dist-compilation chain
// "prebuild": "pnpm --filter @gogol/site-kernel-content build && … (9 packages)"  ← deleted
```

`build` / `build:check` keep running `site-kernel pipeline build.prepare …` exactly as today — now against source.

### Verification matrix

| Consumer | Runtime | Loads | Works with src exports? |
| --- | --- | --- | --- |
| `site-kernel` CLI bin | tsx | `src/cli/index.ts` + cross-pkg src | yes (tsx strips) |
| `apps/*/tools/*.ts` | tsx (kernel runner) | OS pkg src | yes |
| `astro.config.mjs` | Node/Vite | does **not** import OS pkgs | n/a |
| Astro app runtime | Vite | app-layer pkgs only | unchanged |

The matrix is the core safety argument: there is no consumer that loads an OS package outside tsx / Node-strip.

## Failure modes

- **A future consumer runs an OS package under plain Node without tsx.** It would fail to load `.ts`. Mitigation: documented rule — such a consumer adds tsx registration or a local build step. No such consumer exists today.
- **`turbo build` cache assumes file output.** Mitigation: the `build` task is reconfigured as a no-output type-check; turbo `outputs` for these packages drop `dist/**`.
- **Editor / tsserver resolves to stale `dist/*.d.ts`.** Mitigation: deleting `dist/` and pointing `types` at `src` removes the stale surface entirely.

## Rollout

1. **Phase 1 — one package pilot.** Convert `@gogol/site-kernel-content` (exports → src, build → `--noEmit`), delete its `dist`, run the full kernel command suite + `pnpm build`. Confirms the approach end-to-end on the package most central to generation.
2. **Phase 2 — remaining OS packages.** Convert the other eight identically.
3. **Phase 3 — drop app prebuild.** Remove the nine-package `prebuild` chain from every app and the onboarding `package.json` template.
4. **Phase 4 — turbo + gitignore.** Update `turbo.json` (`build` outputs no `dist/**` for OS packages); gitignore `packages/os/**/dist`.
5. **Phase 5 — docs.** Record the "all internal packages resolve from src" rule.

Each phase is independently green: a converted package still type-checks via `build` and runs via tsx.

## Alternatives considered

**Keep dist, fix the staleness with a turbo dependency.** Make every kernel command depend on a fresh `build`. Rejected. It keeps the compile tax and the split model; it only papers over the staleness with more rebuilds. The inconsistency (src here, dist there) remains.

**Keep dist, add a dev watcher.** Rejected. A watcher is stateful, easy to forget to run, and does not help one-shot CLI invocations (the common case). Source resolution is stateless and always correct.

**Move everything to dist (make app-layer packages compile too).** Rejected. It is the wrong direction: it would slow Astro builds, break the instant-edit DX that `@gogol/share` relies on, and add a bundling concern for packages Vite already handles from source.

**Publish OS packages as compiled artifacts.** Rejected. They are private workspace packages with a single in-repo runner (tsx). There is no external distribution requirement to justify a compile step.

## Risks

**Hidden plain-Node entrypoint.** A script somewhere might `node`-import an OS package without tsx. Mitigation: Phase 1 pilot + a repo-wide grep for `require("@gogol/site-kernel` / non-tsx imports before Phase 2; the documented rule covers any future case.

**Type errors previously masked by stale dist.** Switching to src may surface type errors that a stale `dist` hid. Mitigation: that is a feature — `tsc --noEmit` in `build` makes them visible in CI; fix on conversion.

**Third-party tooling expecting `main` → js.** Some tools assume a JS `main`. Mitigation: the app-layer packages already ship `main: ./src/index.ts` without issue under this toolchain; OS packages match that proven setup.

## Acceptance criteria

- [x] All nine `site-kernel*` packages export `./src/index.ts` for `types` and `default`; `main` points at src. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Each OS package `build` script type-checks via `tsc --noEmit` and emits no `dist/`. (evidence: implemented historically)
- [x] The nine-package `prebuild` chain is removed from every app and the onboarding template. (evidence: implemented historically)
- [x] `packages/os/**/dist` is gitignored and removed from the tree. (evidence: packages/ directory, package exists)
- [x] `turbo.json` `build` outputs no longer include `dist/**` for OS packages. (evidence: implemented historically)
- [x] A `src` edit to any OS package changes the next `site-kernel run …` result with no rebuild. (evidence: implemented historically)
- [x] `pnpm build` green for both apps; `turbo run build:check` green. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST keep a `build` script on every OS package (as `tsc --noEmit`) so the turbo `build` / `build:check` graph still type-checks them.
- Agents MUST NOT convert app-layer packages — they already resolve from src.
- Agents MUST run the full kernel command suite + `pnpm build` after the Phase 1 pilot before converting the remaining packages.
- Agents MUST grep for non-tsx Node imports of `@gogol/site-kernel*` before Phase 2 and document any consumer that needs a build step.
- When implementing, agents MUST reference `RFC-0145` in commits / PRs.
