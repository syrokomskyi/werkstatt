---
id: RFC-0522
title: "Reconcile dirty cache clone guard, 3-way fallback, and release ID tracking"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-24
updatedAt: 2026-07-24
enhancedAt: 2026-07-24
implementedAt: 2026-07-24
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0480
amendedBy:
  - RFC-0568
  - RFC-0590
related:
  - DNA-46
  - DNA-47
  - DNA-48
  - DNA-51
  - RFC-0480
satisfies:
  - DNA-46
  - DNA-47
  - DNA-48
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - mission.reconcile
    - mission.validate
    - mission.close
    - release.prepare
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-handoff"
successSignals:
  - "mission.reconcile refuses with a clear error listing dirty files when cache clone has uncommitted changes"
  - "mission.reconcile falls back to git am --3way when plain git am fails on a patch, preserving commit metadata"
  - "release.prepare writes releaseId into mission.yaml on success, overwriting any previous value on re-run"
  - "mission.close emits a warning in close-report when releaseId is null"
  - "mission.validate emits a warning when cache clone has uncommitted changes"
  - "Each guard has a unit test with fixture inputs"
nonGoals:
  - "Does not change DNA-51 (cache clone locking invariant) — this RFC adds guard rails on top of the existing invariant"
  - "Does not exclude generated files from patches — generated files remain in the audit trail"
  - "Does not auto-stash or auto-commit dirty cache clone changes — dirty state is a hard refusal"
  - "Does not add new commands — only changes existing mission and release commands"
---

# RFC-0522: Reconcile dirty cache clone guard, 3-way fallback, and release ID tracking

## Context

RFC-0480 introduced `mission.reconcile` using `git format-patch` + `git am` to transfer workpiece commits to the cache clone. The design assumed the cache clone is locked (DNA-51) and clean during the mission. In practice, multiple parallel agents may work in the same repository, leaving uncommitted files in the cache clone. When `mission.reconcile` runs against a dirty cache clone, `git am` fails with cryptic errors ("already exists in index", "patch does not apply") that do not indicate the root cause.

Additionally, `release.prepare` creates a release and returns its ID, but does not write it to the mission manifest. `mission.close` then closes the mission with `releaseId: null`, losing the association between mission and release.

### Incident report

During mission `warpgogol-com-m000010`, the following occurred:

1. Cache clone had 27 uncommitted files from parallel agent work.
2. `mission.reconcile` failed with `git am` errors: "already exists in index" for 11 generated files.
3. Operator stashed the dirty files to proceed — the stash was never restored, losing 27 files of work.
4. After stash, `git am` still failed on the first patch (materialize commit) because generated files existed in both the patch and the working directory.
5. Operator bypassed `git am` entirely with `rsync` + manual commit, losing the per-commit audit trail.
6. `release.prepare` succeeded but `releaseId` was never written to `mission.yaml`.
7. `mission.close` succeeded with `releaseId: null` — no warning was emitted.

## Problem

1. **No dirty cache clone guard:** `mission.reconcile` does not check cache clone state before generating patches. Dirty state produces cryptic `git am` errors instead of a clear refusal.
2. **No 3-way fallback:** `git am` (plain) fails when a patch touches a file that already exists with different content. `git am --3way` can resolve these conflicts using 3-way merge, but the current code does not attempt it.
3. **No release ID tracking:** `release.prepare` does not write `releaseId` to `mission.yaml`. The mission-to-release association is lost.
4. **No close warning for missing release:** `mission.close` silently closes missions with `releaseId: null`.
5. **No validate warning for dirty cache clone:** `mission.validate` passes even when cache clone is dirty, giving false confidence that reconcile will succeed.

## Decision

### 1. Dirty cache clone guard in `mission.reconcile`

Before generating patches, check `git status --porcelain` in the cache clone. If dirty, refuse with a clear error:

```
[mission.reconcile] cache clone for system '<id>' has <N> uncommitted file(s):
  M src/content/system.md
  M src/content/site/de/labels.md
  ...
Resolve uncommitted changes in the cache clone before re-running reconcile.
```

This guard runs **before** `git format-patch` to avoid wasting time generating patches that cannot be applied.

