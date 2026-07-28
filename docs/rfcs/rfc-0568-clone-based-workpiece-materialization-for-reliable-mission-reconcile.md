---
id: RFC-0568
title: "Clone-based workpiece materialization for reliable mission reconcile"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
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
createdAt: 2026-07-28
updatedAt: 2026-07-28
enhancedAt: 2026-07-28
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0480
  - RFC-0522
amendedBy: []
related:
  - DNA-42
  - DNA-46
  - DNA-47
  - RFC-0356
  - RFC-0389
  - RFC-0480
  - RFC-0517
  - RFC-0522
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-42
  - DNA-46
  - DNA-47
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
    - mission.materialize
    - mission.reconcile
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "mission.reconcile completes without manual patch application after a typical mission"
  - "git log in workpiece shows full site evolution history including previous missions"
  - "Untracked files in cache clone are detected and reported before reconcile attempt"
nonGoals:
  - Does not change mission lifecycle states (open/closed/aborted) — that is RFC-0355
  - Does not change the Bordbuch git synchronization contract (RFC-0477)
  - Does not change the Layer C protection model (RFC-0480)
  - Does not change the git bundle audit trail or mission.cleanup behavior
  - Does not add cache clone drift detection or interactive merge/overlay prompt — `syncCacheClone` already handles cache clone freshness via fetch + reset, and `sternsystem.validate` detects external edits
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

# RFC-0568: Clone-based workpiece materialization for reliable mission reconcile

## Context

RFC-0480 established the mission git workpiece model: `mission.materialize` creates a fresh git repo in the workpiece via `git init`, and `mission.reconcile` transfers commits to the cache clone via `git format-patch` + `git am`. This approach was chosen to keep workpiece history isolated and to transfer only operator edit commits.

In practice, this approach has a fundamental flaw: the workpiece and cache clone have **no shared git objects**. `mission.materialize` runs `git init` (creating a new root commit with no parent), while the cache clone has its own independent history. When `git am` tries to apply patches generated from workpiece commits, it cannot find the blob SHA references needed for 3-way merge (`git am --3way`). This was partially mitigated by RFC-0522, which added a 3-way fallback and auto-resolve for generated files, but the root cause — disconnected git histories — remains.

During the closure of mission `warpgogol-com-m000015`, reconcile failed on patch 0002 because the cache clone had an independent commit (`9c9a0d7` — pin react/react-dom) that modified `package.json` with a different blob SHA than the workpiece's base. `git am --3way` could not build a fake ancestor, and even `git am --reject` required manual intervention for 22 of 24 patches.

Additionally, untracked files in the cache clone (e.g., `.github/workflows/deploy-warpgogol-com.yml`) blocked the dirty cache clone guard, requiring manual cleanup before reconcile could proceed.

## Problem

1. **Disconnected git histories**: `mission.materialize` uses `git init` to create a new repository in the workpiece. The cache clone (`systems/<id>/`) has its own independent git history. `git format-patch` + `git am` cannot reliably transfer commits between repositories with no shared object database. `git am --3way` fails when blob SHA references in patches don't exist in the target repository.

2. **Untracked files block reconcile**: The dirty cache clone guard (RFC-0522) checks for uncommitted changes but does not detect or report untracked files. Untracked files in the cache clone can block `git am` and `git merge` operations, and their origin is not investigated before blocking.

3. **No history visibility in workpiece**: Because the workpiece starts from a root commit with no parent, operators and agents cannot see the site's evolution history in `git log`. This makes it harder to understand what changed between missions and to detect silent regressions in generated files.

4. **Fragile patch-based transfer**: `git format-patch` + `git am` is inherently fragile when the source and target repositories have diverged. Even with RFC-0522's 3-way fallback and auto-resolve, manual intervention is frequently required, especially for generated files that were regenerated at different times.

## Decision

