---
id: RFC-0796
title: "Harden mission directory lifecycle against stale symlinks and residual entries"
status: accepted
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-10
updatedAt: 2026-08-10
enhancedAt: 2026-08-10
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-46
  - RFC-0355
  - RFC-0480
  - RFC-0573
  - RFC-0580
satisfies:
  - DNA-46
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - mission.close
    - mission.open
    - mission.validate
    - mission.materialize
    - mission.archive
    - mission.cleanup
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/forge"
successSignals:
  - "mission.close archives the mission directory automatically via mission.archive (non-fatal)"
  - "mission.open removes stale symlinks or residual directories before creating fresh mission directories"
  - "mission.validate warns when stale symlinks or terminal-state directories are found in missions/ root"
  - "mission.materialize pre-flight checks that no workspace glob resolves to a stale package.json"
  - "mission.archive trashes stale symlinks found in missions/ root"
  - "deriveNextMissionNumberSafe and mission.cleanup --older-than skip archive/ and symlinks"
nonGoals:
  - "Does not change the mission lifecycle states (open → closed/aborted)"
  - "Does not remove mission.archive as a standalone command"
  - "Does not change pnpm-workspace.yaml glob patterns"
  - "Does not introduce a new watch-based symlink cleanup daemon"
---

# RFC-0796: Harden mission directory lifecycle against stale symlinks and residual entries

## Context

After `mission.close` or `mission.abort` transitions a mission to a terminal state, the mission directory remains in `missions/`. The operator must run `mission.archive` separately to move it to `missions/archive/<state>/`. If the operator forgets, or if an IDE/file watcher recreates a symlink or cache directory at the old path after archiving, stale entries accumulate in `missions/` root.

These stale entries cause three concrete failures:

1. **`pnpm install` breaks**: `pnpm-workspace.yaml` includes `missions/*/workpiece`. Stale symlinks point to archived missions with outdated `package.json` files (referencing deleted packages like `@warpgogol/agent-gate`). pnpm follows symlinks, finds the stale `package.json`, and fails with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`.

2. **Mission number derivation is wrong**: `deriveNextMissionNumberSafe` in `bordbuch-io.ts` scans `missions/` using `d.isDirectory()`, which returns `true` for symlinks to directories. Stale symlinks inflate the counter or cause ID collisions.

3. **`mission.cleanup --older-than` follows symlinks**: The cleanup scan in `mission-cleanup.ts` uses `entry.isDirectory()`, following symlinks into archived missions and reading their manifests.

Three immediate code guards (already implemented as bug fixes alongside this RFC) make the existing functions resilient:

- **1a**: `deriveNextMissionNumberSafe` now skips `archive/` and symlinks.
- **1b**: `mission.cleanup --older-than` now skips `archive/` and symlinks.
- **1c**: `mission.archive` now detects and trashes stale symlinks in `missions/` root.

This RFC covers the remaining systemic fixes to prevent stale entries from accumulating in the first place and to detect them early.

## Problem

### Stale entries are not cleaned up automatically

`mission.close` (lines 344-552 of `mission-close.ts`) transitions state, writes close-report, syncs evidence, pins platform version, commits side-effects, syncs mirrors, writes materialization state — but never archives the mission directory. The operator must remember to run `mission.archive` separately. In practice, this is frequently skipped, leaving closed missions in `missions/` root indefinitely.

### Stale symlinks are recreated by watchers

`mission.archive` uses `fs.rename` to move the directory. The post-rename cleanup in `moveMissionDir` (archive.ts:92-97) trashes resurrected source paths. However, this cleanup only runs once, immediately after the rename. IDEs or file watchers (e.g., Astro dev server with `.astro/` cache) can recreate symlinks or directories at the source path minutes or hours later. There is no mechanism to detect and clean these stale entries on subsequent operations.

### No early warning system

`mission.validate` runs 30+ validators but none check for stale entries in `missions/` root. A stale symlink can persist for days or weeks until it breaks `pnpm install` during `mission.materialize` or `ecosystem.commit`.

### `mission.materialize` has no pre-flight guard

`mission.materialize` calls `pnpm install` (line 1137 of `mission-materialize.ts`) without checking whether workspace globs resolve to stale `package.json` files. The failure surfaces as a cryptic `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` error deep in the materialization pipeline.

## Decision

The mission lifecycle is hardened with four complementary changes:

1. **`mission.close` auto-archives** — after all close steps complete, `mission.close` calls `mission.archive --status=closed` (non-fatal, like `sternsystem.sync`).
2. **`mission.open` pre-flight cleanup** — before creating mission directories, `mission.open` checks for and removes stale symlinks or residual directories at the target path.
3. **`mission.validate` stale-entry warning** — a new validator warns when stale symlinks or terminal-state directories are found in `missions/` root.
4. **`mission.materialize` pre-flight guard** — before `pnpm install`, verify no workspace glob resolves to a stale `package.json` with references to missing workspace packages.

## Architectural fit

- **DNA-46 (Mission lifecycle)**: This RFC strengthens the lifecycle by ensuring terminal-state missions are archived automatically and stale entries are detected. It does not change the lifecycle states themselves.
- **RFC-0355 (Mission lifecycle and Bordbuch)**: Extends `mission.close` with a non-fatal post-close archive step, consistent with the existing non-fatal `sternsystem.sync` pattern added by RFC-0762.
- **RFC-0480 (Workpiece preservation)**: Auto-archive does not conflict with workpiece preservation — `mission.archive` moves the entire directory (including workpiece) to `missions/archive/closed/`, where `mission.preview` can still resolve it via `resolveMissionDir`.
- **RFC-0573 (mission.archive command)**: This RFC adds auto-invocation of `mission.archive` from `mission.close`, but `mission.archive` remains a standalone command for manual use.
- **RFC-0580 (Auto-commit side-effects)**: The auto-archive step runs after `commitWerkstattSideEffects`, so the mission.yaml commit is not affected by archive timing.

## Design

### CLI surface

No new commands. Existing commands gain internal behavior changes:

```sh
# mission.close now auto-archives after close (no flag needed)
pnpm exec werkstatt run mission.close --mission warpgogol-com-m000046

