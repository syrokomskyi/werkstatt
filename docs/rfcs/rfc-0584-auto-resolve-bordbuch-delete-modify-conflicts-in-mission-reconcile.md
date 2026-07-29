---
id: RFC-0584
title: "Auto-resolve bordbuch delete-modify conflicts in mission.reconcile"
status: implemented
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
createdAt: 2026-07-29
updatedAt: 2026-07-29
enhancedAt: 2026-07-29
implementedAt: 2026-07-29
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-46
  - RFC-0522
  - RFC-0568
  - RFC-0473
satisfies:
  - DNA-46
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
    - mission.reconcile
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "mission.reconcile auto-resolves bordbuch/ delete-modify conflicts by keeping the cache clone version"
  - "mission.reconcile fails with existing error message when non-bordbuch conflicts occur"
  - "mission.reconcile succeeds for warpgogol-com missions where bordbuch was modified in cache clone and absent in workpiece"
nonGoals:
  - "Do not auto-resolve conflicts for paths other than bordbuch/ — other conflicts require manual resolution"
  - "Do not add bordbuch/ to .gitattributes or change git merge strategy globally"
  - "Do not change the workpiece materialization flow — bordbuch removal during materialize is correct (RFC-0568)"
  - "Do not change the bordbuch append/validate/repair commands"
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

# RFC-0584: Auto-resolve bordbuch delete-modify conflicts in mission.reconcile

## Context

`mission.reconcile` (RFC-0568) merges workpiece commits into the cache clone via `git merge --no-ff FETCH_HEAD`. The workpiece is created by `mission.materialize`, which clones the cache clone and then removes non-data-path files — including `bordbuch/` (confirmed by test at `rfc-0568-clone-reconcile.test.ts:287`: `expect(existsSync(path.join(workpieceDir, "bordbuch"))).toBe(false)`).

During the mission lifecycle, `bordbuch.append` adds entries (mission-open, preflight-skipped, mission-close) to the cache clone's `bordbuch/events.ndjson`. When `mission.reconcile` merges the workpiece (which has no `bordbuch/`) into the cache clone (which has modified `bordbuch/events.ndjson`), git reports a delete/modify conflict.

During mission `warpgogol-com-m000019` closure, this conflict required manual resolution: `git checkout --ours bordbuch/events.ndjson` followed by `git commit`. The operator had to understand the conflict type and the correct resolution strategy.

## Problem

1. **Bordbuch delete-modify conflict is unhandled.** `mission.reconcile` throws a generic `git merge --no-ff failed` error when the workpiece (no `bordbuch/`) is merged into the cache clone (modified `bordbuch/`). The error message tells the operator to "resolve conflicts in the workpiece" — but the conflict is in the cache clone, not the workpiece, and the correct resolution is to keep the cache clone's bordbuch.

2. **Bordbuch is cache-clone-only by design.** RFC-0568 materialization removes `bordbuch/` from the workpiece. RFC-0473 unified bordbuch to live only in the cache clone (`mirrors[0]`). The delete-modify conflict is an expected consequence of this architecture, not an operator error — yet `mission.reconcile` treats it as a hard failure.

3. **Manual resolution is fragile and undocumented.** The operator must know to run `git checkout --ours bordbuch/events.ndjson` in the cache clone. An agent or operator unfamiliar with the bordbuch architecture might choose `--theirs` (workpiece version, which is deletion), losing bordbuch entries.

## Decision

The `mission.reconcile` command auto-resolves `bordbuch/` delete-modify conflicts after `git merge --no-ff` fails. When the only conflicted paths are under `bordbuch/`, the command runs `git checkout --ours bordbuch/` and completes the merge. When non-bordbuch conflicts exist, the command fails with the existing error message.

## Architectural fit

