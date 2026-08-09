---
id: RFC-0762
title: "Make mission.close sync external mirrors before completing"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-08
updatedAt: 2026-08-08
enhancedAt: 2026-08-08
implementedAt: 2026-08-08
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0705
amendedBy: []
related:
  - DNA-46
  - RFC-0355
  - RFC-0356
satisfies:
  - DNA-46
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - mission.close
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "mission.close leaves external mirrors in sync without manual sternsystem.sync"
  - "No manual sternsystem.sync needed after mission.close"
nonGoals:
  - "Does not change mission.reconcile mirror sync behavior (already automatic via RFC-0705)"
  - "Does not add mirror sync to mission.abort (abort does not mutate cache clone content)"
---

# RFC-0762: Make mission.close sync external mirrors before completing

## Context

`mission.reconcile` automatically calls `sternsystem.sync` after pushing to the bare repo when external mirrors are configured (RFC-0705). This ensures the GitHub mirror (`mirrors[2+]`) stays in sync with the cache clone.

However, `mission.close` **also mutates the cache clone** — it commits `system.pin.json` (via `sternsystem.pin`), `.materialization-state.json`, and bordbuch entries. These commits are not pushed to the bare repo or external mirrors. The operator must manually run `sternsystem.sync --id <systemId>` after `mission.close` to propagate these changes.

This was discovered during mission `warpgogol-com-m000039` close: after `mission.close` completed successfully, the GitHub mirror was behind the cache clone by 2 commits (`system.pin.json` + `.materialization-state.json`). A manual `sternsystem.sync` was required to bring the mirror in sync.

## Problem

DNA-46 (Mission lifecycle) states that `mission.close` enforces the mission lifecycle, but does not guarantee mirror consistency after close. The current flow:

1. `mission.reconcile` — syncs mirrors (RFC-0705)
2. `mission.close` — mutates cache clone (pin, state, bordbuch) **without syncing mirrors**
3. Operator must manually run `sternsystem.sync`

This is a gap in the pipeline: `mission.close` checks `mirrorInSync` at the start (blocking if out of sync), but then **creates new out-of-sync state** by committing to the cache clone without pushing. The operator is left with mirrors that are behind, and the next `mission.open` or `mission.reconcile` will see a dirty mirror state.

## Decision

`mission.close` calls `sternsystem.sync --id <systemId>` after all cache clone commits are complete (pin, `.materialization-state.json`, bordbuch) and before the final success response, when `mirrors.length > 2`.

The sync call is non-fatal: if `sternsystem.sync` fails, `mission.close` still succeeds (the mission is closed), but emits a `logger.warn` with a recommendation to run `sternsystem.sync` manually. This mirrors the non-fatal sync behavior of `mission.reconcile` (RFC-0705).

## Architectural fit

- **DNA-46 (Mission lifecycle)**: Extends `mission.close` to guarantee mirror consistency after close, completing the lifecycle invariant that a closed mission leaves the Sternsystem in a consistent state across all mirrors.
- **RFC-0705**: Extends the automatic mirror sync pattern from `mission.reconcile` to `mission.close`. RFC-0705 established a two-phase design: reconcile attempts sync (non-fatal), close blocks on desync (pre-close check). RFC-0762 adds a third phase: close syncs mirrors after committing (post-close propagation). The pre-close blocking check (RFC-0705) and the post-close sync (RFC-0762) are complementary — the pre-close check prevents closing a desynced system, the post-close sync propagates the new commits created by close itself (pin, state, bordbuch).
- **Site OS operator model**: `mission.close` is a workspace-scoped command in the mission module (`packages/os/site-kernel-handoff`). The `sternsystem.sync` call is delegated via `executeKernelCommand`, same pattern as `mission.reconcile`.
- **Compass `docs/*.xml` files**: `docs/development-plan.xml` and `docs/verification-plan.xml` reference `mission.close` only in the context of content regression (RFC-0732/0734), not mirror sync. No `docs/*.xml` synchronization is needed for this RFC.

## Design

### CLI surface

No CLI surface change. The sync is invoked internally by `mission.close` — the operator does not pass any new flags.

