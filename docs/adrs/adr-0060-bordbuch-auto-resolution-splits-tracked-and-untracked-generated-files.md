---
id: ADR-0060
title: "Bordbuch auto-resolution splits tracked and untracked generated files"
status: proposed
scope: package
decider: architecture
createdAt: 2026-08-22
updatedAt: 2026-08-22
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0913
  - RFC-0918
reviewers: []
---

# ADR-0060: Bordbuch auto-resolution splits tracked and untracked generated files

## Context

During m000085, `mission.reconcile` failed with a `bordbuch/status.generated.yaml` conflict that could not be auto-resolved. The auto-resolution logic in `mission.reconcile` (RFC-0584, RFC-0614) handles delete-modify conflicts on cache-clone-only paths by running `git checkout HEAD -- <path>` to keep the cache clone version. However, `bordbuch/status.generated.yaml` is listed in `CACHE_CLONE_GENERATED_PATTERNS` (in `cache-clone-gitignore.ts`) — it is gitignored in the cache clone and not present in HEAD. Running `git checkout HEAD -- bordbuch/status.generated.yaml` fails with "pathspec did not match any file(s) known to git", aborting the merge and blocking reconcile.

A fix was committed in 6.92.5: the auto-resolution logic now splits conflicted paths into tracked (use `git checkout HEAD --`) and untracked generated (use `git add` only to clear the conflict marker). The `.gitignore` restoration step later in reconcile untracks them anyway.

## Decision

- Bordbuch auto-resolution in `mission.reconcile` MUST split conflicted paths into two categories before resolving:
  - **Tracked paths**: files that exist in HEAD — resolved with `git checkout HEAD -- <path>` + `git add <path>` (keep cache clone version).
  - **Untracked generated paths**: files matching `CACHE_CLONE_GENERATED_PATTERNS` that are gitignored and not in HEAD — resolved with `git add <path>` only (clear conflict marker without checkout).
- The `isGeneratedUntracked` check uses `CACHE_CLONE_GENERATED_PATTERNS` from `cache-clone-gitignore.ts` as the canonical list of untracked generated files.
- The `.gitignore` restoration step (RFC-0913) later in reconcile untracks any generated files that were re-tracked by the merge, so `git add` on untracked generated files is safe — they will be untracked again.

## Justification

- **Root cause**: `git checkout HEAD -- <path>` fails for files not in HEAD. `CACHE_CLONE_GENERATED_PATTERNS` files are gitignored in the cache clone and never committed to HEAD. The old code assumed all conflicted paths existed in HEAD.
- **Minimal fix**: The split is a 10-line change in the existing auto-resolution block. No new functions, no new modules, no architectural changes.
- **Safety**: `git add` on an untracked generated file clears the conflict marker without staging the file (it's gitignored). The subsequent `.gitignore` restoration step (RFC-0913) runs `git rm --cached` on these files anyway.

## Consequences

- **Positive**: `mission.reconcile` no longer fails when bordbuch generated files have delete-modify conflicts. The second reconcile attempt (after a failed first attempt) succeeds without manual intervention.
- **Positive**: The fix is general — any new file added to `CACHE_CLONE_GENERATED_PATTERNS` is automatically handled by the split logic.
- **Negative**: The auto-resolution block is now slightly more complex (two branches instead of one). The complexity is justified by the correctness gain.
- **Technical debt**: The `isGeneratedUntracked` check uses pattern matching (`p.startsWith(pattern.replace(/\.[^.]+$/, ""))`) to handle files without extensions. If future generated files have more complex path structures, the pattern matching may need updating.

## Evolution

- If `CACHE_CLONE_GENERATED_PATTERNS` is replaced by a semantic marker (e.g. `routeType: template` for routes, or a `generated: true` flag for files), the `isGeneratedUntracked` check should be updated to use the semantic marker instead of pattern matching.
- If the auto-resolution logic is extracted to a separate module (e.g. `bordbuch-auto-resolve.ts`), the split logic should move with it.
