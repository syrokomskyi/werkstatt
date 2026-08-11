---
id: RFC-0804
title: "Auto-refresh pnpm-lock.yaml after mission.archive moves"
status: accepted
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
createdAt: 2026-08-11
updatedAt: 2026-08-11
enhancedAt: 2026-08-11
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0801
  - RFC-0573
  - RFC-0580
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
    - mission.archive
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/forge
successSignals:
  - "git status shows no dirty pnpm-lock.yaml after mission.archive"
  - "mission.archive commits pnpm-lock.yaml together with moved directories"
nonGoals:
  - "Does not change pnpm-workspace.yaml glob patterns"
  - "Does not add lockfile refresh to mission.close (only mission.archive)"
  - "Does not introduce a new CLI command"
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

# RFC-0804: Auto-refresh pnpm-lock.yaml after mission.archive moves

## Context

`pnpm-workspace.yaml` includes `missions/*/workpiece` as a workspace glob. This means every active mission workpiece with a `package.json` is registered as a pnpm importer and appears in `pnpm-lock.yaml`.

The mission lifecycle creates a predictable cycle:

1. `mission.materialize` creates `missions/<id>/workpiece/` with a `package.json`, runs `pnpm install` at the workspace root, and commits the updated `pnpm-lock.yaml` (commit message: `werkstatt: mission.materialize <id>`).
2. `mission.close` (RFC-0801) transitions the mission to `closed` but no longer auto-archives. The workpiece stays at `missions/<id>/workpiece/`.
3. `mission.archive` moves `missions/<id>/` to `missions/archive/closed/<id>/`. The glob `missions/*/workpiece` no longer matches the archived path.
4. The next `pnpm install` (e.g., during the next `mission.materialize`) removes the stale importer entry from `pnpm-lock.yaml`, leaving the lockfile dirty.

Step 4 is the root cause: `mission.archive` moves directories on disk but does not run `pnpm install` or commit the lockfile. The lockfile drift accumulates until someone notices and commits it manually — usually as an accidental side-effect of an unrelated `pnpm install` run.

## Problem

`mission.archive` (in `packages/forge/os/mission/handlers/archive.ts`) moves terminal-state mission directories to `missions/archive/<state>/` and cleans service folders (`node_modules/`, `dist/`, `.astro/`, etc.) from the workpiece before the move. However, it does NOT:

1. Run `pnpm install` at the workspace root to refresh `pnpm-lock.yaml` after the workspace structure changes.
2. Commit the updated `pnpm-lock.yaml`.

This leaves `pnpm-lock.yaml` with stale importer entries for archived workpieces. The stale entries are only cleaned up by the next `pnpm install` invocation (typically `mission.materialize` for the next mission), which produces a dirty lockfile that nobody expects or commits.

