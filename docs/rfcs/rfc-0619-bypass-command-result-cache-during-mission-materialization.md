---
id: RFC-0619
title: "Bypass command-result cache during mission materialization"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: command
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
createdAt: 2026-07-31
updatedAt: 2026-07-31
enhancedAt: 2026-07-31
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0597
amendedBy: []
related:
  - DNA-47
  - RFC-0390
  - RFC-0597
  - RFC-0568
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
  - "mission.materialize succeeds on re-run without stale cache hits"
  - "All build.prepare.dev pipeline steps execute (no SKIP (cached)) during materialization"
nonGoals:
  - "Changing the RFC-0390 cache key structure for normal pipeline runs"
  - "Adding bordbuch.generate to the dev pipeline"
  - "Filtering generated files from data-path copy (covered by RFC-0620)"
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

# RFC-0619: Bypass command-result cache during mission materialization

## Context

RFC-0390 introduced a command-result cache for pipeline execution. The cache key includes the command name, site name, a hash of declared `reads` file contents, and a hash of the command module source. When the `reads` inputs are identical, the cache returns a stored `KernelExecutionReport` with `cached: true`, skipping actual command execution.

RFC-0597 optimized mission materialization to use the `build.prepare.dev` pipeline (a codegen-only subset) instead of the full `build.prepare` pipeline. However, RFC-0597 did not specify `force: true` when calling `executeKernelPipeline` during materialization.

When `mission.materialize` re-runs for the same site (e.g., after a failed first attempt), the command-result cache contains entries from the previous workpiece. The cache key is identical because: (1) the site name is the same, (2) the `reads` inputs (content files from the same cache clone) are identical, and (3) the module source is unchanged. The cache returns stale results that report successful file generation, but the files were written to the previous workpiece directory — not the new one.

## Problem

DNA-47 (Materialization) requires that a mission's Werkstück is materialized from the Sternsystem's pinned data bundle with runtime scaffolding generated from the pinned platform. The command-result cache (RFC-0390) violates this requirement during re-materialization because it returns cached execution reports from a previous workpiece without writing any files to the new workpiece.

Concrete failure mode observed during `warpgogol-com-m000023` materialization:

1. First `mission.materialize` attempt fails at `ownership.sync.validate` (unrelated bordbuch issue).
2. Second `mission.materialize` attempt creates a fresh workpiece from the cache clone.
3. `build.prepare.dev` pipeline runs — 21 of 42 steps return `SKIP (cached)` because the cache key matches the first attempt.
4. Generated files (e.g., `src/agent-surface.generated.yaml`, `src/freshness.generated.yaml`) are never written to the new workpiece.
5. Downstream commands that depend on these files (e.g., `agent.openapi.generate`) fail with "no Agent Surface Manifest found."
6. Materialization fails with a misleading error that points to a downstream symptom, not the root cause (stale cache).

The cache is fundamentally inapplicable during materialization because the workpiece directory is freshly created — it is not the same directory that produced the cached results.

## Decision

`mission.materialize` passes `force: true` to `executeKernelPipeline` when invoking `build.prepare.dev`, bypassing the command-result cache (RFC-0390) entirely. Every pipeline step executes against the fresh workpiece directory, guaranteeing that all generated files are physically written.

## Architectural fit

- **DNA-47 (Materialization):** This RFC protects the materialization invariant by ensuring that all generated scaffolding files are physically present in the workpiece after materialization, regardless of cache state from previous attempts.
- **RFC-0390 (Command-result cache):** This RFC does not modify the cache key structure or invalidation logic. It uses the existing `force` flag (RFC-0390 §Design: "The `--force` flag bypasses the cache for a full re-execution") for its intended purpose — bypassing the cache when the execution context (output directory) has changed.
- **RFC-0597 (Materialization optimization):** This RFC amends RFC-0597's materialization flow by adding `force: true` to the `executeKernelPipeline` call that RFC-0597 introduced. The pipeline choice (`build.prepare.dev`) and all other RFC-0597 optimizations remain unchanged.
- **RFC-0568 (Clone-based materialization):** The clone-based approach creates a fresh working tree from the cache clone's git history. The command-result cache is orthogonal to git history — it caches execution reports, not file contents. `force: true` ensures the pipeline writes to the fresh working tree.

## Design

### Change surface

No new CLI commands or flags. The change is a single-line addition to the `executeKernelPipeline` call inside `runMissionMaterialize`:

```ts
// packages/os/site-kernel-handoff/src/mission/mission-materialize.ts
const prepareResult = await executeKernelPipeline({
  workspaceRoot,
  pipelineName: "build.prepare.dev",
  siteName: manifest.systemId,
  outputFormat: "pretty",
  force: true, // RFC-0619: bypass stale cache from previous workpiece
});
```

