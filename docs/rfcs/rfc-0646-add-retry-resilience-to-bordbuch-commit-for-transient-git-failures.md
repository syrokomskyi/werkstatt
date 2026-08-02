---
id: RFC-0646
title: "Add retry resilience to bordbuch.commit for transient git failures"
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
createdAt: 2026-08-02
updatedAt: 2026-08-02
enhancedAt: 2026-08-02
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0626
  - RFC-0580
  - RFC-0477
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-51
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
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "bordbuch.commit retries transient git failures (lock contention, timeout) up to 2 times with 12s and 60s backoff before failing the pipeline step."
  - "gitExecWithRetry helper is available in git-exec.ts and reused by bordbuch.commit for git add and git commit operations."
  - "mission.validate, mission.close, and release.prepare complete without bordbuch.commit failing on transient git lock contention."
nonGoals:
  - "Do not make bordbuch.commit non-fatal — if retries are exhausted, the pipeline step still fails (dirty bordbuch files block reconcile)."
  - "Do not change bordbuch.generate behavior — it remains a single-responsibility writeFileIfChanged command."
  - "Do not add retry to gitExec calls in other modules — only bordbuch.commit uses gitExecWithRetry initially. Other modules may adopt it incrementally."
  - "Do not change the bordbuch projection file paths or the commit message format."
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

# RFC-0646: Add retry resilience to bordbuch.commit for transient git failures

## Context

Mission `warpgogol-com-m000024` (closed 2026-08-02) encountered a `bordbuch.commit` pipeline step failure during `mission.validate`. The `bordbuch.commit` command (RFC-0626) auto-commits dirty bordbuch projection files (`bordbuch.json`, `bordbuch/index.html`, `status.generated.yaml`) in the cache clone after `bordbuch.generate` writes them via `writeFileIfChanged`. The step failed with exit code 1, leaving the cache clone dirty and blocking the mission validation pipeline. The operator had to manually `git add` and `git commit` the bordbuch projection files in the cache clone before re-running `mission.validate`.

RFC-0626 added `bordbuch.commit` to the `build.prepare` pipeline to eliminate exactly this class of friction. However, RFC-0626 did not address transient git failures (lock contention, timeout, concurrent git processes). The `gitExec` helper in `packages/os/site-kernel-handoff/src/werkstatt/git-exec.ts` has a 30-second timeout and throws on any non-zero exit code (unless `allowNonZero` is set). The `bordbuch.commit` handler calls `gitExec` without `allowNonZero` for `git add` and `git commit`, so any transient failure propagates as an unhandled exception that fails the pipeline step.

## Problem

`bordbuch.commit` (`packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts:70-73`) calls `gitExec` for `git add` and `git commit` without retry logic or `allowNonZero`. The `gitExec` helper (`packages/os/site-kernel-handoff/src/werkstatt/git-exec.ts:15-33`) has a 30-second timeout and throws on non-zero exit. Transient git failures — lock file contention from concurrent processes, I/O timeouts on large repos, or momentary filesystem unavailability — cause `bordbuch.commit` to fail, leaving bordbuch projection files dirty in the cache clone.

This creates recurring friction during mission completion: `mission.validate`, `mission.close`, and `release.prepare` all run `build.prepare`, which includes `bordbuch.commit`. A single transient git failure blocks the entire mission workflow until the operator manually commits in the cache clone.

The gap: RFC-0626 established the auto-commit pattern but did not add resilience against transient git failures. The `gitExec` primitive has no retry capability, and `bordbuch.commit` has no error handling.

## Decision

The `gitExec` helper in `packages/os/site-kernel-handoff/src/werkstatt/git-exec.ts` gains a `gitExecWithRetry` companion function that retries transient git failures with configurable backoff. The `bordbuch.commit` command handler uses `gitExecWithRetry` for all git operations (`git status`, `git add`, `git commit`, `git rev-parse HEAD`) with 2 retries at 12s and 60s intervals. If all retries are exhausted, the pipeline step fails as before — the failure is not silenced.

## Architectural fit

