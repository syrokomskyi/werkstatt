---
id: RFC-0597
title: "Optimize mission materialization: skip preflight on unchanged cache, split build.prepare pipeline, persist media cache across missions"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-30
updatedAt: 2026-07-30
enhancedAt: 2026-07-30
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-46
  - DNA-47
  - RFC-0356
  - RFC-0389
  - RFC-0517
  - RFC-0568
  - RFC-0593
  - RFC-0210
  - RFC-0204
  - RFC-0234
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
  - DNA-47
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - mission.materialize
    - mission.close
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - site-kernel-handoff
  - site-kernel-checks
successSignals:
  - mission.materialize completes in under 30 seconds when cache clone HEAD is unchanged
  - video.variants.generate reuses cached encodings when .cache/video is warmed from prior mission
  - build.prepare.dev pipeline runs only codegen generators, skipping media and static public file generation
nonGoals:
  - Do not remove or weaken bordbuch.validate at mission.open (RFC-0593) — it is fast and protects hash-chain integrity
  - Do not eliminate build.prepare entirely — codegen generators are required for dev server startup
  - Do not change the build.check or release.prepare pipelines — they remain full-pipeline for production validation
  - Do not add new CLI flags for forcing preflight — operators delete the state file to force re-validation
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0597: Optimize mission materialization: skip preflight on unchanged cache, split build.prepare pipeline, persist media cache across missions

## Context

`mission.materialize` (RFC-0356, RFC-0568) is the heaviest operation in the mission lifecycle. It syncs the cache clone, clones into a staging workpiece, generates boilerplate (RFC-0389), runs `pnpm install`, ensures Playwright Chromium, executes the full `build.prepare` pipeline (~50 steps including media transcoding), and runs a preflight content quality gate (RFC-0517). In practice, materialization takes several minutes — dominated by `video.variants.generate` (180s expected), `live.variants.generate` (120s), `image.variants.generate` (60s), and `preview.images.generate` (30s).

The operator works in dev mode (`astro dev`) after materialization, not in preview mode. The production-only artifacts (sitemaps, OG preview images, RSS feeds, robots.txt, video/image variants for `dist/`) are not consumed by the dev server. Despite this, `build.prepare` regenerates all of them on every materialization.

Additionally, `video.variants.generate` (RFC-0210) and `image.variants.generate` (RFC-0204) use content-addressed caches (`.cache/video/`, `.cache/video-live/`) that are gitignored in the cache clone. When a mission closes and the workpiece is cleaned up, these caches are lost. The next mission's materialization re-encodes all media from scratch, even when source files are byte-identical to the previous mission.

The preflight content quality gate (RFC-0517) validates the entire content tree on every materialization. When a mission is opened immediately after closing a previous one on the same cache clone HEAD, the content has not changed — the validation is redundant.

## Problem

Three specific inefficiencies slow down `mission.materialize`:

1. **Redundant preflight validation.** The preflight content quality gate (RFC-0517) runs on every materialization, even when the cache clone HEAD has not changed since the last successful validation at mission close. This adds seconds to minutes of validation work that was already done.

2. **Full `build.prepare` pipeline for dev-mode work.** The `SITES_BUILD_PREPARE_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` runs all ~50 steps including production-only generators (`preview.images.generate`, `image.variants.generate`, `video.variants.generate`, `live.variants.generate`, `sitemap.generate`, `llms.generate`, `feed.generate`, `robots.generate`, `page.markdown.generate`, etc.). These artifacts are only needed for `astro build` (production), not for `astro dev`. Running them at materialization wastes minutes.

3. **Media cache loss across missions.** `.cache/video/` and `.cache/video-live/` are gitignored (`systems-cache/<id>/.gitignore` lines: `.cache/`, `public/_video/`, `public/_img/`). The cache clone never retains them. When a workpiece is cloned from the cache clone (RFC-0568), the `.cache/` directory is absent. `video.variants.generate` re-encodes every source video from scratch even when the source bytes are identical to the previous mission. This is the single largest time sink (180s+ per materialization with video content).