`mission.materialize` clones the cache clone (`systems/<id>/`) instead of running `git init`, creating a shared git object database between workpiece and cache clone. Authored content from the cache clone's data directories is overlaid on top of the cloned state. The materialize commit stages only data paths (`STERNSYSTEM_DATA_PATHS`), keeping platform boilerplate untracked. `mission.reconcile` transfers commits via `git merge --no-ff` instead of `git format-patch` + `git am`, preserving all individual commits and their SHA references. Untracked files in the cache clone are investigated and reported before reconcile, blocking until the operator resolves them.

## Architectural fit

- **DNA-42 (Compass markup contract)**: Tangential. The full clone gives agents access to prior mission commits for context when authoring CHANGE_SUMMARY blocks, but the clone-vs-init change does not enforce, protect, or extend DNA-42 itself. Listed in `satisfies[]` for traceability only.
- **DNA-46 (Mission lifecycle)**: This RFC extends DNA-46 by changing the reconcile mechanism from patch-based transfer to merge-based transfer. The lifecycle states (open/closed/aborted), validation-before-reconcile precondition, and lock semantics are preserved.
- **DNA-47 (Materialization)**: This RFC extends DNA-47 by changing the materialization git initialization from `git init` to `git clone` from the cache clone. The overall pipeline (copy authored content → build.prepare → preflight → git commit) and the `STERNSYSTEM_DATA_PATHS` contract are preserved.
- **RFC-0480 (mission git workpiece)**: This RFC amends RFC-0480 by changing the materialization mechanism from `git init` to `git clone` and the reconcile mechanism from `git format-patch` + `git am` to `git merge --no-ff`. The edits-only-through-missions invariant, Layer C protection, git bundle audit trail, and workpiece preservation model remain unchanged.
- **RFC-0522 (reconcile dirty cache clone guard)**: This RFC amends RFC-0522 by removing the 3-way fallback and auto-resolve mechanisms (no longer needed with shared git objects). The dirty cache clone guard is extended to detect and investigate untracked files, not just modified tracked files.
- **RFC-0356 (mission materialization)**: The materialization flow changes its git initialization step but preserves the overall pipeline: copy authored content → build.prepare → preflight → git commit.
- **RFC-0477 (Bordbuch git synchronization)**: Unchanged. Bordbuch entries are still committed and pushed separately.

The operator model is preserved: operators still use `mission.git.commit` to commit edits, `mission.reconcile` to transfer to cache clone, and `mission.close` to finalize. The change is transparent to the operator except that reconcile no longer fails on divergent histories.

## Design

### Materialization flow (changed)

The `mission.materialize` command changes its git initialization step:

1. **Sync cache clone** (existing): `syncCacheClone` runs first (unchanged from current implementation) — fetches latest from remote and resets to `origin/<branch>`. This ensures the cache clone is up-to-date before cloning.
2. **Clone cache clone** (new): `git clone systems/<id>/ <staging-dir>` — creates a full clone with shared object database. The workpiece inherits all history from the cache clone.
3. **Remove non-data-path files**: Delete files from the clone that are not part of `STERNSYSTEM_DATA_PATHS` and not needed in the workpiece (e.g., `bordbuch/`, `system.pin.json`). These are cache-clone-local files that must not enter the workpiece. The `.gitignore` template (written in step 6) will exclude generated artifacts.
4. **Overlay authored content**: Copy authored files from the cache clone's data directories (`src/content`, `public`, `provenance`, `behavior.snapshot.generated.yaml`) over the cloned working tree, replacing the cloned versions. This is the existing `STERNSYSTEM_DATA_PATHS` copy step — it overwrites data files with the cache clone's current content.
5. **Run build.prepare**: Generate all derived artifacts (surface, sitemap, video/image variants, etc.).
6. **Generate boilerplate**: Write template files (`package.json`, `astro.config.mjs`, `wrangler.jsonc`, `.gitignore`, etc.) and run codegen generators. These files are **not** `git add`-ed — they remain untracked in the workpiece.
7. **Ensure Playwright Chromium**: Auto-install if missing (existing behavior from current implementation).
8. **Run preflight gate**: Content quality checks (RFC-0517).
9. **Git commit (data-only)**: `git add src/content public provenance behavior.snapshot.generated.yaml system.pin.json && git commit -m "materialize from pin <version>"` — creates a materialize commit containing **only data paths** on top of the cloned history. Boilerplate files remain untracked and are excluded from the commit. This ensures that `git merge --no-ff` during reconcile transfers only data-path changes into the cache clone, not platform boilerplate (DNA-44 compliance).

