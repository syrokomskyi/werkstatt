---
id: RFC-0644
title: "Auto-commit dirty workpiece before mission.reconcile"
status: implemented
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
createdAt: 2026-08-02
updatedAt: 2026-08-02
enhancedAt: 2026-08-02
implementedAt: 2026-08-02
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

During mission `warpgogol-com-m000024`, the workpiece had 9 uncommitted generated files (icons, open-source SBOM, biome.generated.css, manifest) after a `build.prepare` run. The current `mission.reconcile` handler blocks with a descriptive error (`workpiece has N uncommitted file(s). Run mission.git.commit first`), requiring the operator to manually commit before re-running reconcile.

RFC-0580 auto-commits werkstatt-level side-effects (`registry.yaml`, `mission.yaml`, `pnpm-lock.yaml`) from mission lifecycle commands. RFC-0626 auto-commits bordbuch projection files in the cache clone after `build.prepare`. But neither covers the workpiece working tree — a separate git repository that requires its own commit hygiene.

## Problem

`mission.reconcile` currently blocks with a hard error when the workpiece has uncommitted changes (`isWorkpieceDirty` guard at `mission-materialization-commands.ts:893-898`). The error directs the operator to run `mission.git.commit` manually, then re-run reconcile. This creates:

1. **Manual commit burden** — the operator or agent must manually run `mission.git.commit` in the workpiece before running reconcile, then re-run reconcile. This is a two-step workflow for a common case (generated files from `build.prepare` are dirty).
2. **Workflow friction** — the blocking guard prevents reconcile from proceeding until the operator commits. For generated files (icons, SBOM, biome CSS) that are deterministic outputs of `build.prepare`, requiring manual commit adds friction without value — the operator knows these files are safe to commit.
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

A new helper is needed rather than reusing `mission.git.commit` because `mission.git.commit` is a CLI command handler that requires a `KernelCommandInput` and `KernelRuntimeContext` — it is designed for CLI invocation, not for programmatic calls from within `runMissionReconcile`. Additionally, `mission.git.commit` runs pre-commit content validators (RFC-0594) which are unnecessary for auto-generated files and would add latency. The `commitWorkpieceIfDirty` helper is a plain function, consistent with the `commitWerkstattSideEffects` pattern from RFC-0580.

The helper uses `execSync` (or `gitExec` from `bordbuch-io.ts`) to run `git add -A` followed by `git commit --no-verify -m "workpiece: auto-commit before reconcile <missionId>"`. The `--no-verify` flag skips pre-commit hooks because the workpiece is a clone of the cache clone — hooks are not copied by `git clone` unless explicitly configured. If `git status --porcelain` returns empty, the helper returns `{ committed: false, commitSha: null }` without running any git commands.