- **DNA-46 (Sternsystem cache clone):** Bordbuch lives in the cache clone (`mirrors[0]`). Auto-resolving bordbuch conflicts by keeping the cache clone version preserves the cache clone's authoritative state.
- **RFC-0522 (Reconcile dirty cache clone guard):** The dirty guard runs before the merge. Auto-resolution happens after the merge fails — the guard is not bypassed.
- **RFC-0568 (Clone-based materialization):** Materialization removes `bordbuch/` from the workpiece. This RFC handles the expected consequence of that removal during reconcile.
- **RFC-0473 (Unified bordbuch schemas):** Bordbuch is cache-clone-only. The workpiece never has bordbuch entries. Keeping `--ours` is the only correct resolution.
- **Site OS operator model:** `mission.reconcile` remains workspace-scoped, in the `handoff` module. No new command, no new flags.

## Design

### CLI surface

No CLI surface change. `mission.reconcile` is invoked the same way:

```sh
pnpm exec site-kernel run mission.reconcile --mission warpgogol-com-m000019
```

The command's behavior changes: after `git merge --no-ff` fails, it checks if all conflicted paths are under `bordbuch/`. If so, it auto-resolves with `git checkout --ours bordbuch/` and completes the merge. If non-bordbuch conflicts exist, it fails with the existing error message.

### TypeScript contracts