### 2. `git am --3way` fallback

When plain `git am <patch>` fails, automatically retry with `git am --3way <patch>`:

1. Attempt `git am <patch>` (plain).
2. If exit code != 0: `git am --abort`, then `git am --3way <patch>`.
3. If `--3way` also fails: `git am --abort`, throw error with conflict details.

The fallback is automatic — no operator flag or intervention needed. `--3way` preserves commit metadata (author, date, message) identically to plain `git am`.

### 3. `release.prepare` writes `releaseId` to mission manifest

After successful `release.prepare`, write the release ID to `mission.yaml`:

```yaml
releaseId: "warpgogol-com-r000001"
```

On re-run, overwrite the previous value — the last successful `release.prepare` is the active release.

### 4. `mission.close` warning for null `releaseId`

When `mission.close` encounters `releaseId: null`, emit a warning in `evidence/close-report.json`:

```json
{
  "warnings": [
    {
      "rule": "missing-release-id",
      "message": "Mission closed without release — releaseId is null. Run release.prepare before close to associate a release."
    }
  ]
}
```

This is a **warning, not an error** — valid scenarios exist (empty mission, intentional skip).

### 5. `mission.validate` warning for dirty cache clone

Add a check to `mission.validate` that runs `git status --porcelain` in the cache clone. If dirty, emit a warning:

```
[WARN] cache clone for system '<id>' has <N> uncommitted file(s) — reconcile will fail until resolved
```

This is a **warning, not an error** — `mission.validate` may be run to check workpiece state before the cache clone is cleaned up.

## Architectural fit

- **DNA-46 (Mission lifecycle):** These guards strengthen the mission lifecycle by making dirty cache clone state visible at validate time and blocking reconcile with a clear error. The lifecycle flow is unchanged.
- **DNA-47 (Materialization):** `mission.reconcile` is the materialization transfer step. The dirty guard and 3-way fallback make it more robust without changing its contract.
- **DNA-48 (Release discipline):** Writing `releaseId` to the mission manifest strengthens release discipline by making the mission-to-release association explicit and persistent.
- **DNA-51 (Cache clone locking):** This RFC does not change DNA-51. The dirty cache clone guard makes DNA-51 violations visible rather than hiding them in cryptic `git am` errors.
- **RFC-0480 (Mission git workpiece):** This RFC amends RFC-0480 by adding guard rails that were not needed when the design assumed a locked, clean cache clone. The core mechanism (`git format-patch` + `git am`) is preserved — only error handling and preconditions are added.

## Design

### Dirty cache clone guard

Reuse the existing `isWorkpieceDirty` helper from `mission-git-commit.ts:37`. Despite its name, this function is generic — it takes any directory, checks `.git` existence, and runs `git status --porcelain`. It already handles non-git directories gracefully (returns `{ dirty: false }`).

Extend `WorkpieceDirtyResult` to optionally include file names for better error messages:

```ts
export interface WorkpieceDirtyResult {
  dirty: boolean;
  fileCount: number;
  files: string[]; // NEW: file paths for error messages
}

export function isWorkpieceDirty(dir: string): WorkpieceDirtyResult {
  if (!existsSync(path.join(dir, ".git"))) {
    return { dirty: false, fileCount: 0, files: [] };
  }
  let output: string;
  try {
    output = git(dir, "status --porcelain");
  } catch {
    return { dirty: false, fileCount: 0, files: [] };
  }
  const lines = output.split("\n").filter((l) => l.trim().length > 0);
  const files = lines.map((l) => l.slice(3).trim());
  return { dirty: lines.length > 0, fileCount: lines.length, files };
}
```

Called in `runMissionReconcile` **inside the `if (existsSync(gitDir))` block**, before `git format-patch`. The guard only runs for git-backed cache clones — non-git systems use the existing `copyDir` fallback and are not affected:

```ts
// Inside: if (existsSync(gitDir)) {
const dirtyCheck = isWorkpieceDirty(systemDir);
if (dirtyCheck.dirty) {
  throw new Error(
    `[mission.reconcile] cache clone for system '${manifest.systemId}' has ${dirtyCheck.fileCount} uncommitted file(s):\n` +
      dirtyCheck.files.map((f) => `  ${f}`).join("\n") +
      `\nResolve uncommitted changes in the cache clone before re-running reconcile.`
  );
}
// ... proceed to git format-patch
```