Observable symptom: `git status` shows `M pnpm-lock.yaml` with hundreds of deleted lines (the archived workpiece's importer block) after every mission archive cycle.

## Decision

`mission.archive` gains two new behaviors after all directory moves are complete:

1. **Lockfile refresh**: runs `pnpm install` at the workspace root to update `pnpm-lock.yaml` after the workspace structure changed.
2. **Git commit**: commits the updated `pnpm-lock.yaml` together with the moved mission directories in a single atomic commit. This is a new responsibility — the current handler only moves directories on disk via `fs.rename` without committing.

The `pnpm install` step is non-fatal: if it fails (e.g., network issues, lockfile conflicts), `mission.archive` logs a warning and proceeds without committing. The operator can run `pnpm install` manually and commit the result.

The MODULE_CONTRACT non-goals in `archive.ts` are updated to allow `node:child_process` (for `execSync`) alongside `node:fs` and `yaml`. No `@warpgogol/*` imports are introduced — `node:child_process` is a Node.js built-in.

## Architectural fit

- **Site OS operator model**: `mission.archive` is a forge command (`packages/forge/os/mission/handlers/archive.ts`). It currently uses `node:fs/promises` (`fs.rename`) for filesystem operations. Adding `execSync` from `node:child_process` is a new import — the MODULE_CONTRACT non-goals are updated to allow it.
- **Forge autonomy**: `os/mission/` is not fully autonomous (forge AGENTS.md: "Other `os/` modules may still use dynamic imports where kernel integration is needed"). Adding `node:child_process` does not violate the autonomy guard — it is a Node.js built-in, not an `@warpgogol/*` package.
- **RFC-0801**: Separated `mission.archive` from `mission.close`. This RFC extends `mission.archive` with lockfile management — a natural complement to the service-folder cleanup that RFC-0801 already added.
- **No new DNA invariant**: This is a bug fix restoring intended behavior (clean repo state after archive). No new architectural contract is established.

## Design

### CLI surface

No CLI surface change. `mission.archive` is invoked as before:

```sh
pnpm exec werkstatt run mission.archive --status=closed
pnpm exec werkstatt run mission.archive --dry-run
```

The lockfile refresh happens automatically as a post-move step. No new flags are added.

### Implementation

After all directory moves are complete (end of `runMissionArchive`, before the return), add:

1. **Skip if dry-run**: If `dryRun` is true, skip the lockfile refresh entirely.
2. **Skip if no moves**: If `moved.length === 0`, skip — no workspace structure changed.
3. **Run `pnpm install`**: Execute `pnpm install` at `workspaceRoot` with a timeout (120s). Non-fatal: catch errors and log a warning.
4. **Commit if lockfile changed**: Check `git status --porcelain pnpm-lock.yaml` at `workspaceRoot`. If dirty, stage `pnpm-lock.yaml` + all changes under `missions/` (using `git add -A` to reliably capture renames) and commit with message: `chore: refresh pnpm-lock.yaml after mission.archive (N moved)`.

```ts
import { execSync } from "node:child_process";

// Post-move lockfile refresh
if (!dryRun && moved.length > 0) {
  try {
    execSync("pnpm install", {
      cwd: workspaceRoot,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000,
    });
    // Check if lockfile changed
    const lockfileStatus = execSync("git status --porcelain pnpm-lock.yaml", {
      cwd: workspaceRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (lockfileStatus) {
      // Stage lockfile + all mission changes (git add -A captures renames reliably)
      execSync("git add -A missions/ pnpm-lock.yaml", {
        cwd: workspaceRoot,
        stdio: ["pipe", "pipe", "pipe"],
      });
      execSync(
        `git commit -m ${JSON.stringify(`chore: refresh pnpm-lock.yaml after mission.archive (${moved.length} moved)`)}`,
        { cwd: workspaceRoot, stdio: ["pipe", "pipe", "pipe"] },
      );
      logger.info(`  Committed pnpm-lock.yaml refresh (${moved.length} missions archived)`);
    }
  } catch (installErr) {
    logger.warn(
      `  pnpm install failed after archive — lockfile may be stale. Run 'pnpm install' manually: ${installErr instanceof Error ? installErr.message : String(installErr)}`,
    );
  }
}
```

Note: `git add -A missions/` is used instead of staging individual `m.from`/`m.to` paths because `fs.rename` has already moved the directories — the source paths no longer exist on disk. `git add -A` reliably captures both sides of the rename.

### File system responsibilities

| Path                             | Role                                                          |
| -------------------------------- | ------------------------------------------------------------- |
| `pnpm-lock.yaml`                 | Refreshed by `pnpm install`, committed if changed             |
| `missions/<id>/`                 | Moved to `missions/archive/<state>/<id>/` (existing behavior) |
| `missions/archive/<state>/<id>/` | Destination of moved directories (existing behavior)          |

### Failure modes

- **`pnpm install` fails**: Non-fatal. Log a warning advising the operator to run `pnpm install` manually. The directory moves are still on disk (uncommitted). The operator commits manually after resolving the install issue.
- **`git commit` fails** (nothing to commit): Non-fatal. The lockfile may not have changed (e.g., archived workpiece had no unique dependencies). Silently skip.
- **Partial archive** (some moves skipped, some succeeded): The lockfile refresh runs if at least one move succeeded (`moved.length > 0`). Skipped moves don't affect the lockfile.

## Rollout

- **Default behavior**: The lockfile refresh is always active (no opt-in flag). This is a bug fix, not a feature.
- **Existing repos**: No migration needed. The first `mission.archive` invocation after implementation will refresh the lockfile automatically.
- **New workshops**: Automatically compliant from day one.
- **Pipeline integration**: `mission.archive` is a standalone command, not part of a pipeline. No pipeline changes needed.

## Alternatives considered

1. **Remove `missions/*/workpiece` from `pnpm-workspace.yaml`**: Rejected. The glob is needed so `pnpm install` links `@warpgogol/*` symlinks into the workpiece during `mission.materialize`. Removing it would break the materialize flow.

2. **Run `pnpm install` in `mission.close` instead**: Rejected. `mission.close` (RFC-0801) no longer archives. The workpiece stays at `missions/<id>/workpiece/` after close — the glob still matches, so the lockfile is still correct. The lockfile only becomes stale after `mission.archive` moves the directory.

3. **Add a separate `mission.lockfile.refresh` command**: Rejected. This would require the operator to remember an extra step. The lockfile refresh should be automatic, part of the archive operation that causes the drift.

4. **Change glob to `missions/**/workpiece`**: Rejected. This would include archived workpieces in the pnpm workspace. Archived workpieces have no `node_modules/` (cleaned by RFC-0801) and would cause pnpm resolution errors.

## Risks

- **`pnpm install` latency**: Adds ~10-30s to `mission.archive` execution. Acceptable since archive is a manual, infrequent operation.
- **Commit scope**: The auto-commit includes moved directories + lockfile. If the operator expected to review moves before committing, they can use `--dry-run` first (existing behavior).
- **Forge autonomy guard**: `mission.archive` is in `packages/forge`. Adding `execSync("pnpm install")` and `execSync("git ...")` does not import any `@warpgogol/*` packages — it uses `node:child_process` directly. No autonomy guard violation.
- **Concurrent execution**: Two simultaneous `mission.archive` invocations would both run `pnpm install` concurrently, potentially corrupting `pnpm-lock.yaml`. The existing lock mechanism does not cover archive operations. This risk is acceptable — `mission.archive` is a manual, infrequent command and concurrent invocations are unlikely. If needed, a lock can be added in a future RFC.
- **`pnpm install` side effects**: `pnpm install` may modify `node_modules/` symlinks across the entire workspace, not just `pnpm-lock.yaml`. If the archived workpiece had unique dependencies not present in any other workspace package, `pnpm install` might remove packages from the shared store. This is benign — the dependencies are no longer needed.

## Acceptance criteria

- [ ] `mission.archive` runs `pnpm install` at workspace root after all directory moves
- [ ] `pnpm install` step is non-fatal (warning on failure, archive proceeds)
- [ ] If `pnpm-lock.yaml` changed, it is committed together with moved directories
- [ ] Dry-run mode skips the lockfile refresh entirely
- [ ] No-moves case skips the lockfile refresh (no workspace structure changed)
- [ ] Unit test: verify `pnpm install` is called after moves (mock `execSync`)
- [ ] Unit test: verify lockfile commit when `pnpm-lock.yaml` is dirty after install
- [ ] Unit test: verify non-fatal behavior when `pnpm install` fails
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST update the MODULE_CONTRACT non-goals in `archive.ts` to allow `node:child_process` alongside `node:fs` and `yaml`.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
