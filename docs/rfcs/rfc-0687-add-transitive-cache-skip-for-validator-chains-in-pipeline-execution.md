---
id: RFC-0687
title: "Add transitive cache skip for validator chains in pipeline execution"
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
createdAt: 2026-08-04
updatedAt: 2026-08-05
enhancedAt: 2026-08-05
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0390
  - RFC-0382
  - RFC-0685
  - RFC-0686
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-35
  - DNA-53
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
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel"
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "Cacheable validators skip execution when all their upstream generators were cache hits — no reads[] hash computation needed"
  - "Cross-pipeline skip works: build.check validators skip when build.prepare generators were cached in the same build session"
  - "Pipeline wall time for build.check drops on cache-hit runs (no code changed since last build)"
  - "Cache skip is transitive — a validator at the end of a chain skips if all upstream generators and intermediate validators were cache hits"
  - "generated.drift.validate (cacheable: false) always runs and catches manual edits to generated files"
nonGoals:
  - "Does not change the command-result cache schema (RFC-0390) — reuses existing cache entries"
  - "Does not skip `cacheable: false` validators — they always execute (e.g. generated.drift.validate, generated.files.validate, generated.stale.validate)"
  - "Does not remove validators from the pipeline — skipped validators still appear in the pipeline report with a skip reason"
  - "Does not apply to non-validator commands (generators, transformers) — only to cacheable read-only validators that declare `validatesOutputs`"
  - "Does not compute reads[] hash for transitive-skip decisions — the skip is based solely on upstream cache-hit status"
  - "Does not merge build.prepare and build.check into a single pipeline — they remain separate pipeline runs connected by a persisted cache-hit file"
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

# RFC-0687: Add transitive cache skip for validator chains in pipeline execution

## Context

RFC-0390 caches command results by hashing declared `reads[]` inputs. When a generator's inputs are unchanged, the cache hit means the generator's output files are identical to the previous run. Validators that check those output files will also produce identical results — yet they re-run because the cache only skips the generator, not downstream validators.

Within `build.prepare`, validators like `mirror.quintet.validate` run after generators like `manifest.contract.validate`. When the generator was a cache hit, the validator's inputs are guaranteed unchanged — but the validator still executes, re-hashing its `reads[]` and re-running its check logic.

The `build.check` pipeline runs after `build.prepare` as a separate pipeline invocation. Validators in `build.check` that check outputs from `build.prepare` generators cannot benefit from `build.prepare`'s cache hits because `cacheHitCommands` is per-pipeline-run — there is no mechanism to propagate cache-hit status across pipeline boundaries.

For example: `mirror.quintet.validate` reads `packages/ui/src/{sections,components,pages}/**/*.astro` and validates that each has a colocated manifest. If `manifest.contract.validate` (which reads the same manifests) was a cache hit, the manifests are unchanged, and `mirror.quintet.validate` will pass — but it still runs, re-hashing and re-checking every file.

## Problem

The command-result cache (RFC-0390) is per-command: each command checks its own `reads[]` hash against the cache. There is no mechanism to propagate cache-hit status across commands or across pipeline boundaries. This means:

1. A cacheable validator that reads only generated files must re-hash and re-validate even when all generators that produced those files were cache hits in the same pipeline run.
2. Validators in `build.check` cannot benefit from `build.prepare`'s cache hits because the two are separate pipeline runs with no shared state.
3. The pipeline wall time for a no-op `build.check` (nothing changed) is the sum of all validator durations, not near-zero.

This is particularly costly for validators that read large file trees (e.g. `mirror.quintet.validate` reads all `.astro` files in `packages/ui/src/`).

Note: `cacheable: false` validators (e.g. `generated.drift.validate`, `generated.files.validate`, `generated.stale.validate`) are NOT affected by this problem — they always execute by design, which is correct because they check filesystem state not captured by `reads[]` alone (file existence, directory contents, generator re-execution). The transitive skip targets only cacheable validators whose results are fully determined by their declared `reads[]`.

## Decision

The `KernelCommandDefinition` type gains an optional `validatesOutputs?: string[]` field declaring which commands' outputs this validator checks. When a validator's `validatesOutputs` list is fully satisfied by cache-hit generators (all listed commands were cache hits in the current pipeline run or imported from a previous pipeline run via the persisted cache-hit file), the validator is skipped with `skipReason: "transitive-cache-skip: upstream generators cached"`. No `reads[]` hash computation is performed for the transitive-skip decision — the skip is based solely on upstream cache-hit status.