### 3-way fallback

In the patch application loop, replace the single `git am` attempt with a two-step try:

```ts
for (const patchFile of patchFiles.sort()) {
  const patchPath = path.join(patchDir, patchFile);
  try {
    execSync(`git am ${JSON.stringify(patchPath)}`, {
      cwd: systemDir,
      stdio: "pipe",
      encoding: "utf-8",
    });
  } catch {
    // Plain am failed — abort and retry with 3-way merge
    try {
      execSync("git am --abort", { cwd: systemDir, stdio: "pipe", encoding: "utf-8" });
    } catch {
      // No am session to abort — continue
    }
    try {
      execSync(`git am --3way ${JSON.stringify(patchPath)}`, {
        cwd: systemDir,
        stdio: "pipe",
        encoding: "utf-8",
      });
      logger.info(`  Applied ${patchFile} via 3-way merge fallback`);
    } catch (err) {
      try {
        execSync("git am --abort", { cwd: systemDir, stdio: "pipe", encoding: "utf-8" });
      } catch {
        // ignore
      }
      throw new Error(
        `[mission.reconcile] git am conflict on patch ${patchFile} (plain and 3-way both failed): ${(err as Error).message}. Resolve conflicts in workpiece and re-run reconcile.`,
      );
    }
  }
}
```

### `release.prepare` writes `releaseId`

In `release-commands.ts`, after successful release preparation, use the existing `readMissionManifest` / `writeMissionManifest` helpers from `mission-io.ts` (which use Zod-validated `missionManifestSchema`) — not raw `YAML.parse` / `YAML.stringify`:

```ts
import { readMissionManifest, writeMissionManifest, resolveMissionDir } from "../mission/mission-io.ts";

// After release directory is finalized:
const missionManifest = await readMissionManifest(workspaceRoot, missionId);
missionManifest.releaseId = releaseId;
await writeMissionManifest(workspaceRoot, missionManifest);
```

### `mission.close` warning and `releaseId` precedence

**Precedence rule:** `mission.close` resolves `releaseId` as follows:

1. If `--release` flag is provided, use it (explicit operator override).
2. If `--release` is not provided, read from `manifest.releaseId` (written by `release.prepare`).
3. If both are null, emit the warning.

In `mission-close.ts`, change the `releaseId` resolution:

```ts
const releaseIdFlag = flagString(input, "release");
const releaseId = releaseIdFlag ?? manifest.releaseId ?? null;
```

Then, after resolving `releaseId`, emit warning if null:

```ts
const warnings: Array<{ rule: string; message: string }> = [];
if (!releaseId) {
  warnings.push({
    rule: "missing-release-id",
    message: "Mission closed without release — releaseId is null. Run release.prepare before close to associate a release.",
  });
}
```

Warnings are written to `evidence/close-report.json` alongside the existing `git`, `mirror`, and `reconcile` blocks.

### `mission.validate` warning

In `mission-materialization-commands.ts` (`runMissionValidate`), add a cache clone dirty check using the same `isWorkpieceDirty` helper. This check runs only if the cache clone is a git repo:

```ts
const systemDir = path.join(workspaceRoot, "systems", manifest.systemId);
if (existsSync(path.join(systemDir, ".git"))) {
  const dirtyCheck = isWorkpieceDirty(systemDir);
  if (dirtyCheck.dirty) {
    logger.warn(
      `[mission.validate] cache clone for system '${manifest.systemId}' has ${dirtyCheck.fileCount} uncommitted file(s) — reconcile will fail until resolved`,
    );
  }
}
```

## TypeScript contracts

```ts
// mission-git-commit.ts — extended return type
export interface WorkpieceDirtyResult {
  dirty: boolean;
  fileCount: number;
  files: string[];
}

// mission-close.ts — extended CloseReport
export interface CloseReport {
  git: CloseReportGit;
  mirror: CloseReportMirror;
  reconcile: CloseReportReconcile;
  warnings: Array<{ rule: string; message: string }>; // NEW
}

// release-commands.ts — no new types; uses existing ReleasePrepareData
// mission-materialization-commands.ts — no new types; uses existing MissionReconcileData
```

