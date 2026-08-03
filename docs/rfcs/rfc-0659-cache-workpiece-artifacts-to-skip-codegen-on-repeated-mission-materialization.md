---
id: RFC-0659
title: "Cache workpiece artifacts to skip codegen on repeated mission materialization"
status: draft
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
reviewers: []
createdAt: 2026-08-03
updatedAt: 2026-08-03
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-47
  - RFC-0597
  - RFC-0619
  - RFC-0635
  - RFC-0653
  - RFC-0568
  - RFC-0389
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
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
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "Repeated mission materialization with unchanged cache clone HEAD and platform completes in <30s instead of ~3-5min"
  - "mission.materialize reports artifactCacheHit: true when cache key matches"
  - "mission.materialize --force bypasses the artifact cache and performs full materialization"
  - "Cache is invalidated automatically when cache clone HEAD, platform version, or platform semantic hash changes"
nonGoals:
  - "Caching the git clone of the cache clone (still needed for reconcile)"
  - "Caching pnpm install (still needed to link workpiece into workspace)"
  - "Changing the preflight skip logic (RFC-0597 remains independent)"
  - "Changing the distribution reuse logic in mission.validate (RFC-0635 remains independent)"
  - "Changing the build-skip cache in leitstand.dev-deploy (RFC-0653 remains independent)"
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

# RFC-0659: Cache workpiece artifacts to skip codegen on repeated mission materialization

## Context

Mission materialization (`mission.materialize`) is the process of preparing a workpiece from a Sternsystem's pinned data bundle. It runs every time a new mission is opened. The current flow (RFC-0356, RFC-0389, RFC-0568, RFC-0597) performs these steps:

1. `syncCacheClone` — fetch + reset to origin/main (~5s)
2. Preflight skip check (RFC-0597) — skips preflight if cache clone HEAD unchanged
3. `git clone` cache clone → staging (~5-10s, needed for shared git object database for reconcile)
4. Copy data paths (src/content, public, provenance) (~5s)
5. Warm media cache (.cache/video, .cache/video-live) (~5s)
6. `generateFullBoilerplate` — 7 template files + 11 codegen generators (~20-30s)
7. `atomicMoveDir` staging → workpiece
8. `pnpm install` at workspace root (~10-30s)
9. `ensureChromium` (~1s if installed)
10. `build.prepare.dev` pipeline — 48 codegen steps with `force: true` (~60-120s)
11. Preflight gate (skipped if HEAD unchanged, RFC-0597)
12. Git commit + compass.audit.baseline (~10s)

**Total: ~3-5 minutes per materialization.**

When an operator closes one mission and immediately opens another for the same Sternsystem, the cache clone HEAD, platform version, and platform semantic hash are typically unchanged. Yet steps 3-10 run again in full, regenerating identical artifacts. RFC-0597 already skips preflight (step 11) on unchanged HEAD, but the expensive codegen and build.prepare.dev pipeline (steps 6, 10) still run every time.

RFC-0619 intentionally bypasses the RFC-0390 command-result cache during materialization (via `force: true`) because a fresh workpiece starts empty — a cached "no files modified" result would skip writing generated files, leaving the workpiece incomplete. This is correct for the command-result cache, but it means there is no mechanism to skip the codegen when the inputs are provably identical.

## Problem

DNA-47 requires that a mission's Werkstück is materialized from the Sternsystem's pinned data bundle with runtime scaffolding generated from the pinned platform. The current materialization flow regenerates all runtime scaffolding (boilerplate + codegen output) on every `mission.materialize` call, even when the inputs — cache clone HEAD (data content), platform version, and platform semantic hash (all packages/integrations/services source code) — are byte-identical to the previous materialization.

This creates unnecessary latency (~3-5 minutes) when switching missions for the same Sternsystem, slowing the operator's workflow. The existing RFC-0390 command-result cache cannot be reused because it tracks "did the output change?" not "write the output to a new location" — a fresh workpiece starts empty, so cached "no changes" results would leave it incomplete (RFC-0619).

There is no file-level artifact cache that snapshots the complete workpiece state after codegen and restores it when inputs are unchanged.

## Decision

