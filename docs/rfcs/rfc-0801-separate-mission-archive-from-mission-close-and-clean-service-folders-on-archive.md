---
id: RFC-0801
title: "Separate mission.archive from mission.close and clean service folders on archive"
status: draft
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-11
updatedAt: 2026-08-11
implementedAt:
closedAt:
supersedes:
  - RFC-0796
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-46
  - DNA-48
  - RFC-0355
  - RFC-0480
  - RFC-0573
  - RFC-0796
  - RFC-0797
satisfies:
  - DNA-46
  - DNA-48
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - mission.close
    - mission.archive
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "mission.close no longer auto-archives; the operator runs mission.archive explicitly after the release pipeline completes"
  - "mission.archive deletes node_modules/, dist/, .astro/, .wrangler/, .cache/, .turbo/ from each workpiece before moving it to missions/archive/<state>/"
  - "The deploy workflow (deploy.md) documents mission.archive as an explicit post-deploy step"
  - "release.prepare succeeds on a freshly closed mission without broken node_modules"
nonGoals:
  - "Does not change the mission lifecycle states (open → closed/aborted)"
  - "Does not remove the --skip-auto-archive flag (kept for backward compatibility but now a no-op)"
  - "Does not change pnpm-workspace.yaml glob patterns"
  - "Does not introduce a new watch-based cleanup daemon"
---

# RFC-0801: Separate mission.archive from mission.close and clean service folders on archive

## Context

RFC-0796 introduced auto-archiving of terminal missions inside `mission.close`. The intent was to prevent stale mission directories from accumulating in `missions/` root. However, the deployment pipeline requires `release.prepare` to run **after** `mission.close` (it checks `state: closed`) but **before** archiving. Auto-archiving moves the workpiece to `missions/archive/closed/`, breaking pnpm symlinks in `node_modules/` (relative paths change with the deeper directory nesting). This causes `release.prepare` to fail with `Cannot find module ... astro/bin/astro.mjs` and `WORKPIECE-IMPORTS-01` errors.

The operator must use `--skip-auto-archive` to prevent this, but the flag was not registered in the active command schema (`mission.module.ts`), making it inaccessible from the CLI. Even with the flag, the workflow is fragile: the operator must remember the flag every time.

Additionally, archived workpieces retain `node_modules/`, `dist/`, `.astro/`, `.wrangler/`, `.cache/`, and `.turbo/` directories. These contain broken symlinks and stale build artifacts that waste disk space and serve no purpose in the archive.

## Problem

### Auto-archive breaks release.prepare

`mission.close` calls `mission.archive --status=closed` after completing all close steps. `mission.archive` uses `fs.rename` to move the mission directory from `missions/<id>/` to `missions/archive/closed/<id>/`. This changes the relative path depth by two levels (`missions/` → `missions/archive/closed/`). pnpm creates symlinks in `node_modules/` with relative paths like `../../../../node_modules/.pnpm/...` that are correct for the original location but resolve to wrong paths after the move.

`release.prepare` then runs `build.prepare` which includes `workpiece.imports.validate` and `astro build`. Both fail because `node_modules/astro/bin/astro.mjs` is a broken symlink.

### Service folders in archive waste space and cause confusion

Archived workpieces retain `node_modules/` (with broken symlinks), `dist/`, `.astro/`, `.wrangler/`, `.cache/`, and `.turbo/`. These are:
- Regenerated on `mission.materialize` or build — not needed in archive
- Broken after the directory move — symlinks point to wrong paths
- Disk space waste — `node_modules/` alone can be 100+ MB per workpiece

### Flag registration inconsistency

`mission.close` reads `skipAutoArchive` via `flagBoolean(input, "skip-auto-archive")` in `mission-close.ts:185`, but the flag was not registered in `mission.module.ts` (the active command schema). The flag was only registered in `mission/index.ts` (a secondary registration that the CLI does not use). This made `--skip-auto-archive` inaccessible from the CLI, forcing operators to manually move missions back from archive.

## Decision

