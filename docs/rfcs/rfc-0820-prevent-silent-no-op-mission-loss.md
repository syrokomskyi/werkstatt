---
id: RFC-0820
title: "Prevent silent no-op mission loss — three-level guard against uncommitted work"
status: implemented
scope: package
kind: fix
createdAt: 2026-08-12
updatedAt: 2026-08-12
implementedAt: 2026-08-12
satisfies: []
versionBump: patch
related:
  - RFC-0480
  - RFC-0644
  - RFC-0797
reviewers: []
---

# RFC-0820: Prevent silent no-op mission loss — three-level guard against uncommitted work

## Problem

Mission `warpgogol-com-m000051` had brief "Add founder positioning phrase to Person record bio". The agent reported success and wrote a memory entry claiming the work was committed via `mission.git.commit`. However, git history shows zero content commits — the bio changes were never written to disk, and `mission.git.commit` silently returned success because there were no changes to commit.

The mission was reconciled and closed without any content changes. Mission `m000052` materialized from the cache clone and inherited the pre-`m000051` state — the work was lost.

## Root cause

Three gaps in the mission lifecycle allowed silent data loss:

1. **`mission.git.commit` returns success on empty workpiece** — When `git diff --cached --quiet` succeeds (no staged changes), the command returns `{ exitCode: 0 }` with summary "no changes to commit". Agents interpret this as success.

2. **`mission.close` does not verify brief fulfillment** — No check confirms that operator commits exist between materialization and close. A mission with zero work can be closed without warning.

3. **`mission.reconcile` does not warn on zero content diff** — When `transferredCommits === 0`, the reconcile completes silently. The operator is never alerted that no work was transferred.

## Fix

Three layers of defense, each catching the problem at a different stage:

### Level 1: `mission.git.commit` — warn on empty commit

When there are no staged changes, write a prominent warning to stderr and set `noChanges: true` in the result data. The command still returns success (exit 0) to avoid breaking existing automation, but the warning is visible in terminal output and the data field is machine-readable.

### Level 2: `mission.close` — block when zero operator commits

Before state transition, count operator commits since materialization using the existing `countOperatorCommits` helper. If zero, block close with an actionable error message that includes the mission brief. The `--allow-no-op` flag overrides this guard for legitimate no-op missions (e.g., platform-only updates, config syncs).

### Level 3: `mission.reconcile` — warn on zero transferred commits

After the git merge, if `transferredCommits === 0`, emit a prominent warning via `logger.warn` and include `zeroTransferWarning: true` in the reconciliation report. This is non-blocking (reconcile may legitimately transfer zero commits on re-runs) but makes the condition visible.

## Files changed

- `packages/werkstatt/src/mission/mission-git-commit.ts` — Level 1: stderr warning + `noChanges` field
- `packages/werkstatt/src/mission/mission-close.ts` — Level 2: zero-commit guard + `--allow-no-op` flag
- `packages/werkstatt/src/mission/mission-materialization-commands.ts` — Level 3: zero-transfer warning
- `packages/werkstatt/src/tests-handoff/mission-no-op-guard.test.ts` — regression tests for all three levels