```ts
// packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts

// Interface change: add optional autoResolvedPaths to MissionReconcileData
export interface MissionReconcileData {
  missionId: string;
  systemId: string;
  commitSha: string | null;
  preReconcileSha: string | null;
  reconciledAt: string;
  autoResolvedPaths?: string[];
}

// Inside runMissionReconcile, replace the existing try/catch around git merge:

let autoResolvedPaths: string[] = [];

try {
  execSync(`git merge --no-ff FETCH_HEAD -m ${JSON.stringify(mergeMessage)}`, {
    cwd: systemDir,
    stdio: "pipe",
    encoding: "utf-8",
  });
} catch (err) {
  // Check if all conflicts are bordbuch-only (delete/modify)
  let conflictedPaths: string[] = [];
  try {
    const statusOutput = execSync("git status --porcelain", {
      cwd: systemDir,
      stdio: "pipe",
      encoding: "utf-8",
    });
    conflictedPaths = statusOutput
      .split("\n")
      .filter((l) => l.startsWith("DU") || l.startsWith("UD") || l.startsWith("AA") || l.startsWith("UU"))
      .map((l) => l.slice(3).trim());
  } catch {
    // git status failed — fall through to existing error
  }

  const allBordbuch = conflictedPaths.length > 0 && conflictedPaths.every((p) => p.startsWith("bordbuch/"));

  if (allBordbuch) {
    // Auto-resolve: keep cache clone's bordbuch (ours)
    try {
      execSync("git checkout --ours bordbuch/", {
        cwd: systemDir,
        stdio: "pipe",
        encoding: "utf-8",
      });
      execSync("git add bordbuch/", {
        cwd: systemDir,
        stdio: "pipe",
        encoding: "utf-8",
      });
      execSync("git commit --no-edit", {
        cwd: systemDir,
        stdio: "pipe",
        encoding: "utf-8",
      });
      autoResolvedPaths = conflictedPaths;
      logger.info(`  Auto-resolved bordbuch/ conflict (kept cache clone version)`);
    } catch (resolveErr) {
      // Auto-resolution failed — abort merge and throw
      try {
        execSync("git merge --abort", { cwd: systemDir, stdio: "pipe" });
      } catch {
        // merge --abort also failed — continue to throw
      }
      throw new Error(
        `[mission.reconcile] bordbuch auto-resolution failed: ${(resolveErr as Error).message}.\n` +
          `Merge has been aborted. Inspect the cache clone state manually.\n` +
          `Reconcile is idempotent — it will reset the cache clone to preReconcileSha and re-merge.`,
      );
    }
  } else {
    // Abort merge and throw existing error
    try {
      execSync("git merge --abort", { cwd: systemDir, stdio: "pipe" });
    } catch {
      // merge --abort also failed — continue to throw
    }
    throw new Error(
      `[mission.reconcile] git merge --no-ff failed: ${(err as Error).message}.\n` +
        `Resolve conflicts in the workpiece (not the cache clone), commit via mission.git.commit, then re-run reconcile.\n` +
        `Reconcile is idempotent — it will reset the cache clone to preReconcileSha and re-merge.`,
    );
  }
}

// After merge (successful or auto-resolved), existing logic continues:
// commitSha, mergeCommitSha, transferredCommits, push...

// Evidence report includes autoResolvedPaths:
const report = {
  schemaVersion: "1.0.0",
  missionId,
  systemId: manifest.systemId,
  commitSha,
  preReconcileSha,
  reconciledAt: now,
  mergeCommitSha,
  transferredCommits,
  message,
  copiedPaths,
  autoResolvedPaths,
};

// Summary extended when auto-resolution occurred:
const autoResolveSuffix =
  autoResolvedPaths.length > 0 ? `, ${autoResolvedPaths.length} bordbuch conflict${autoResolvedPaths.length > 1 ? "s" : ""} auto-resolved` : "";
const summary = `[mission.reconcile] ${missionId} reconciled (${commitSha ? `${commitSha.slice(0, 8)}, ${transferredCommits} commits merged` : "no git"}${autoResolveSuffix})`;

// Return data includes autoResolvedPaths when non-empty:
return {
  data: {
    missionId,
    systemId: manifest.systemId,
    commitSha,
    preReconcileSha,
    reconciledAt: now,
    ...(autoResolvedPaths.length > 0 ? { autoResolvedPaths } : {}),
  },
  summary,
};
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Modified: add bordbuch conflict auto-resolution in `runMissionReconcile`, extend `MissionReconcileData` with `autoResolvedPaths?`, include `autoResolvedPaths` in evidence report and summary |
| `mirrors[0].path/bordbuch/events.ndjson` | Auto-resolved to cache clone version (`--ours`) during merge conflict |

### Output format

The `--json` output gains an optional `autoResolvedPaths` field (absent when no auto-resolution occurred, present as `string[]` when bordbuch conflicts were auto-resolved). The `autoResolvedPaths` array lists the actual conflicted paths from `git status --porcelain`, not a hardcoded value:

```json
{
  "command": "mission.reconcile",
  "status": "ok",
  "data": {
    "missionId": "warpgogol-com-m000019",
    "systemId": "warpgogol-com",
    "commitSha": "abc123def",
    "preReconcileSha": "def789abc",
    "reconciledAt": "2026-07-29T14:40:28.512Z",
    "autoResolvedPaths": ["bordbuch/events.ndjson"]
  },
  "summary": "[mission.reconcile] warpgogol-com-m000019 reconciled (abc123de, 3 commits merged, 1 bordbuch conflict auto-resolved)"
}
```

When no bordbuch conflicts occur, `autoResolvedPaths` is absent from `data` and the summary has no auto-resolve suffix. The `reconciliation-report.json` evidence file also includes `autoResolvedPaths` for auditability.

### Failure modes

- **Bordbuch-only conflicts (auto-resolved):** When all conflicted paths are under `bordbuch/`, the command auto-resolves with `--ours` and completes the merge. The result includes `autoResolvedPaths`.
- **Non-bordbuch conflicts (hard failure):** When any conflicted path is outside `bordbuch/`, the command aborts the merge (`git merge --abort`) and throws the existing error message. The operator must resolve the conflict in the workpiece.
- **Mixed bordbuch + non-bordbuch conflicts (hard failure):** Same as non-bordbuch — the command does not partially auto-resolve. All conflicts must be resolved manually.
- **Auto-resolution failure:** If `git checkout --ours bordbuch/` or `git add bordbuch/` or `git commit --no-edit` fails during auto-resolution, the command aborts the merge (`git merge --abort`) and throws with a message to inspect the cache clone state. The cache clone is left in a clean (non-conflicted) state if abort succeeds.
- **Merge abort failure:** If `git merge --abort` fails (in either the non-bordbuch or auto-resolution failure path), the command throws with a message to manually inspect the cache clone state.

## Rollout

- **Default behavior:** Auto-resolution is active immediately upon implementation. No flag, no opt-in — the delete-modify bordbuch conflict is an expected consequence of the architecture, not an operator error.
- **Existing apps:** All sites with bordbuch in the cache clone will benefit from auto-resolution. No changes needed.
- **Pipeline integration:** `mission.reconcile` remains in the mission lifecycle pipeline. Auto-resolution is transparent — the operator sees a log message `Auto-resolved bordbuch/ conflict (kept cache clone version)`.
- **No migration needed:** The fix is backward-compatible — it only adds auto-resolution for a conflict that previously caused a hard failure.

## Alternatives considered

1. **`.gitattributes` with `merge=ours` for `bordbuch/` in the cache clone.** Rejected because it changes git's merge strategy globally for the cache clone, making it less explicit. The auto-resolution is visible in the reconcile command's code and logs, while `.gitattributes` is a hidden git config that agents may not discover.

2. **Preventive `git merge --no-commit` + `git checkout --ours bordbuch/` before conflict.** Rejected because it adds complexity to the happy path (no-conflict merges) and requires an extra commit step. The reactive approach (try merge, catch conflict, auto-resolve) is simpler and only activates when needed.

3. **Generalize to all cache-clone-only paths.** Rejected because `bordbuch/` is the only known cache-clone-only path that causes delete-modify conflicts. Other paths (e.g. `system.pin.json`) are data paths present in the workpiece. Generalizing without a clear use case is premature.

## Risks

- **Silent conflict resolution:** Auto-resolving bordbuch conflicts means the operator is not forced to acknowledge the conflict. The log message and `autoResolvedPaths` field mitigate this — the operator can see what was resolved.
- **Future cache-clone-only paths:** If a new cache-clone-only path is introduced (e.g. a lock file, a state directory), it will cause the same delete-modify conflict. This RFC only handles `bordbuch/`. A future RFC can extend the auto-resolution list.
- **Git porcelain parsing:** The conflict detection relies on `git status --porcelain` output parsing. If git changes the porcelain format, the detection may break. The parsing uses standard git porcelain v1 format codes (DU, UD, AA, UU) which are stable.
- **Performance:** Negligible — one additional `git status` call only when `git merge` fails.

## Acceptance criteria

- [x] `mission.reconcile` auto-resolves `bordbuch/` delete-modify conflicts by keeping the cache clone version (evidence: mission-materialization-commands.ts:733-754, rfc-0584-bordbuch-conflict-autoresolve.test.ts test 1)
- [x] `mission.reconcile` fails with existing error when non-bordbuch conflicts occur (evidence: mission-materialization-commands.ts:768-780, rfc-0584-bordbuch-conflict-autoresolve.test.ts test 2)
- [x] `mission.reconcile` aborts merge and fails when mixed bordbuch + non-bordbuch conflicts occur (evidence: mission-materialization-commands.ts:768-780, rfc-0584-bordbuch-conflict-autoresolve.test.ts test 3)
- [x] Reconcile result includes `autoResolvedPaths` field when bordbuch conflicts were auto-resolved (evidence: mission-materialization-commands.ts:895-903, interface at :531)
- [x] Log message `Auto-resolved bordbuch/ conflict (kept cache clone version)` is emitted (evidence: mission-materialization-commands.ts:752-754)
- [x] Unit test covers the bordbuch delete-modify conflict auto-resolution scenario (evidence: rfc-0584-bordbuch-conflict-autoresolve.test.ts test 1)
- [x] Unit test covers the non-bordbuch conflict hard-failure scenario (evidence: rfc-0584-bordbuch-conflict-autoresolve.test.ts test 2)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT extend auto-resolution to paths other than `bordbuch/` without a new RFC.
- Agents MUST NOT use `git checkout --theirs` for bordbuch conflicts — the workpiece does not have bordbuch, so `--theirs` would delete bordbuch entries.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
