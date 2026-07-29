---
id: RFC-0580
title: "Auto-commit werkstatt side-effects from mission lifecycle commands"
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
createdAt: 2026-07-29
updatedAt: 2026-07-29
enhancedAt: 2026-07-29
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0355
  - RFC-0477
  - RFC-0568
  - RFC-0574
  - RFC-0575
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-45
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
    - mission.open
    - mission.materialize
    - mission.migrate
    - mission.reconcile
    - mission.close
    - mission.abort
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals: []
nonGoals:
  - "Adding commitAndPushBordbuch to mission.migrate and mission.materialize — these handlers append bordbuch entries but do not commit them to the cache clone. This is a pre-existing bordbuch hygiene gap separate from werkstatt auto-commit. Track separately."
  - "Adding bordbuch entry recording to mission.reconcile — reconcile does not call appendBordbuchEntry at all. This is a separate gap in bordbuch audit trail, not a werkstatt commit issue."
  - "Auto-committing werkstatt side-effects from sternsystem.sync — sternsystem.sync may mutate registry.yaml but is not a mission lifecycle command. Track separately if needed."
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

# RFC-0580: Auto-commit werkstatt side-effects from mission lifecycle commands

## Context

Mission lifecycle commands (`mission.open`, `mission.materialize`, `mission.migrate`, `mission.reconcile`, `mission.close`, `mission.abort`) mutate werkstatt-level state files: `systems/registry.yaml` (DNA-45 fleet registry) and `missions/<id>/mission.yaml` (DNA-46 mission manifest). `mission.materialize` additionally mutates `pnpm-lock.yaml` via `pnpm install`.

These commands already commit Bordbuch entries to the Sternsystem cache clone (RFC-0477) via `commitAndPushBordbuch`. However, the werkstatt-level side-effect files (`registry.yaml`, `mission.yaml`, `pnpm-lock.yaml`) are left uncommitted in the monorepo working tree after every lifecycle transition.

This was observed in practice: after `mission.abort` (m000018) + `mission.open` (m000019) + `mission.materialize` (m000019), the monorepo working tree had two dirty files — `systems/registry.yaml` and `pnpm-lock.yaml` — with no automated commit path. RFC-0575 (session-start pre-flight git status guard) then flags the dirty tree, blocking subsequent operations.

## Problem

Werkstatt-level side-effects from mission lifecycle commands rely on manual discipline to commit. This creates:

1. **Dirty working tree after every lifecycle transition** — `registry.yaml` and `mission.yaml` are left uncommitted, blocking RFC-0575 pre-flight guard and `rfc.implement.stamp` (RFC-IMP-04).
2. **Manual commit burden** — the operator or agent must manually `git add` + `git commit` after each lifecycle command, with no convention for commit message format or file scope.
3. **Inconsistency with Bordbuch pattern** — Bordbuch entries are auto-committed to the cache clone (RFC-0477), but werkstatt-level files are not, creating an asymmetry in lifecycle hygiene.

DNA-51 (Werkstatt consistency primitives) requires shared lock, idempotency, and atomic staging primitives for state mutations. The absence of auto-commit for werkstatt side-effects is a gap in this consistency contract.

## Decision

Mission lifecycle commands (`mission.open`, `mission.materialize`, `mission.migrate`, `mission.reconcile`, `mission.close`, `mission.abort`) auto-commit their werkstatt-level side-effect files (`systems/registry.yaml`, `missions/<id>/mission.yaml`, `pnpm-lock.yaml`) to the monorepo working tree via a shared `commitWerkstattSideEffects` helper, using the existing `gitExec` utility (exported from `bordbuch-io.ts` and reused) for git operations, with idempotent skip when no changes are present, and throwing on commit failure.

## Architectural fit

