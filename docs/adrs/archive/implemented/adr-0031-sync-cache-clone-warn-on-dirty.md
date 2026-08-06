---
id: ADR-0031
title: "syncCacheClone must warn on uncommitted changes before hard reset"
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
  - ADR-0030
  - RFC-0477
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0031: syncCacheClone must warn on uncommitted changes before hard reset

## Context

`syncCacheClone` in `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` performs `git reset --hard origin/${branch}` to synchronize the cache clone with the bare repo. This is correct — the cache clone must be an exact mirror. However, if the cache clone has uncommitted or unpushed changes, the hard reset silently destroys them with no diagnostic output.

This caused data loss during mission m000034: edits to `system.md` in the cache clone were committed locally but not pushed to the bare repo. The next `mission.materialize` call wiped them without warning.

## Decision

`syncCacheClone` MUST check for uncommitted changes before running `git reset --hard` and log a `logger.warn` if any are found.

- Use `git status --porcelain` to detect dirty working tree.
- If dirty, log: `Cache clone has uncommitted changes — they will be lost on reset. Push to bare repo before materializing.`
- Proceed with the reset regardless — the cache clone must be synchronized.

## Justification

The reset is correct behavior; the problem is silent data loss. A warning gives the operator (or agent) a chance to realize their mistake and push before the reset destroys work. This is defense-in-depth alongside ADR-0030, which prevents the most common cause (unpushed bordbuch entries).

Alternatives considered:

- **Abort instead of warn:** Rejected — `syncCacheClone` runs inside `mission.materialize`, which is often called after a failed attempt. Aborting would create a chicken-and-egg situation where the operator can't re-materialize without manually cleaning the cache clone.
- **Auto-stash:** Rejected — stashing creates hidden state that the operator may never find. Explicit push is the correct workflow.

## Consequences

- Positive: Operators and agents get immediate feedback when uncommitted changes are about to be destroyed.
- Positive: No behavioral change — the reset still happens, maintaining cache clone integrity.
- Negative: Adds one `git status` call per materialization (~10ms). Negligible.

## Evolution

If the cache clone management is refactored to use a separate worktree or sparse checkout, this check may become unnecessary. Monitor for false positives — if `git status` reports noise from generated files, consider filtering.