`git add -A` is used instead of selective staging (as RFC-0580's `commitWerkstattSideEffects` does) because the workpiece is a single-agent ephemeral repo — unlike the shared monorepo working tree where concurrent sessions could introduce foreign changes, the workpiece is only modified by the operator/agent working on the current mission. Selective staging would require maintaining a file list that duplicates `STERNSYSTEM_DATA_PATHS` and is fragile when new generated file types are added.

The call replaces the existing `isWorkpieceDirty` block-and-throw guard at `mission-materialization-commands.ts:893-898`. It goes **after lock acquisition** (lines 843-856: `system:<id>` and `mission:<id>` locks) and **after the validation evidence check** (lines 834-870), but before `git fetch` from the workpiece into the cache clone. This ensures the auto-commit is serialized with other lifecycle commands and only runs for validated missions.

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/<missionId>/workpiece/` | Workpiece git repository — auto-committed before reconcile |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Modified: `runMissionReconcile` replaces `isWorkpieceDirty` guard with `commitWorkpieceIfDirty` call before fetch |
| `packages/os/site-kernel-handoff/AGENTS.md` | Updated: "Reconcile dirty cache clone guard" section updated to document workpiece auto-commit behavior |

### Output format

The existing `MissionReconcileData` interface is extended with two new fields:

```ts
export interface MissionReconcileData {
  missionId: string;
  systemId: string;
  commitSha: string | null;
  preReconcileSha: string | null;
  reconciledAt: string;
  autoResolvedPaths?: string[];
  workpieceAutoCommitted: boolean;
  workpieceCommitSha: string | null;
}
```

The reconcile command output includes the auto-commit result:

```json
{
  "command": "mission.reconcile",
  "status": "ok",
  "data": {
    "missionId": "warpgogol-com-m000024",
    "systemId": "warpgogol-com",
    "commitSha": "9d34a6b5",
    "preReconcileSha": "7c12a3f0",
    "reconciledAt": "2026-08-02T10:00:00.000Z",
    "autoResolvedPaths": ["bordbuch/release.json"],
    "workpieceAutoCommitted": true,
    "workpieceCommitSha": "8d25d61"
  },
  "summary": "[mission.reconcile] warpgogol-com-m000024 reconciled (9d34a6b5, 11 commits merged, 1 bordbuch conflict auto-resolved, workpiece auto-committed 8d25d61)"
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
- **Pre-existing merge conflicts in workpiece**: `git status --porcelain` shows `UU` entries (unmerged paths). `isWorkpieceDirty` detects this as dirty, `git add -A` stages the conflicted files, but `git commit --no-verify` **fails** because the conflicts are not resolved. The helper throws, reconcile aborts. The operator must resolve the conflicts in the workpiece (or abort the merge) before re-running reconcile.
- **Bypass of RFC-0594 pre-commit content validators**: `--no-verify` skips git hooks, and the helper does not invoke `mission.git.commit`'s content validators (`pbp.content.validate`, `semantic.drift.validate`, `faq.validate`). This means content edits in the workpiece bypass validation at auto-commit time. Mitigation: `mission.validate` runs all content validators before reconcile is allowed — the validation gate at lines 834-870 ensures the workpiece has already passed `app.contract.full` before the auto-commit runs. The auto-commit only captures files that have already been validated.

## Rollout

- **Default behavior**: auto-commit is always on. No opt-out flag.
- **Existing missions**: the next `mission.reconcile` call auto-commits any dirty workpiece. No migration needed.
- **New missions**: workpiece is clean after materialization (clone-based, RFC-0568). The first reconcile after `build.prepare` will auto-commit generated files.
- **Pipeline integration**: `mission.reconcile` is a standalone lifecycle command, not part of `build.check` or `build.prepare` pipelines.

## Alternatives considered

1. **Block reconcile on dirty workpiece** — this is the **current behavior** (`isWorkpieceDirty` guard at lines 893-898). Rejected: relies on manual discipline and creates workflow friction for the common case of generated files from `build.prepare`. The operator explicitly chose auto-commit over blocking.

2. **Auto-commit only generated files** — commit only files matching `GENERATOR_OWNERSHIP_MAP` paths, leaving manual edits dirty. Rejected: partial commit creates a confusing state where some changes are committed and others are left behind. The operator explicitly chose `git add -A` (all changes).

3. **Add `commitWorkpieceIfDirty` to other lifecycle commands** (mission.materialize, mission.close). Rejected as non-goal: only `mission.reconcile` fetches from the workpiece and needs a clean tree. Other commands operate on the workpiece in-place and do not transfer state.

## Risks

- **Capturing unfinished manual edits**: `git add -A` commits everything, including work-in-progress content edits the operator may not want committed yet. Mitigation: the commit message clearly identifies it as an auto-commit, and the operator can `git reset --soft HEAD~1` to unstage. The operator explicitly accepted this trade-off.
- **Pre-commit hook bypass**: `--no-verify` skips hooks in the workpiece. This is intentional — workpieces are generated-file-heavy repos where hooks may not be configured, and blocking on a missing hook would prevent reconcile.
- **Agent confusion**: agents may see unexpected commits in the workpiece log. Mitigation: the `workpiece: auto-commit before reconcile` prefix is self-documenting.

## Acceptance criteria

- [x] `commitWorkpieceIfDirty` helper implemented in `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts` (evidence: `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts:286-315`)
- [x] `runMissionReconcile` calls `commitWorkpieceIfDirty` before `git fetch` from workpiece (evidence: `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:900-905`)
- [x] Helper is idempotent — clean workpiece produces no commit (evidence: `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts:290-293`)
- [x] Reconcile output includes `workpieceAutoCommitted` and `workpieceCommitSha` fields (evidence: `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:811-812,1184-1185`)
- [x] Unit test: dirty workpiece → auto-commit created, reconcile proceeds (evidence: `packages/os/site-kernel-handoff/src/mission/rfc-0644-workpiece-auto-commit.test.ts:47-64`)
- [x] Unit test: clean workpiece → no auto-commit, reconcile proceeds (evidence: `packages/os/site-kernel-handoff/src/mission/rfc-0644-workpiece-auto-commit.test.ts:67-75`)
- [x] `mission.validate` passes after implementation (evidence: `pnpm --filter @warpgogol/site-kernel-handoff run test` — 491/491 tests pass)
- [x] `rfc.validate` passes on this file (evidence: `pnpm exec site-kernel run rfc.validate --id RFC-0644 --json` — exit 0, 0 errors, 0 warnings)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove the auto-commit behavior established by this RFC without a new RFC that supersedes it.
- The `commitWorkpieceIfDirty` helper MUST use `--no-verify` to bypass pre-commit hooks in the workpiece. Workpieces are generated-file-heavy clones where hooks may not be configured.
- The helper MUST use `git add -A` (all changes), not selective staging. Partial staging creates a confusing hybrid state.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