### Reconcile flow (changed)

The `mission.reconcile` command changes its commit transfer mechanism:

1. **Check dirty cache clone** (enhanced): Run `git status --porcelain` in the cache clone. If there are modified tracked files OR untracked files:
   - For untracked files: investigate origin using these decision rules:
     - **`previous-mission`**: file path matches a pattern produced by `mission.materialize` boilerplate generation (e.g., `.github/workflows/deploy-*.yml`, `package.json`, `astro.config.mjs`) AND file creation time (via `stat`) is within a previous mission's time range (cross-reference with Bordbuch entries for `mission.materialize` events).
     - **`direct-commit`**: file does not match boilerplate patterns AND was not created during a known mission time range.
     - **`unknown`**: cannot be determined (e.g., file creation time unavailable, no Bordbuch entries found).
   - Write `evidence/untracked-files-report.json` as an array of `UntrackedFileReport` objects (one per untracked file).
   - Block reconcile with a descriptive error: `"cache clone has N untracked file(s) — resolve before reconcile"`. No `--force` bypass is provided; the operator must `git add` or `rm` the files manually after reviewing the report. This is consistent with RFC-0522's hard refusal pattern.
2. **Fetch workpiece commits**: Determine the workpiece branch dynamically: `workpieceBranch=$(git -C <workpiece-dir> rev-parse --abbrev-ref HEAD)`, then `git fetch <workpiece-dir> ${workpieceBranch}` — fetches workpiece commits into the cache clone's object database. Using the dynamic branch name avoids failure when the cache clone uses `main` instead of `master`.
3. **Merge**: `git merge --no-ff FETCH_HEAD -m "reconcile mission <id>"` — creates a merge commit that preserves all individual workpiece commits and their SHA references. Only data-path files (`src/content`, `public`, `provenance`, `behavior.snapshot.generated.yaml`, `system.pin.json`) are affected because the materialize commit and operator commits only stage data paths. Generated files are gitignored in the workpiece and not tracked in the cache clone, so no generated file conflicts can occur.
4. **Record reconciliation report**: Write `evidence/reconciliation-report.json` with `commitSha` (cache clone HEAD after merge), `preReconcileSha` (cache clone HEAD before merge), `mergeCommitSha`, `transferredCommits`, `message`, and `copiedPaths` (preserved from existing report for non-git fallback).
5. **Push to origin**: `git push origin <branch>` — pushes the merge commit to the remote so the next materialize's `syncCacheClone` preserves reconciled changes. Non-fatal if push fails (next sync will catch up).
6. **Update mission manifest**: Set `reconciledAt` in the mission manifest.

### CLI surface

No new commands. Changed commands:

```sh
# materialize — now clones cache clone instead of git init
pnpm exec site-kernel run mission.materialize --mission <id>

# reconcile — now uses git merge instead of git format-patch + git am
pnpm exec site-kernel run mission.reconcile --mission <id>
```

No new flags for reconcile. Existing flags (`--mission`, `--report-only`, `--skip-preflight`) unchanged. The `--message` flag on reconcile is preserved.

### Output format

Both commands support `--json` output. The JSON shapes match the TypeScript contracts below:

**`mission.materialize --json`**: Returns `MissionMaterializeData` (unchanged shape — `missionId`, `systemId`, `versionComparison`, `migratorChain`, `capabilityDiff`, `regeneration`, `materializedAt`).

**`mission.reconcile --json`**: Returns `ReconciliationReport` (see TypeScript contracts below).