### Why `force: true` is sufficient

The `executeKernelPipeline` function already supports `force: true` (RFC-0390). When `force` is true:

- `tryCacheRead` returns `null` for every command (line 201 of `execute-pipeline.ts`: `if (dryRun || force) return null;`)
- `tryCacheWrite` still stores fresh results (line 241: only skips on `dryRun`), so the cache is populated with valid entries for the new workpiece
- Subsequent non-materialize pipeline runs (e.g., `mission.validate`) benefit from the refreshed cache

`executeKernelCommand` (used for preflight steps and `compass.audit.baseline`) does not use the command-result cache — only `executeKernelPipeline` does. No additional bypass is needed for those call sites.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` | Add `force: true` to `executeKernelPipeline` call |
| `packages/os/site-kernel-handoff/src/tests/` | Regression test verifying `force: true` is passed during materialization |

### Failure modes

- **Cache unavailable (no better-sqlite3):** `force: true` has no effect — cache always misses, all commands execute normally. No change in behavior.
- **First materialization (no prior cache):** `force: true` has no effect — cache is empty, all commands execute normally. No change in behavior.
- **Re-materialization (stale cache present):** `force: true` bypasses stale entries, all commands execute and write files to the new workpiece. This is the fix.

## Rollout

- **Immediate effect:** All `mission.materialize` invocations bypass the command-result cache for the `build.prepare.dev` pipeline. No flag day, no migration path — the fix is transparent.
- **Existing missions:** Re-materialization of any existing mission automatically benefits from the fix.
- **New missions:** First materialization is unaffected (cache is empty for a new site). `force: true` is a no-op on an empty cache.
- **Pipeline integration:** No pipeline definition changes. The `force` flag is passed at the call site, not in the pipeline definition.
- **Cache warming:** After materialization with `force: true`, the cache is populated with fresh results from the new workpiece. Subsequent `mission.validate` or manual pipeline runs benefit from these cached results.

## Alternatives considered

1. **Include `site.directory` in the cache key (RFC-0390 amendment).** Rejected because the cache is designed for repeated runs against the same directory. Adding the directory path to the key would make every workpiece replacement a full cache miss, which is correct for materialization but would also reduce hit rates for normal pipeline runs where the directory changes between site resolutions (e.g., switching between mission workpiece and `apps/` directory). The `force` flag already provides a targeted bypass for the materialization case.

2. **Clear the `command_results` cache namespace before materialization.** Rejected because it is heavy-handed — it clears cache entries for all sites, not just the one being materialized. This would slow down concurrent pipeline runs for other sites. The `force` flag provides a per-invocation bypass without affecting other consumers.

3. **Make `executeKernelPipeline` detect workpiece replacement automatically.** Rejected because it would require the pipeline executor to understand materialization semantics (comparing directory paths, checking creation timestamps). This couples the cache layer to the mission lifecycle, violating separation of concerns. The caller (`mission.materialize`) knows when the directory is fresh and should explicitly request cache bypass.

## Risks

- **Performance impact:** `force: true` means all 42 `build.prepare.dev` steps execute on every materialization, adding ~5-10 seconds compared to a cached run. This is acceptable because materialization is an infrequent operation (once per mission) and correctness is more important than speed.
- **Agent confusion:** Agents may see `SKIP (cached)` disappear from materialization output and think the cache is broken. The `force: true` flag is documented in the code comment referencing this RFC. No AGENTS.md change is needed — the behavior is transparent to agents.
- **Regression risk:** If a future refactor removes `force: true` from the call site, the stale cache bug returns. Mitigation: a regression test verifies that `force: true` is passed during materialization.

## Acceptance criteria

- [ ] `executeKernelPipeline` call in `mission-materialize.ts` passes `force: true` (evidence: `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:879-885`)
- [ ] Re-running `mission.materialize` for the same mission produces a workpiece with all generated files present (evidence: `mission.materialize --mission <id> --json` returns `ok: true` on second run)
- [ ] No `SKIP (cached)` steps appear in the `build.prepare.dev` pipeline output during materialization (evidence: pipeline output shows all 42 steps as `OK` or `FAIL`, never `SKIP (cached)`)
- [ ] Regression test verifies `force: true` is passed to `executeKernelPipeline` during materialization (evidence: test in `packages/os/site-kernel-handoff/src/tests/`)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT remove `force: true` from the `executeKernelPipeline` call in `mission-materialize.ts` without a new RFC that supersedes this one.
- The hotfix already applied to `mission-materialize.ts` (adding `force: true`) satisfies this RFC's core requirement. Implementation work is limited to adding the regression test and verifying the acceptance criteria.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
