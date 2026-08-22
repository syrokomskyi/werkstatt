---
id: RFC-0918
title: "Eliminate mission.close rebuild cycle via dist reuse from release.prepare"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-22
updatedAt: 2026-08-22
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0913
amendedBy: []
related:
  - RFC-0913
  - RFC-0635
  - RFC-0593
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - mission.close
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt
successSignals:
  - "mission.close succeeds without --skip-reconcile-check after a single reconcile"
  - "No unreconciled commits from build-generated files during close"
  - "No diverged cache clone history after close"
nonGoals:
  - "Removing inline validate from mission.close entirely"
  - "Changing reconcile logic"
  - "Adding force-push to mirrors automatically"
---

# RFC-0918: Eliminate mission.close rebuild cycle via dist reuse from release.prepare

## Context

During m000085 deployment, `mission.close` entered an infinite cycle:

1. `mission.close` runs `mission.validate` (inline validate, RFC-0593) which executes a full build (`build.prepare` + `build.check` + `astro build` + `build.post`).
2. The build regenerates files (behavior snapshots, PDFs, sitemap, etc.) in the workpiece.
3. `commitWorkpieceIfDirty` auto-commits these generated files (RFC-0797).
4. The new workpiece HEAD no longer matches `workpieceHeadAtReconcile` from the reconciliation report.
5. The reconcile-freshness gate (RFC-0913) detects 1 unreconciled commit and blocks close.
6. Operator runs `mission.reconcile` to transfer the commit to the cache clone.
7. Operator re-runs `mission.close` → goto step 1.

A band-aid fix was committed in 6.92.5: after auto-committing build-generated files, `mission.close` updates `workpieceHeadAtReconcile` in the reconciliation report to the new workpiece HEAD. This breaks the cycle for generated-only commits. However, the root cause remains: `mission.close` rebuilds after reconcile, creating generated files that didn't exist when reconcile ran.

The cycle also caused two secondary problems:
- **Diverged cache clone history**: Multiple reconcile runs with `git reset --hard` to `preReconcileSha` caused the cache clone and bare repo to diverge, requiring manual `git reset --hard origin/main` and force-push.
- **GitHub mirror non-fast-forward**: The diverged history propagated to the GitHub mirror, requiring `git push --force mirror main`.

## Problem

`mission.close` runs a full build via `runInlineValidate` (which calls `runMissionValidate`) **after** reconcile has already been completed. The build creates new generated files → auto-commit → workpiece HEAD moves → freshness gate fails. The band-aid (updating the reconcile report) works for generated-only commits, but:

1. If the build produces files that change content semantics (not just generated artifacts), the freshness gate should still catch them.
2. The build takes 3+ minutes, wasting time when `release.prepare` has already built the same dist.
3. Multiple reconcile runs caused by the cycle can diverge cache clone history, requiring manual force-push to recover.

The root cause is that `mission.close` does not reuse the dist already built by `release.prepare` or a prior `mission.validate`. The distribution-reuse path exists in `mission.validate` (RFC-0635) — it checks `build-input-hash` and skips the build if the hash matches. But `mission.close` calls `runMissionValidate` without ensuring the distribution-reuse path is taken.

## Decision

### 1. `mission.close` reuses distribution dist when build-input-hash matches

Before running `runInlineValidate`, `mission.close` checks if `missions/<id>/distribution/build-input-hash.json` exists and the hash matches the current workpiece state. If it matches, `mission.validate` takes the distribution-reuse path (RFC-0635) and skips the full build — no new generated files, no auto-commit, no freshness gate failure.

If the hash does not match (workpiece changed since `release.prepare`), the full build runs as before. The band-aid fix (updating the reconcile report) remains as a safety net for this path.

### 2. Guard against diverged cache clone history after reconcile

After `mission.reconcile` pushes to origin (bare repo), verify that the cache clone HEAD matches `origin/main`. If they diverge (e.g. from multiple reconcile runs with `git reset --hard`), log a warning with the diverged SHAs. The operator can then manually `git reset --hard origin/main` in the cache clone.

This is a non-blocking diagnostic — it does not auto-fix the divergence, but makes it visible before `mission.close` encounters a non-fast-forward push error.

## Architectural fit