## Decision

`mission.materialize` gains three optimizations: (1) a materialization state file tracks the cache clone HEAD hash at last successful close/validate, and preflight is skipped automatically when the current HEAD matches; (2) the `build.prepare` pipeline is split into `build.prepare.dev` (codegen generators required for dev server startup) and `build.prepare.full` (media transcoding + static public file generation), with materialization running only `.dev`; (3) `.cache/video/` and `.cache/video-live/` directories are copied from workpiece to cache clone at mission close and from cache clone to workpiece at materialization, preserving content-addressed media caches across missions.

## Architectural fit

- **DNA-46 (Mission lifecycle):** This RFC optimizes the materialization step within the mission lifecycle. It does not change the lifecycle states (open → closed/aborted) or the bordbuch contract. `bordbuch.validate` at `mission.open` (RFC-0593) remains unchanged.
- **DNA-47 (Materialization):** This RFC refines how materialization works — the workpiece is still materialized from the pinned Sternsystem bundle with runtime scaffolding from the pinned platform. The split pipeline does not change what artifacts exist at production build time; it only defers production-only artifact generation to `mission.validate` / `release.prepare`.
- **RFC-0356:** Extends `mission.materialize` with conditional preflight skip and pipeline selection.
- **RFC-0517:** The preflight content quality gate is preserved but made conditional on cache clone HEAD change.
- **RFC-0568:** Clone-based materialization is preserved. The media cache copy is an additional step after clone, not a replacement.
- **RFC-0210 / RFC-0204 / RFC-0234:** Media variant generators remain unchanged. The content-addressed cache mechanism is preserved — this RFC only ensures the cache survives across missions by storing it outside git in the cache clone.
- **RFC-0593:** `bordbuch.validate` at `mission.open` is explicitly out of scope and remains mandatory.

## Design

### CLI surface

No new commands. No new flags. The operator experience is unchanged — `mission.materialize` simply runs faster. The optimizations are automatic:

```sh
# Operator runs the same command as before:
pnpm exec site-kernel run mission.materialize --mission warpgogol-com-m000023

# Internally:
# 1. Check .materialization-state.json — if cache clone HEAD matches last close, skip preflight
# 2. Run build.prepare.dev (codegen only) instead of build.prepare.full
# 3. Copy .cache/video/ and .cache/video-live/ from cache clone to workpiece after git clone
```

To force a full preflight, the operator deletes the state file:

```sh
rm systems-cache/<id>/.materialization-state.json
```

### TypeScript contracts

**Materialization state file** (`systems-cache/<id>/.materialization-state.json`):

```ts
interface MaterializationState {
  systemId: string;
  cacheCloneHead: string;       // git rev-parse HEAD of cache clone at last close/validate
  lastValidatedAt: string;      // ISO timestamp of last successful preflight
  lastMissionId: string;        // mission that wrote this state
}
```

**Pipeline split** in `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`:

```ts
// Existing: SITES_BUILD_PREPARE_PIPELINE (unchanged, used by mission.validate / release.prepare)

// New: codegen-only subset for dev-mode materialization
export const SITES_BUILD_PREPARE_DEV_PIPELINE: KernelPipelineStep[] = [
  { command: "config.regenerate" },
  { command: "workpiece.imports.validate" },
  { command: "yaml.contract.lint" },
  { command: "yaml.parse.validate" },
  { command: "content.ref-index.generate" },
  { command: "kernel.wire" },
  { command: "agents.generate" },
  { command: "overlay.pages.generate" },
  { command: "routes.generate" },
  { command: "not-found.generate" },
  { command: "api.routes.generate" },
  { command: "env.example.generate" },
  { command: "entitlements.resolve" },
  { command: "surface.generate" },
  { command: "surface.freshness" },
  { command: "surface.starmap" },
  { command: "content.freshness.validate" },
  { command: "agent.knowledge.generate" },
  { command: "agent.manifest.generate" },
  { command: "agent.openapi.generate" },
  { command: "agent.routes.generate" },
  { command: "agent.surface.sign" },
  { command: "styles.global.generate" },
  { command: "scripts.orchestrator.generate" },
  { command: "public.infrastructure.generate" },
  { command: "security.txt.generate" },
  { command: "indexnow.key.generate" },
  { command: "humans.generate" },
  { command: "public.icons.generate" },
  { command: "headers.security.generate" },
  { command: "open-source.generate" },
  { command: "material.credits.generate" },
  { command: "icons.generate" },
  { command: "biome.css.generate" },
  { command: "fonts.imports.generate" },
  { command: "cms.schema.generate" },
  { command: "archetype.registry.build" },
  { command: "uni.registry.build" },
  { command: "i18n.middleware.generate" },
  { command: "generated.files.validate" },
  // Excluded from .dev (production-only or workspace-scoped):
  //   sitemap.generate, preview.images.generate, llms.generate,
  //   public.managed.clean, page.markdown.generate, feed.generate,
  //   ai.generate, ai.policy.generate, robots.generate,
  //   public.artifact.generate, image.variants.generate,
  //   video.variants.generate, live.variants.generate,
  //   material.metadata.write, warpgogol.check-hints.generate
  // Excluded (workspace-scoped validators, not needed for dev server startup):
  //   manifest.contract.validate, mirror.quintet.validate
];
```

The existing `SITES_BUILD_PREPARE_PIPELINE` remains unchanged and is used by `mission.validate`, `release.prepare`, and any other command that needs the full production artifact set.

### Pipeline registration and invocation

The new pipeline is registered in `tools/kernel.config.ts` alongside the existing `build.prepare`:

```ts
import {
  SITES_BUILD_PREPARE_PIPELINE,
  SITES_BUILD_PREPARE_DEV_PIPELINE,
} from "@warpgogol/site-kernel-checks/pipelines";

// in the pipelines section:
pipelines: {
  "build.prepare": [...SITES_BUILD_PREPARE_PIPELINE],
  "build.prepare.dev": [...SITES_BUILD_PREPARE_DEV_PIPELINE],
  // ... other pipelines unchanged
},
```

`mission.materialize` invokes it via `executeKernelPipeline({ pipelineName: "build.prepare.dev", ... })` — the same API it currently uses for `build.prepare`, just with a different pipeline name. The kernel registry resolves the pipeline by name (`registry.getPipeline(options.pipelineName)`). No new invocation API is needed.

