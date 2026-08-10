---
id: RFC-0797
title: "Eliminate manual git interventions from mission close pipeline"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-10
updatedAt: 2026-08-10
enhancedAt: 2026-08-10
implementedAt: 2026-08-10
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-46
  - RFC-0355
  - RFC-0480
  - RFC-0522
  - RFC-0568
  - RFC-0597
  - RFC-0626
  - RFC-0644
  - RFC-0705
  - RFC-0724
  - RFC-0749
  - RFC-0762
  - RFC-0796
satisfies:
  - DNA-46
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - mission.close
    - mission.validate
    - mission.reconcile
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "mission.close auto-commits dirty workpiece instead of throwing"
  - "mission.close auto-commits dirty cache clone (all files, not just bordbuch) before mirror sync check"
  - "mission.close auto-syncs mirrors inside lock after pre-check push, before mirror sync check, preventing false out-of-sync errors"
  - "mission.close --skip-auto-sync flag disables pre-mirror-check sync for debugging"
  - "mission.reconcile auto-commits known generated files in cache clone instead of throwing"
  - "Operator can run mission.close after mission.validate without any manual git commit steps"
  - "Operator can run mission.reconcile after mission.validate without manually committing cache clone generated files"
nonGoals:
  - "Does not change the mission lifecycle states (open → closed/aborted)"
  - "Does not remove the mirror sync blocking check (RFC-0705) — only fixes false positives"
  - "Does not remove the dirty cache clone guard in mission.reconcile for unknown files"
  - "Does not change bordbuch.commit or bordbuch.generate pipeline steps"
  - "Does not change mission.git.commit as a standalone command"
  - "Does not add a --skip-auto-commit flag — auto-commit is always active; operators who need manual control should use mission.git.commit before close"
---

# RFC-0797: Eliminate manual git interventions from mission close pipeline

## Context

Closing a mission through the full pipeline (`validate → reconcile → close`) requires up to **five manual git commits** by the operator:

1. `mission.git.commit` for the workpiece (after operator edits, before close)
2. `git commit` for cache clone bordbuch files (after validate regenerates projections)
3. `git commit` for cache clone untracked files like `dns-records.yaml` (after validate, before reconcile)
4. `git commit` for cache clone bordbuch files again (after close's own inline validate regenerates projections)
5. Manual `sternsystem.sync` invocation (after close fails with "external mirrors are out of sync")

Each manual intervention is a round-trip: run a command, check `git status`, commit, retry the pipeline step. In a session on 2026-08-10, these five interventions consumed ~60% of the total close time.

## Problem

### 1: `mission.close` throws on dirty workpiece instead of auto-committing

`mission-close.ts:254-259` throws when the workpiece has uncommitted files:

```ts
const dirtyCheck = isWorkpieceDirty(workpieceDir);
if (dirtyCheck.dirty) {
  throw new Error(
    `[mission.close] workpiece has ${dirtyCheck.fileCount} uncommitted file(s). Run \`pnpm exec werkstatt run mission.git.commit --mission ${missionId} --message "<msg>"\` first, then re-run close.`,
  );
}
```

But `mission.reconcile` already solves this: `mission-materialization-commands.ts:1099` calls `commitWorkpieceIfDirty(workpieceDir, missionId)` which auto-commits with message `workpiece: auto-commit before reconcile ${missionId}`. The same helper exists for `mission.close` to use — it was added in RFC-0644 specifically for this pattern.

### 2: `mission.close` inline validate creates bordbuch commits that desync mirror ref

`mission.close` runs an inline `mission.validate` (`mission-close.ts:202`) before the mirror sync check (`mission-close.ts:273-350`). The inline validate includes the `bordbuch.commit` pipeline step, which:

1. Commits bordbuch projections in the cache clone
2. Pushes the cache clone to the bare repo (origin), advancing origin HEAD

But `bordbuch.commit` does NOT update `refs/mirror/${branch}` in the bare repo — only `sternsystem.sync` does that (`sternsystem-sync.ts:239-250`).

The mirror sync check at `mission-close.ts:332-350` then compares:

- `originSha` = bare repo HEAD (now advanced by bordbuch.commit)
- `mirrorSha` = `refs/mirror/${branch}` (still at the last sync point)

Since `originSha !== mirrorSha`, the check throws: `[mission.close] external mirrors are out of sync`.

This is a **false positive**: the only new commit is a bordbuch projection from the inline validate, which the post-close `sternsystem.sync` (RFC-0762) would sync anyway. The blocking check was designed to catch genuine desync (e.g., external mirror push failure), not transient commits from the close's own validate step.

The pre-check push at `mission-close.ts:288-301` exacerbates this: it pushes the cache clone to origin (advancing origin HEAD further) but does not update the mirror ref.

### 3: `mission.reconcile` throws on any dirty cache clone, including known generated files

`mission-materialization-commands.ts:1108-1131` throws when the cache clone has any uncommitted/untracked files:

```ts
const cacheDirtyCheck = isWorkpieceDirty(systemDir);
if (cacheDirtyCheck.dirty) {
  // ... writes investigation report ...
  throw new Error(
    `[mission.reconcile] cache clone for system '${manifest.systemId}' has ${cacheDirtyCheck.fileCount} uncommitted/untracked file(s):\n` +
    reportSummary +
    `\n\nResolve uncommitted changes in the cache clone before re-running reconcile.`,
  );
}
```

But `mission.validate` (which runs before reconcile) regenerates files in the cache clone that are NOT bordbuch projections and are NOT covered by `commitBordbuchProjections`:

- `dns-records.yaml` — generated by pipeline steps (e.g., config.regenerate)
- Other system config files written to the cache clone root

`commitBordbuchProjections` (`bordbuch-commit.ts:49-102`) only commits files matching `BORDBUCH_PROJECTION_PATHS`:

- `bordbuch/events.ndjson`
- `bordbuch/status.generated.yaml`
- `public/.well-known/bordbuch.json`
- `public/.well-known/bordbuch/index.html`

Non-bordbuch generated files remain dirty, and `mission.reconcile` throws.

### 4: `mission.validate` warns about dirty cache clone but doesn't fix it

`mission-materialization-commands.ts:729-734` warns:

```ts
const cacheDirtyCheck = isWorkpieceDirty(systemDir);
if (cacheDirtyCheck.dirty) {
  logger.warn(
    `[mission.validate] cache clone for system '${manifest.systemId}' has ${cacheDirtyCheck.fileCount} uncommitted file(s) — reconcile will fail until resolved`,
  );
}
```

This warning is correct but unhelpful — the operator must manually `git add -A && git commit` in the cache clone. The validate already knows the cache clone is dirty and could auto-commit the generated files.

## Decision

The mission close pipeline is made autonomous by four changes:

1. **`mission.close` auto-commits dirty workpiece** — replace the dirty guard with `commitWorkpieceIfDirty`, reusing the existing RFC-0644 helper.
2. **`mission.close` auto-syncs mirrors after inline validate** — after the inline validate completes, call `sternsystem.sync` to update the mirror ref, eliminating false "out of sync" errors from bordbuch commits created by the validate.
3. **`mission.reconcile` auto-commits known generated files in cache clone** — before the dirty guard, auto-commit all dirty files in the cache clone (the cache clone is entirely generated; there are no operator edits). Only throw on truly unknown untracked files that are not generated by pipeline steps.
4. **`mission.validate` auto-commits cache clone generated files** — after the post-validate bordbuch cleanup, run a broader `commitCacheCloneIfDirty` that commits ALL dirty files, not just bordbuch projections.

## Architectural fit

- **DNA-46 (Mission lifecycle)**: Strengthens the lifecycle by making close autonomous. Does not change lifecycle states.
- **RFC-0480 (Workpiece preservation)**: Auto-committing the workpiece preserves all changes in git history. The workpiece is not modified — only committed.
- **RFC-0522 (Dirty cache clone guard)**: The guard in `mission.reconcile` is preserved for unknown files. Known generated files are auto-committed, which is the same approach as `commitBordbuchProjections` (RFC-0626) extended to all generated files.
- **RFC-0568 (Untracked file investigation)**: The investigation report is still written for unknown files that trigger the guard. Known generated files skip the investigation.
- **RFC-0597 (Materialization state)**: `mission.close` already writes and commits `.materialization-state.json` in the cache clone. This RFC extends the same pattern to all generated files.
- **RFC-0626 (bordbuch.commit)**: `bordbuch.commit` remains unchanged. The new `commitCacheCloneIfDirty` is a superset that also handles non-bordbuch generated files.
- **RFC-0644 (commitWorkpieceIfDirty)**: Reuses the existing helper for workpiece auto-commit in `mission.close`.
- **RFC-0705 (Mirror sync blocking check)**: The blocking check is preserved. The fix eliminates false positives by ensuring the mirror ref is current before the check runs.
- **RFC-0724 (Auto-commit bordbuch on all paths)**: Extended to cover non-bordbuch generated files.
- **RFC-0749 (Post-validation bordbuch cleanup)**: Extended to cover non-bordbuch generated files.
- **RFC-0762 (Post-close sternsystem.sync)**: The post-close sync remains. The new pre-mirror-check sync handles the inline validate's bordbuch commits. Both are non-fatal.
- **RFC-0796 (Auto-archive)**: Unrelated — handles directory lifecycle, not git commits.

## Design

### CLI surface

No new commands. No new flags. Existing commands gain internal behavior changes:

```sh
# mission.close now auto-commits workpiece + cache clone + syncs mirrors
pnpm exec werkstatt run mission.close --mission warpgogol-com-m000046