- **DNA-45 (Fleet registry)** — `systems/registry.yaml` is the single source of truth for fleet state. Auto-commit ensures registry mutations from lifecycle commands are persisted, not left as dirty working-tree state.
- **DNA-46 (Mission lifecycle)** — `missions/<id>/mission.yaml` records lifecycle state transitions. Auto-commit ensures manifest writes are durable.
- **DNA-51 (Werkstatt consistency primitives)** — extends the shared-primitives contract to include werkstatt-level git commit hygiene, complementing the existing Bordbuch auto-commit (RFC-0477).
- **RFC-0477** — Bordbuch entries are already auto-committed to the cache clone. This RFC extends the same pattern to werkstatt-level files.
- **RFC-0575** — pre-flight git status guard benefits directly: lifecycle commands no longer leave the working tree dirty.
- **RFC-0568** — clone-based materialization runs `pnpm install` which mutates `pnpm-lock.yaml`; auto-commit covers this side-effect.

## Design

### CLI surface

No new CLI commands. The change is internal to existing lifecycle command handlers:

```sh
pnpm exec site-kernel run mission.open --system <id> --brief "..."
pnpm exec site-kernel run mission.materialize --mission <id>
pnpm exec site-kernel run mission.migrate --mission <id>
pnpm exec site-kernel run mission.reconcile --mission <id>
pnpm exec site-kernel run mission.close --mission <id>
pnpm exec site-kernel run mission.abort --mission <id>
```

Each command now auto-commits its side-effect files before returning.

### TypeScript contracts

```ts
/**
 * Commits werkstatt-level side-effect files to the monorepo working tree.
 * Idempotent: skips commit if no changes are staged.
 * Throws on git commit failure (e.g. pre-commit hook block).
 *
 * @param workspaceRoot - monorepo root directory
 * @param files - specific file paths to stage (not `git add -A`)
 * @param message - commit message, format: `werkstatt: <command> <missionId>`
 */
export async function commitWerkstattSideEffects(
  workspaceRoot: string,
  files: string[],
  message: string,
): Promise<{ committed: boolean; commitSha: string | null }>;
```

The helper uses `gitExec` exported from `bordbuch-io.ts` (the existing private utility, now exported for reuse). This avoids duplicating the git wrapper and keeps a single git utility for all werkstatt-level operations.

Each lifecycle handler calls `commitWerkstattSideEffects` after all werkstatt-level file writes are complete — after `writeRegistry` and `writeMissionManifest`. The call goes at the end of the handler's `try` block, before the `return`. The existing `commitAndPushBordbuch` call (which operates on the cache clone, a separate git repo) is independent and remains in its current position.