1. **Remove auto-archive from `mission.close`** — `mission.close` no longer calls `mission.archive`. The operator runs `mission.archive --status=closed` explicitly after the full deployment pipeline completes. This makes the deployment workflow linear and predictable.

2. **Clean service folders in `mission.archive`** — before moving a mission directory to archive, `mission.archive` deletes `node_modules/`, `dist/`, `.astro/`, `.wrangler/`, `.cache/`, and `.turbo/` from the workpiece. This prevents broken symlinks and saves disk space.

3. **Update deployment workflow** — `deploy.md` documents `mission.archive` as an explicit final step after `leitstand.promote`.

4. **Deprecate `--skip-auto-archive` flag** — the flag remains accepted but is a no-op (auto-archive is removed). This preserves backward compatibility for scripts and muscle memory.

5. **Supersede RFC-0796** — this RFC supersedes the auto-archive portion of RFC-0796. The stale-entry detection and cleanup improvements from RFC-0796 remain in effect.

## Architectural fit

- **DNA-46 (Mission lifecycle)**: This RFC refines the lifecycle by making archiving an explicit operator step rather than an automatic side-effect of close. The lifecycle states (open → closed/aborted) are unchanged. Archiving remains a post-terminal-state transition, just no longer automatic.
- **DNA-48 (Release discipline)**: This RFC aligns with release discipline by ensuring the workpiece remains at its original path during `release.prepare`, `leitstand.dev-deploy`, `leitstand.propagate`, and `leitstand.promote`. The release pipeline operates on a stable workpiece location.
- **RFC-0355 (Mission lifecycle and Bordbuch)**: No conflict — `mission.close` still transitions state, writes close-report, syncs evidence, and commits side-effects. Only the auto-archive call is removed.
- **RFC-0480 (Workpiece preservation)**: No conflict — the workpiece is preserved at its original location until the operator explicitly archives it.
- **RFC-0573 (mission.archive command)**: `mission.archive` remains a standalone command. This RFC adds service-folder cleanup to it.
- **RFC-0796 (auto-archive)**: Superseded. The stale-entry detection (validator warning, pre-flight cleanup in `mission.open`, `mission.materialize` guard) remains. Only the auto-archive call from `mission.close` is removed.
- **RFC-0797 (auto-commit dirty workpiece)**: No conflict — `commitWorkpieceIfDirty` runs before the (now removed) auto-archive step.

## Design

### CLI surface

```sh
# 1. Close the mission (no auto-archive)
pnpm exec werkstatt run mission.close --mission warpgogol-com-m000048

# 2. Prepare and deploy the release
pnpm exec werkstatt run release.prepare --site warpgogol-com --mission warpgogol-com-m000048
pnpm exec werkstatt run release.ready --release warpgogol-com-r000022
pnpm exec werkstatt run leitstand.dev-deploy --site warpgogol-com --release warpgogol-com-r000022
pnpm exec werkstatt run leitstand.propagate --release warpgogol-com-r000022
pnpm exec werkstatt run leitstand.promote --release warpgogol-com-r000022

# 3. Archive after successful deployment
pnpm exec werkstatt run mission.archive --status=closed
```

### TypeScript contracts

#### Remove auto-archive from `mission.close`

```ts
// In mission-close.ts:
// - Remove the `skipAutoArchive` flag read (line 185)
// - Remove the auto-archive block (lines 837-872)
// - Remove `CloseReportArchive` interface and `archive` field from `CloseReport`
// - Keep `--skip-auto-archive` as an accepted-but-ignored flag for backward compat
```

#### Add service-folder cleanup to `mission.archive`

```ts
// In archive.ts, before fs.rename in moveMissionDir:

const SERVICE_FOLDERS = [
  "node_modules",
  "dist",
  ".astro",
  ".wrangler",
  ".cache",
  ".turbo",
] as const;

async function cleanServiceFolders(workpieceDir: string): Promise<string[]> {
  const removed: string[] = [];
  for (const folder of SERVICE_FOLDERS) {
    const target = path.join(workpieceDir, folder);
    if (await fileExists(target)) {
      await rm(target, { recursive: true, force: true });
      removed.push(folder);
    }
  }
  return removed;
}
```