## File system responsibilities

| File | Change |
| --- | --- |
| `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts` | Extend `isWorkpieceDirty` to return `files: string[]` |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Add dirty cache clone guard to `runMissionReconcile`; add 3-way fallback to patch loop; add dirty cache clone warning to `runMissionValidate` |
| `packages/os/site-kernel-handoff/src/release/release-commands.ts` | Write `releaseId` to mission manifest via `writeMissionManifest` after successful `release.prepare` |
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | Resolve `releaseId` with flag→manifest precedence; add `warnings[]` to `CloseReport` |
| `packages/os/site-kernel-handoff/src/tests/` | New unit tests for each guard |
| `packages/os/site-kernel-handoff/AGENTS.md` | Document new guard behaviors |
| `docs/verification-plan.xml` | Add `mission.validate` dirty cache clone warning |

## Failure modes

| Failure | Behavior |
| --- | --- |
| Cache clone is dirty at reconcile time | Hard refusal with file list. Operator must commit or stash changes in cache clone. |
| Plain `git am` fails on a patch | Automatic retry with `git am --3way`. If 3-way succeeds, continue to next patch. |
| Both plain and 3-way `git am` fail | `git am --abort` (mandatory), then throw with patch filename and conflict details. Operator resolves in workpiece and re-runs reconcile. |
| `release.prepare` cannot write to mission manifest | Throw — release preparation fails. The release directory is not created. |
| `mission.close` with null `releaseId` | Warning in `close-report.json`. Close proceeds — valid scenarios exist. |
| Cache clone is not a git repo | Guard is skipped (non-git fallback via `copyDir` is used). No error. |

## Implementation notes for agents

- **Reuse `isWorkpieceDirty`** — do not create a separate `isCacheCloneDirty` function. The existing helper in `mission-git-commit.ts` is generic and works on any git directory. Extend its return type to include `files: string[]`.
- **Use `writeMissionManifest`** — when writing `releaseId` to `mission.yaml` in `release.prepare`, use the existing `writeMissionManifest` helper (Zod-validated). Do not use raw `YAML.parse` / `YAML.stringify`.
- **Guard placement** — the dirty cache clone guard in `mission.reconcile` must be placed **inside** the `if (existsSync(gitDir))` block, not before it. Non-git systems use the `copyDir` fallback and must not trigger the guard.
- **`git am --abort` is mandatory** — on both plain and 3-way failure, `git am --abort` must be called before throwing. This cleans up conflict markers and resets the am session. Wrap in try/catch to handle the case where no am session is active.
- **`releaseId` precedence in `mission.close`** — `--release` flag takes precedence if provided; otherwise read from `manifest.releaseId`; if both are null, emit warning. Do not overwrite `manifest.releaseId` with null when the flag is not provided.
- **No auto-stash** — agents MUST NOT auto-stash or auto-commit dirty cache clone changes. Dirty state is a hard refusal (DNA-51 violation).

## Acceptance criteria

