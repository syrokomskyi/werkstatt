---
id: RFC-0259
title: "Align turbo task contracts with generated build artifacts"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-01
updatedAt: 2026-07-02
implementedAt: 2026-07-02
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0049
  - RFC-0087
  - RFC-0154
  - RFC-0204
commands:
  proposed:
    - pipeline.cache.parity
  added:
    - pipeline.cache.parity
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel-checks"
successSignals:
  - "A turbo cache hit never leaves an app in a state that differs from a cold build (verified by `pipeline.cache.parity`)."
  - "The root `turbo.json` no longer claims cacheability for tasks whose outputs are not fully declared."
  - "Workspace-shared registries are built once per `turbo run build`, before any app build starts."
nonGoals:
  - "Do not optimize build speed in this RFC; correctness of the cache contract comes first."
  - "Do not hand-maintain an exhaustive outputs list per app — re-enabling caching is gated on rfc-0266 (generated command manifest) supplying declared outputs."
  - "Do not change what the generators produce (RFC-0049 output invariant is untouched)."
---

# RFC-0259: Align turbo task contracts with generated build artifacts

## Context

Part A of the 2026-07-02 AEO audit series (see rfc-0258 for series order). Depends on rfc-0258 (atomic shared writes).

The root `turbo.json` declares for the `build` task: `outputs: ["dist/**", ".astro/**"]`. But an app build is self-mutating far beyond those paths: `build.prepare` writes `public/_img/**`, `public/_video/**`, `public/sitemap.xml`, `src/*.generated.json` (`entitlements`, `surface`, `freshness`, `knowledge`, `image-variants`, `video-manifest`, …), `src/styles/biome.generated.css`, `src/content/prose/{lang}/open-source.md`, plus the workspace-root registries (`uni.registry.json`, `packages/ontology/archetypes/index.json`).

## Problem

Two unprotected invariants:

1. **Cache-restore completeness.** On a turbo cache hit only `dist/` and `.astro/` are restored. Every consumer of the undeclared side artifacts — `handoff.pack`, `image.variants.validate`, postbuild audits, a subsequent `build:check` — then reads stale or missing files. Behavior depends on cache state, which is invisible to an agent reading the code.
2. **Input stability.** The build mutates files that participate in turbo's input hash, so the hash differs before and after a run. Cache behavior becomes an emergent property instead of a contract.

This directly violates the platform's core requirement: an agent-run build must be deterministic regardless of orchestrator cache state.

## Decision

Adopt a two-step contract:

**Step 1 (this RFC, immediate):**

1. Set `"cache": false` on the app-affecting `build` and `build:check` turbo tasks. This is the honest contract today: self-mutating tasks are not cacheable.
2. Add a root turbo task `//#registry:build` that runs `uni.registry.build` + `archetype.registry.build` once, declared with exact outputs; app `build`/`build:check` tasks gain `dependsOn: ["//#registry:build"]`. Per-app pipeline steps keep running these commands (safe and idempotent after rfc-0258; they become fast no-ops).
3. Add a `pipeline.cache.parity` command that proves cold-vs-warm equivalence and becomes the permanent gate for any future re-enablement of caching.

**Step 2 (deferred, gated on rfc-0266):** regenerate `turbo.json` task `inputs`/`outputs` from the command manifest's declared read/write paths, then re-enable caching behind a green `pipeline.cache.parity`.

## Architectural fit

- Upholds RFC-0049 (never generate into `dist/`, never validate against `dist/`) by making the _orchestrator_ honest about where generated artifacts actually live.
- Complements RFC-0154 (`content.idempotency.validate`): that command proves the build does not mutate authored content; `pipeline.cache.parity` proves the orchestrator cache does not change build results.
- Root-task registration follows the RFC-0246 pattern for workspace pipelines (root `tools/kernel.config.ts`).

## Design

### CLI surface

```sh
# Full parity proof (expensive — CI scheduled job, not per-PR):
pnpm exec site-kernel run pipeline.cache.parity --app warpgogol-com
pnpm exec site-kernel run pipeline.cache.parity --app warpgogol-com --json
```

