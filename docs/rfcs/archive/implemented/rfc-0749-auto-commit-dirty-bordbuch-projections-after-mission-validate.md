---
id: RFC-0749
title: "Auto-commit dirty bordbuch projections in cache clone after mission.validate"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:syrokomskyi
createdAt: 2026-08-08
updatedAt: 2026-08-08
implementedAt: 2026-08-08
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0702
  - RFC-0626
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - mission.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - site-kernel-handoff
successSignals:
  - "mission.validate does not leave dirty bordbuch files in cache clone after successful validation"
  - "mission.reconcile succeeds after mission.validate without manual cache clone cleanup"
nonGoals:
  - "Does not commit non-bordbuch files in the cache clone — only bordbuch projection paths"
  - "Does not change bordbuch.commit command behavior — the pipeline step remains as-is"
  - "Does not remove the RFC-0522 dirty cache clone warning — the warning stays as a diagnostic"
---

# RFC-0749: Auto-commit dirty bordbuch projections in cache clone after mission.validate

## Context

RFC-0702 made `commitBordbuchProjections` non-throwing and added a cleanup call in the distribution reuse path of `mission.validate`. RFC-0724 added a pre-validate auto-commit call at the start of `mission.validate` (`mission-materialization-commands.ts:214-227`).

However, `bordbuch.commit` runs as a pipeline step inside `build.prepare`, and `build.prepare` runs during the full validation path. The `bordbuch.commit` step commits bordbuch projections in the cache clone, but if it fails (non-throwing, returns error), the cache clone stays dirty. After validation completes, there is no post-validation cleanup call — the RFC-0522 warning at `mission-materialization-commands.ts:579-588` fires, and `mission.reconcile` fails.

## Problem

When `bordbuch.commit` fails silently (non-throwing per RFC-0702), dirty bordbuch projection files remain in the cache clone. The operator sees a warning from `mission.validate` but must manually `cd` into the cache clone and commit the files. If they don't, `mission.reconcile` fails.

The pre-validate auto-commit (RFC-0724) handles dirty files from a _previous_ run, but it doesn't help when `bordbuch.commit` fails _during_ the current run's `build.prepare`.

## Decision

Add a post-validation `commitBordbuchProjections` cleanup call at the end of `mission.validate`, after the pipeline and build complete, before the dirty cache clone warning check. This ensures any bordbuch projections that were regenerated during `build.prepare` but not committed (due to transient git failure in `bordbuch.commit`) are cleaned up before the warning fires.

## Architectural fit

- Extends RFC-0702's non-throwing pattern — the cleanup call is also non-fatal
- Extends RFC-0724's pre-validate cleanup with a post-validate cleanup — both are needed
- The RFC-0522 warning remains as a diagnostic for non-bordbuch dirty files
- Aligns with the AGENTS.md rule: "commitBordbuchProjections is non-throwing (RFC-0702)"

## Design

### CLI surface

No CLI change — this is an internal behavior change in `mission.validate`.

### TypeScript contracts

```ts
// No new types — uses existing commitBordbuchProjections function
// from bordbuch/bordbuch-commit.ts
```

### File system responsibilities

| Path                                                 | Role               |
| ---------------------------------------------------- | ------------------ |
| Cache clone `bordbuch/status.generated.yaml`         | Committed if dirty |
| Cache clone `public/.well-known/bordbuch.json`       | Committed if dirty |
| Cache clone `public/.well-known/bordbuch/index.html` | Committed if dirty |

### Output format

No change to output format. A `logger.info` line is emitted if the post-validate cleanup commits files, matching the pre-validate pattern.

### Failure modes

- If the post-validate cleanup fails, `logger.warn` is emitted (non-fatal, same as pre-validate)
- The RFC-0522 dirty cache clone warning still fires for non-bordbuch dirty files
- `mission.validate` does not fail due to cleanup failure

## Rollout

- Default behavior: the post-validate cleanup runs automatically on every `mission.validate` call
- No migration needed — the cleanup is additive
- Existing sites benefit immediately — no more manual cache clone cleanup after `bordbuch.commit` transient failures

## Alternatives considered

1. **Make `bordbuch.commit` retry more aggressively**: Rejected — it already uses `gitExecWithRetry` with 12s/60s backoff. More retries would slow down `build.prepare` for no benefit.
2. **Make `bordbuch.commit` throwing again**: Rejected — RFC-0702 explicitly made it non-throwing to prevent `build.prepare` crashes. Reversing that would regress.
3. **Remove the RFC-0522 warning**: Rejected — the warning is still useful for non-bordbuch dirty files (e.g. content source edits in cache clone).
4. **Add cleanup to `mission.reconcile` instead**: Rejected — reconcile runs after validate, but the operator may want to inspect the cache clone between validate and reconcile. Cleaning up at the end of validate is earlier and prevents the warning from firing in the first place.

## Risks

- **Masking bordbuch.commit failures**: If `bordbuch.commit` consistently fails, the post-validate cleanup masks the problem. Mitigated by the `logger.warn` from `bordbuch.commit` itself (RFC-0702) and the `logger.info` from the cleanup — both are visible in the output.
- **Cache clone HEAD changes**: Committing changes the cache clone HEAD. This is already the case with the pre-validate cleanup (RFC-0724) and `bordbuch.commit` itself. The cache key depends on `cacheCloneHead`, so this is expected behavior — the next materialization will detect the change and re-materialize if needed.

## Acceptance criteria

- [x] Post-validation `commitBordbuchProjections` call added to `mission.validate` after pipeline/build completion (evidence: `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:579-597`)
- [x] Cleanup call is non-fatal (try/catch with `logger.warn`) (evidence: `mission-materialization-commands.ts:583-596` — try/catch block with logger.warn in catch)
- [x] `logger.info` emitted when post-validate cleanup commits files (evidence: `mission-materialization-commands.ts:588-591`)
- [x] RFC-0522 dirty cache clone warning still fires for non-bordbuch dirty files (evidence: `mission-materialization-commands.ts:599-608` — warning check remains after cleanup)
- [x] `rfc.validate` passes on this file (evidence: `rfc.validate --id RFC-0749` returns OK)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST NOT remove the RFC-0522 warning — it still serves non-bordbuch dirty files.
- Agents MUST NOT make the post-validate cleanup throwing — it must be non-fatal like the pre-validate cleanup.
