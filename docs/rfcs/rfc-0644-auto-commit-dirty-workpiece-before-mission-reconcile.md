---
id: RFC-0644
title: "Auto-commit dirty workpiece before mission.reconcile"
status: draft
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
reviewers: []
createdAt: 2026-08-02
updatedAt: 2026-08-02
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0580
  - RFC-0568
  - RFC-0626
  - RFC-0477
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
  - DNA-51
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
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "mission.reconcile completes without manual git commit in the workpiece, even when generated files were modified by prior build.prepare or codegen runs."
  - "After mission.reconcile, the workpiece git log contains an auto-commit entry with message prefix 'workpiece: auto-commit before reconcile' if and only if the workpiece was dirty."
  - "mission.reconcile with a clean workpiece does not create a commit (idempotent skip)."
nonGoals:
  - "Do not auto-commit the cache clone — RFC-0580 and RFC-0626 cover werkstatt-level and bordbuch auto-commit respectively."
  - "Do not auto-commit workpiece changes from other lifecycle commands (mission.materialize, mission.close) — only mission.reconcile fetches from the workpiece and needs a clean tree."
  - "Do not add a --skip-auto-commit flag — if the operator has unfinished manual edits, they should commit or stash before running reconcile."
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

# RFC-0644: Auto-commit dirty workpiece before mission.reconcile

## Context

Mission workpieces (`missions/<missionId>/workpiece/`) are separate git repositories cloned from the Sternsystem cache clone (RFC-0568). `mission.reconcile` fetches commits from the workpiece into the cache clone via `git fetch` + `git merge`. Git fetch only transfers committed objects — uncommitted changes in the workpiece working tree are invisible to the fetch and remain behind.

During mission `warpgogol-com-m000024`, the workpiece had 9 uncommitted generated files (icons, open-source SBOM, biome.generated.css, manifest) after a `build.prepare` run. `mission.reconcile` would have silently merged the stale HEAD without these changes, causing them to be lost or require manual recovery.

RFC-0580 auto-commits werkstatt-level side-effects (`registry.yaml`, `mission.yaml`, `pnpm-lock.yaml`) from mission lifecycle commands. RFC-0626 auto-commits bordbuch projection files in the cache clone after `build.prepare`. But neither covers the workpiece working tree — a separate git repository that requires its own commit hygiene.

## Problem

`mission.reconcile` relies on manual discipline to ensure the workpiece working tree is clean before reconcile. This creates:

1. **Silent data loss** — uncommitted generated files (icons, SBOM, biome CSS, manifest) are invisible to `git fetch` and are left behind in the workpiece after reconcile. The cache clone receives the stale HEAD without the latest generated artifacts.
2. **Manual commit burden** — the operator or agent must manually `git add -A && git commit` in the workpiece before running reconcile, with no enforcement or reminder.
3. **Inconsistency with RFC-0580** — werkstatt-level side-effects and bordbuch projections are auto-committed, but workpiece generated files are not, creating an asymmetry in lifecycle hygiene.

DNA-46 (Mission lifecycle) requires reliable state transitions. DNA-51 (Werkstatt consistency primitives) requires automated primitives for state mutations. The absence of auto-commit for the workpiece working tree is a gap in both invariants.

## Decision

`mission.reconcile` auto-commits all uncommitted changes in the workpiece git repository (`git add -A && git commit`) before starting the fetch+merge into the cache clone. The commit message follows the format `workpiece: auto-commit before reconcile <missionId>`. The auto-commit is idempotent — if the workpiece working tree is clean, no commit is created.

## Architectural fit

- **DNA-46 (Mission lifecycle)** — reconcile is a lifecycle transition that must reliably transfer all workpiece state to the cache clone. Auto-commit ensures no workpiece changes are left behind.
- **DNA-51 (Werkstatt consistency primitives)** — extends the auto-commit pattern established by RFC-0580 (werkstatt side-effects) and RFC-0626 (bordbuch projections) to cover the workpiece git repository.
- **RFC-0580** — established the `commitWerkstattSideEffects` helper pattern. This RFC applies the same pattern to the workpiece, a separate git repo.
- **RFC-0568** — clone-based materialization creates the workpiece as a git clone. Auto-commit ensures the clone's working tree is clean before fetch.
- **RFC-0626** — auto-commits bordbuch projections in the cache clone after `build.prepare`. This RFC covers the workpiece side — generated files produced by `build.prepare` in the workpiece are committed before reconcile transfers them.

## Design

### CLI surface

No new CLI commands. The change is internal to the existing `mission.reconcile` handler:

```sh
pnpm exec site-kernel run mission.reconcile --mission <missionId>
```

The handler now auto-commits the workpiece before proceeding with fetch+merge.

### TypeScript contracts

```ts
/**
 * Commits all uncommitted changes in the workpiece git repository.
 * Idempotent: skips commit if the working tree is clean.
 * Throws on git commit failure (e.g. pre-commit hook block).
 *
 * @param workpieceDir - path to missions/<missionId>/workpiece/
 * @param missionId - mission id for commit message
 * @returns { committed: boolean; commitSha: string | null }
 */
async function commitWorkpieceIfDirty(
  workpieceDir: string,
  missionId: string,
): Promise<{ committed: boolean; commitSha: string | null }>;
```