The template at `packages/os/site-kernel-codegen/src/templates/wire/tools/kernel.config.template.ts` must also be updated so new Sternsystems get the `.dev` pipeline registration automatically.

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems-cache/<id>/.materialization-state.json` | New. State file tracking cache clone HEAD at last close. Outside git. Created/updated by `mission.close` only. Read by `mission.materialize`. |
| `systems-cache/<id>/.cache/video/` | New (persisted). Content-addressed video encoding cache (RFC-0210). Copied from workpiece at mission close, copied to workpiece at materialization. Outside git. |
| `systems-cache/<id>/.cache/video-live/` | New (persisted). Content-addressed living-photo cache (RFC-0234). Same lifecycle as `.cache/video/`. |
| `missions/<id>/workpiece/.cache/video/` | Existing (gitignored). Populated by `video.variants.generate`. Now warmed from cache clone at materialization. |
| `missions/<id>/workpiece/.cache/video-live/` | Existing (gitignored). Populated by `live.variants.generate`. Now warmed from cache clone at materialization. |
| `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` | Modified. Exports new `SITES_BUILD_PREPARE_DEV_PIPELINE` alongside existing `SITES_BUILD_PREPARE_PIPELINE`. |
| `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` | Modified. Reads state file, conditionally skips preflight, runs `.dev` pipeline, copies `.cache/` from cache clone. |
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | Modified. Writes state file with current cache clone HEAD. Copies `.cache/` from workpiece to cache clone. |

### `--skip-preflight` flag and state-file skip precedence

The existing `--skip-preflight` flag (operator override) and the new automatic state-file-based skip are independent mechanisms with defined precedence:

1. **`--skip-preflight` flag set:** Preflight is always skipped. A bordbuch `preflight-skipped` entry is appended with reason `"operator override via --skip-preflight flag"`. The state file is not consulted.
2. **Flag not set, state file matches HEAD:** Preflight is skipped automatically. A bordbuch `preflight-skipped` entry is appended with reason `"cache-clone-head-unchanged"`. The `preflightSkipReason` field in `--json` output is `"cache-clone-head-unchanged"`.
3. **Flag not set, state file missing or HEAD mismatch:** Preflight runs normally. No bordbuch entry.

The `preflightSkipReason` field in `--json` output distinguishes the two skip paths: `"operator-override"` when the flag is used, `"cache-clone-head-unchanged"` when the state file triggers the skip.

### Output format

`mission.materialize` `--json` output gains two new fields:

```json
{
  "command": "mission.materialize",
  "status": "ok",
  "preflightSkipped": true,
  "preflightSkipReason": "cache-clone-head-unchanged",
  "pipelineUsed": "build.prepare.dev",
  "mediaCacheWarmed": true,
  "mediaCacheSources": 3
}
```

When preflight is not skipped: `preflightSkipped: false`, `preflightSkipReason: null`. When media cache is not present in cache clone: `mediaCacheWarmed: false`, `mediaCacheSources: 0`.

### Failure modes

- **State file missing or corrupt:** `mission.materialize` treats a missing or unparseable state file as "no prior validation" — runs preflight normally. No hard failure.
- **Cache clone HEAD cannot be resolved:** If `git rev-parse HEAD` fails on the cache clone, preflight runs normally (fail-safe: prefer validation over skipping).
- **`.cache/` copy fails (cache clone → workpiece):** Log a warning, continue materialization. `video.variants.generate` will encode from scratch — slower but correct.
- **`.cache/` copy fails (workpiece → cache clone at close):** Log a warning, continue close. Next materialization will encode from scratch — slower but correct.
- **`build.prepare.dev` step fails:** Same behavior as current `build.prepare` failure — materialization fails with the step's error.
- **State file stale (HEAD matches but content was force-pushed without HEAD change):** Not possible — git HEAD changes on every push. If somehow the same HEAD is reused with different content (amended commit), the state file's `lastValidatedAt` timestamp provides auditability but preflight would be skipped. This is an acceptable edge case — `mission.validate` at close re-validates everything.
- **Existing workpiece `.cache/` from failed materialization:** If a previous materialization attempt failed and left a partial `.cache/` in the workpiece, the cache clone's `.cache/` replaces (not merges with) the workpiece's `.cache/`. The copy is `rm -rf workpiece/.cache/video && cp -r cache/.cache/video workpiece/.cache/video` semantics — stale entries from a failed run do not persist.
- **Concurrent materialization:** The existing lock mechanism (`acquireLock` for `system:${systemId}` and `mission:${missionId}` in `mission-materialize.ts:565-578`) prevents concurrent materialization for the same system. Different systems have independent state files and `.cache/` directories. No new locking is needed.

## Rollout

- **Default behavior:** All three optimizations are active by default. No opt-in flag.
- **Existing missions:** Missions materialized before this RFC have no state file — first materialization runs full preflight and writes the state file. Subsequent materializations benefit from the skip.
- **`mission.validate` / `release.prepare`:** These commands continue to use the full `SITES_BUILD_PREPARE_PIPELINE` (now effectively `build.prepare.full`). Production artifacts are generated at validation/release time, not at materialization time.
- **`mission.close`:** This command writes the state file and copies `.cache/` to the cache clone. If the workpiece has no `.cache/` (e.g., no media content), the copy is a no-op. `mission.reconcile` does NOT write the state file or copy `.cache/` — it only transfers commits. The state file reflects "last successful close", not "last reconcile".
- **New apps:** New Sternsystems benefit automatically from the first materialization onward.
- **No migration path needed:** The optimizations are additive — if the state file or `.cache/` is absent, behavior falls back to current (full preflight, full pipeline, no media cache warming).

## Alternatives considered

1. **Skip entire `build.prepare` at materialization.** Rejected — the dev server (`astro dev`) requires generated routes, middleware, styles, and surface artifacts to start. Without `routes.generate`, `i18n.middleware.generate`, `surface.generate`, `styles.global.generate`, the dev server would crash or serve stale content. Splitting into `.dev` vs `.full` is safer.

2. **Lazy codegen via Vite plugins.** Instead of running codegen at materialization, run it on-demand when the dev server requests a generated file. Rejected — this would require rewriting ~40 generators as Vite plugins, a massive change with unclear benefit. The codegen generators are fast (seconds total); the slow steps are media transcoding and preview image generation, which are excluded from `.dev`.

3. **Store `.cache/` in git (LFS).** Rejected — video encoding caches can be hundreds of MB. Git LFS is already used for source media, but derived artifacts should not bloat the repo. The cache clone's filesystem is the right storage location.

4. **Use `system.pin.json` for HEAD tracking instead of a separate state file.** Rejected — `system.pin.json` is updated at sync time, not at close time. Its semantics (platform version, RFC head) don't match "last validated content state". A dedicated state file is cleaner.

5. **Add `--force-preflight` flag.** Rejected by the operator — adds unnecessary CLI surface. Deleting the state file achieves the same result without new flags or conditional logic in the command handler.

## Risks

- **Stale preflight skip after force-push with same HEAD:** If someone amends a commit and force-pushes to the cache clone's remote, the HEAD hash changes (amended commits have different hashes). This risk is negligible — git HEAD is a reliable change indicator.
- **`build.prepare.dev` missing a generator needed for dev.** If a generator is incorrectly classified as production-only but the dev server depends on its output, the dev server will fail. Mitigation: the `.dev` pipeline includes all codegen generators that produce files under `src/` (routes, middleware, styles, surface, agents). Only `public/` static file generators and media transcoders are excluded. If a dev server issue arises, the missing generator is moved from `.dev` to `.full` — but this is a bug, not a design flaw.
- **Media cache disk usage.** `.cache/video/` can grow to hundreds of MB per system. The cache clone filesystem must accommodate this. Mitigation: content-addressed cache means unchanged sources don't accumulate duplicates. Old hashes from removed sources persist but can be cleaned manually. Copying 500 MB between cache clone and workpiece takes ~5-10 seconds on SSD (sequential I/O), negligible compared to the 180s+ re-encoding it replaces.
- **`.dev` pipeline cost.** The `.dev` pipeline runs ~38 codegen steps. Based on existing telemetry, codegen steps complete in ~10-15 seconds total. This is well within the "under 30 seconds" success signal for the unchanged-cache case (where preflight is also skipped).
- **Agent confusion about pipeline split.** Agents may not understand why `build.prepare` runs fewer steps at materialization vs. validation. Mitigation: the following AGENTS.md files must be updated:
  - `packages/os/site-kernel-handoff/AGENTS.md` — document that `mission.materialize` uses `build.prepare.dev` and `mission.validate`/`release.prepare` use `build.prepare.full`
  - `packages/os/site-kernel-checks/AGENTS.md` — document the new `SITES_BUILD_PREPARE_DEV_PIPELINE` export in the pipelines module table
- **State file not committed to git.** Since the state file lives outside git in the cache clone, it is machine-local. Different developers may have different state files. This is acceptable — the state file is a local optimization, not a source of truth. If missing, preflight runs normally.

## Acceptance criteria

- [x] `SITES_BUILD_PREPARE_DEV_PIPELINE` exported from `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` with all codegen generators, `generated.files.validate`, and `uni.registry.build`; no media/static-public generators (evidence: `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts:121-173` exports `SITES_BUILD_PREPARE_DEV_PIPELINE`; re-exported in `pipelines/index.ts:18` and `module.ts:35-69`)
- [x] `SITES_BUILD_PREPARE_PIPELINE` (full) unchanged and still used by `mission.validate` and `release.prepare` (evidence: `SITES_BUILD_PREPARE_PIPELINE` unchanged in `build-prepare.ts:13-14`; `mission-materialize.ts` pipeline switch only affects `mission.materialize`)
- [x] `mission.materialize` reads `systems-cache/<id>/.materialization-state.json` and skips preflight when cache clone HEAD matches `cacheCloneHead` in the state file (evidence: `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:667-699` reads state file and sets `preflightSkipped` on HEAD match; test `mission-materialize-preflight-skip.test.ts` verifies)
- [x] `mission.materialize` runs `SITES_BUILD_PREPARE_DEV_PIPELINE` (registered as `build.prepare.dev` in `tools/kernel.config.ts`) instead of `SITES_BUILD_PREPARE_PIPELINE` (evidence: `mission-materialize.ts:856-863` invokes `pipelineName: "build.prepare.dev"`; `kernel.config.template.ts:41-59` registers the pipeline)
- [x] `mission.materialize` copies `.cache/video/` and `.cache/video-live/` from cache clone to workpiece after git clone, when they exist (evidence: `mission-materialize.ts:778-800` copies `MEDIA_CACHE_DIRS` from cache clone to staging dir with replace semantics)
- [x] `mission.close` writes `systems-cache/<id>/.materialization-state.json` with current cache clone HEAD hash (evidence: `mission-close.ts:353-382` writes state file with `cacheCloneHead` from `git rev-parse HEAD`; test `mission-close-state-file.test.ts` verifies)
- [x] `mission.close` copies `.cache/video/` and `.cache/video-live/` from workpiece to cache clone (evidence: `mission-close.ts:384-406` copies `MEDIA_CACHE_DIRS` from workpiece to cache clone; test `mission-close-state-file.test.ts` verifies)
- [x] `mission.materialize` `--json` output includes `preflightSkipped`, `pipelineUsed`, and `mediaCacheWarmed` fields (evidence: `mission-materialize.ts:1000-1004` adds `preflightSkipped`, `preflightSkipReason`, `pipelineUsed`, `mediaCacheWarmed`, `mediaCacheSources` to result data)
- [x] Unit tests in `packages/os/site-kernel-handoff/src/tests/` verify: preflight skip on matching HEAD, preflight run on missing state file, media cache copy from cache clone, media cache copy to cache clone at close (evidence: `src/tests/mission-materialize-preflight-skip.test.ts` 5 tests and `src/tests/mission-close-state-file.test.ts` 4 tests — all 9 pass)
- [x] `bordbuch.validate` at `mission.open` remains unchanged (RFC-0593 preserved) (evidence: no changes to `mission-open.ts`; `mission-close.ts` only adds state file write and `.cache/` copy after existing close logic)
- [x] `rfc.validate` passes on this file (evidence: `pnpm exec site-kernel run rfc.validate` reports no errors for RFC-0597)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT add `--force-preflight` or `--skip-build-prepare` flags to `mission.materialize`. The operator requested no new flags. To force preflight, delete `systems-cache/<id>/.materialization-state.json`.
- Agents MUST preserve `bordbuch.validate` at `mission.open` (RFC-0593). This RFC does not touch `mission.open`.
- Agents MUST ensure `mission.validate` and `release.prepare` continue to use the full `SITES_BUILD_PREPARE_PIPELINE` — only `mission.materialize` uses `.dev`.
- When classifying pipeline steps for `.dev` vs `.full`, a step belongs in `.dev` if and only if its output is consumed by `astro dev` (generated `src/` files, middleware, styles, surface artifacts). Steps that write to `public/` for production `dist/` consumption belong in `.full`. Validators that catch silent codegen failures (e.g., `generated.files.validate`) also belong in `.dev` as a safety net. Workspace-scoped validators (`manifest.contract.validate`, `mirror.quintet.validate`) are excluded from `.dev` because they validate cross-package contracts not needed for dev server startup.
