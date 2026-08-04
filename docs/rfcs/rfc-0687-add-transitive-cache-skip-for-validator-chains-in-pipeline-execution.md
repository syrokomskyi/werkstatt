---
id: RFC-0687
title: "Add transitive cache skip for validator chains in pipeline execution"
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
createdAt: 2026-08-04
updatedAt: 2026-08-04
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0390
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
  - "Validators skip execution when all their upstream generators were cache hits and the validator's own inputs are unchanged"
  - "Pipeline wall time for build.check drops significantly on cache-hit runs (no code changed since last build)"
  - "Cache skip is transitive — a validator at the end of a chain skips if all upstream generators and intermediate validators were cache hits"
  - "No validation false-negatives — a cache miss in any upstream step forces full re-validation"
nonGoals:
  - "Does not change the command-result cache schema (RFC-0390) — reuses existing cache entries"
  - "Does not skip validators on cache misses — only skips when upstream generators were cache hits"
  - "Does not remove validators from the pipeline — skipped validators still appear in the pipeline report with a skip reason"
  - "Does not apply to non-validator commands (generators, transformers) — only to read-only validators that declare `validatesOutputs`"
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

The `build.check` pipeline runs after `build.prepare`. Many validators in `build.check` validate outputs produced by generators in `build.prepare`. When `build.prepare` was fully cached (all generators were cache hits), the validators in `build.check` are guaranteed to produce the same results as the last run — but they still execute because the cache is per-command, not transitive.

For example: `generated.drift.validate` checks that generated files match their generators' current output. If all generators were cache hits, the generated files are unchanged, and `generated.drift.validate` will pass — but it still runs, reading and comparing every generated file.

## Problem

The command-result cache (RFC-0390) is per-command: each command checks its own `reads[]` hash against the cache. There is no mechanism to propagate cache-hit status across commands. This means:

1. A validator that reads only generated files must re-hash and re-validate even when all generators that produced those files were cache hits.
2. The `build.check` pipeline re-runs all validators on every invocation, even when `build.prepare` was fully cached and nothing changed.
3. The pipeline wall time for a no-op `build.check` (nothing changed) is the sum of all validator durations, not near-zero.

This is particularly costly for validators that read large generated trees (e.g. `generated.drift.validate` reads all generated files, `mirror.quintet.validate` reads all manifests and schemas).

## Decision

The `KernelCommandDefinition` type gains an optional `validatesOutputs?: string[]` field declaring which commands' outputs this validator checks. When a validator's `validatesOutputs` list is fully satisfied by cache-hit generators (all listed commands were cache hits in the current pipeline run), and the validator's own `reads[]` hash also matches the cache, the validator is skipped with `skipReason: "transitive-cache-skip: upstream generators cached"`. The skip is transitive: if validator A validates outputs of generator G, and validator B validates outputs of validator A (rare but possible), B is skipped if both G and A were cache hits.

## Architectural fit

- **DNA-35 (`app.contract.full`):** The canonical readiness signal benefits from transitive cache skip because a no-op `build.check` (nothing changed) completes near-instantly. The gate still exits zero only if all validators pass — a skipped validator is one that would have passed (its inputs are identical to the last run where it did pass).
- **DNA-53 (Semantic fingerprint governance):** The transitive skip uses existing cache entries and the existing `reads[]` hash mechanism. No new hashing is introduced.
- **RFC-0390 (Command-result cache):** This RFC extends RFC-0390 with a new metadata field (`validatesOutputs`) and a new skip reason. The cache schema is unchanged — the skip decision is made at the pipeline executor level, not the cache layer.
- **RFC-0685 (Workspace tree index):** The tree index and mtime fast path make the validator's own `reads[]` hash check faster, which is used as a secondary confirmation before applying the transitive skip.
- **RFC-0686 (Pipeline dependency graph):** The `validatesOutputs` field is complementary to `dependsOn`. `dependsOn` controls execution order; `validatesOutputs` controls transitive cache skip. A validator can declare `dependsOn: ["generator.x"]` for ordering and `validatesOutputs: ["generator.x"]` for cache skip.
- **Site OS operator model:** No new commands. The `validatesOutputs` field is metadata on existing command definitions in `packages/os/site-kernel-checks/src/commands/`.

## Design

### Transitive skip algorithm

