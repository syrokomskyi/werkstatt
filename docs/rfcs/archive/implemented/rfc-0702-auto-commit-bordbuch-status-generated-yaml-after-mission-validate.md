---
id: RFC-0702
title: "Make bordbuch.commit resilient and cover distribution reuse path in mission.validate"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-05
updatedAt: 2026-08-05
enhancedAt: 2026-08-05
implementedAt: 2026-08-05
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0724
related:
  - RFC-0477
  - RFC-0584
  - RFC-0597
  - RFC-0626
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
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
    - bordbuch.commit
    - mission.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals: []
nonGoals:
  - "Adding push to bordbuch.commit — bordbuch.commit commits locally only; push is handled by sternsystem.sync and commitAndPushBordbuch in mission lifecycle commands. Push is out of scope for this RFC."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0702: Make bordbuch.commit resilient and cover distribution reuse path in mission.validate

## Context

`mission.validate` runs `build.prepare` which includes `bordbuch.generate` (step 125) and `bordbuch.commit` (step 129, added by RFC-0626). `bordbuch.commit` calls `commitBordbuchProjections` in `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts`, which stages and commits `bordbuch/status.generated.yaml`, `public/.well-known/bordbuch.json`, and `public/.well-known/bordbuch/index.html` to the cache clone using `gitExecWithRetry` with `[12_000, 60_000]` backoff (RFC-0646).

Two gaps remain:

1. **`commitBordbuchProjections` throws on git failure.** If `gitExecWithRetry` for `add` or `commit` exhausts retries (e.g. persistent git lock conflict), the function throws. The pipeline step `bordbuch.commit` fails, which causes `build.prepare` to report a failure, which causes `mission.validate` to fail entirely — even though the bordbuch commit is a non-critical side effect.

2. **Distribution reuse path skips `build.prepare` entirely.** When `build-input-hash` matches (`mission-materialization-commands.ts:214-297`), `mission.validate` skips `build.prepare` and copies `dist/` from the distribution directory. Neither `bordbuch.generate` nor `bordbuch.commit` runs. If a previous run left the cache clone dirty (e.g. `bordbuch.commit` failed), the dirty state persists. The existing dirty cache clone warning at lines 557-565 fires, but no cleanup is attempted.

## Problem

### Gap 1: bordbuch.commit failure crashes mission.validate

`commitBordbuchProjections` (`bordbuch-commit.ts:46-89`) wraps `resolveCachePath` in try/catch but does NOT wrap the `gitExecWithRetry` calls for `status --porcelain`, `add`, `commit`, and `rev-parse`. If any of these throw after retry exhaustion, the exception propagates through `runBordbuchCommit` (no try/catch) into the pipeline executor, marking `bordbuch.commit` as failed. Since `bordbuch.commit` is a step in `build.prepare`, `mission.validate` sees `prepareReport.ok === false` and returns `exitCode: 1` — even if all validation checks would have passed.

The bordbuch commit is a non-critical side effect: `status.generated.yaml` is a projection file that can be regenerated. It should not block validation.

### Gap 2: distribution reuse path has no bordbuch cleanup

When `mission.validate` reuses a distribution (lines 214-297), `build.prepare` is skipped. If a previous `mission.validate` run left the cache clone dirty (e.g. `bordbuch.commit` failed), the dirty state persists through the reuse path. The dirty cache clone warning at lines 557-565 fires, but no cleanup is attempted. The next `mission.reconcile` then encounters a dirty cache clone, which can trigger bordbuch conflict auto-resolution (RFC-0584) or block reconciliation.

## Decision

### Fix 1: Make `commitBordbuchProjections` resilient

Wrap the `gitExecWithRetry` calls for `add`, `commit`, and `rev-parse` in `commitBordbuchProjections` (`bordbuch-commit.ts`) in a try/catch. On failure, return `{ committed: false, commitSha: null, systemId, filesCommitted: [], error: <message> }` instead of throwing. Add an `error?: string` field to `BordbuchCommitResult`.

In `runBordbuchCommit` (the kernel handler), log `logger.warn` when `result.committed === false && result.error` — distinguishing git failures from the no-dirty-files case.

### Fix 2: Call `commitBordbuchProjections` in the distribution reuse path

In `mission.validate` (`mission-materialization-commands.ts`), after the distribution reuse check succeeds (around line 297, before the `return` at line 291), call `commitBordbuchProjections(workspaceRoot, manifest.systemId)` to clean up any dirty bordbuch files from a previous run. Wrap in try/catch with `logger.warn` on failure.

```ts
// In mission-materialization-commands.ts, inside the distribution reuse path
// (canReuse && storedHash), before the return at line 291:
try {
  const bordbuchResult = await commitBordbuchProjections(workspaceRoot, manifest.systemId);
  if (bordbuchResult.committed) {
    logger.info(`  Bordbuch cleanup: committed ${bordbuchResult.filesCommitted.length} file(s) from previous run`);
  }
} catch (err) {
  logger.warn(`  Bordbuch cleanup failed (non-fatal) — ${(err as Error).message}`);
}
```

### No push