# mission.open now cleans stale entries before creating directories
pnpm exec werkstatt run mission.open --site warpgogol-com --system warpgogol-com --brief "..."

# mission.validate now warns about stale entries
pnpm exec werkstatt run mission.validate --mission warpgogol-com-m000046

# mission.archive now trashes stale symlinks (already implemented as 1c)
pnpm exec werkstatt run mission.archive
```

### TypeScript contracts

#### 2a: Auto-archive in `mission.close`

```ts
// In mission-close.ts, after .materialization-state.json write, before return:
interface AutoArchiveResult {
  archived: boolean;
  error: string | null;
}

// Added to CloseReport (alongside mirror: CloseReportMirror):
interface CloseReportArchive {
  archived: boolean;
  error: string | null;
}

async function autoArchiveClosedMissions(
  workspaceRoot: string,
  logger: { info: (msg: string) => void; warn: (msg: string) => void },
): Promise<AutoArchiveResult>;
```

The `CloseReport` interface gains an `archive: CloseReportArchive` field, following the same pattern as `mirror: CloseReportMirror` (RFC-0762). The auto-archive result is traceable in `--json` output via `closeReport.archive.archived` and `closeReport.archive.error`.

#### 2b: Pre-flight cleanup in `mission.open`

```ts
// In mission-open.ts, before createMissionDirectories:
interface StaleEntryCheck {
  removedPaths: string[];
  skipped: string[];
}

async function cleanupStaleMissionEntries(
  workspaceRoot: string,
  missionId: string,
): Promise<StaleEntryCheck>;
```

#### 3a: Stale-entry validator in `mission.validate`

```ts
interface StaleEntryViolation {
  path: string;
  kind: "symlink" | "terminal-state-in-root";
  state?: string;
  message: string;
}

