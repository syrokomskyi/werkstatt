---
id: RFC-0648
title: "Enforce main branch for Sternsystem repos"
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
  - RFC-0574
  - RFC-0472
  - RFC-0568
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-44
  - DNA-45
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
    - sternsystem.validate
    - sternsystem.status
    - mission.close
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "sternsystem.validate reports 0 violations for branch-convention rule on all systems"
  - "sternsystem.status shows branch: main for all systems"
  - "Existing warpgogol-com cache clone and bare repo renamed from master to main"
nonGoals:
  - "Does not change the monorepo's own branch name — the monorepo is out of scope."
  - "Does not add branch validation to mission workpieces — workpieces are ephemeral clones that inherit the cache clone's branch."
  - "Does not change git config init.defaultBranch globally — enforcement is per-repo, not per-machine."
  - "Does not rename branches on external GitHub mirrors automatically — operators must rename external mirrors manually."
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

# RFC-0648: Enforce main branch for Sternsystem repos

## Context

Git's default branch name is `master` unless the operator explicitly configures `init.defaultBranch` or passes `-b main` to `git init`. When Sternsystem cache clones and bare mirror repos are created (by `sternsystem.register`, manual `git init --bare`, or `git clone`), they inherit Git's default `master` branch.

The existing warpgogol-com Sternsystem uses `master` in both its cache clone (`../systems-cache/warpgogol-com/`) and bare repo (`../systems-git/warpgogol-com/`). The codebase has three places where `"master"` is hardcoded as a fallback branch name:

- `sternsystem-status.ts:124` — fallback when `symbolic-ref HEAD` fails
- `mission-close.ts:301` — same fallback pattern
- `mission-materialize.ts:341,367` — comments referencing `origin/master`

RFC-0568 already made the workpiece branch dynamic (`git rev-parse --abbrev-ref HEAD` instead of hardcoded `"master"`) in `mission.reconcile`, but the fallback defaults in `sternsystem.status` and `mission.close` were not updated.

## Problem

DNA-44 (Sternsystem bundle contract) and DNA-45 (Fleet registry) define the Sternsystem repo topology but do not specify a branch name convention. This creates two risks:

1. **Silent divergence:** If some Sternsystem repos use `master` and others use `main` (e.g., because one was created on a machine with `init.defaultBranch = main`), the hardcoded `"master"` fallback in `sternsystem.status` and `mission.close` will produce incorrect results for `main`-branch repos — it will try to `rev-parse master` instead of `main`, silently failing to read the correct SHA.

2. **No enforcement:** `sternsystem.validate` checks mirror topology (storage types, credential embedding, remote URLs) but does not check the branch name. An operator can create a new Sternsystem with `git init --bare` (which defaults to `master`) and the system will work until a fallback path is hit.

The convention is currently enforced by manual discipline only — there is no automated check.

## Decision

All Sternsystem cache clones (mirrors[0]) and bare mirror repos (mirrors[1]) MUST use `main` as their default branch, not `master`. The `sternsystem.validate` command enforces this with a `branch-convention` validation rule. The hardcoded `"master"` fallback in `sternsystem.status` and `mission.close` is replaced with `"main"`.

## Architectural fit

- **DNA-44 (Sternsystem bundle contract):** This RFC extends the bundle contract with a branch name convention. The Sternsystem repo is a durable, independently versioned data-only bundle — its branch name is part of the repo-level contract that `sternsystem.validate` enforces.
- **DNA-45 (Fleet registry):** The registry declares mirror paths but not branch names. This RFC adds an implicit convention that all declared mirrors must use `main`, enforced by `sternsystem.validate`.
- **RFC-0574 (mirror topology):** Established the star topology (cache clone → bare → external). This RFC adds a branch-name constraint on top of the existing topology rules.
- **RFC-0568 (clone-based materialization):** Made the workpiece branch dynamic. This RFC completes the work by ensuring the source repos (cache clone, bare) also use a consistent branch name, so the dynamic detection always resolves to `main`.
- **Site OS operator model:** `sternsystem.validate` is the existing validation surface for registry invariants. Adding a `branch-convention` rule follows the established pattern of validating mirror topology, pin files, and bundle contracts in the same command.

## Design

### CLI surface

No new commands. The existing `sternsystem.validate` command gains a new validation rule:

```sh
# Validate all systems (including branch-convention rule)
pnpm exec site-kernel run sternsystem.validate --json

# Validate a single system
pnpm exec site-kernel run sternsystem.validate --id warpgogol-com --json
```