The skip is transitive: if validator A validates outputs of generator G, and validator B validates outputs of validator A (rare but possible), B is skipped if both G and A were cache hits. A validator that was transitively skipped is also added to `cacheHitCommands`, enabling downstream transitive skips.

Cross-pipeline propagation: after each pipeline run, the `cacheHitCommands` set is persisted to `.cache/pipeline-cache-hits.json`. The next pipeline run loads this file and merges imported cache hits into its own `cacheHitCommands`. This enables `build.check` validators to skip when `build.prepare` generators were cached in the same build session. Stale entries (older than 30 minutes) are ignored to avoid false skips across unrelated build sessions.

Safety net: `generated.drift.validate` (`cacheable: false`) always runs and detects manual edits to generated files. The transitive skip does NOT apply to `cacheable: false` validators — they are the safety layer that catches filesystem state changes the cache cannot capture.

## Architectural fit

- **DNA-35 (`app.contract.full`):** The canonical readiness signal benefits from transitive cache skip because a no-op build (nothing changed) completes near-instantly. The gate still exits zero only if all validators pass — a skipped validator is one whose upstream generators were cached, meaning their outputs are identical to the last run where the validator did pass. The `cacheable: false` validators (`generated.drift.validate`, `generated.files.validate`, `generated.stale.validate`) always run and provide the filesystem-state safety net.
- **DNA-53 (Semantic fingerprint governance):** The transitive skip uses existing cache entries and the existing `reads[]` hash mechanism for normal cache checks. No new hashing is introduced. The transitive-skip decision itself does NOT compute hashes — it relies on the upstream cache-hit signal.
- **RFC-0390 (Command-result cache):** This RFC extends RFC-0390 with a new metadata field (`validatesOutputs`) and a new skip reason. The cache schema is unchanged — the skip decision is made at the pipeline executor level, not the cache layer.
- **RFC-0382 (Kernel cache):** The persisted cache-hit file (`.cache/pipeline-cache-hits.json`) lives in the same `.cache/` directory as the SQLite kernel cache. It is gitignored. `--force` clears the file.
- **RFC-0685 (Workspace tree index):** The tree index and mtime fast path benefit the normal cache check path (RFC-0390). The transitive-skip path bypasses hash computation entirely, so RFC-0685 does not directly affect the transitive skip — but it benefits the non-transitive-skip path when upstream is not cached.
- **RFC-0686 (Pipeline dependency graph):** The `validatesOutputs` field is complementary to `dependsOn`. `dependsOn` controls execution order; `validatesOutputs` controls transitive cache skip. A validator can declare `dependsOn: ["generator.x"]` for ordering and `validatesOutputs: ["generator.x"]` for cache skip. If RFC-0686 introduces parallel step execution, `cacheHitCommands` must be updated after all parallel steps in a wave complete, before the next wave checks transitive skip.
- **Site OS operator model:** No new commands. The `validatesOutputs` field is metadata on existing command definitions in `packages/os/site-kernel-checks/src/command-tables/`.
- **Compass sync:** `docs/verification-plan.xml` may need updating to document the new `validatesOutputs` field and the transitive-skip behavior. `packages/os/site-kernel/AGENTS.md` § Command-result cache (RFC-0390) must be updated to document the new field and the `.cache/pipeline-cache-hits.json` file.
- **Command manifest:** `buildCommandManifest` in `packages/os/site-kernel/src/command-manifest.ts` must include `validatesOutputs` in the manifest entry. `KernelRegisteredCommandInfo` in `types.ts` and `commandInfo()` in `registry.ts` must propagate the field.

## Design

### Transitive skip algorithm