async function validateNoStaleMissionEntries(
  workspaceRoot: string,
): Promise<{ warnings: StaleEntryViolation[] }>;
```

#### 3b: Pre-flight guard in `mission.materialize`

```ts
interface WorkspaceGlobCheck {
  stalePackages: string[];
  ok: boolean;
}

async function checkWorkspaceGlobsForStalePackages(
  workspaceRoot: string,
): Promise<WorkspaceGlobCheck>;
```

### Output format

`mission.close --json` gains `closeReport.archive: { archived: boolean; error: string | null }`.

`mission.open --json` gains `staleEntries: { removedPaths: string[]; skipped: string[] }` in the response data.

`mission.validate --json` gains `staleEntryWarnings: StaleEntryViolation[]` in the validation warnings array.

`mission.materialize --json` gains `workspaceGlobCheck: { stalePackages: string[]; ok: boolean }` in the response data.

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/<id>/` | Checked for stale symlinks by mission.open, mission.archive, mission.validate |
| `missions/archive/<state>/<id>/` | Target for auto-archive after mission.close |
| `pnpm-workspace.yaml` | Read by mission.materialize pre-flight guard to resolve globs |
| `missions/<id>/workpiece/package.json` | Checked for references to missing workspace packages |

### Failure modes

| Change | Failure mode | Behavior |
| --- | --- | --- |
| 2a: Auto-archive | `mission.archive` throws | Non-fatal — `logger.warn`, mission is already closed |
| 2a: Auto-archive | `mission.archive` finds no terminal missions | Silent success, no warning |
| 2b: Stale cleanup | Path is not a symlink and not empty | Skip with warning, do not delete real directories |
| 3a: Validate warning | Stale symlink found | Warning (not error), mission.validate still passes |
| 3b: Materialize guard | Stale `package.json` found | Error — abort materialization before `pnpm install` |

## Rollout

- **2a (auto-archive)**: Active by default. No flag needed. `--skip-auto-archive` escape hatch for operators who want to keep the mission directory in `missions/` root after close (e.g., for manual inspection). Non-fatal on failure. **Note:** `mission.archive` scans ALL terminal-state missions in `missions/` root, not just the one being closed. The first `mission.close` after this RFC deploys will archive ALL pending closed missions. This is intentional — it matches the existing `mission.archive` standalone command behavior.
- **2b (stale cleanup at open)**: Active by default. Only removes symlinks and empty directories. Non-empty real directories are skipped with a warning.
- **3a (validate warning)**: Warning only, never fails `mission.validate`. Operators can clean up with `mission.archive` at their convenience. This is a workspace-level advisory check within a mission-scoped command, consistent with existing workspace-level warnings (dirty cache clone, bordbuch consistency).
- **3b (materialize guard)**: Active by default. Errors before `pnpm install` with a clear message pointing to the stale `package.json` and suggesting `mission.archive` as the fix. **Performance:** reads `pnpm-workspace.yaml` (1 file), resolves each glob (typically `missions/*/workpiece` + `packages/*` + `services/*`), reads each matched `package.json` (O(n) where n = workspace package count). For a workshop with 50 workspace packages, this is ~50 file reads — negligible compared to the `pnpm install` it precedes.

### Already implemented (bug fixes alongside this RFC)

- **1a**: `deriveNextMissionNumberSafe` skips `archive/` and symlinks (bordbuch-io.ts).
- **1b**: `mission.cleanup --older-than` skips `archive/` and symlinks (mission-cleanup.ts).
- **1c**: `mission.archive` trashes stale symlinks in `missions/` root (archive.ts).

## Alternatives considered

- **Change `pnpm-workspace.yaml` to exclude symlinks**: pnpm does not support excluding symlinks in workspace globs. This would require changing the glob pattern to `missions/*/workpiece` → something more specific, but pnpm's glob engine does not support negative patterns or symlink filtering.

- **Watch-based symlink cleanup daemon**: A background process that monitors `missions/` for symlink creation and auto-removes them. Rejected as over-engineered — adds a daemon dependency, requires lifecycle management, and the problem is already addressed by the archive-at-close approach.