- **RFC-0635** (Distribution reuse): This RFC extends the distribution-reuse path to be effective during `mission.close`'s inline validate. No new mechanism is needed — the existing `build-input-hash` check in `mission.validate` already handles this. The fix is ensuring `mission.close` benefits from it.
- **RFC-0593** (Inline validation gate): `mission.close` runs validation before acquiring locks to avoid holding locks for 2+ minutes. This RFC does not change that ordering — it only ensures the validation reuses dist when available.
- **RFC-0913** (Reconcile-freshness gate): The band-aid fix (updating `workpieceHeadAtReconcile` after auto-commit) remains as a safety net. This RFC addresses the root cause that makes the band-aid necessary.
- **DNA-87** (Mission close reconcile-freshness): This RFC strengthens DNA-87 by ensuring the freshness gate is not triggered by build-generated files in the common case (dist reuse).

## Design

### CLI surface

No new commands. No new flags. The behavior change is internal to `mission.close`.

### TypeScript contracts

```ts
// In mission-close.ts, before runInlineValidate:

// Check if distribution dist can be reused (RFC-0635 path)
const distributionMetaPath = path.join(missionDir, "distribution", "build-input-hash.json");
const distributionDistDir = path.join(missionDir, "distribution", "dist");
// If both exist, mission.validate will check the hash and skip the build
// if it matches. This prevents generated-file auto-commit cycle.
```

No new types needed — the existing `build-input-hash` mechanism in `mission.validate` handles the reuse decision.

### File system responsibilities

| Path | Role |
|---|---|
| `packages/werkstatt/src/mission/mission-close.ts` | Ensure distribution-reuse path is effective during inline validate |
| `packages/werkstatt/src/mission/mission-materialization-commands.ts` | Add post-push divergence check in reconcile |
| `missions/<id>/distribution/build-input-hash.json` | Pre-existing, written by `release.prepare` |

### Failure modes

- **No distribution dist exists**: `mission.close` falls back to full build. Band-aid fix handles auto-commit. No regression.
- **Build-input-hash mismatch**: Full build runs. Band-aid fix handles auto-commit. No regression.
- **Cache clone divergence**: Non-blocking warning logged. Operator must manually resolve. Close is not blocked — the pre-check push in `mission.close` already handles non-fast-forward with a warning.

## Rollout

1. Verify that `mission.close`'s `runInlineValidate` call passes through to `mission.validate` which already has the distribution-reuse path (RFC-0635). No code change may be needed if the path is already effective.
2. If the distribution-reuse path is not effective during close (e.g. because `mission.close` passes flags that bypass it), add logic to check `build-input-hash` before calling `runInlineValidate` and pass `--force=false` explicitly.
3. Add post-push divergence check in `mission.reconcile` after the push-to-origin retry loop.
4. Add a test that verifies `mission.close` succeeds without `--skip-reconcile-check` when distribution dist exists and hash matches.
5. Update `AGENTS.md` to note that `release.prepare` should be run before `mission.close` to enable dist reuse.

## Alternatives considered

- **Remove inline validate from `mission.close` entirely**: Rejected — inline validate catches content regressions and build errors before the mission is closed. Removing it would allow broken content to be archived.
- **Skip auto-commit of build-generated files during close**: Rejected — the auto-commit (RFC-0797) exists because `mission.validate` generates files that need to be committed. Not committing them leaves the workpiece dirty, which blocks reconcile.
- **Use `--skip-reconcile-check` by default during close**: Rejected — this defeats the purpose of the freshness gate (DNA-87). The gate exists to prevent operator commits from being silently lost.
- **Auto-force-push to mirrors when history diverges**: Rejected — force-push is destructive and should require operator intervention. The warning makes divergence visible; the operator decides how to resolve it.

## Risks

- **Stale distribution dist**: If `release.prepare` built dist from an older workpiece state and the workpiece changed since, the hash won't match and a full build will run. No risk of using stale dist.
- **False sense of safety**: The band-aid fix (updating reconcile report) could mask real operator commits that happen to look like generated files. Risk is low — `commitWorkpieceIfDirty` commits all dirty files, and the freshness gate compares HEAD SHAs, not file lists.

## Acceptance criteria

- [ ] `mission.close` succeeds without `--skip-reconcile-check` when `release.prepare` has been run and workpiece is unchanged
- [ ] No unreconciled commit errors from build-generated files during close (with dist reuse)
- [ ] `mission.reconcile` logs a warning when cache clone HEAD diverges from origin after push
- [ ] Band-aid fix (update reconcile report after auto-commit) remains as safety net for full-build path
- [ ] Test verifies dist-reuse path during close
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- The band-aid fix committed in 6.92.5 (updating `workpieceHeadAtReconcile` after auto-commit) MUST NOT be removed — it remains as a safety net for the full-build path.
- Agents MUST NOT add auto-force-push to mirrors. Divergence detection is diagnostic-only.