The `sternsystem.status` and `mission.close` commands change their internal fallback branch name from `"master"` to `"main"`. No CLI-visible output change — the fallback is an internal implementation detail.

### TypeScript contracts

No new types. The `branch-convention` validation rule produces standard `SternsystemValidateData.violations` entries:

```ts
// New violation rule id: "branch-convention"
// Added to the existing violations array in SternsystemValidateData
{
  systemId: string;
  rule: "branch-convention";
  message: string; // e.g. "cache clone branch is 'master', expected 'main'"
}
```

The fallback change in `sternsystem.status` and `mission.close`:

```ts
// Before:
} catch {
  branch = "master";
}

// After:
} catch {
  branch = "main";
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts` | Add `branch-convention` validation rule |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-status.ts` | Change fallback `"master"` → `"main"` (line ~124) |
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | Change fallback `"master"` → `"main"` (line ~301) |
| `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` | Update comments referencing `origin/master` (lines ~341, ~367) |
| `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` (line ~1002) | Change non-git cache clone fallback `git init` → `git init -b main` |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync-integration.test.ts` | Update test: `git init --bare -b main`, push to `origin main` |
| `packages/os/site-kernel-handoff/src/tests/helpers/materialize-fixture.ts` | Update `gitInit` helper: `git init -b main` |
| All test files with local `gitInit` helpers | Update to `git init -b main` — see list below |
| `packages/os/site-kernel-handoff/AGENTS.md` | Document the `main` branch convention |

### Output format

The `sternsystem.validate --json` output gains violations with `rule: "branch-convention"`:

```json
{
  "command": "sternsystem.validate",
  "data": {
    "validated": 1,
    "violations": [
      {
        "systemId": "warpgogol-com",
        "rule": "branch-convention",
        "message": "cache clone branch is 'master', expected 'main' — run: git -C <cache-path> branch -m master main"
      }
    ],
    "warnings": []
  },
  "exitCode": 1
}
```

### Failure modes

- **Cache clone has no `.git` directory:** Skip branch check (no git repo to inspect). This is the same skip condition used by the existing bundle-contract check.
- **Bare repo does not exist:** Skip branch check for the bare repo. Report only if the cache clone branch is wrong.
- **`git symbolic-ref HEAD` fails on a repo with commits:** Fall back to `"main"` (changed from `"master"`). This handles the edge case where HEAD is detached.
- **`git symbolic-ref HEAD` fails on a bare repo with no commits:** This is already handled by `sternsystem.sync` which throws "bare repo has no commits — nothing to push". `sternsystem.validate` will skip the branch check if the bare repo has no HEAD ref.
- **Exit code:** `sternsystem.validate` exits 1 if any `branch-convention` violation is found, same as all other violation rules.

## Rollout

- **Default behavior:** Fail-hard from day one. The `branch-convention` rule is a validation rule in `sternsystem.validate`, which already exits 1 on any violation. No grace period — the migration is a one-time `git branch -m master main` per repo.
- **Existing systems (warpgogol-com):** The operator must rename the branch in the cache clone and bare repo before the next `sternsystem.validate` run:
  ```sh
  git -C ../systems-cache/warpgogol-com branch -m master main
  git -C ../systems-git/warpgogol-com symbolic-ref HEAD refs/heads/main
  ```
  The external GitHub mirror (`git@github.com:syrokomskyi/warpgogol-com.git`) must also be renamed via the GitHub UI or `git push origin main && git push origin --delete master`.
- **New systems:** `sternsystem.register` creates the cache clone directory but does not `git init` — the bare repo is created manually by the operator. The AGENTS.md rule will instruct operators to use `git init --bare -b main` when creating bare repos. `mission.materialize` clones from the bare repo, so the cache clone inherits `main` automatically.
- **Pipeline integration:** `sternsystem.validate` is not currently in any build pipeline. It is run manually by the operator. No pipeline changes needed.
- **Test fixtures:** All test helpers that call `git init` must be updated to `git init -b main` to avoid creating `master`-branch repos in tests. The following test files have local `gitInit` helpers that need updating:
  - `tests/helpers/materialize-fixture.ts`
  - `tests/mission-validate-snapshot-auto-regen.test.ts`
  - `tests/mission-materialize-baseline.test.ts`
  - `tests/mission-validate-distribution-reuse.test.ts`
  - `tests/rfc-0614-public-well-known-bordbuch-conflict.test.ts`
  - `tests/werkstatt-commit.test.ts`
  - `tests/mission-build-check-phase.test.ts`
  - `tests/mission-validate-cache-clone-warning.test.ts`
  - `tests/mission-dirty-guard.test.ts`
  - `tests/mission-close-state-file.test.ts`
  - `tests/mission-open-clean-tree.test.ts`