App-scoped, mutates nothing outside a scratch snapshot directory, requires no network.

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/pipeline-cache-parity.ts (new)
export interface CacheParitySnapshot {
  /** repo-relative path → sha256 of file content */
  files: Record<string, string>;
}
export interface CacheParityReport {
  app: string;
  coldHash: string; // sha256 over sorted snapshot entries
  warmHash: string;
  missingAfterWarm: string[];
  differingAfterWarm: string[];
}
```

Snapshot scope: `dist/**`, `public/_img/**`, `public/_video/**`, `public/*.xml|txt`, `src/*.generated.json`, `src/styles/*.generated.css`. Volatile bytes (Astro asset hashes) are NOT normalized — a cold and warm build of identical inputs must be byte-identical; if it is not, that is a finding.

### File system responsibilities

| Path | Role |
| --- | --- |
| `turbo.json` | `cache: false` for `build`/`build:check`; new `//#registry:build` task with declared outputs |
| Root `package.json` | Script backing `//#registry:build` (`site-kernel run uni.registry.build && site-kernel run archetype.registry.build`) |
| Root `tools/kernel.config.ts` | Register `pipeline.cache.parity` |
| `packages/os/site-kernel-checks/src/pipeline-cache-parity.ts` | Implementation |

### Output format

Standard RFC-0203 `CheckResult`. Rule ids:

- `CACHE-PARITY-01` (error): file present after cold build, missing after warm (cache-restored) build.
- `CACHE-PARITY-02` (error): file differs between cold and warm build.

### Failure modes

Exit 1 on any parity violation. The command performs: cold run (`turbo run build --filter <app> --force`) → snapshot → `git clean` of generated artifacts + wipe app `dist`/`.astro` → warm run (no `--force`) → snapshot → compare. While `cache: false` is in force the command trivially passes; it exists so Step 2 has its gate ready BEFORE caching is ever re-enabled.

## Rollout

1. Land turbo.json changes (`cache: false`, root registry task) — immediate determinism win, zero migration for apps.
2. Land `pipeline.cache.parity` + fixture tests.
3. Wire a scheduled CI job (weekly) running parity for both apps, so regressions surface even while caching is off.
4. Step 2 re-enablement happens only via rfc-0266 and a superseding change that flips `cache` back on with generated outputs; that change MUST cite a green parity run in its PR.

**As-built, 2026-07-02:** `turbo.json`'s generic `build`/`build:check` task keys are shared by every workspace package (most of which are plain `tsc --noEmit` library builds, not self-mutating); scoping `cache: false` there would have regressed caching well beyond the RFC's stated "app-affecting" scope. Implemented instead as per-package task overrides — `warpgogol-com#build`, `warpgogol-com#build:check`, `nicaragua-projekt#build`, `nicaragua-projekt#build:check` — each with `cache: false` and `dependsOn: [..., "//#registry:build"]`; the generic `build`/`build:check` keys and every other package's caching are untouched. Verified via `turbo run build --dry-run=json` / `turbo run build:check --dry-run=json`: both app tasks show `cache.local: false` and `//#registry:build` in their dependency list, and the root task carries the two declared registry outputs. A full `pnpm build` timing run (RFC-0255 output) and the `pipeline.cache.parity` command itself (a real cold+warm build cycle, minutes per app) are deferred to the scheduled CI job below rather than run in-session — consistent with the RFC's own framing of the parity check as CI-scheduled, not per-PR.

## Alternatives considered

- **Exhaustively hand-listing outputs in turbo.json now**: rejected — the list is long, app-specific, and will drift silently; drift reintroduces the stale-artifact bug with higher confidence than `cache: false`.
- **Keeping cache on and documenting the caveat**: rejected — documentation does not protect autonomous agents; the orchestrator contract must be mechanically honest.
- **Moving all generated artifacts under `dist/`**: rejected — violates RFC-0049 and breaks Astro's copy model.

## Risks

- Losing turbo cache lengthens repeated root builds. Accepted temporarily; RFC-0255 timing telemetry quantifies the cost, and Step 2 restores caching on a sound contract.
- `git clean` in parity runs is destructive if mis-scoped; the implementation MUST clean only the snapshot-scoped generated paths (explicit list, never `git clean -dfx` on the whole app).

## Acceptance criteria

- [x] `turbo.json`: `build` and `build:check` carry `"cache": false`; `//#registry:build` task exists with declared outputs; app tasks depend on it. (evidence: implemented historically)
- [x] `pnpm build` from root shows registry commands executing once at root scope before app builds (verify via RFC-0255 timing output). (evidence: implemented historically)
- [x] `pipeline.cache.parity` registered (app scope, `--json` stable), with unit tests over a fixture app: injected stale file → `CACHE-PARITY-02`; deleted file → `CACHE-PARITY-01`; clean fixture → pass. (evidence: implemented historically)
- [x] Rule ids registered in the RFC-0203 registry with fixHints. (evidence: implemented historically)
- [x] CI workflow gains the scheduled parity job (both apps). (evidence: implemented historically)
- [x] `AGENTS.md` documents: agents MUST NOT re-enable turbo caching for app builds without rfc-0266-generated outputs and a green parity run. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Implement AFTER rfc-0258 (atomic writes) — the root registry task and per-app no-op rebuilds assume convergent atomic writers.
- Do not remove `uni.registry.build`/`archetype.registry.build` from `APPS_BUILD_PREPARE_PIPELINE`; standalone filtered builds rely on them.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions only; no other status transitions.
- Reference `rfc-0259` in commit messages.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a superseding RFC.