`mission.materialize` gains a workpiece artifact cache that snapshots the complete workpiece directory (excluding `.git/` and `node_modules/`) after `build.prepare.dev` completes successfully. On subsequent materializations, if the cache key — `byteHash(cacheCloneHead + "|" + platformVersion + "|" + platformSemanticHash)` — matches and the cache directory exists, the workpiece is restored from cache instead of running `generateFullBoilerplate` + `build.prepare.dev`. The `--force` flag bypasses the cache and performs full materialization.

## Architectural fit

- **DNA-47 (Materialization):** This RFC optimizes the materialization process without changing its contract. The workpiece is still materialized from the pinned data bundle with runtime scaffolding from the pinned platform. The cache is a performance optimization that produces byte-identical results.
- **RFC-0597 (Preflight skip):** Complementary but independent. RFC-0597 skips preflight validators on unchanged HEAD. This RFC skips codegen + build.prepare.dev on unchanged (HEAD, platform). Both use `cacheCloneHead` as a signal, but this RFC additionally checks `platformVersion` and `platformSemanticHash`.
- **RFC-0619 (Bypass command-result cache):** This RFC does not modify the `force: true` behavior during build.prepare.dev. On cache miss, the existing flow runs unchanged (including `force: true`). On cache hit, build.prepare.dev is skipped entirely.
- **RFC-0635 (Distribution reuse in mission.validate):** Independent. Distribution reuse caches the built `dist/` directory. This RFC caches the pre-build workpiece state. Both can be active on the same mission.
- **RFC-0653 (Build-skip in dev-deploy):** Independent. Dev-deploy build-skip caches `pnpm build` output. This RFC caches materialization output. Both operate at different lifecycle stages.
- **RFC-0568 (Clone-based workpiece):** The git clone of the cache clone is still performed on cache hit — it provides the shared git object database needed for `mission.reconcile`.
- **RFC-0389 (Full boilerplate generation):** On cache miss, the existing boilerplate generation runs unchanged. On cache hit, it is skipped because the cached workpiece already contains all boilerplate.

## Design

### CLI surface

No new commands. The existing `mission.materialize` command is enhanced:

```sh
# Normal materialization (uses cache if available)
pnpm exec site-kernel run mission.materialize --mission <missionId>

# Force full materialization, bypassing the artifact cache
pnpm exec site-kernel run mission.materialize --mission <missionId> --force

# Report-only mode (unchanged, does not touch cache)
pnpm exec site-kernel run mission.materialize --mission <missionId> --report-only
```

The `--force` flag already exists and is already passed to `executeKernelPipeline` for `build.prepare.dev`. This RFC extends its semantics: when `--force` is set, the artifact cache is bypassed in addition to the existing behavior.

### TypeScript contracts

```ts
/**
 * State file at systems/<id>/.materialization-cache-state.json.
 * Separate from .materialization-state.json (RFC-0597) for clean separation
 * of preflight skip and artifact cache concerns.
 */
interface MaterializationCacheState {
  systemId: string;
  cacheKey: string;  // byteHash(cacheCloneHead + "|" + platformVersion + "|" + platformSemanticHash)
  cacheCloneHead: string;
  platformVersion: string;
  platformSemanticHash: string;
  writtenAt: string;  // ISO timestamp
}

/**
 * Fields added to MissionMaterializeData output.
 */
interface ArtifactCacheFields {
  artifactCacheHit: boolean;
  artifactCacheKey: string | null;
  artifactCacheSkipped: boolean;  // true when --force bypassed the cache
}
```

