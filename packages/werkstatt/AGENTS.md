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

## Mission git helpers

- `commitWorkpieceIfDirty(workpieceDir, missionId)` (RFC-0644): auto-commits all dirty files in the workpiece via `git add -A` + `git commit --no-verify`. Returns `{ committed: boolean, commitSha: string | null }`. Used by `mission.reconcile` and `mission.close` (RFC-0797) to auto-commit dirty workpieces instead of throwing.
- `commitCacheCloneIfDirty(systemDir, systemId)` (RFC-0797): auto-commits all dirty files in the cache clone via `git add -A` + `git commit --no-verify`. Returns `{ committed: boolean, commitSha: string | null }`. Used by `mission.reconcile` (before the dirty guard) and `mission.validate` (post-validate cleanup) to auto-commit generated files instead of leaving the cache clone dirty.

## Env file persistence (RFC-0822)

- `persistEnvFilesToCacheClone(workpieceDir, cacheCloneDir)` (RFC-0822): copies `.env*` files from workpiece to cache clone (untracked). Excludes `.env.example` and `.env.*.example`. Used by `mission.close` as a final step. Non-fatal on failure.
- `restoreEnvFilesFromCacheClone(cacheCloneDir, workpieceDir)` (RFC-0822): restores `.env*` files from cache clone to workpiece after `atomicMoveDir`. Replaces `PUBLIC_IMAGE_PROVIDER` with `build-portable`. Used by `mission.materialize`. Non-fatal on failure.
- `sternsystem.validate` emits `ENV-PERSIST-01` warning when cache clone lacks `.env*` but active workpiece has them.

## Operator config file persistence (RFC-0840)

- `OPERATOR_CONFIG_FILES` constant in `operator-config-files.ts` declares the canonical list of operator config files to persist: `[".lighthouse-budget-ignore", "src/image-delivery.config.yaml"]`. Entries are path-based (not just filenames) to support files in subdirectories. Adding a new file requires a superseding RFC.
- `persistOperatorConfigFiles(workpieceDir, cacheCloneDir)` (RFC-0840): copies each file in `OPERATOR_CONFIG_FILES` from workpiece to cache clone (untracked). Uses `path.join` with subpath entries. Non-fatal on failure. Used by `mission.close` after `persistEnvFilesToCacheClone`.
- `restoreOperatorConfigFiles(cacheCloneDir, workpieceDir)` (RFC-0840): restores each file from cache clone to workpiece after `atomicMoveDir`. Creates parent directories with `mkdir { recursive: true }`. Does NOT modify file contents. Non-fatal on failure. Used by `mission.materialize` after `restoreEnvFilesFromCacheClone`.
- `materialize.config.validate` (RFC-0840): workspace-scope check command in `PACKAGES_CHECK_PIPELINE`. Emits MAT-CONFIG-01 (warning: unrecognized operator file in workpiece root or `src/`) and MAT-CONFIG-02 (error: dead entry in `OPERATOR_CONFIG_FILES` not found in any workpiece or cache clone).
- `workpiece.config.presence.check` (RFC-0844): pre-build gate in `mission.validate` that verifies all `OPERATOR_CONFIG_FILES` entries are present in the active workpiece before the build pipeline starts. Runs before the Playwright Chromium pre-flight (RFC-0813). Returns `status: "fail"` with restore commands for each missing file. Non-fatal if the check command itself throws. Skipped on distribution-reuse path.

## Autonomy guard

The `werkstatt.autonomy.validate` command enforces DNA-64. It scans `packages/werkstatt/src/**` for `@warpgogol/*` import specifiers. Exemptions:

- `@warpgogol/werkstatt` (self-imports)
- `@warpgogol/werkstatt-site/ontology`, `@warpgogol/werkstatt-site/share` (shared schema subpaths)
- `@warpgogol/forge` (governance)
- `@warpgogol/werkstatt-site/passport`, `@warpgogol/werkstatt-site/observability`, `@warpgogol/werkstatt-site/integration`, `@warpgogol/werkstatt-site/surface` (shared infrastructure subpaths)

Excludes: `node_modules/`, `tests/`, `tests-handoff/`, `*.test.ts`, `*.spec.ts`.

## Pre-dev critical file check in mission.preview

`mission.preview` must verify that dev-critical generated files exist before starting the dev server. The check uses `existsSync` (instant, no pipeline overhead) and auto-generates missing files via `executeKernelCommand`. If generation fails, the server launch is blocked with an actionable error message explaining what is missing, why it matters, and how to fix it. The `--skip-prepare` flag bypasses the check for fast restarts when files are known to exist.

RFC-0817: `mission.preview` also enforces a materialization gate before the dev-critical file check. If `materializedAt` is null and mission state is `open`, `mission.materialize` is auto-run. This gate is NOT bypassed by `--skip-prepare` — materialization is the formal lifecycle gate, not a convenience check. Non-open missions (closed, aborted) skip the materialization check.

Dev-critical files: `src/content-ref-index.generated.yaml`, `src/derived-prices.generated.json`, `src/video-manifest.generated.yaml`. Some generators have prerequisites (e.g. `derived-prices.materialize` requires `entitlements.resolve`, `rate-snapshot.resolve`, `currency-pricing.compile`) — the check runs prerequisites before the owning command.

## Cache-clone commit guard (RFC-0821)

`installBordbuchPreCommitHook` (RFC-0658) installs a **combined pre-commit hook** in cache clones that includes both the bordbuch integrity guard and a **commit guard** that blocks direct `git commit` unless the `MISSION_GIT_COMMIT=1` environment variable is set. `mission.git.commit` sets this variable; raw `git commit` does not.

This is the only **hard guard** preventing agents from directly committing to Sternsystem cache clones. AGENTS.md rules are soft guards — they rely on agent compliance. The pre-commit hook is enforced by git itself and cannot be bypassed without `--no-verify` (which AGENTS.md already restricts to last-resort use on closed missions).

Agents MUST NOT use `git commit --no-verify` in cache clones to bypass this guard. If a file needs to be committed to a cache clone, use `mission.git.commit` or open a mission and work through the workpiece.