The pipeline executor tracks a `cacheHitCommands: Set<string>` per pipeline run. After each step, if the step was a cache hit (the command's `reads[]` hash matched a cached entry and the command was not executed), the command name is added to the set.

Before executing a validator step, the executor checks:

1. Does the command have `validatesOutputs` declared? If not, proceed with normal cache check.
2. Are all commands in `validatesOutputs` in the `cacheHitCommands` set? If not, proceed with normal cache check.
3. Does the validator's own `reads[]` hash match the cache? If yes, skip the validator with `skipReason: "transitive-cache-skip"`.
4. If the validator's own `reads[]` hash does not match the cache, execute the validator normally (the validator's inputs may have changed even if the generator's were cached — e.g. manual edits to generated files).

The skip is transitive because a validator that was cache-hit (via transitive skip or normal cache hit) is also added to `cacheHitCommands`, enabling downstream validators to skip transitively.

### TypeScript contracts

```ts
// packages/os/site-kernel/src/types.ts (modified)

export interface KernelCommandDefinition<TData = unknown>
  extends KernelCommandMetadata {
  // ... existing fields ...
  /**
   * RFC-0687: command names whose outputs this validator checks. When all
   * listed commands were cache hits in the current pipeline run, and this
   * validator's own reads[] hash also matches the cache, the validator is
   * skipped with skipReason "transitive-cache-skip". Only meaningful for
   * read-only validators (mutatesState: false). Ignored for generators.
   */
  validatesOutputs?: string[];
}
```

```ts
// packages/os/site-kernel/src/runtime/execute-pipeline.ts (modified)

interface PipelineRunState {
  cacheHitCommands: Set<string>;
  // ... existing fields ...
}

function shouldTransitiveSkip(
  command: KernelCommandDefinition,
  runState: PipelineRunState,
): boolean {
  if (!command.validatesOutputs || command.validatesOutputs.length === 0) {
    return false;
  }
  return command.validatesOutputs.every((name) =>
    runState.cacheHitCommands.has(name),
  );
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/types.ts` | Modified: add `validatesOutputs` to `KernelCommandDefinition` |
| `packages/os/site-kernel/src/runtime/execute-pipeline.ts` | Modified: track `cacheHitCommands`, check transitive skip before execution |
| `packages/os/site-kernel-checks/src/commands/*.ts` | Modified: add `validatesOutputs` to validator command definitions |

### Failure modes

- **Stale transitive skip**: if a generator was a cache hit but a manual edit changed its output files (bypassing the pipeline), the validator's own `reads[]` hash will not match the cache, and the validator will execute normally. The transitive skip only applies when both the upstream generators were cached AND the validator's own inputs match the cache.
- **Missing `validatesOutputs` declaration**: validators without `validatesOutputs` are never transitively skipped — they always go through the normal cache check. This is the default and is safe.
- **Incorrect `validatesOutputs` declaration**: if a validator declares `validatesOutputs: ["generator.x"]` but actually also reads files from `generator.y`, the transitive skip may fire when `generator.y` changed but `generator.x` was cached. This is a command definition bug. Mitigation: the `reads[]` hash check (step 3 of the algorithm) catches this — if `generator.y` changed the validator's inputs, the `reads[]` hash won't match, and the validator executes normally.
- **`--force` flag**: bypasses all cache reads, so `cacheHitCommands` is always empty, and transitive skip never fires.

## Rollout

- **Default behavior**: transitive cache skip is enabled by default. No opt-in flag is needed — the skip is transparent and only fires when all preconditions are met (upstream cached + validator's own inputs cached).
- **Gradual adoption**: validators are annotated with `validatesOutputs` incrementally. Validators without the field are never transitively skipped. Priority candidates: `generated.drift.validate`, `generated.files.validate`, `generated.stale.validate`, `mirror.quintet.validate`, `ownership.sync.validate`.
- **No pipeline changes**: `build.check` step definitions are unchanged. The `validatesOutputs` field is on command definitions, not pipeline steps.
- **`--force` flag**: bypasses all cache reads, so transitive skip never fires.
- **Pipeline report**: skipped validators appear in the report with `skipReason: "transitive-cache-skip"` and `ok: true`, making it clear they were skipped due to transitive cache, not a failure.

## Alternatives considered

- **Pipeline-level cache key**: compute a single hash for the entire pipeline and skip all validators if the pipeline-level hash matches. Rejected because it's too coarse — a single changed file would invalidate the entire pipeline cache, even if only one validator cares about that file.
- **Output-hash-based skip**: after a generator runs, hash its output files and store the hash. Validators skip if the output hash matches. Rejected because it duplicates the `reads[]` hash mechanism — the validator's `reads[]` already covers the generated files. The transitive skip adds the "upstream was cached" signal on top of the existing `reads[]` check.
- **Declarative `skipIfCached` flag**: a boolean on validators that says "skip if all reads are cached." Rejected because it doesn't capture the transitive dependency — a validator might read both generated files and authored files. The `validatesOutputs` field specifically tracks which generators' outputs are being validated, making the skip decision precise.
- **Separate `build.check.cached` pipeline**: a minimal pipeline that runs only when `build.prepare` was fully cached. Rejected because it duplicates the pipeline definition and requires manual maintenance to keep the two pipelines in sync.

## Risks

- **False-negative on manual edits**: if someone manually edits a generated file (bypassing the pipeline), the generator's cache is still a hit (its `reads[]` didn't change), but the generated file is different. The validator's `reads[]` hash will not match the cache (it reads the generated file), so the validator will execute and catch the drift. This is the correct behavior — the `reads[]` check is the safety net.
- **Incorrect `validatesOutputs` declaration**: if a validator declares `validatesOutputs: ["generator.x"]` but actually reads files from `generator.y` too, and `generator.y` changed while `generator.x` was cached, the transitive skip would fire incorrectly. Mitigation: the validator's own `reads[]` hash includes all files it reads (including `generator.y`'s output), so the `reads[]` check catches this. The `validatesOutputs` field is an optimization hint, not a correctness mechanism.
- **Agent misinterpretation**: agents might think `validatesOutputs` replaces `reads[]`. It does not — `reads[]` is still the functional cache input declaration (RFC-0390). `validatesOutputs` is an additional optimization layer that enables transitive skip.
- **Maintenance burden**: each validator must keep its `validatesOutputs` list in sync with the generators it actually validates. If a validator starts reading a new generator's output, `validatesOutputs` must be updated. This is a documentation burden, not a correctness risk (the `reads[]` check is the safety net).