- [x] `mission.reconcile` refuses with a clear error listing dirty files when cache clone has uncommitted changes (before generating patches) (evidence: `mission-materialization-commands.ts:488-497` — `isWorkpieceDirty(systemDir)` guard inside `existsSync(gitDir)`)
- [x] `mission.reconcile` falls back to `git am --3way` when plain `git am` fails, logging the fallback (evidence: `mission-materialization-commands.ts:586-598` — abort + `git am --3way` retry with `logger.info`)
- [x] `mission.reconcile` throws a clear error when both plain and 3-way `git am` fail (evidence: `mission-materialization-commands.ts:600-607` — abort + throw with patch filename)
- [x] `release.prepare` writes `releaseId` into `mission.yaml` on success (evidence: `release-commands.ts:231-234` — `writeMissionManifest` after `writeReleaseYaml`)
- [x] `release.prepare` overwrites previous `releaseId` on re-run (evidence: `release-prepare-release-id.test.ts` — "overwrites previous releaseId on re-run" test)
- [x] `mission.close` emits a warning in `close-report.json` when `releaseId` is null (evidence: `mission-close.ts:252-259` — `warnings` array with `missing-release-id` rule)
- [x] `mission.validate` emits a warning when cache clone has uncommitted changes (evidence: `mission-materialization-commands.ts:236-245` — `logger.warn` inside `existsSync(.git)` guard)
- [x] Unit test: dirty cache clone → reconcile refuses with file list (evidence: `reconcile-cache-clone-guard.test.ts` — "isWorkpieceDirty detects dirty cache clone directory" test)
- [x] Unit test: plain `git am` conflict → 3-way fallback succeeds (evidence: `reconcile-3way-fallback.test.ts` — "git am --3way fallback is attempted after plain am fails" test)
- [x] Unit test: both plain and 3-way fail → clear error (evidence: `reconcile-3way-fallback.test.ts` — "both plain and 3way git am fail produces error" test)
- [x] Unit test: `release.prepare` writes `releaseId` to manifest (evidence: `release-prepare-release-id.test.ts` — "writeMissionManifest persists releaseId to mission.yaml" test)
- [x] Unit test: `mission.close` with null `releaseId` → warning in report (evidence: `mission-close-release-id-warning.test.ts` — "null releaseId produces missing-release-id warning" test)
- [x] Unit test: `mission.validate` with dirty cache clone → warning (evidence: `mission-validate-cache-clone-warning.test.ts` — "dirty cache clone is detected by isWorkpieceDirty for validate warning" test)

## Rollout

1. Extend `isWorkpieceDirty` in `mission-git-commit.ts` to return `files: string[]`.
2. Add dirty guard to `mission.reconcile` inside the `if (existsSync(gitDir))` block, before `git format-patch`.
3. Add 3-way fallback to patch application loop.
4. Add `releaseId` write to `release-commands.ts` using `writeMissionManifest`.
5. Add `releaseId` precedence resolution and null warning to `mission-close.ts`.
6. Add dirty cache clone warning to `mission.validate`.
7. Update `packages/os/site-kernel-handoff/AGENTS.md` with the new guard behaviors.
8. Update `docs/verification-plan.xml` with the new `mission.validate` warning.
9. Write unit tests for each guard.
10. Run `pnpm --filter @gogol/site-kernel-handoff build:check` and `pnpm --filter @gogol/site-kernel-handoff test`.

## Alternatives considered

- **Auto-stash dirty cache clone changes.** Rejected: stashing hides the problem and the stash may be forgotten (as happened in the incident). Dirty state is a violation of DNA-51 and should be surfaced, not hidden.
- **Exclude generated files from patches.** Rejected: generated files are part of the audit trail. Excluding them loses commit history for those files. The 3-way fallback handles generated file conflicts without excluding them.
- **`git am --skip` for conflicting patches.** Rejected: skipping patches loses commits and breaks the audit trail. 3-way merge preserves commits while resolving conflicts.
- **`mission.close` blocks on null `releaseId`.** Rejected: valid scenarios exist for closing without a release (empty mission, intentional skip). Warning is sufficient.
- **`mission.validate` blocks on dirty cache clone.** Rejected: validate may be run to check workpiece state before cache clone is cleaned. Warning is sufficient.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| 3-way merge produces conflict markers that operator doesn't notice | Low | `git am --3way` either succeeds cleanly or fails with conflict. On failure, `git am --abort` is mandatory before throwing — it cleans up conflict markers and resets the am session. The abort is wrapped in try/catch to handle the case where no am session is active. |
| `release.prepare` overwrites a releaseId that should be preserved | Low | Last successful `release.prepare` is the active release; previous releases remain in Bordbuch |
| Dirty cache clone guard blocks reconcile when operator expects it to proceed | Medium | Warning at validate time gives early visibility; operator resolves dirty files before reconcile |
| Existing in-flight missions have dirty cache clones when guard is deployed | Low | The guard is additive — it only blocks `mission.reconcile`, not `mission.validate` (which warns). Operators with in-flight missions should clean the cache clone before running reconcile. No migration script is needed. |