### File system responsibilities

| Path | Role |
|---|---|
| `missions/<id>/workpiece/node_modules/` | Deleted by `mission.archive` before move |
| `missions/<id>/workpiece/dist/` | Deleted by `mission.archive` before move |
| `missions/<id>/workpiece/.astro/` | Deleted by `mission.archive` before move |
| `missions/<id>/workpiece/.wrangler/` | Deleted by `mission.archive` before move |
| `missions/<id>/workpiece/.cache/` | Deleted by `mission.archive` before move |
| `missions/<id>/workpiece/.turbo/` | Deleted by `mission.archive` before move |
| `missions/archive/<state>/<id>/` | Destination after cleanup + move |

### Failure modes

- **Service folder cleanup failure**: Non-fatal. If `rm` fails for a specific folder (e.g., permission error), log a warning and continue with the archive move. The folder will be moved as-is.
- **`--skip-auto-archive` on `mission.close`**: Accepted but ignored. Logs a deprecation info message: `--skip-auto-archive is deprecated: mission.close no longer auto-archives (RFC-0801)`.

## Rollout

- **Default behavior**: `mission.close` no longer auto-archives. All operators must run `mission.archive` explicitly after deployment.
- **Existing missions**: Missions already in `missions/archive/closed/` with broken `node_modules` are unaffected — they are already archived. Future archives will clean service folders.
- **Backward compatibility**: `--skip-auto-archive` flag is accepted but ignored on `mission.close`. Scripts using it will not break.
- **Workflow update**: `deploy.md` updated to include `mission.archive --status=closed` as the final step.

## Alternatives considered

1. **Keep auto-archive, fix symlinks after move** — Re-run `pnpm install` in the archived location. Rejected: `pnpm install` is slow (30+ seconds), the archived workpiece is not a workspace member after archiving, and the install would create new symlinks that are still wrong for the archive depth.

2. **Keep auto-archive, make `release.prepare` work from archive** — Fix `workpiece.imports.validate` and `template.deps.drift` to search archive directories (already done as a bug fix). Rejected: This treats the symptom, not the cause. The build still fails because `astro build` cannot find `node_modules/astro/bin/astro.mjs`. Fixing all possible `node_modules` resolution paths is fragile and incomplete.

3. **Keep auto-archive, add `--skip-auto-archive` flag** — The flag existed in code but was not registered in the active schema. Rejected as the primary solution: even with the flag registered, the workflow is fragile because the operator must remember to pass it every time. Auto-archive is the wrong default for a deployment pipeline that requires post-close steps.

## Risks

- **Stale mission directories accumulate** — Without auto-archive, operators may forget to run `mission.archive`. Mitigated by: (a) `mission.validate` stale-entry warning from RFC-0796, (b) `mission.open` pre-flight cleanup from RFC-0796, (c) `deploy.md` documenting archive as an explicit step.
- **Service folder deletion loses cached state** — If a mission needs to be re-activated after archiving, `mission.materialize` regenerates all service folders. No data loss.
- **Behavioral change for existing scripts** — Scripts that relied on auto-archive after `mission.close` will need to add an explicit `mission.archive` call. The `--skip-auto-archive` flag remains accepted to avoid CLI errors.

## Acceptance criteria

- [ ] `mission.close` no longer calls `mission.archive` (auto-archive block removed from `mission-close.ts`)
- [ ] `--skip-auto-archive` flag accepted but ignored on `mission.close` with deprecation info message
- [ ] `mission.archive` deletes `node_modules/`, `dist/`, `.astro/`, `.wrangler/`, `.cache/`, `.turbo/` from workpiece before move
- [ ] `CloseReport.archive` field removed or deprecated
- [ ] `deploy.md` updated with `mission.archive` as explicit post-deploy step
- [ ] Unit test: `mission.close` does not call `mission.archive`
- [ ] Unit test: `mission.archive` removes service folders before move
- [ ] `rfc.validate` passes on this file before merging
- [ ] RFC-0796 superseded by this RFC in frontmatter

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it (RFC-0334).