- **DNA-51 (Werkstatt consistency primitives)** — Extends the consistency primitive family with retry resilience. DNA-51 defines lock, idempotency, and atomic staging as the existing primitives; retry complements these by recovering from transient git failures that locks cannot prevent (concurrent process conflicts) and that atomic staging cannot absorb (lock file contention). Together, lock-based mutual exclusion + atomic staging + retry form a more complete consistency guarantee for werkstatt git operations.
- **RFC-0626 (bordbuch.commit)** — This RFC amends the `bordbuch.commit` command handler to use `gitExecWithRetry` instead of bare `gitExec` for mutation operations. The command's contract (auto-commit dirty bordbuch projection files) is unchanged.
- **RFC-0580 (auto-commit werkstatt side-effects)** — The `gitExecWithRetry` helper is available for reuse by `commitWerkstattSideEffects` and other git-based auto-commit patterns if needed in the future.
- **Site OS operator model** — `bordbuch.commit` remains an internal pipeline step, not a direct operator command. The retry behavior is transparent to the operator — they only see the final success or failure after retries are exhausted.

## Design

### CLI surface

No new CLI commands. The change is internal to the existing `bordbuch.commit` pipeline step and the `gitExec` helper. No operator-facing flags change.

### TypeScript contracts

```ts
// packages/os/site-kernel-handoff/src/werkstatt/git-exec.ts

interface RetryOptions {
  backoffMs: number[];
}

/**
 * Retries gitExec on transient failures (non-zero exit, timeout).
 * The number of retries is derived from backoffMs.length.
 * Throws the last error if all retries are exhausted.
 */
export function gitExecWithRetry(
  cwd: string,
  args: string,
  retryOptions: RetryOptions,
  options?: { allowNonZero?: boolean },
): string;

// packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts

const BORDBUCH_RETRY_OPTIONS: RetryOptions = {
  backoffMs: [12_000, 60_000],
};
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/werkstatt/git-exec.ts` | `gitExecWithRetry` helper added |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts` | All `gitExec` calls replaced with `gitExecWithRetry` (status, add, commit, rev-parse) |

### Output format

No change to `bordbuch.commit` output format. The `BordbuchCommitResult` interface remains:

```json
{
  "committed": true,
  "commitSha": "abc123def456",
  "systemId": "warpgogol-com",
  "filesCommitted": [
    "bordbuch/status.generated.yaml",
    "public/.well-known/bordbuch.json",
    "public/.well-known/bordbuch/index.html"
  ]
}
```

On retry, the command handler logs each retry attempt via `logger.warn` before the final result.

### Retry scope

All `gitExec` calls in `commitBordbuchProjections` are replaced with `gitExecWithRetry`:

1. `git status --porcelain` — retried to avoid silent-skip when `allowNonZero` masks a transient failure. Without retry, a transient `git status` failure returns empty string, causing the function to silently return `committed: false` and leaving dirty bordbuch files uncommitted.
2. `git add <paths>` — retried to handle transient lock contention during staging.
3. `git commit -m "..."` — retried to handle transient lock contention during commit.
4. `git rev-parse HEAD` — retried to handle transient failure after a successful commit. Without retry, a transient `rev-parse` failure would throw, causing the pipeline step to fail even though the commit already succeeded. On pipeline retry, `git status` would show no dirty files, causing the function to return `committed: false` — the commit succeeded but the result reports no commit.

### Failure modes

| Failure | Behavior |
| --- | --- |
| Transient git failure (lock, timeout) on 1st attempt | Wait 12s, retry |
| Transient git failure on 2nd attempt | Wait 60s, retry |
| Transient git failure on 3rd attempt (retries exhausted) | `gitExecWithRetry` throws, pipeline step fails with exit code 1 |
| Non-transient git failure (missing repo, permissions) | `gitExecWithRetry` throws immediately (no retry for non-transient errors) |
| No dirty bordbuch files | Returns `{ committed: false }` — no change |

The retry logic distinguishes transient from non-transient failures by inspecting the error: timeouts and lock-file errors are retried; missing-repo and permission errors are not. The number of retries is derived from `backoffMs.length` — no separate `retries` field is needed.

## Rollout

- **Default behavior**: `bordbuch.commit` uses `gitExecWithRetry` with 2 retries (12s, 60s backoff) from the first release. No opt-in flag.
- **Existing apps**: No migration needed — the retry behavior is transparent. Apps that previously encountered transient `bordbuch.commit` failures will now self-heal.
- **New apps**: Automatically benefit from retry resilience.
- **Pipeline integration**: No pipeline changes — `bordbuch.commit` remains at its current position in `build.prepare` after `bordbuch.generate`.
- **Unit tests**: Add tests for `gitExecWithRetry` (retry on transient, no retry on non-transient, backoff timing, exhaustion throws) and update `bordbuch-commit.test.ts` to verify retry behavior.
- **AGENTS.md**: Update `packages/os/site-kernel-handoff/AGENTS.md` Bordbuch section to note that `bordbuch.commit` retries transient git failures with 2 retries at 12s/60s backoff before failing the pipeline step.

## Alternatives considered

- **Non-fatal warning instead of retry**: Make `bordbuch.commit` log a warning and continue the pipeline on failure. Rejected because dirty bordbuch files block `mission.reconcile` — silencing the failure delays the problem, it does not solve it.
- **Retry + non-fatal fallback**: Retry first, then warn if retries exhausted. Rejected by the operator — the pipeline should fail if retries are exhausted, forcing the operator to investigate the root cause.
- **Increase `gitExec` timeout**: Increase the 30-second timeout to 120 seconds. Rejected because timeout is not the only transient failure mode — lock contention and concurrent process conflicts also cause failures. Retry addresses all transient modes, not just timeout.
- **Use `git --no-optional-locks`**: Avoid lock contention by using `--no-optional-locks` flag. Rejected because it only addresses lock contention, not timeouts or other transient failures. Can be used in combination with retry but does not replace it.

## Risks

- **Pipeline latency**: 2 retries with 12s + 60s backoff adds up to 72s of wait time in the worst case. This is acceptable because transient failures are rare and the alternative (manual operator intervention) takes longer.
- **Retry storms**: If multiple pipeline steps fail simultaneously, retries could compound. However, `bordbuch.commit` is the only step using `gitExecWithRetry` initially, so this risk is minimal.
- **False positive retry**: Non-transient errors misclassified as transient could waste retry attempts. The error classification logic must be conservative — only retry on timeout and lock-file errors.
- **Agent misinterpretation**: Agents might apply `gitExecWithRetry` to all `gitExec` calls. The RFC explicitly scopes initial adoption to `bordbuch.commit` only; other modules may adopt incrementally.

## Acceptance criteria

- [x] `gitExecWithRetry` helper implemented in `packages/os/site-kernel-handoff/src/werkstatt/git-exec.ts` with `RetryOptions` interface (evidence: `packages/os/site-kernel-handoff/src/werkstatt/git-exec.ts:37-80`)
- [x] `gitExecWithRetry` retries only on transient errors (timeout, lock-file) and throws immediately on non-transient errors (evidence: `packages/os/site-kernel-handoff/src/werkstatt/git-exec.ts:41-54` `isTransientError`, `packages/os/site-kernel-handoff/src/tests/git-exec-retry.test.ts:68-76` non-transient test)
- [x] `bordbuch.commit` uses `gitExecWithRetry` for all `gitExec` calls (status, add, commit, rev-parse) with 2 retries at 12s/60s backoff (evidence: `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts:57,76,78,80`, `packages/os/site-kernel-handoff/src/tests/bordbuch-commit.test.ts:145-153` all-operations test)
- [x] Unit tests for `gitExecWithRetry` cover: retry on transient, no retry on non-transient, backoff timing, exhaustion throws (evidence: `packages/os/site-kernel-handoff/src/tests/git-exec-retry.test.ts` 7 tests, `pnpm --filter @warpgogol/site-kernel-handoff exec vitest run src/tests/git-exec-retry.test.ts` passes)
- [x] `bordbuch-commit.test.ts` updated to verify retry behavior (evidence: `packages/os/site-kernel-handoff/src/tests/bordbuch-commit.test.ts:46-51` `gitExecWithRetry` mock, `packages/os/site-kernel-handoff/src/tests/bordbuch-commit.test.ts:145-153` all-operations test)
- [x] `mission.validate` completes without `bordbuch.commit` failing on transient git lock contention (evidence: `bordbuch.commit` now retries transient failures via `gitExecWithRetry` before throwing; `pnpm --filter @warpgogol/site-kernel-handoff exec vitest run` 499 tests pass)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec site-kernel run rfc.validate --id RFC-0646 --json` exits 0, 2026-08-02)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT apply `gitExecWithRetry` to `gitExec` calls in other modules without explicit justification — initial adoption is scoped to `bordbuch.commit` only.
- Agents MUST classify transient errors conservatively: only timeout and lock-file errors (`ENOENT` on `.git/index.lock`, `ETIMEDOUT`, exit code 128 with lock message) are retried. All other errors throw immediately.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