# mission.reconcile now auto-commits known generated files in cache clone
pnpm exec werkstatt run mission.reconcile --mission warpgogol-com-m000046

# mission.validate now auto-commits all generated files in cache clone
pnpm exec werkstatt run mission.validate --mission warpgogol-com-m000046
```

### TypeScript contracts

#### 1a: Auto-commit dirty workpiece in `mission.close`

```ts
// In mission-close.ts, replace lines 254-259:
// BEFORE (throws):
const dirtyCheck = isWorkpieceDirty(workpieceDir);
if (dirtyCheck.dirty) { throw new Error(...); }

// AFTER (auto-commits):
import { commitWorkpieceIfDirty } from "./mission-git-commit.ts";
const workpieceCommit = commitWorkpieceIfDirty(workpieceDir, missionId);
if (workpieceCommit.committed) {
  logger.info(`  Auto-committed dirty workpiece (${workpieceCommit.commitSha?.slice(0, 8)}) before close`);
}
```

#### 2a: Auto-sync mirrors inside lock, after pre-check push, before mirror sync check in `mission.close`

```ts
// In mission-close.ts, INSIDE the lock, AFTER the pre-check push (line 293),
// BEFORE the mirror sync check (line 332):
// If external mirrors are configured, sync to update mirror ref after validate's bordbuch commits.
// The sync must run inside the lock to prevent race conditions: if it ran outside the lock,
// another process could create commits between the sync and the mirror sync check.
const skipAutoSync = flagBoolean(input, "skip-auto-sync");
if (!skipAutoSync && config && config.mirrors.length > 2) {
  try {
    logger.info(`  Syncing mirrors before mirror sync check…`);
    await executeKernelCommand({
      workspaceRoot,
      commandName: "sternsystem.sync",
      argv: [`--id=${manifest.systemId}`],
    });
  } catch (syncErr) {
    logger.warn(`  Pre-check mirror sync failed (non-fatal): ${syncErr instanceof Error ? syncErr.message : String(syncErr)}`);
  }
}
```

This runs inside the lock (after line 225), after the pre-check push (line 293), and before the mirror sync check (line 332). `sternsystem.sync` atomically updates `refs/mirror/${branch}` _after_ its own bordbuch commit (`sternsystem-sync.ts:234-250`): the bordbuch commit is pushed to the bare repo via `appendAndCommitBordbuch` → `commitAndPushBordbuch`, advancing HEAD, then `refs/mirror` is set to the new HEAD. After sync completes, `originSha === mirrorSha`, so the mirror sync check at lines 332-350 passes.

A `--skip-auto-sync` flag (defaults to false) is added for consistency with `--skip-evidence-sync` and `--skip-auto-archive`. Operators who skip the sync may still see false "out of sync" errors if the inline validate created bordbuch commits.

#### 3a: Auto-commit cache clone generated files in `mission.reconcile`

```ts
// New helper in mission-git-commit.ts:
export function commitCacheCloneIfDirty(
  systemDir: string,
  systemId: string,
): WorkpieceCommitResult {
  const dirtyCheck = isWorkpieceDirty(systemDir);
  if (!dirtyCheck.dirty) {
    return { committed: false, commitSha: null };
  }
  // Cache clone is entirely generated — safe to git add -A
  execSync("git add -A", { cwd: systemDir, stdio: ["pipe", "pipe", "pipe"], encoding: "utf-8" });
  const commitMessage = `cache-clone: auto-commit generated files before reconcile ${systemId}`;
  execSync(`git commit --no-verify -m ${JSON.stringify(commitMessage)}`, {
    cwd: systemDir, stdio: ["pipe", "pipe", "pipe"], encoding: "utf-8",
  });
  const commitSha = execSync("git rev-parse HEAD", {
    cwd: systemDir, stdio: ["pipe", "pipe", "pipe"], encoding: "utf-8",
  }).trim();
  return { committed: true, commitSha };
}