- **Command manifest:** After implementation, run `pnpm exec site-kernel run command.manifest.generate` to update `docs/command-manifest.generated.yaml` with the changed commands (RFC-CMD-02).

## Alternatives considered

- **Global git config `init.defaultBranch main`:** Rejected because it is a local machine setting, not enforceable across all environments (CI runners, new developer machines, containers). The convention must be enforced per-repo by a validation command, not by a global config that may or may not be set.

- **Dynamic branch detection everywhere (no hard convention):** Rejected because the operator explicitly wants a hard convention (`main`, not `master`). Dynamic detection (already used in `mission.reconcile` via `git rev-parse --abbrev-ref HEAD`) works for the happy path but does not prevent `master`-branch repos from being created. The fallback defaults in `sternsystem.status` and `mission.close` would still need to pick a name, and without a convention, the choice is arbitrary.

- **ADR instead of RFC:** Rejected because this change adds a validation rule to `sternsystem.validate` (a Site OS command) and establishes a cross-workspace contract for all Sternsystem repos. Per the fo-idea classification table, changes to Site OS commands require an RFC.

## Risks

- **Migration risk:** The existing warpgogol-com repos use `master`. If the operator renames the branch but forgets to update the external GitHub mirror, `sternsystem.sync` will push to `main` on the bare repo but the external mirror may still expect `master`. Mitigation: the operator must rename branches on all mirrors in the same maintenance window.
- **False positive rate:** Low. The `branch-convention` rule only checks repos that have a `.git` directory and a resolvable HEAD. Empty directories and non-git repos are skipped.
- **Agent misinterpretation risk:** Agents may attempt to rename branches automatically. The AGENTS.md rule must state that branch renaming is a manual operator action, not an automated one — agents MUST NOT run `git branch -m` without explicit operator approval.
- **Performance impact:** Negligible. `git symbolic-ref HEAD` is a fast operation (reads a single file from `.git/`).

## Acceptance criteria

- [x] `sternsystem.validate` includes a `branch-convention` rule that checks cache clone and bare repo branch name is `main` (evidence: `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts:296-350`)
- [x] `sternsystem.status` fallback branch changed from `"master"` to `"main"` (evidence: `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-status.ts:124`)
- [x] `mission.close` fallback branch changed from `"master"` to `"main"` (evidence: `packages/os/site-kernel-handoff/src/mission/mission-close.ts:301`)
- [x] `mission-materialize.ts` comments updated from `origin/master` to `origin/main` (evidence: `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:341,367`)
- [x] Test helpers updated: `gitInit` uses `git init -b main`; `sternsystem-sync-integration.test.ts` uses `git init --bare -b main` and pushes to `origin main`; all 11 local `gitInit` helpers across the test suite updated (evidence: `packages/os/site-kernel-handoff/src/tests/helpers/materialize-fixture.ts:16` + 10 other test files)
- [x] `mission-materialize.ts:1002` non-git cache clone fallback changed to `git init -b main` (evidence: `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:1003`)
- [x] `sternsystem.validate --id warpgogol-com --json` reports 0 `branch-convention` violations after migration (evidence: operator renamed branches — `git -C ../systems-cache/warpgogol-com branch -m master main` + `git -C ../systems-git/warpgogol-com symbolic-ref HEAD refs/heads/main`; `sternsystem.validate --id warpgogol-com --json` reports 0 `branch-convention` violations)
- [x] `AGENTS.md` documents the `main` branch convention for Sternsystem repos (evidence: `packages/os/site-kernel-handoff/AGENTS.md:214-220`)
- [x] `command.manifest.generate` run to update `docs/command-manifest.generated.yaml` (evidence: commit `2b047eeb`)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec site-kernel run rfc.validate --id RFC-0648 --json` — 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT rename git branches automatically. Branch renaming (`git branch -m master main`) is a manual operator action that affects all mirrors simultaneously. Agents MAY recommend the rename commands but MUST NOT execute them without explicit operator approval.
- Agents MUST NOT weaken or remove the `branch-convention` validation rule without a new RFC that supersedes this one.
- When creating new Sternsystem bare repos, operators and agents MUST use `git init --bare -b main` (or `git init -b main` for non-bare repos) to ensure compliance from creation.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