`bordbuch.commit` commits locally only. Push is handled by `sternsystem.sync` and `commitAndPushBordbuch` in mission lifecycle commands (`mission.open`, `mission.close`, `mission.abort`). Adding push to `bordbuch.commit` is out of scope — see `nonGoals`.

## Architectural fit

- **RFC-0626**: this RFC fixes a resilience bug in the command introduced by RFC-0626 and extends its coverage to the reuse path. `bordbuch.commit` remains a pipeline step in `build.prepare`.
- **RFC-0477**: aligns with the AGENTS.md rule that bordbuch projections must be committed to keep the cache clone clean.
- **RFC-0584**: reduces bordbuch conflict auto-resolution triggers by cleaning the cache clone in the reuse path.
- **RFC-0597**: `mission.close` commits `.materialization-state.json` after writing it. This RFC applies the same "commit side effects" pattern to the reuse path in `mission.validate`.
- **RFC-0646**: `commitBordbuchProjections` already uses `gitExecWithRetry` with `[12_000, 60_000]` backoff. This RFC adds a try/catch around those calls — it does NOT change the retry configuration.

## Design

### CLI surface

No CLI surface changes. The command flags remain the same:

```sh
pnpm exec werkstatt run mission.validate --mission <missionId>
```

### TypeScript contracts

`BordbuchCommitResult` gains an optional `error` field:

```ts
// In bordbuch-commit.ts
export interface BordbuchCommitResult {
  committed: boolean;
  commitSha: string | null;
  systemId: string;
  filesCommitted: string[];
  error?: string; // NEW: present when committed === false due to git failure
}
```

`commitBordbuchProjections` wraps git operations in try/catch:

```ts
// In bordbuch-commit.ts, commitBordbuchProjections:
// After determining bordbuchDirty.length > 0:
try {
  const addArgs = bordbuchDirty.map((f) => `"${f}"`).join(" ");
  await gitExecWithRetry(cachePath, `add -- ${addArgs}`, BORDBUCH_RETRY_OPTIONS);
  await gitExecWithRetry(
    cachePath,
    'commit -m "chore: bordbuch projections from build.prepare"',
    BORDBUCH_RETRY_OPTIONS,
  );
  const sha = await gitExecWithRetry(cachePath, "rev-parse HEAD", BORDBUCH_RETRY_OPTIONS);
  return { committed: true, commitSha: sha, systemId, filesCommitted: bordbuchDirty };
} catch (err) {
  return {
    committed: false,
    commitSha: null,
    systemId,
    filesCommitted: [],
    error: err instanceof Error ? err.message : String(err),
  };
}
```

`runBordbuchCommit` logs a warning on git failure:

```ts
// In bordbuch-commit.ts, runBordbuchCommit:
if (!result.committed && result.error) {
  logger.warn(`[bordbuch.commit] git operation failed for ${systemId}: ${result.error}`);
}
```

`mission.validate` calls `commitBordbuchProjections` in the reuse path:

```ts
// In mission-materialization-commands.ts, inside the canReuse block, before return:
try {
  const bordbuchResult = await commitBordbuchProjections(workspaceRoot, manifest.systemId);
  if (bordbuchResult.committed) {
    logger.info(`  Bordbuch cleanup: committed ${bordbuchResult.filesCommitted.length} file(s) from previous run`);
  }
} catch {
  // Non-fatal — reuse path continues regardless
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| Cache clone `bordbuch/status.generated.yaml` | Generated by `bordbuch.generate`, committed by `bordbuch.commit` (pipeline step) and by `commitBordbuchProjections` (reuse path cleanup) |
| Cache clone `bordbuch/events.ndjson` | Not touched by `commitBordbuchProjections` — only bordbuch projection files are committed |
| Cache clone `public/.well-known/bordbuch.json` | Bordbuch projection, committed by `commitBordbuchProjections` |
| Cache clone `public/.well-known/bordbuch/index.html` | Bordbuch projection, committed by `commitBordbuchProjections` |

### Output format

No output format changes. The `--json` output of `mission.validate` remains the same. The `bordbuch.commit` pipeline step result is already visible in the `build.prepare` step report. No new fields are added to `MissionValidateData`.

### Failure modes

- `commitBordbuchProjections` git add/commit fails (retry exhausted): **non-fatal** — `committed: false`, `error` set, `logger.warn` emitted. Pipeline step `bordbuch.commit` returns ok (exitCode 0) instead of throwing. `build.prepare` continues. `mission.validate` continues.
- `commitBordbuchProjections` in reuse path fails: **non-fatal** — `logger.warn` emitted, reuse path continues, `mission.validate` returns success.
- `commitBordbuchProjections` finds no dirty bordbuch files: existing behavior — `committed: false`, no `error`, no warning. This is the normal case when `bordbuch.commit` already cleaned up during `build.prepare`.
- Validation itself fails: existing behavior (exit 1 with violations). Bordbuch commit resilience does not affect validation results.

## Rollout

- **Default behavior**: `bordbuch.commit` is resilient by default — no opt-in flag needed. The reuse path cleanup is also default.
- **Existing apps**: no changes needed. The behavior change is backward-compatible — the only observable difference is that `bordbuch.commit` no longer crashes `mission.validate` on git failure, and the reuse path cleans up stale dirty state.
- **No migration path needed**: the change is a bug fix to existing logic, not a new feature.
- **Pipeline integration**: `bordbuch.commit` remains a pipeline step in `build.prepare`. The reuse path cleanup is a direct call in `mission.validate`.

## Alternatives considered

- **Add a separate `commitAndPushBordbuch` call after `build.prepare` in `mission.validate`**: rejected — `bordbuch.commit` already runs inside `build.prepare` and commits the same files. A separate call would produce redundant commits and use `gitExec` (without retry), which is less resilient than `gitExecWithRetry` used by `bordbuch.commit`.
- **Move bordbuch cleanup to `mission.reconcile`**: rejected — the dirty cache clone warning fires during `mission.validate`, and operators expect `mission.validate` to leave a clean state. Deferring cleanup to `mission.reconcile` adds an unnecessary failure surface.
- **Suppress the dirty-cache warning instead of cleaning up**: rejected — the warning exists because the dirty state is a real problem for `mission.reconcile`. Suppressing the warning hides the issue without fixing it.
- **Make `bordbuch.commit` push in addition to committing**: rejected — push is handled by `sternsystem.sync` and `commitAndPushBordbuch` in mission lifecycle commands. Adding push to a `build.prepare` pipeline step would couple build validation to network operations, increasing failure surface. See `nonGoals`.

## Risks

- **Silent git failures**: making `bordbuch.commit` non-throwing means git failures are logged as warnings but do not block the pipeline. If the operator ignores warnings, the cache clone stays dirty. Mitigation: the existing dirty cache clone warning at lines 557-565 still fires, providing a second signal.
- **Concurrent execution**: if two `mission.validate` runs execute concurrently for the same system, both could trigger `commitBordbuchProjections` in the reuse path, causing git lock conflicts. Mitigation: `gitExecWithRetry` has `[12_000, 60_000]` backoff. The try/catch ensures the loser does not crash.
- **Stale dirty state from failed previous run**: the reuse path cleanup handles this — `commitBordbuchProjections` checks `git status --porcelain` and commits any dirty bordbuch files regardless of when they were modified.

## Acceptance criteria

- [x] `commitBordbuchProjections` wraps all `gitExecWithRetry` calls (`status --porcelain`, `add`, `commit`, `rev-parse`) in try/catch — (evidence: `bordbuch-commit.ts:59-100`, `bordbuch-commit.test.ts:179-223`)
- [x] `BordbuchCommitResult` has an optional `error?: string` field for git failure cases — (evidence: `bordbuch-commit.ts:40`, `bordbuch-commit.test.ts:186`)
- [x] `runBordbuchCommit` logs `logger.warn` when `committed === false && error` is set — (evidence: `bordbuch-commit.ts:128-134`, `bordbuch-commit.test.ts:276-301`)
- [x] `bordbuch.commit` pipeline step returns exitCode 0 (not throw) when git operations fail after retry exhaustion — (evidence: `bordbuch-commit.ts:92-100` returns error result, `runBordbuchCommit` returns summary without throwing, `bordbuch-commit.test.ts:219-223`)
- [x] `mission.validate` distribution reuse path calls `commitBordbuchProjections` before returning success — (evidence: `mission-materialization-commands.ts:290-302`, `mission-validate-distribution-reuse.test.ts:329-339`)
- [x] Reuse path cleanup is non-fatal (try/catch with `logger.warn`) — (evidence: `mission-materialization-commands.ts:293-302` try/catch block, `mission-validate-distribution-reuse.test.ts:382-393`)
- [x] Cache clone is clean after `mission.validate` completes successfully via the reuse path (when dirty state was from bordbuch files) — (evidence: `commitBordbuchProjections` commits dirty bordbuch files, `mission-validate-distribution-reuse.test.ts:341-379` verifies cleanup log)
- [x] Unit test covers `commitBordbuchProjections` try/catch path (git failure returns error instead of throwing) — (evidence: `bordbuch-commit.test.ts:179-223`, 5 tests covering status/add/commit/rev-parse + does-not-throw)
- [x] Unit test covers reuse path cleanup call in `mission.validate` — (evidence: `mission-validate-distribution-reuse.test.ts:329-393`, 3 tests covering call, log, and throw-resilience)
- [x] `rfc.validate` passes on this file before merging — (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0702` exit 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT make the bordbuch commit failure fatal to `mission.validate` — validation results must always be returned regardless of commit success.
- Agents MUST NOT change the `gitExecWithRetry` backoff configuration (`[12_000, 60_000]`) — that is owned by RFC-0646.
- Agents MUST NOT add push to `bordbuch.commit` — push is out of scope (see `nonGoals`).
- Agents MUST NOT call `commitAndPushBordbuch` from `mission.validate` — that function commits `events.ndjson` (not modified by `mission.validate`) and uses `gitExec` without retry. Use `commitBordbuchProjections` instead.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0702 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