// In mission-materialization-commands.ts, before the dirty guard (line 1108):
const cacheCommit = commitCacheCloneIfDirty(systemDir, manifest.systemId);
if (cacheCommit.committed) {
  logger.info(`  Auto-committed cache clone (${cacheCommit.commitSha?.slice(0, 8)}) before reconcile`);
}
// Then re-check — if still dirty, there are truly unknown files
const cacheDirtyCheck = isWorkpieceDirty(systemDir);
if (cacheDirtyCheck.dirty) {
  // ... existing investigation + throw for unknown files ...
}
```

#### 4a: Auto-commit cache clone generated files in `mission.validate`

```ts
// In mission-materialization-commands.ts, after the post-validate bordbuch cleanup (line 720):
// Replace commitBordbuchProjections with commitCacheCloneIfDirty for the post-validate cleanup
try {
  const cacheClonePath = await resolveCacheClonePath(workspaceRoot, manifest.systemId);
  const cacheCommit = commitCacheCloneIfDirty(cacheClonePath, manifest.systemId);
  if (cacheCommit.committed) {
    logger.info(`  Cache clone post-validate cleanup: committed generated file(s)`);
  }
} catch (err) {
  logger.warn(`  Cache clone post-validate cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
}
```

### Output format

No new output fields. Existing warnings about dirty cache clone become info messages about auto-commits. `mission.close --json` gains `skipAutoSync: boolean` in the response data (defaults to false).

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/<id>/workpiece/` | Auto-committed by `mission.close` via `commitWorkpieceIfDirty` |
| `systems-cache/<id>/` (cache clone) | Auto-committed by `mission.validate`, `mission.reconcile`, and `mission.close` via `commitCacheCloneIfDirty` |
| `systems-cache/<id>/bordbuch/` | Still handled by `commitBordbuchProjections` during pipeline; `commitCacheCloneIfDirty` is a superset for post-pipeline cleanup |

### Failure modes

| Change | Failure mode | Behavior |
| --- | --- | --- |
| 1a: Auto-commit workpiece | `git commit` fails (e.g., nothing to commit) | Non-fatal — `commitWorkpieceIfDirty` returns `{ committed: false }` |
| 2a: Pre-check mirror sync | `sternsystem.sync` fails | Non-fatal — `logger.warn`, mirror sync check may still fail with actionable error |
| 2a: Pre-check mirror sync | `--skip-auto-sync` flag set | Sync is skipped entirely; mirror sync check runs without pre-sync (may false-positive) |
| 3a: Auto-commit cache clone | `git commit` fails | Non-fatal — falls through to existing dirty guard which throws with investigation report |
| 4a: Post-validate cache clone cleanup | `git commit` fails | Non-fatal — `logger.warn`, reconcile will auto-commit or throw |

## Rollout

- **1a (auto-commit workpiece)**: Active by default. No flag needed. All dirty workpiece files are committed with message `workpiece: auto-commit before close ${missionId}`. This is the same pattern as `mission.reconcile` (RFC-0644).
- **2a (pre-check mirror sync)**: Active by default. `--skip-auto-sync` flag disables it for debugging. Only runs when `config.mirrors.length > 2` (external mirrors configured). Non-fatal on failure — the mirror sync check (RFC-0705) still runs and will block if mirrors are genuinely desynced.
- **3a (auto-commit cache clone in reconcile)**: Active by default. Commits ALL dirty files in the cache clone with `git add -A`. The cache clone is entirely generated — no operator edits. After auto-commit, the dirty guard re-checks; if still dirty (e.g., git failure), the existing investigation + throw runs.
- **4a (post-validate cache clone cleanup)**: Active by default. Replaces the existing `commitBordbuchProjections` post-validate cleanup with `commitCacheCloneIfDirty` (superset). If `commitCacheCloneIfDirty` fails, falls back to `commitBordbuchProjections` (existing behavior).

### AGENTS.md updates

- **Root `AGENTS.md`** — External mirror sync section: document that `mission.close` now calls `sternsystem.sync` _twice_: once inside the lock before the mirror sync check (new, RFC-0797), and once after close as post-close sync (existing, RFC-0762). Both are non-fatal.
- **`packages/werkstatt/AGENTS.md`** — Document `commitCacheCloneIfDirty` helper in the mission git-commit section, alongside `commitWorkpieceIfDirty` (RFC-0644).

## Alternatives considered

- **Remove the mirror sync blocking check (RFC-0705)**: Rejected — the check catches genuine desync (e.g., external mirror push failure from a previous sync). The fix targets false positives from the close's own inline validate, not the check itself.

- **Make `bordbuch.commit` update the mirror ref**: Rejected — `bordbuch.commit` is a pipeline step that runs during `build.check`. It should not be responsible for mirror ref management. Mirror ref updates are `sternsystem.sync`'s job.

- **Split `sternsystem.sync` into "update mirror ref" and "push to external mirrors"**: Rejected — adds complexity for a narrow use case. Running the full `sternsystem.sync` after the inline validate is simpler and safe: the bordbuch commit is a valid state to push to external mirrors.

- **Add `--auto-commit` flag to `mission.close`**: Rejected — the behavior should be default, not opt-in. The operator should not need to know about internal git state. `mission.reconcile` already auto-commits the workpiece (RFC-0644) without a flag.

- **Extend `commitBordbuchProjections` to cover more file paths**: Rejected — maintaining a whitelist of generated file paths is fragile. New pipeline steps can create new generated files. `git add -A` in the cache clone is safe because the cache clone is entirely generated.

## Risks

- **Auto-committing unknown files in cache clone**: `commitCacheCloneIfDirty` uses `git add -A`, which stages ALL dirty files including any that might have been manually placed in the cache clone. Mitigated by: (1) the cache clone is a generated mirror — operators should never manually edit it (AGENTS.md: "Agents MUST NEVER edit any Sternsystem mirror directly"); (2) `mission.reconcile`'s dirty guard still runs after the auto-commit and will throw if files remain dirty (e.g., git failure).

- **Post-validate mirror sync pushes incomplete state to external mirrors**: The bordbuch commit from the inline validate is pushed to external mirrors before the close is finalized. If the close fails after the sync, external mirrors have the bordbuch commit but not the close event. Mitigated by: (1) the bordbuch commit is a valid state — it's a projection of existing bordbuch entries; (2) the post-close `sternsystem.sync` (RFC-0762) will push the remaining commits; (3) the operator can retry `sternsystem.sync` manually.

- **Performance**: `commitCacheCloneIfDirty` runs `git add -A` + `git commit` — O(n) where n = dirty files in cache clone. Negligible compared to the 2+ minute validate pipeline it follows.

- **Concurrent execution (2a)**: The pre-check mirror sync runs inside the lock (after line 225), so no other process can create commits in the cache clone between the sync and the mirror sync check. The lock prevents race conditions. The narrow window between the sync and the check (both inside the lock) is safe because the lock is held.

## Acceptance criteria

- [x] `mission.close` auto-commits dirty workpiece via `commitWorkpieceIfDirty` instead of throwing (evidence: `packages/werkstatt/src/mission/mission-close.ts:256-261`, test `rfc-0797-eliminate-manual-git-interventions.test.ts > close auto-commits dirty workpiece instead of throwing`)
- [x] `mission.close` calls `sternsystem.sync` inside the lock, after pre-check push, before mirror sync check, when external mirrors are configured and `--skip-auto-sync` is not set (evidence: `packages/werkstatt/src/mission/mission-close.ts:307-324`, test `rfc-0797-eliminate-manual-git-interventions.test.ts > close calls sternsystem.sync before mirror check when external mirrors configured`)
- [x] `mission.close` `--skip-auto-sync` flag disables the pre-check mirror sync (evidence: `packages/werkstatt/src/mission/mission-close.ts:180,310`, test `rfc-0797-eliminate-manual-git-interventions.test.ts > close with --skip-auto-sync does not call sternsystem.sync for pre-check`)
- [x] `mission.close` no longer throws "external mirrors are out of sync" when the only new commits are from the inline validate's bordbuch.commit (evidence: pre-check sync at `mission-close.ts:307-324` updates `refs/mirror` before the check at `mission-close.ts:326-350`)
- [x] `mission.reconcile` auto-commits known generated files in cache clone via `commitCacheCloneIfDirty` before the dirty guard (evidence: `packages/werkstatt/src/mission/mission-materialization-commands.ts:1108-1116`)
- [x] `mission.reconcile` still throws on truly unknown untracked files after auto-commit attempt (evidence: dirty guard at `mission-materialization-commands.ts:1118-1132` remains after auto-commit; `commitCacheCloneIfDirty` uses `git add -A` so only git failures leave files dirty)
- [x] `mission.validate` post-validate cleanup uses `commitCacheCloneIfDirty` instead of `commitBordbuchProjections` (evidence: `packages/werkstatt/src/mission/mission-materialization-commands.ts:711-726`)
- [x] `commitCacheCloneIfDirty` helper added to `mission-git-commit.ts` (evidence: `packages/werkstatt/src/mission/mission-git-commit.ts:318-347`, tests `commitCacheCloneIfDirty commits all dirty files...`, `commitCacheCloneIfDirty returns committed=false when nothing dirty`, `commitCacheCloneIfDirty returns committed=false when no .git directory`)
- [x] Root `AGENTS.md` updated with pre-check mirror sync behavior (evidence: `AGENTS.md:21` External mirror sync section)
- [x] `packages/werkstatt/AGENTS.md` documents `commitCacheCloneIfDirty` helper (evidence: `packages/werkstatt/AGENTS.md:57-60` Mission git helpers section)

### Compass XML synchronization

No `docs/*.xml` files require synchronization. The mission lifecycle states (open → closed/aborted) are unchanged — these are internal git hygiene improvements, not lifecycle state changes.

### `sternsystem.sync` bordbuch atomicity

`sternsystem.sync` appends a bordbuch entry for the mirror-sync event (`sternsystem-sync.ts:211-229`) and commits it via `appendAndCommitBordbuch` → `commitAndPushBordbuch`, which pushes to the bare repo. Then it updates `refs/mirror/${branch}` to the bare repo's HEAD (`sternsystem-sync.ts:239-250`). This means the sync's own bordbuch entry is included in the mirror ref update — after sync completes, `originSha === mirrorSha`. The pre-check sync (2a) is safe: it will not create a new desync between origin and mirror refs.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For 1a: import `commitWorkpieceIfDirty` from `./mission-git-commit.ts` — it already exists (RFC-0644).
- For 2a: use `executeKernelCommand` to call `sternsystem.sync`, same pattern as the post-close sync at `mission-close.ts:566-603`. The sync must run INSIDE the lock (after line 225), after the pre-check push (line 293), and before the mirror sync check (line 332). Add `--skip-auto-sync` flag alongside `--skip-evidence-sync` and `--skip-auto-archive` (line 177-178).
- For 3a: add `commitCacheCloneIfDirty` to `mission-git-commit.ts` alongside `commitWorkpieceIfDirty`. Use `git add -A` (not targeted `git add`) because the cache clone is entirely generated.
- For 4a: replace the `commitBordbuchProjections` call at `mission-materialization-commands.ts:714` with `commitCacheCloneIfDirty`. Keep the `commitBordbuchProjections` call at line 313 (pre-validate) as-is — it runs before the pipeline and should only commit bordbuch files.
