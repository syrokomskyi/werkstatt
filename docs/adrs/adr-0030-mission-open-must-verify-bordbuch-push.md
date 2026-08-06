---
id: ADR-0030
title: "mission.open must verify commitAndPushBordbuch succeeded"
status: implemented
scope: package
decider: architecture
createdAt: 2026-08-06
updatedAt: 2026-08-06
implementedAt: 2026-08-06
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0477
  - RFC-0583
  - RFC-0593
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0030: mission.open must verify commitAndPushBordbuch succeeded

## Context

`commitAndPushBordbuch` in `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts:326` is non-throwing: it returns `{ commitSha, pushed, error }` on failure. `mission.open` (line 183) calls it but **does not check the result**. If the git push silently fails, the `mission-open` bordbuch entry exists only in the cache clone's working tree but never reaches the bare repo.

When a subsequent `mission.materialize` runs `syncCacheClone` → `git reset --hard origin/${branch}`, the unpushed commit is erased. The bordbuch now has a `mission-close` event (from `mission.close`, which does verify bordbuch integrity via RFC-0658) without a matching `mission-open` — an orphan-mission-close violation.

This was discovered during mission m000034 for `warpgogol-com`: m000033's `mission-open` event was missing from the bordbuch, requiring `bordbuch.repair` to insert a synthetic `mission-open` before m000034 could be opened.

## Decision

`mission.open` MUST check the return value of `commitAndPushBordbuch` and throw if `pushed === false`.

- If `commitSha` is null (commit failed), throw with a descriptive error including the system ID.
- If `commitSha` is non-null but `pushed === false` (push failed), throw with the error string from the result.
- The error message must instruct the operator to check git remote connectivity and re-run `mission.open`.

## Justification

`mission.close` already validates bordbuch integrity before appending its event (RFC-0658). `mission.open` has a pre-flight bordbuch validation gate (RFC-0593). But neither guard prevents the silent push failure that creates the orphan in the first place.

Alternatives considered:

- **Make `commitAndPushBordbuch` throwing:** Rejected — it's also called from `mission.close` and `mission.abort` where a push failure should not block the close (the bordbuch entry is already appended; the push can be retried via `mission.reconcile`).
- **Add a post-open bordbuch.validate:** Redundant — the pre-flight gate (RFC-0593) already validates before the open event is appended. The problem is not validation; it's persistence.

## Consequences

- Positive: Eliminates the orphan-mission-close class of bordbuch violations caused by silent push failures during `mission.open`.
- Positive: Fails fast — the operator knows immediately that the open did not persist, rather than discovering it hours later during the next materialization.
- Negative: `mission.open` becomes stricter — a transient network issue will block mission opening. This is acceptable: a mission that isn't persisted to the bare repo is not a real mission.
- Technical debt: `mission.close` and `mission.abort` still silently tolerate push failures. A future ADR may address those if orphan patterns emerge there too.

## Evolution

If `commitAndPushBordbuch` is refactored to be throwing by default, this ADR's implementation becomes a no-op and can be superseded. Monitor for push failure patterns in `mission.close` — if orphans appear from close-side push failures, extend the same guard there.