The cache key is computed using the same primitives as `computeBuildInputHash` (`build-pipeline-helpers.ts`), but substitutes `cacheCloneHead` for `workpieceTreeHash` — the cache clone HEAD is available before materialization and is a superset of the workpiece content tree.

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems/<id>/.cache/materialization/<hash>/` | Cached workpiece snapshot (excluding .git/ and node_modules/) |
| `systems/<id>/.materialization-cache-state.json` | Cache key state file (separate from RFC-0597's .materialization-state.json) |
| `missions/<missionId>/workpiece/` | Restored from cache on hit, or generated from scratch on miss |

**Cache exclusions** (not included in the cached workpiece snapshot):

- `.git/` — cloned from cache clone separately (needed for reconcile)
- `node_modules/` — created by `pnpm install` (linked into workspace)

**Cache inclusions** (included in the cached workpiece snapshot):

- Data paths (src/content, public, provenance) — captured at cache-write time
- Boilerplate (package.json, astro.config.mjs, tsconfig.json, etc.)
- Codegen output (routes, overlays, agents, surface.generated.json, etc.)
- `.env`, `.env.main`, `.env.alt` — empty templates from .env.example (with PUBLIC_IMAGE_PROVIDER=build-portable)
- `.cache/video`, `.cache/video-live` — media cache (warmed from cache clone)
- `system.pin.json`

### Output format

The `mission.materialize` JSON output gains three fields:

```json
{
  "command": "mission.materialize",
  "data": {
    "missionId": "warpgogol-com-m000027",
    "systemId": "warpgogol-com",
    "artifactCacheHit": true,
    "artifactCacheKey": "sha256:abc123...",
    "artifactCacheSkipped": false,
    "preflightSkipped": true,
    "preflightSkipReason": "cache-clone-head-unchanged",
    "pipelineUsed": "artifact-cache-restore",
    "materializedAt": "2026-08-03T08:00:00.000Z",
    "mediaCacheWarmed": false,
    "mediaCacheSources": 0
  },
  "summary": "[mission.materialize] warpgogol-com-m000027 materialized (artifact cache hit)"
}
```

On cache miss, the output is unchanged from the current format with `artifactCacheHit: false`.

### Failure modes

- **Cache directory missing despite state file match:** Fall through to full materialization. Delete stale state file. Log warning.
- **Cache directory corrupt or partially written:** Fall through to full materialization. Delete stale cache directory and state file. Log warning.
- **Cache restore I/O error (disk full, permissions):** Abort materialization with error. Workpiece staging dir is left for inspection.
- **`--force` flag set:** Bypass cache read. Perform full materialization. Write new cache entry after successful build.prepare.dev.
- **`--report-only` flag set:** Do not read or write cache. Return report only.
- **Platform semantic hash computation fails:** Fall through to full materialization (fail-safe, same as RFC-0597 preflight skip logic).
- **Cache clone HEAD cannot be resolved:** Fall through to full materialization (fail-safe).

All fallback paths produce correct results — the cache is a pure performance optimization. A false miss (running full materialization when the cache would have been valid) is safe. A false hit (restoring stale artifacts) is prevented by the cache key including all three input dimensions.

## Rollout

- **Default behavior:** The artifact cache is active by default. No opt-in flag needed.
- **First materialization:** Cache miss (no state file, no cache directory). Full materialization runs. After `build.prepare.dev` completes, the workpiece is snapshotted to `systems/<id>/.cache/materialization/<hash>/` and the state file is written.
- **Subsequent materializations with unchanged inputs:** Cache hit. Workpiece restored from cache. `generateFullBoilerplate`, `build.prepare.dev`, and media cache warming are skipped. `pnpm install` and `git clone` still run.
- **Subsequent materializations with changed inputs:** Cache miss (hash differs). Full materialization runs. New cache entry written. Previous cache entry deleted (keep only latest).
- **Existing systems:** No migration needed. The cache is populated on the first materialization after this RFC is implemented.
- **`--force` bypass:** Operators can always force full materialization with `--force`. This refreshes the cache entry.
- **No pipeline integration:** The artifact cache is internal to `mission.materialize` and does not affect `build.check`, `mission.validate`, or other pipelines.

## Alternatives considered

1. **Reuse the RFC-0390 command-result cache for build.prepare.dev during materialization.** Rejected by RFC-0619: a fresh workpiece starts empty, so a cached "no files modified" result would skip writing generated files, leaving the workpiece incomplete. The command-result cache tracks "did the output change?" not "write the output to a new location."

2. **Cache only generated (non-data-path) artifacts, not the entire workpiece.** Rejected: caching the entire workpiece (minus .git/ and node_modules/) is simpler to implement and faster to restore (one copy operation vs. copy data paths + restore generated files separately). The data paths are already in the cache clone and are small relative to video/media files.

3. **Eliminate redundant codegen in `generateFullBoilerplate` (11 generators re-run by build.prepare.dev).** Partial solution: saves ~10-20s but does not address the ~60-120s build.prepare.dev pipeline. This RFC subsumes this optimization — on cache hit, both `generateFullBoilerplate` and `build.prepare.dev` are skipped.

4. **Skip `pnpm install` when package.json is unchanged.** Rejected as standalone optimization: `pnpm install` is already fast with cached deps (~10s) and is needed to link the workpiece into the pnpm workspace. The artifact cache makes this moot — on cache hit, `pnpm install` still runs but is effectively a no-op.

## Risks

- **Stale cache after manual cache clone edit:** If an operator manually edits files in the cache clone without committing (dirty working tree), `git rev-parse HEAD` returns the committed HEAD, not the working tree state. The cache key would match, but the data paths copied from the cache clone would differ. **Mitigation:** This is the same risk as RFC-0597's preflight skip. The cache clone is a non-bare git repo, and manual edits without commits are an operator error. `sternsystem.validate` detects dirty cache clones.

- **Cache directory grows large:** The cache includes media files (.cache/video, .cache/video-live) and all data paths. For systems with large video content, this could be significant. **Mitigation:** Only the latest cache entry is kept (previous entries deleted on new write). The cache lives in `systems/<id>/.cache/` which is outside the git-tracked content.

- **Agent misinterpretation:** Agents might assume the artifact cache guarantees fresh content. **Mitigation:** The cache key includes all three input dimensions (HEAD, platform version, platform semantic hash). If any changes, the cache is invalidated. The `--force` flag provides an explicit escape hatch.

- **Platform semantic hash computation cost:** `resolvePlatformSemanticHash` fingerprints all of `packages/`, `integrations/`, `services/` — this takes ~2-5s. **Mitigation:** This is already computed by `computeBuildInputHash` in `mission.validate` and `release.prepare`. The cost is amortized across the materialization lifecycle.

- **Cache restore I/O failure:** If the cache restore fails partway, the workpiece could be in an inconsistent state. **Mitigation:** The restore uses the existing atomic staging + move pattern (write to staging dir, then `atomicMoveDir` to workpiece). If the restore fails, the staging dir is cleaned up and the error is surfaced.

## Acceptance criteria

- [ ] `MaterializationCacheState` interface defined in `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts`
- [ ] Cache key computed as `byteHash(cacheCloneHead + "|" + platformVersion + "|" + platformSemanticHash)` using existing `resolvePlatformSemanticHash` and `resolveCurrentEcosystem`
- [ ] On cache miss, workpiece snapshot written to `systems/<id>/.cache/materialization/<hash>/` after `build.prepare.dev` completes successfully (excluding `.git/` and `node_modules/`)
- [ ] On cache hit, workpiece restored from cache via atomic staging + move pattern, skipping `generateFullBoilerplate`, `build.prepare.dev`, and media cache warming
- [ ] `--force` flag bypasses cache read and performs full materialization
- [ ] Previous cache entry deleted when new entry is written (keep only latest)
- [ ] `mission.materialize` JSON output includes `artifactCacheHit`, `artifactCacheKey`, and `artifactCacheSkipped` fields
- [ ] `.materialization-cache-state.json` written separately from `.materialization-state.json` (RFC-0597)
- [ ] Unit test: cache hit → `artifactCacheHit: true`, `generateFullBoilerplate` not called, `build.prepare.dev` not called
- [ ] Unit test: cache miss → full materialization, cache written after `build.prepare.dev`
- [ ] Unit test: `--force` → cache bypassed, full materialization, cache refreshed
- [ ] Unit test: cache directory missing despite state file match → fall through to full materialization
- [ ] `AGENTS.md` for `site-kernel-handoff` updated with artifact cache documentation
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
- Agents MUST NOT cache `.git/` or `node_modules/` in the workpiece artifact cache — these are restored by `git clone` and `pnpm install` respectively.
- Agents MUST use the atomic staging + move pattern for cache restore (write to staging dir, then `atomicMoveDir` to workpiece) to ensure consistency on failure.
- Agents MUST write the cache snapshot AFTER `build.prepare.dev` completes successfully, not before — the cache must capture the post-codegen state.
- Agents MUST delete previous cache entries when writing a new one — only the latest entry is kept.
- Agents MUST NOT use the RFC-0390 command-result cache for the artifact cache — they are different mechanisms with different semantics (file-level snapshot vs. result-level cache).
- The `--force` flag bypasses both the artifact cache (this RFC) and the command-result cache for `build.prepare.dev` (RFC-0619). This is intentional — `--force` means "redo everything from scratch."