```ts
// mission.open example (simplified — actual handler has more steps)
await writeMissionManifest(workspaceRoot, manifest);
await appendBordbuchEntry(workspaceRoot, systemId, "mission-open", brief, actor, { missionId, ... });
await commitAndPushBordbuch(systemDir, `Bordbuch: mission-open ${missionId}`);
entry.currentMission = missionId;
await writeRegistry(workspaceRoot, registry);
// Auto-commit werkstatt side-effects (RFC-0580)
await commitWerkstattSideEffects(
  workspaceRoot,
  [
    path.join("systems", "registry.yaml"),
    path.join("missions", missionId, "mission.yaml"),
  ],
  `werkstatt: mission.open ${missionId}`,
);
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems/registry.yaml` | Staged + committed by `mission.open`, `mission.close`, `mission.abort` |
| `missions/<id>/mission.yaml` | Staged + committed by all 6 lifecycle commands |
| `pnpm-lock.yaml` | Staged + committed by `mission.materialize` (after `pnpm install`) |
| `packages/os/site-kernel-handoff/src/werkstatt/werkstatt-commit.ts` | New helper file |
| `packages/os/site-kernel-handoff/src/werkstatt/index.ts` | Updated to export `commitWerkstattSideEffects` |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` | Export `gitExec` (currently private) for reuse by `werkstatt-commit.ts` |
| `packages/os/site-kernel-handoff/AGENTS.md` | Update Bordbuch git synchronization section to document parallel werkstatt auto-commit pattern |
| `packages/os/site-kernel-handoff/src/mission/mission-open.ts` | Updated to call helper |
| `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` | Updated to call helper |
| `packages/os/site-kernel-handoff/src/mission/mission-migrate.ts` | Updated to call helper |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Updated for `mission.reconcile` |
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | Updated to call helper |
| `packages/os/site-kernel-handoff/src/mission/mission-abort.ts` | Updated to call helper |

### Output format

No change to `--json` output shape. The auto-commit is a side-effect, not a result field. If the commit fails, the command throws and the error message includes the git output.

### Failure modes

| Scenario | Behavior |
| --- | --- |
| No changes to side-effect files | Skip commit silently (idempotent) |
| `git commit` fails (pre-commit hook, auth) | **Throw** — command fails, agent must resolve |
| Conditional `registry.yaml` writes | In `mission.close` and `mission.abort`, `writeRegistry` is only called when `entry.currentMission === missionId`. If the condition is false, `registry.yaml` is not modified. The helper's `git add` on an unchanged file is a no-op (harmless) — the idempotent skip handles this case |
| Foreign uncommitted changes in same files | `git add <specific paths>` stages ALL changes in those files, including foreign ones. Mitigated by DNA-51 locks: lifecycle commands acquire `registry` and `system:<id>` locks, serializing access. Concurrent manual edits to `registry.yaml` or `mission.yaml` while a lifecycle command holds the lock are unlikely but not impossible — the helper does not detect or reject this case |
| Foreign uncommitted changes in other files | `git add <specific paths>` stages only the named files; foreign changes in other files are not touched |
| `git` not available | Throw — command fails with clear error |

The helper stages **only specific file paths** (never `git add -A` or `git add .`), preventing accidental pickup of foreign changes from concurrent sessions.

## Rollout

- **Default behavior**: auto-commit is always on. No opt-in flag, no grace period.
- **Existing apps**: no migration needed — the change is internal to lifecycle command handlers, not app-facing.
- **New apps**: automatically comply from day one.
- **No supersedes**: this RFC extends RFC-0477 (Bordbuch auto-commit) to werkstatt-level files. It does not supersede any existing RFC.
- **Pipeline integration**: no pipeline changes. Auto-commit runs inside each lifecycle command handler, not in `build.check` or `build.prepare`.
- **Tests**: unit tests for `commitWerkstattSideEffects` helper (idempotent skip, specific-file staging, throw on failure). Integration tests for each lifecycle command verifying the werkstatt tree is clean after execution.

## Alternatives considered

1. **Warn instead of throw on commit failure** — rejected. Warning would leave the working tree dirty and shift the burden to the operator, violating the "minimize operator involvement" principle. Throwing forces the agent to resolve the issue immediately.

2. **Separate `werkstatt.commit` command** — rejected. A separate command requires the operator or agent to remember to run it after every lifecycle transition, recreating the manual discipline problem this RFC eliminates.

3. `git add -A` **instead of specific file paths** — rejected. `git add -A` risks picking up foreign uncommitted changes from concurrent sessions. Staging only specific side-effect files is safe and deterministic.

4. **Push in addition to commit** — rejected. Werkstatt monorepo push is a separate operation controlled by the operator or CI. Lifecycle commands should not implicitly push.

5. **`simple-git` library instead of `gitExec`** — rejected. `gitExec` is already used in the codebase (`bordbuch-io.ts`). Adding a new dependency for 3 git calls is unnecessary.

## Risks

- **Pre-commit hook failures** — if the monorepo has pre-commit hooks that reject side-effect files (e.g. lint rules), lifecycle commands will throw. Mitigation: side-effect files (`registry.yaml`, `mission.yaml`, `pnpm-lock.yaml`) are machine-generated and should pass existing hooks.
- **Concurrent sessions** — two lifecycle commands running simultaneously could produce conflicting commits. Mitigation: lifecycle commands already acquire locks (DNA-51) via `acquireLock(workspaceRoot, "registry", ...)` and `acquireLock(workspaceRoot, "system:<id>", ...)`, serializing access.
- **Agent misinterpretation** — agents might assume lifecycle commands are fully safe to retry. They are idempotent for the commit step (skip if no changes), but the primary work (bordbuch append, registry update) is not idempotent. Agents must not retry lifecycle commands blindly.
- **Performance** — `git add` + `git commit` adds ~50–100ms per lifecycle command. Negligible.
- **Commit history noise** — adds one commit per lifecycle transition to the monorepo. Acceptable: these commits are machine-readable (`werkstatt:` prefix) and filterable.

## Acceptance criteria

- [x] `commitWerkstattSideEffects` helper defined in `packages/os/site-kernel-handoff/src/werkstatt/werkstatt-commit.ts` with TypeScript types (evidence: packages/os/site-kernel-handoff/src/werkstatt/werkstatt-commit.ts:7-40)
- [x] Helper stages only specific file paths (never `git add -A`) (evidence: packages/os/site-kernel-handoff/src/werkstatt/werkstatt-commit.ts:22, test src/tests/werkstatt-commit.test.ts:56)
- [x] Helper is idempotent — skips commit when `git diff --quiet -- <files>` reports no changes (evidence: packages/os/site-kernel-handoff/src/werkstatt/werkstatt-commit.ts:25-34, test src/tests/werkstatt-commit.test.ts:41)
- [x] Helper throws on `git commit` failure (does not warn) (evidence: packages/os/site-kernel-handoff/src/werkstatt/werkstatt-commit.ts:36, test src/tests/werkstatt-commit.test.ts:74)
- [x] `mission.open` calls helper with `registry.yaml` + `mission.yaml` (evidence: packages/os/site-kernel-handoff/src/mission/mission-open.ts:158-166)
- [x] `mission.materialize` calls helper with `mission.yaml` + `pnpm-lock.yaml` (evidence: packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:911-919)
- [x] `mission.migrate` calls helper with `mission.yaml` (evidence: packages/os/site-kernel-handoff/src/mission/mission-migrate.ts:220-225)
- [x] `mission.reconcile` calls helper with `mission.yaml` (evidence: packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:810-815)
- [x] `mission.close` calls helper with `registry.yaml` + `mission.yaml` (evidence: packages/os/site-kernel-handoff/src/mission/mission-close.ts:291-299)
- [x] `mission.abort` calls helper with `registry.yaml` + `mission.yaml` (evidence: packages/os/site-kernel-handoff/src/mission/mission-abort.ts:154-162)
- [x] Commit message format: `werkstatt: <command> <missionId>` (evidence: test src/tests/werkstatt-commit.test.ts:112)
- [x] Unit tests for `commitWerkstattSideEffects` (idempotent skip, specific-file staging, throw on failure) (evidence: src/tests/werkstatt-commit.test.ts, 5 tests passing)
- [x] Integration test: after `mission.open`, `git status` in monorepo is clean (evidence: src/tests/mission-open-clean-tree.test.ts, 1 test passing)
- [x] `rfc.validate` passes on this file before merging (evidence: pnpm exec site-kernel run rfc.validate --json, no violations for RFC-0580)

## Pre-existing gaps (out of scope)

- **`mission.migrate` and `mission.materialize` do not call `commitAndPushBordbuch`** — these handlers append bordbuch entries via `appendBordbuchEntry` but never commit them to the cache clone. This means the bordbuch `events.ndjson` file in the cache clone is left dirty after these commands. This is a pre-existing bordbuch hygiene gap, separate from werkstatt auto-commit. This RFC adds `commitWerkstattSideEffects` to these handlers (committing `mission.yaml` to the werkstatt tree), but the bordbuch entry remains uncommitted in the cache clone. Track this gap separately.

- **`mission.reconcile` does not call `appendBordbuchEntry`** — the reconcile handler performs git merge + push on the cache clone but does not record a bordbuch entry at all. This is a separate gap in bordbuch audit trail, not a werkstatt commit issue.

- **`sternsystem.sync` boundary** — `sternsystem.sync` also calls `commitAndPushBordbuch` and may mutate werkstatt-level files, but is not a mission lifecycle command. It is out of scope for this RFC.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The `commitWerkstattSideEffects` helper MUST stage only specific file paths, never `git add -A` or `git add .`. This prevents accidental pickup of foreign uncommitted changes from concurrent sessions.
- The helper MUST be idempotent: check `git diff --quiet -- <files>` before committing. If no changes, skip silently.
- The helper MUST throw on `git commit` failure. Do not catch and warn — the agent must resolve the issue.
- The helper MUST NOT push. Werkstatt monorepo push is a separate operator-controlled operation.
- Commit message format MUST be `werkstatt: <command> <missionId>` (e.g. `werkstatt: mission.open warpgogol-com-m000019`).