The pipeline executor tracks a `cacheHitCommands: Set<string>` per pipeline run. Before the run starts, it loads `.cache/pipeline-cache-hits.json` and merges non-stale entries (written within the last 30 minutes) from previous pipeline runs into `cacheHitCommands`. After each step, if the step was a cache hit (the command's `reads[]` hash matched a cached entry and the command was not executed) OR the step was transitively skipped, the command name is added to the set. After the run completes, the set is persisted back to the file.

Before executing a validator step, the executor checks:

1. Does the command have `validatesOutputs` declared? If not, proceed with normal cache check.
2. Is the command `cacheable` (not `cacheable: false`)? If not, proceed with normal execution — transitive skip does not apply to `cacheable: false` validators.
3. Are all commands in `validatesOutputs` in the `cacheHitCommands` set? If not, proceed with normal cache check.
4. If all upstream commands are cached, skip the validator with `skipReason: "transitive-cache-skip"`. No `reads[]` hash computation is performed.

The skip is transitive because a validator that was transitively skipped is also added to `cacheHitCommands`, enabling downstream validators to skip transitively.

`--force` flag: clears `.cache/pipeline-cache-hits.json` before the run starts and skips all transitive-skip checks. `cacheHitCommands` remains empty for the entire run.

### Cross-pipeline cache-hit persistence

The `.cache/pipeline-cache-hits.json` file has the following structure:

```json
{
  "pipelines": {
    "build.prepare": {
      "commands": ["manifest.contract.validate", "routes.generate", ...],
      "writtenAt": "2026-08-05T14:30:00.000Z"
    },
    "build.check": {
      "commands": ["biome.tokens.validate", ...],
      "writtenAt": "2026-08-05T14:31:00.000Z"
    }
  }
}
```

Before a pipeline run starts, the executor loads this file and merges all non-stale entries (written within the last 30 minutes) from ALL other pipelines into `cacheHitCommands`. This enables `build.check` to see `build.prepare`'s cache hits.

After a pipeline run completes, the executor writes its own `cacheHitCommands` set back to the file under its pipeline name, replacing any previous entry for that pipeline.

Staleness: entries older than 30 minutes are ignored. This prevents false skips across unrelated build sessions (e.g., a `build.prepare` from the morning and a `build.check` in the afternoon).

`--force` clears the entire file before the run starts, ensuring no imported cache hits are used.

### TypeScript contracts

```ts
// packages/os/site-kernel/src/types.ts (modified)

export interface KernelCommandDefinition<TData = unknown>
  extends KernelCommandMetadata {
  // ... existing fields ...
  /**
   * RFC-0687: command names whose outputs this validator checks. When all
   * listed commands were cache hits in the current pipeline run (or imported
   * from a previous pipeline run via .cache/pipeline-cache-hits.json), the
   * validator is skipped with skipReason "transitive-cache-skip". No reads[]
   * hash computation is performed for the transitive-skip decision.
   * Only meaningful for cacheable read-only validators (mutatesState: false,
   * cacheable: true). Ignored for generators and cacheable: false validators.
   */
  validatesOutputs?: string[];
}

// packages/os/site-kernel/src/types.ts (modified — propagate to registered info)

export interface KernelRegisteredCommandInfo extends KernelCommandMetadata {
  // ... existing fields ...
  /** RFC-0687: propagated from KernelCommandDefinition for manifest exposure. */
  validatesOutputs?: string[];
}
```

```ts
// packages/os/site-kernel/src/runtime/execute-pipeline.ts (modified)

interface PipelineRunState {
  cacheHitCommands: Set<string>;
  pipelineName: string;
}

function shouldTransitiveSkip(
  command: KernelCommandDefinition,
  runState: PipelineRunState,
): boolean {
  if (command.cacheable === false) return false;
  if (!command.validatesOutputs || command.validatesOutputs.length === 0) {
    return false;
  }
  return command.validatesOutputs.every((name) =>
    runState.cacheHitCommands.has(name),
  );
}

// Cross-pipeline cache-hit persistence

const PIPELINE_CACHE_HITS_PATH = ".cache/pipeline-cache-hits.json";
const PIPELINE_CACHE_HITS_STALENESS_MS = 30 * 60 * 1000; // 30 minutes

interface PipelineCacheHitsFile {
  pipelines: Record<string, {
    commands: string[];
    writtenAt: string;
  }>;
}

async function loadImportedCacheHits(
  workspaceRoot: string,
  currentPipelineName: string,
): Promise<Set<string>> {
  // Load .cache/pipeline-cache-hits.json, merge non-stale entries from
  // pipelines other than currentPipelineName.
}

async function persistCacheHits(
  workspaceRoot: string,
  pipelineName: string,
  cacheHitCommands: Set<string>,
): Promise<void> {
  // Write cacheHitCommands under pipelineName in .cache/pipeline-cache-hits.json.
}
```

```ts
// packages/os/site-kernel/src/runtime/registry.ts (modified — propagate field)

function commandInfo(
  command: KernelCommandDefinition,
  provider: KernelRegisteredCommandInfo["provider"],
  siteName?: string,
  moduleName?: string,
): KernelRegisteredCommandInfo {
  return {
    // ... existing fields ...
    ...(command.validatesOutputs ? { validatesOutputs: command.validatesOutputs } : {}),
    provider,
    siteName,
  };
}
```

```ts
// packages/os/site-kernel/src/command-manifest.ts (modified — include in manifest)

const entries: CommandManifestEntry[] = commands.map((command) => ({
  // ... existing fields ...
  validatesOutputs: command.validatesOutputs ?? [],
  pipelines: [...(pipelinesByCommand.get(command.name) ?? [])].sort(),
}));
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/types.ts` | Modified: add `validatesOutputs` to `KernelCommandDefinition` and `KernelRegisteredCommandInfo` |
| `packages/os/site-kernel/src/runtime/execute-pipeline.ts` | Modified: track `cacheHitCommands`, load/persist `.cache/pipeline-cache-hits.json`, check transitive skip before execution |
| `packages/os/site-kernel/src/runtime/registry.ts` | Modified: propagate `validatesOutputs` in `commandInfo()` |
| `packages/os/site-kernel/src/command-manifest.ts` | Modified: include `validatesOutputs` in manifest entries |
| `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` | No changes in this RFC — no validators annotated with `validatesOutputs` (infrastructure-only) |
| `.cache/pipeline-cache-hits.json` | New: persisted cache-hit file (gitignored, lives in `.cache/` per RFC-0382) |
| `packages/os/site-kernel/AGENTS.md` | Modified: document `validatesOutputs` field and `.cache/pipeline-cache-hits.json` in § Command-result cache |

### Failure modes

- **Stale transitive skip (manual edits)**: if a generator was a cache hit but a manual edit changed its output files (bypassing the pipeline), the transitive skip would fire and miss the drift. Mitigation: `generated.drift.validate` (`cacheable: false`) always runs and detects manual edits to generated files. The transitive skip does NOT apply to `cacheable: false` validators. Additionally, the staleness TTL (30 minutes) prevents cross-session false skips.
- **Missing `validatesOutputs` declaration**: validators without `validatesOutputs` are never transitively skipped — they always go through the normal cache check. This is the default and is safe.
- **Incorrect `validatesOutputs` declaration**: if a validator declares `validatesOutputs: ["generator.x"]` but actually also reads files from `generator.y`, the transitive skip may fire when `generator.y` changed but `generator.x` was cached. This is a command definition bug. Mitigation: the `cacheable: false` validators (`generated.drift.validate`, `generated.files.validate`, `generated.stale.validate`) always run and catch missing or stale files regardless of transitive skip.
- **`--force` flag**: clears `.cache/pipeline-cache-hits.json` and bypasses all cache reads, so `cacheHitCommands` is always empty, and transitive skip never fires.
- **Stale `.cache/pipeline-cache-hits.json`**: if the file contains entries older than 30 minutes, they are ignored. If the file is corrupt or missing, the executor falls back to empty `cacheHitCommands` (no transitive skip, normal cache check only).
- **Concurrent pipeline runs**: if two pipeline runs execute concurrently (e.g., two agents), they may both read and write `.cache/pipeline-cache-hits.json` causing a race. Mitigation: the file is per-pipeline-name keyed, so concurrent runs of different pipelines do not conflict. Concurrent runs of the same pipeline are not supported by the pipeline executor (it is sequential per site).

## Rollout

- **Default behavior**: transitive cache skip is enabled by default. No opt-in flag is needed — the skip is transparent and only fires when all preconditions are met (cacheable validator, `validatesOutputs` declared, all upstream commands cached).
- **Gradual adoption**: validators are annotated with `validatesOutputs` incrementally. Validators without the field are never transitively skipped. No validators are annotated in this RFC — the mechanism is infrastructure-only. The first `validatesOutputs` annotation will be added when a suitable cacheable generator→cacheable validator pair is identified. Current cacheable validators (e.g. `biome.tokens.validate`, `mirror.quintet.validate`) read authored files, not generated files, so they are not candidates. Current generators that produce files checked by cacheable validators (e.g. `open-source.generate`) are `cacheable: false`, so they never appear in `cacheHitCommands`.
- **`cacheable: false` exclusion**: `generated.drift.validate`, `generated.files.validate`, `generated.stale.validate`, `ownership.sync.validate`, `open-source.generate`, `bordbuch.generate` are `cacheable: false` and are NOT candidates for transitive skip. They always run and provide the filesystem-state safety net.
- **No pipeline changes**: `build.check` and `build.prepare` step definitions are unchanged. The `validatesOutputs` field is on command definitions, not pipeline steps.
- **`--force` flag**: clears `.cache/pipeline-cache-hits.json` and bypasses all cache reads, so transitive skip never fires.
- **Pipeline report**: skipped validators appear in the report with `skipReason: "transitive-cache-skip"` and `ok: true`, making it clear they were skipped due to transitive cache, not a failure.
- **Empty state**: a new site with no generated files — validators with `validatesOutputs` would have no upstream cache hits (generators produce nothing on first run), so the transitive skip would not fire. This is correct behavior — the first run always executes all validators.

## Alternatives considered

- **Pipeline-level cache key**: compute a single hash for the entire pipeline and skip all validators if the pipeline-level hash matches. Rejected because it's too coarse — a single changed file would invalidate the entire pipeline cache, even if only one validator cares about that file.
- **Output-hash-based skip**: after a generator runs, hash its output files and store the hash. Validators skip if the output hash matches. Rejected because it duplicates the `reads[]` hash mechanism — the validator's `reads[]` already covers the generated files. The transitive skip adds the "upstream was cached" signal on top of the existing `reads[]` check.
- **Declarative `skipIfCached` flag**: a boolean on validators that says "skip if all reads are cached." Rejected because it doesn't capture the transitive dependency — a validator might read both generated files and authored files. The `validatesOutputs` field specifically tracks which generators' outputs are being validated, making the skip decision precise.
- **Separate `build.check.cached` pipeline**: a minimal pipeline that runs only when `build.prepare` was fully cached. Rejected because it duplicates the pipeline definition and requires manual maintenance to keep the two pipelines in sync.
- **Keep `reads[]` hash check as safety net (audit finding)**: the original RFC design required step 3 (`reads[]` hash check) as a NON-NEGOTIABLE safety net before applying transitive skip. Rejected because (a) it provides zero performance benefit over RFC-0390's per-command cache — the hash computation is the same cost, and the validator's own cache check would already produce a cache hit; (b) it makes the transitive skip impossible for `cacheable: false` validators whose `reads[]` hash is never stored. The revised design skips without hash check and relies on `generated.drift.validate` (always runs, `cacheable: false`) as the safety net for manual edits.
- **In-memory process-level cache-hit passing**: pass `cacheHitCommands` between pipeline runs via a process-level variable or singleton. Rejected because `build.prepare` and `build.check` may run in separate processes (e.g., `pnpm run build:prepare` followed by `pnpm run build:check`). The JSON file persistence works across processes and is simpler.

## Risks

- **False-negative on manual edits**: if someone manually edits a generated file (bypassing the pipeline), the generator's cache is still a hit (its `reads[]` didn't change), but the generated file is different. The transitive skip would fire and miss the drift. Mitigation: `generated.drift.validate` (`cacheable: false`) always runs and detects manual edits. The transitive skip does NOT apply to `cacheable: false` validators. The `generated.drift.validate` validator is specifically designed to catch this case by re-running generators in dryRun mode and comparing output.
- **Incorrect `validatesOutputs` declaration**: if a validator declares `validatesOutputs: ["generator.x"]` but actually reads files from `generator.y` too, and `generator.y` changed while `generator.x` was cached, the transitive skip would fire incorrectly. Mitigation: the `cacheable: false` validators (`generated.drift.validate`, `generated.files.validate`, `generated.stale.validate`) always run and catch missing or stale files regardless of transitive skip. The `validatesOutputs` field is an optimization hint, not a correctness mechanism.
- **Agent misinterpretation**: agents might think `validatesOutputs` replaces `reads[]`. It does not — `reads[]` is still the functional cache input declaration (RFC-0390). `validatesOutputs` is an additional optimization layer that enables transitive skip. Agents MUST NOT remove `reads[]` from validators that have `validatesOutputs`.
- **Maintenance burden**: each validator must keep its `validatesOutputs` list in sync with the generators it actually validates. If a validator starts reading a new generator's output, `validatesOutputs` must be updated. This is a documentation burden, not a correctness risk (the `cacheable: false` validators are the safety net).
- **Stale `.cache/pipeline-cache-hits.json`**: if the file contains entries from a previous build session that are within the 30-minute TTL but the filesystem has changed since, the transitive skip may fire incorrectly. Mitigation: the TTL is conservative (30 minutes), and `generated.drift.validate` catches manual edits. In practice, `build.prepare` and `build.check` run seconds apart in the same build session.
- **RFC-0686 concurrent execution**: if RFC-0686 is implemented and steps run in parallel, `cacheHitCommands` must be updated after all parallel steps in a wave complete, before the next wave checks transitive skip. The current sequential executor does not have this issue.