```sh
# Before (current):
pnpm exec werkstatt run mission.close --mission <id>
# Then manually:
pnpm exec werkstatt run sternsystem.sync --id <systemId>

# After (proposed):
pnpm exec werkstatt run mission.close --mission <id>
# Mirrors synced automatically.
```

### TypeScript contracts

The existing `CloseReportMirror` interface (established by RFC-0705) is **extended** with two new fields — `synced` and `syncError` — to track the post-close sync result alongside the pre-close mirror status check:

```ts
// Existing interface in mission-close.ts (RFC-0705), extended by RFC-0762:

export interface CloseReportMirror {
  // RFC-0705 fields (pre-close mirror status check):
  originSha: string | null;
  mirrorSha: string | null;
  inSync: boolean;
  recommendation: string | null;
  // RFC-0762 fields (post-close sync result):
  synced: boolean;
  syncError: string | null;
}

// In mission-close.ts, after all cache clone commits are complete
// (bordbuch, system.pin.json, .materialization-state.json):

const { executeKernelCommand } = await import("@warpgogol/site-kernel");
const syncResult = (await executeKernelCommand({
  workspaceRoot,
  commandName: "sternsystem.sync",
  argv: [`--id=${manifest.systemId}`],
})) as { exitCode?: number; summary?: string };

const syncExitCode = syncResult.exitCode ?? 0;
if (syncExitCode !== 0) {
  logger.warn(
    `[mission.close] sternsystem.sync failed — run manually: ` +
    `sternsystem.sync --id ${manifest.systemId}`
  );
  closeReport.mirror.synced = false;
  closeReport.mirror.syncError =
    syncResult.summary ?? `sternsystem.sync exited with code ${syncExitCode}`;
} else {
  closeReport.mirror.synced = true;
  closeReport.mirror.syncError = null;
}
```