### TypeScript contracts

```ts
// New: untracked file investigation result (one per untracked file)
interface UntrackedFileReport {
  path: string;
  createdAt: string;  // ISO timestamp from stat
  sizeBytes: number;
  likelyOrigin: "previous-mission" | "direct-commit" | "unknown";
  originHint?: string;  // e.g., "matches .github/workflows/ pattern from mission m000014"
}

// evidence/untracked-files-report.json is an array of UntrackedFileReport objects:
// UntrackedFileReport[]

// Changed: reconciliation report (preReconcileSha now used for merge reset, not am abort)
interface ReconciliationReport {
  schemaVersion: "1.0.0";
  missionId: string;
  systemId: string;
  commitSha: string;       // cache clone HEAD after merge
  preReconcileSha: string; // cache clone HEAD before merge
  reconciledAt: string;
  mergeCommitSha: string;  // the --no-ff merge commit SHA
  transferredCommits: number; // count of commits merged from workpiece
  message: string;         // preserved from existing report
  copiedPaths: string[];   // preserved from existing report (non-git fallback)
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems/<id>/.git` | Cache clone git repo — source for workpiece clone, target for reconcile merge |
| `missions/<id>/workpiece/.git` | Workpiece git repo — clone of cache clone, receives authored content overlay |
| `missions/<id>/evidence/reconciliation-report.json` | Written by reconcile with merge metadata |
| `missions/<id>/evidence/untracked-files-report.json` | Written by reconcile when untracked files are detected |
| `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` | Materialize command — git init replaced with git clone |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Reconcile command — git am replaced with git merge |

### Failure modes

1. **Cache clone has no .git directory**: Fallback to `copyDir` (existing behavior for non-git Sternsystems). No clone, no merge — direct file copy.
2. **Untracked files in cache clone during reconcile**: Reconcile blocks with an investigation report (`evidence/untracked-files-report.json`). Operator must `git add` or `rm` the files manually. No `--force` bypass is provided.
3. **Merge conflict during reconcile**: `git merge --no-ff` fails. Reconcile reports the conflict files and blocks. Operator resolves conflicts **in the workpiece** (not the cache clone), commits the resolution via `mission.git.commit`, then re-runs reconcile. Reconcile is idempotent: it resets the cache clone to `preReconcileSha` and re-merges. Resolving in the cache clone risks external-edit detection by `sternsystem.validate` (RFC-0480 Bordbuch-vs-git-log check).
4. **Workpiece has only the materialize commit (no operator edits)**: Reconcile merges the materialize commit, which contains only data-path changes. If the data paths are identical to the cache clone's current state, the merge is effectively a no-op (no file changes). If data paths differ (e.g., `syncCacheClone` updated the cache clone after materialization), the merge applies the data-path delta. Report is written with `transferredCommits: 1` (the materialize commit).

### Idempotency

Reconcile remains idempotent via `preReconcileSha` in the reconciliation report. On re-run:

1. Read previous report's `preReconcileSha`.
2. `git reset --hard <preReconcileSha>` in cache clone (undo previous merge).
3. Re-fetch and re-merge workpiece commits.

This is the same idempotency mechanism as RFC-0480, just using `git reset` to undo a merge instead of `git am --abort`.

## Rollout

- **No migration needed**: All existing missions are closed. No open missions require re-materialization.
- **New missions**: All new missions materialized after implementation automatically use the clone-based flow.
- **Cache clones without .git**: Non-git Sternsystems continue to use the `copyDir` fallback (unchanged).
- **RFC-0480 amendment**: The `git init` → `git clone` and `git am` → `git merge` changes are effective immediately upon RFC acceptance.
- **RFC-0522 amendment**: The 3-way fallback and auto-resolve code paths are removed. The dirty cache clone guard is enhanced with untracked file detection.
- **AGENTS.md update**: The `packages/os/site-kernel-handoff/AGENTS.md` mission reconcile section is updated to reflect the new mechanism.