## Acceptance criteria

- [ ] `validatesOutputs?: string[]` field added to `KernelCommandDefinition` in `packages/os/site-kernel/src/types.ts`
- [ ] `PipelineRunState` interface in `execute-pipeline.ts` tracks `cacheHitCommands: Set<string>`
- [ ] `shouldTransitiveSkip` function in `execute-pipeline.ts` checks all `validatesOutputs` entries are in `cacheHitCommands`
- [ ] Validator is skipped with `skipReason: "transitive-cache-skip"` when transitive skip conditions are met
- [ ] Validator's own `reads[]` hash is still checked before applying transitive skip (safety net)
- [ ] Transitive skip does not fire when `--force` is set
- [ ] At least 3 validators in `site-kernel-checks` annotated with `validatesOutputs` (e.g. `generated.drift.validate`, `generated.files.validate`, `generated.stale.validate`)
- [ ] Unit tests verify: (a) transitive skip fires when all upstream cached + own reads match, (b) no skip when upstream cache miss, (c) no skip when own reads don't match, (d) transitive skip through a chain of 2 validators, (e) `--force` disables transitive skip
- [ ] `build:check` passes on `@warpgogol/site-kernel` and `@warpgogol/site-kernel-checks`
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- When annotating a validator with `validatesOutputs`, agents MUST ensure the list includes ALL generators whose outputs the validator reads. Missing a generator means the transitive skip could fire when that generator's output changed — but the `reads[]` hash check is the safety net.
- `validatesOutputs` MUST only be set on read-only validators (`mutatesState: false`). Setting it on a generator has no effect and is a command definition bug.
- The `reads[]` hash check (step 3 of the algorithm) is NON-NEGOTIABLE — it must always run before applying the transitive skip. Without it, manual edits to generated files would go undetected.
- Agents MUST NOT use `validatesOutputs` as a replacement for `reads[]`. `reads[]` is the functional cache input declaration (RFC-0390); `validatesOutputs` is an optimization hint for transitive skip.