The `synced` field tracks whether the post-close sync succeeded; `inSync` (RFC-0705) tracks whether mirrors were in sync before close. Both are needed: `inSync` is the pre-close blocking check, `synced` is the post-close propagation result.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | Add `sternsystem.sync` call after cache clone commits; extend `CloseReportMirror` interface |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync.ts` | Existing sync implementation (no changes) |
| `AGENTS.md` | Update § External mirror sync to note that `mission.close` also syncs mirrors automatically after close commits |

### Output format

The `CloseReport.mirror` object extends the existing RFC-0705 shape with `synced` and `syncError`:

```json
{
  "command": "mission.close",
  "mirror": {
    "originSha": "a1b2c3d4e5f6...",
    "mirrorSha": "a1b2c3d4e5f6...",
    "inSync": true,
    "recommendation": null,
    "synced": true,
    "syncError": null
  }
}
```

When sync fails (non-fatal):

```json
{
  "mirror": {
    "originSha": "a1b2c3d4e5f6...",
    "mirrorSha": "a1b2c3d4e5f6...",
    "inSync": true,
    "recommendation": null,
    "synced": false,
    "syncError": "git push to git@github.com:... failed: Connection timed out"
  }
}
```

### Failure modes

- **`sternsystem.sync` fails**: `mission.close` still succeeds (mission is closed). `logger.warn` emitted. `report.mirror.synced = false`. Operator can re-run `sternsystem.sync` manually.
- **No external mirrors** (`mirrors.length <= 2`): Sync is skipped entirely. No warning.
- **`executeKernelCommand` throws** (unexpected): Caught and logged as `logger.warn`. Close still succeeds.

## Rollout

- **Default behavior**: `mission.close` syncs mirrors automatically on first release. No flag day.
- **Existing missions**: No migration needed — the sync is additive (mirrors that are already in sync are unaffected).
- **New missions**: Automatically benefit from the sync.
- **Pipeline integration**: No pipeline changes. `mission.close` is a standalone command.

## Alternatives considered

- **Block `mission.close` if sync fails**: Rejected. `mission.close` is irreversible (state transition, bordbuch entry). Blocking after the state has changed would leave the mission in an inconsistent state. Non-fatal warning is the correct behavior.
- **Add a `--no-sync` flag**: Rejected. Adds complexity for no clear benefit. If the operator wants to skip sync, they can ignore the warning and not run it manually.
- **Move sync to a post-close pipeline step**: Rejected. `mission.close` is not a pipeline; it is a single command. Adding a pipeline would over-engineer the close flow.

## Risks

- **Performance**: `sternsystem.sync` adds a network push to GitHub. For missions with large diffs, this may add 5-30 seconds. This is additive to an already long-running command (`mission.close` runs `mission.validate` inline + `evidence.sync` to R2 + multiple cache clone commits). Acceptable given the reliability benefit.
- **False sense of safety**: Operators may assume mirrors are always in sync after close. The `synced` field in the report and the warning on failure mitigate this.
- **Duplicate sync**: If `mission.reconcile` was run just before `mission.close`, the sync in close may push the same commits again. Git push is idempotent — no harm.
- **Non-fatal vs evidence sync**: Mirror sync is non-fatal (logger.warn, close succeeds) while evidence sync is fatal (throws `EVIDENCE_SYNC_FAILED`). This asymmetry is intentional: evidence is the audit trail — losing it means the mission close is unverifiable (RFC-0652). Mirror sync failure leaves the mission closed with mirrors behind, but the operator can retry `sternsystem.sync` manually. Blocking after the irreversible state transition would leave the mission in an inconsistent state (see Alternatives considered).

## Acceptance criteria

- [x] `mission.close` calls `sternsystem.sync` after cache clone commits when `mirrors.length > 2` (evidence: packages/os/site-kernel-handoff/src/mission/mission-close.ts:539-572, rfc-0762-close-mirror-sync.test.ts test 1)
- [x] Sync failure is non-fatal — `mission.close` still succeeds with a warning (evidence: packages/os/site-kernel-handoff/src/mission/mission-close.ts:549-557, rfc-0762-close-mirror-sync.test.ts test 2)
- [x] `CloseReport.mirror` includes `synced` and `syncError` fields (evidence: packages/os/site-kernel-handoff/src/mission/mission-close.ts:82-89, build:check passes)
- [x] No external mirrors (`mirrors.length <= 2`) — sync skipped, no warning (evidence: packages/os/site-kernel-handoff/src/mission/mission-close.ts:539, rfc-0762-close-mirror-sync.test.ts test 3)
- [x] Unit test: sync called when mirrors > 2 (evidence: packages/os/site-kernel-handoff/src/tests/rfc-0762-close-mirror-sync.test.ts test 1, vitest run passes)
- [x] Unit test: sync failure does not block close (evidence: packages/os/site-kernel-handoff/src/tests/rfc-0762-close-mirror-sync.test.ts test 2, vitest run passes)
- [x] Unit test: sync skipped when mirrors <= 2 (evidence: packages/os/site-kernel-handoff/src/tests/rfc-0762-close-mirror-sync.test.ts test 3, vitest run passes)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0762 --json` — 0 errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove the mirror sync guarantee established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it (RFC-0334).
- The `sternsystem.sync` call MUST use `executeKernelCommand` (dynamic import from `@warpgogol/site-kernel`), not a direct function call — this preserves the kernel command boundary and ensures the sync command's own error handling applies. See `mission-materialization-commands.ts` (RFC-0705 reconcile sync) for the established pattern.
- The `sternsystem.sync` call from close produces a `mirror-sync` bordbuch entry and a `commitAndPushBordbuch` commit in the cache clone (RFC-0477). The sync MUST be placed before the `.materialization-state.json` write, so the state file captures the final cache clone HEAD including the sync's bordbuch commit. If the sync is placed after the state file write, the next materialization will see a stale HEAD and run a full preflight unnecessarily.
- The sync MUST check `entry.mirrors.length > 2` before calling `sternsystem.sync` — systems without external mirrors skip the sync call entirely.
- The `CloseReportMirror` interface is EXTENDED, not replaced. The existing `originSha`, `mirrorSha`, `inSync`, and `recommendation` fields (RFC-0705) must be preserved. The new `synced` and `syncError` fields are added alongside them.
- Compass `docs/*.xml` files do not reference `mission.close` mirror sync behavior — no `docs/*.xml` synchronization is needed for this RFC.