## Alternatives considered

1. **Shallow clone + unshallow at reconcile**: Materialize creates a `git clone --depth=1` for speed, then `git unshallow` before reconcile. Rejected — adds complexity for marginal speed gain. Full clone is simpler and gives agents access to full history during the mission.

2. **Keep `git init` + fix `git am` with `--reject`**: Apply patches with `git am --reject` and auto-resolve rejected hunks. Rejected — this is the current broken behavior. Reject files require manual intervention for every generated file conflict. Does not solve the root cause (disconnected histories).

3. **`git rebase` instead of `git merge`**: Rebase workpiece commits onto cache clone HEAD for linear history. Rejected — rebase rewrites SHA references, breaking traceability. `git merge --no-ff` preserves original commit SHA references and creates an explicit reconcile point in history.

4. **Auto-delete untracked files in cache clone**: `git clean -fd` before reconcile. Rejected by operator — automatic deletion is dangerous. A previous session may have left untracked files intentionally. Investigation + block is safer.

## Risks

1. **Larger workpiece .git directory**: Full clone includes all history from cache clone. For sites with long mission history, `.git` may grow significantly. Mitigation: git GC runs during `mission.cleanup`. Acceptable trade-off for reliable reconcile.

2. **Merge conflicts during reconcile**: If cache clone and workpiece both modified the same file, `git merge --no-ff` will conflict. Mitigation: this is less likely than with `git am` because the workpiece starts from the cache clone state. Conflicts are surfaced clearly with file names.

3. **Operator confusion from full history**: Operators seeing previous mission commits in `git log` may be confused about which commits are theirs. Mitigation: the materialize commit message clearly marks the boundary. Reconcile merge commit marks the transfer point.

4. **Agent misinterpretation**: Agents may attempt `git am` or `git format-patch` manually. Mitigation: AGENTS.md explicitly states the reconcile mechanism is `git merge --no-ff`.

5. **Untracked file investigation false positives**: The origin analysis for untracked files may incorrectly attribute files. Mitigation: the report includes `likelyOrigin: "unknown"` as a fallback, and the operator makes the final decision.

## Acceptance criteria

- [ ] `mission.materialize` uses `git clone` instead of `git init` for the workpiece git repository
- [ ] `mission.materialize` stages only data paths (`src/content`, `public`, `provenance`, `behavior.snapshot.generated.yaml`, `system.pin.json`) in the materialize commit — boilerplate files remain untracked
- [ ] `mission.reconcile` uses `git merge --no-ff` instead of `git format-patch` + `git am` to transfer commits
- [ ] `mission.reconcile` detects untracked files in cache clone, investigates their origin, writes `evidence/untracked-files-report.json` (array of `UntrackedFileReport`), and blocks until resolved
- [ ] `mission.reconcile` determines workpiece branch dynamically (not hardcoded `master`)
- [ ] `mission.reconcile` pushes merge commit to origin after successful merge
- [ ] Workpiece `git log` shows full site evolution history including previous mission commits
- [ ] `mission.reconcile` is idempotent: re-run resets cache clone to `preReconcileSha` and re-merges
- [ ] `packages/os/site-kernel-handoff/AGENTS.md` updated to reflect clone-based materialization and merge-based reconcile
- [ ] RFC-0480 and RFC-0522 `amendedBy` fields reference this RFC
- [ ] `rfc.validate` passes on this file
- [ ] `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- [ ] `pnpm --filter @warpgogol/site-kernel-handoff test` passes

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT use `git format-patch` or `git am` in `mission.reconcile` — the reconcile mechanism is `git merge --no-ff`.
- Agents MUST NOT use `git init` in `mission.materialize` — the materialization mechanism is `git clone` from the cache clone.
- Agents MUST NOT auto-delete untracked files in the cache clone — the operator must resolve them manually after reviewing the investigation report.
- The `copyDir` fallback for non-git Sternsystems is preserved and MUST NOT be removed.