The helper uses `execSync` (or `gitExec` from `bordbuch-io.ts`) to run `git add -A` followed by `git commit --no-verify -m "workpiece: auto-commit before reconcile <missionId>"`. The `--no-verify` flag skips pre-commit hooks because the workpiece is a generated-file-heavy repo where hooks may not be configured. If `git status --porcelain` returns empty, the helper returns `{ committed: false, commitSha: null }` without running any git commands.

The call goes at the beginning of `runMissionReconcile`, before `git fetch` from the workpiece into the cache clone.

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/<missionId>/workpiece/` | Workpiece git repository — auto-committed before reconcile |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Modified: `runMissionReconcile` calls `commitWorkpieceIfDirty` before fetch |

### Output format

The reconcile command output includes the auto-commit result:

```json
{
  "command": "mission.reconcile",
  "status": "ok",
  "data": {
    "cacheCloneHead": "9d34a6b5",
    "commitsMerged": 11,
    "bordbuchConflictsAutoResolved": 3,
    "workpieceAutoCommitted": true,
    "workpieceCommitSha": "8d25d61"
  },
  "summary": "[mission.reconcile] <missionId> reconciled (9d34a6b5, 11 commits merged, 3 bordbuch conflicts auto-resolved, workpiece auto-committed 8d25d61)"
}
```

When the workpiece was clean:

```json
{
  "workpieceAutoCommitted": false,
  "workpieceCommitSha": null
}
```

### Failure modes

- **Git commit failure** (e.g. disk full, permissions): the helper throws, reconcile aborts with a descriptive error. The operator must resolve the git issue manually.
- **Workpiece directory missing**: the helper throws `ENOENT`, reconcile aborts. This indicates a corrupted mission state.
- **Pre-existing merge conflicts in workpiece**: `git commit` fails because there is no merge in progress. The helper detects this via `git status --porcelain` and skips the commit, letting reconcile proceed (the fetch will handle the state).

## Rollout

- **Default behavior**: auto-commit is always on. No opt-out flag.
- **Existing missions**: the next `mission.reconcile` call auto-commits any dirty workpiece. No migration needed.
- **New missions**: workpiece is clean after materialization (clone-based, RFC-0568). The first reconcile after `build.prepare` will auto-commit generated files.
- **Pipeline integration**: `mission.reconcile` is a standalone lifecycle command, not part of `build.check` or `build.prepare` pipelines.

## Alternatives considered

1. **Block reconcile on dirty workpiece** — refuse to proceed with an error message directing the operator to commit manually. Rejected: relies on manual discipline, the same class of problem this RFC eliminates. The operator explicitly chose auto-commit over blocking.

2. **Auto-commit only generated files** — commit only files matching `GENERATOR_OWNERSHIP_MAP` paths, leaving manual edits dirty. Rejected: partial commit creates a confusing state where some changes are committed and others are left behind. The operator explicitly chose `git add -A` (all changes).

3. **Add `commitWorkpieceIfDirty` to other lifecycle commands** (mission.materialize, mission.close). Rejected as non-goal: only `mission.reconcile` fetches from the workpiece and needs a clean tree. Other commands operate on the workpiece in-place and do not transfer state.

## Risks

- **Capturing unfinished manual edits**: `git add -A` commits everything, including work-in-progress content edits the operator may not want committed yet. Mitigation: the commit message clearly identifies it as an auto-commit, and the operator can `git reset --soft HEAD~1` to unstage. The operator explicitly accepted this trade-off.
- **Pre-commit hook bypass**: `--no-verify` skips hooks in the workpiece. This is intentional — workpieces are generated-file-heavy repos where hooks may not be configured, and blocking on a missing hook would prevent reconcile.
- **Agent confusion**: agents may see unexpected commits in the workpiece log. Mitigation: the `workpiece: auto-commit before reconcile` prefix is self-documenting.

## Acceptance criteria

- [ ] `commitWorkpieceIfDirty` helper implemented in `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts`
- [ ] `runMissionReconcile` calls `commitWorkpieceIfDirty` before `git fetch` from workpiece
- [ ] Helper is idempotent — clean workpiece produces no commit
- [ ] Reconcile output includes `workpieceAutoCommitted` and `workpieceCommitSha` fields
- [ ] Unit test: dirty workpiece → auto-commit created, reconcile proceeds
- [ ] Unit test: clean workpiece → no auto-commit, reconcile proceeds
- [ ] `mission.validate` passes after implementation
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove the auto-commit behavior established by this RFC without a new RFC that supersedes it.
- The `commitWorkpieceIfDirty` helper MUST use `--no-verify` to bypass pre-commit hooks in the workpiece. Workpieces are generated-file-heavy clones where hooks may not be configured.
- The helper MUST use `git add -A` (all changes), not selective staging. Partial staging creates a confusing hybrid state.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