- **Make `mission.archive` recursive on close**: Instead of calling `mission.archive` from `mission.close`, inline the archive logic. Rejected — `mission.archive` is a standalone command with its own pinned-files protection, dry-run support, and output format. Calling it via `executeKernelCommand` reuses all of that.

- **Remove `missions/*/workpiece` from `pnpm-workspace.yaml`**: This would prevent workpiece dependencies from being linked into the workspace, breaking `mission.materialize` and `mission.preview`. Not viable.

## Risks

- **Auto-archive timing**: If an operator inspects a closed mission's workpiece before auto-archive runs, the directory moves to `missions/archive/closed/` during inspection. Mitigated by: (1) auto-archive runs as the last step of `mission.close`, after all evidence and state files are written; (2) `resolveMissionDir` follows into `missions/archive/`, so `mission.preview` still works after archiving.

- **Stale cleanup false positive**: `mission.open` might remove a directory that the operator intentionally placed in `missions/`. Mitigated by: only removing symlinks and empty directories; non-empty real directories are skipped with a warning.

- **Performance**: Auto-archive adds one `fs.readdir` + state check per mission in `missions/` root. For workshops with many closed missions, this is O(n) but fast (directory read + YAML state field only). The `mission.archive` command already handles this efficiently.

- **Validator false positives (3a)**: The stale-entry validator warns when terminal-state directories exist in `missions/` root. Operators who intentionally keep closed missions in `missions/` root (e.g., for manual inspection) will see warnings on every `mission.validate` run. These warnings are advisory and do not block validation. Operators can suppress them by running `mission.archive` or `--skip-auto-archive` on close.

## Acceptance criteria

- [ ] `mission.close` calls `mission.archive --status=closed` as a non-fatal post-close step
- [ ] `--skip-auto-archive` flag on `mission.close` disables auto-archive
- [ ] `mission.open` removes stale symlinks at the target mission path before creating directories
- [ ] `mission.open` skips non-empty real directories with a warning
- [ ] `mission.validate` warns when stale symlinks or terminal-state directories exist in `missions/` root
- [ ] `mission.materialize` checks workspace globs for stale `package.json` before `pnpm install`
- [ ] `mission.materialize` aborts with a clear error message if stale packages are found
- [ ] `deriveNextMissionNumberSafe` skips `archive/` and symlinks (already implemented)
- [ ] `mission.cleanup --older-than` skips `archive/` and symlinks (already implemented)
- [ ] `mission.archive` trashes stale symlinks in `missions/` root (already implemented)
- [ ] Unit tests for all four new changes (2a, 2b, 3a, 3b) — bug fixes 1a/1b/1c already have tests in `rfc-0796-stale-symlink-guard.test.ts` and `archive.test.ts`
- [ ] `AGENTS.md` updated with auto-archive behavior note

### Compass XML synchronization

No `docs/*.xml` files require synchronization. The mission lifecycle states (open → closed/aborted) are unchanged — auto-archive is a post-close cleanup step, not a lifecycle state change. `docs/requirements.xml` and `docs/development-plan.xml` describe lifecycle states, not post-close directory management.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- The three bug fixes (1a, 1b, 1c) are already implemented as direct bug fixes — they do not require this RFC to be accepted. They are documented here for traceability.
- For 2a (auto-archive): follow the same non-fatal pattern as `sternsystem.sync` in `mission-close.ts` (lines 559-591). Use `executeKernelCommand` to call `mission.archive`.
- For 2b (stale cleanup): use `lstatSync` to detect symlinks (not `statSync`, which follows symlinks). Use `trashPath` from `utils/fs-trash.ts` for deletion.
- For 3a (validate warning): add the check to `mission-materialization-commands.ts` alongside the existing validators. Return warnings, not errors.
- For 3b (materialize guard): read `pnpm-workspace.yaml`, resolve each glob, check each `package.json` for `workspace:*` references to packages that do not exist in the workspace.