## Acceptance criteria

- [ ] `validatesOutputs?: string[]` field added to `KernelCommandDefinition` in `packages/os/site-kernel/src/types.ts`
- [ ] `validatesOutputs?: string[]` field added to `KernelRegisteredCommandInfo` in `packages/os/site-kernel/src/types.ts`
- [ ] `commandInfo()` in `packages/os/site-kernel/src/runtime/registry.ts` propagates `validatesOutputs`
- [ ] `buildCommandManifest` in `packages/os/site-kernel/src/command-manifest.ts` includes `validatesOutputs` in manifest entries
- [ ] `PipelineRunState` interface in `execute-pipeline.ts` tracks `cacheHitCommands: Set<string>` and `pipelineName: string`
- [ ] `shouldTransitiveSkip` function in `execute-pipeline.ts` checks: (a) command is not `cacheable: false`, (b) `validatesOutputs` is non-empty, (c) all entries are in `cacheHitCommands`
- [ ] Validator is skipped with `skipReason: "transitive-cache-skip"` when transitive skip conditions are met — no `reads[]` hash computation performed
- [ ] `loadImportedCacheHits` function loads `.cache/pipeline-cache-hits.json` and merges non-stale entries (within 30-minute TTL) from other pipelines
- [ ] `persistCacheHits` function writes `cacheHitCommands` to `.cache/pipeline-cache-hits.json` after pipeline run completes
- [ ] Transitive skip does not fire when `--force` is set (file is cleared, `cacheHitCommands` is empty)
- [ ] Transitive skip does not fire for `cacheable: false` validators (step 2 of algorithm)
- [ ] `mirror.quintet.validate` in `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` NOT annotated — no validators are annotated in this RFC (infrastructure-only)
- [ ] Unit tests verify: (a) transitive skip fires when all upstream cached, (b) no skip when upstream cache miss, (c) no skip for `cacheable: false` validators, (d) transitive skip through a chain of 2 validators, (e) `--force` disables transitive skip, (f) stale `.cache/pipeline-cache-hits.json` entries (>30 min) are ignored, (g) cross-pipeline skip works when `build.prepare` cache hits are loaded by `build.check`, (h) no skip when `validatesOutputs` is empty or undefined, (i) corrupt `.cache/pipeline-cache-hits.json` falls back to empty set, (j) `persistCacheHits` preserves entries for other pipelines
- [ ] `build:check` passes on `@warpgogol/site-kernel` and `@warpgogol/site-kernel-checks`
- [ ] `rfc.validate` passes on this file
- [ ] `packages/os/site-kernel/AGENTS.md` § Command-result cache updated to document `validatesOutputs` and `.cache/pipeline-cache-hits.json`

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- When annotating a validator with `validatesOutputs`, agents MUST ensure the list includes ALL generators whose outputs the validator reads. Missing a generator means the transitive skip could fire when that generator's output changed — but the `cacheable: false` validators (`generated.drift.validate`, `generated.files.validate`, `generated.stale.validate`) are the safety net.
- `validatesOutputs` MUST only be set on cacheable read-only validators (`mutatesState: false`, `cacheable: true` or unset). Setting it on `cacheable: false` validators has no effect (the algorithm checks `cacheable !== false`). Setting it on a generator has no effect and is a command definition bug.
- The transitive skip does NOT compute `reads[]` hash — the skip is based solely on upstream cache-hit status. The safety net against manual edits is `generated.drift.validate` (always runs, `cacheable: false`), NOT the `reads[]` hash check.
- Agents MUST NOT use `validatesOutputs` as a replacement for `reads[]`. `reads[]` is the functional cache input declaration (RFC-0390); `validatesOutputs` is an optimization hint for transitive skip. Validators with `validatesOutputs` MUST still declare `reads[]`.
- The `.cache/pipeline-cache-hits.json` file is gitignored and lives in `.cache/` per RFC-0382. It is not a cache schema change — it is a pipeline-executor-level state file.
- `--force` clears `.cache/pipeline-cache-hits.json` before the run starts. Agents MUST NOT manually edit this file.
- If RFC-0686 (parallel step execution) is implemented, agents MUST update `cacheHitCommands` after all parallel steps in a wave complete, before the next wave checks transitive skip.
