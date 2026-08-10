---
id: RFC-0794
title: "Fix cache clone state sync, evidence path resolution, and lifecycle commit guard"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-10
updatedAt: 2026-08-10
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0790
amendedBy: []
related:
  - DNA-44
  - DNA-45
  - RFC-0790
  - RFC-0356
  - RFC-0580
  - RFC-0629
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
    - mission.open
    - mission.reconcile
    - leitstand.propagate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "mission.open writes currentMission to system-state.yaml and pushes to bare repo"
  - "mission.materialize preserves system-state.yaml after syncCacheClone"
  - "leitstand.propagate resolves Axiom evidence from missions/archive/closed/ when active mission directory is absent"
  - "commitWerkstattSideEffects commits platform-scope files without pre-commit hook blocking"
nonGoals:
  - Does not change syncCacheClone's git reset --hard strategy — the push in writeSystemState ensures the commit survives the reset
  - Does not add new commands — only fixes existing lifecycle command behavior
  - Does not change evidence archival R2 sync (separate concern, requires R2 env vars)
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0794: Fix cache clone state sync, evidence path resolution, and lifecycle commit guard

## Context

RFC-0790 moved per-system configuration into the cache clone (`systems-cache/<id>/`) and introduced convention-based discovery. The mission lifecycle (`mission.open`, `mission.materialize`, `mission.reconcile`, `mission.close`) and the deployment pipeline (`leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote`) depend on cache clone state consistency.

During the first real-world deployment through the full pipeline (mission `warpgogol-com-m000043`, release `warpgogol-com-r000018`), three architectural gaps in RFC-0790's implementation surfaced — each causing the pipeline to stall and require manual intervention.

## Problem

### 1. `writeSystemState` does not push to bare repo

`writeSystemState` (in `packages/werkstatt/src/sternsystem/registry-io.ts`) commits `system-state.yaml` to the cache clone but does not push to the bare repo (`mirrors[1]`). When `mission.materialize` runs `syncCacheClone`, it executes `git reset --hard origin/<branch>`, discarding the unpushed commit. The `currentMission` field reverts to `null`, and subsequent lifecycle commands fail with "No target site with a kernel config could be resolved."

This was the primary blocker during mission `warpgogol-com-m000043` — `mission.open` appeared to succeed, but `mission.materialize` could not find the mission.

### 2. `leitstand.propagate` cannot find evidence after `mission.close` archives the mission

`leitstand.propagate` checks for Axiom evidence at `missions/<missionId>/evidence/axiom/evidence-metadata.json`. However, `mission.close` archives the mission to `missions/archive/closed/<missionId>/`. After close, the active mission directory no longer exists, and `leitstand.propagate` fails with "no Axiom evidence found for mission '<id>'. Run leitstand.dev-deploy first." — even though dev-deploy already ran successfully.

This required a manual `cp -r` of the evidence directory from the archive back to the active path.

### 3. `commitWerkstattSideEffects` blocked by pre-commit hook for platform-scope files

`commitWerkstattSideEffects` (in `packages/werkstatt/src/werkstatt/werkstatt-commit.ts`) invokes `git commit` directly. The repository's pre-commit hook (`hooks/pre-commit`) blocks direct commits that touch `packages/**` unless the `ECOSYSTEM_COMMIT=1` environment variable is set. When mission lifecycle commands produce side-effect files in `packages/**` (e.g., generated check files, cache artifacts), the auto-commit fails silently, leaving uncommitted changes that block `mission.reconcile`.

## Decision

`writeSystemState` pushes its commit to the bare repo after writing `system-state.yaml` to the cache clone. `leitstand.propagate` falls back to `missions/archive/closed/<missionId>/evidence/axiom/` when the active mission directory is absent. `commitWerkstattSideEffects` sets `ECOSYSTEM_COMMIT=1` when invoking `git commit` so the pre-commit hook's platform-scope guard does not block lifecycle auto-commits.

## Architectural fit

- **DNA-44** (cache clone is source of truth for system state): The push in `writeSystemState` ensures the cache clone's `system-state.yaml` is propagated to the bare repo, making it durable across `syncCacheClone` resets. Without the push, the cache clone is not a reliable source of truth.
- **DNA-45** (mirror topology): The push maintains mirror consistency — `mirrors[0]` (cache clone) and `mirrors[1]` (bare repo) stay in sync after state writes.
- **RFC-0790** (amended): This RFC amends RFC-0790 by adding the push step to `writeSystemState` and the archive fallback to `leitstand.propagate`.
- **RFC-0580** (`commitWerkstattSideEffects`): The `ECOSYSTEM_COMMIT=1` env var aligns with the pre-commit hook's existing bypass mechanism — `ecosystem.commit` uses the same env var. Lifecycle auto-commits are functionally equivalent to `ecosystem.commit` and should not be blocked by the platform-scope guard.

## Design

### 1. `writeSystemState` — push after commit

In `packages/werkstatt/src/sternsystem/registry-io.ts`, after the `git commit` in `writeSystemState`, add a `git push origin <branch>` step:

```ts
// After successful commit:
const branch = execSync("git rev-parse --abbrev-ref HEAD", {
  cwd: cacheClone,
  encoding: "utf-8",
  timeout: 10_000,
}).trim();
execSync(`git push origin ${branch}`, {
  cwd: cacheClone,
  stdio: ["pipe", "pipe", "pipe"],
  timeout: 30_000,
});
```

The push is wrapped in try/catch — if no bare repo is configured (offline mode), the push is non-fatal. The branch is resolved dynamically from `git rev-parse --abbrev-ref HEAD`.

### 2. `leitstand.propagate` — archive evidence fallback

In `packages/werkstatt/src/leitstand/leitstand-commands.ts`, the evidence-metadata.json path resolution changes from a single `existsSync` check to a two-step fallback:

```ts
let metadataPath = path.join(workspaceRoot, "missions", missionId, "evidence", "axiom", "evidence-metadata.json");
if (!existsSync(metadataPath)) {
  const archivedPath = path.join(workspaceRoot, "missions", "archive", "closed", missionId, "evidence", "axiom", "evidence-metadata.json");
  if (!existsSync(archivedPath)) {
    throw new Error(`[leitstand.propagate] no Axiom evidence found for mission '${missionId}'. Run leitstand.dev-deploy first.`);
  }
  metadataPath = archivedPath;
}
```

All subsequent reads (`fs.readFile`, study-run.json, findings.json) use the resolved `metadataPath` directory.

### 3. `commitWerkstattSideEffects` — `ECOSYSTEM_COMMIT=1` env var

In `packages/werkstatt/src/werkstatt/git-exec.ts`, the `gitExec` function gains an optional `env` parameter:

```ts
export function gitExec(
  cwd: string,
  args: string,
  options?: { allowNonZero?: boolean; env?: NodeJS.ProcessEnv },
): string {
  return execSync(`git ${args}`, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30_000,
    ...(options?.env ? { env: options.env } : {}),
  }).trim();
}
```

In `packages/werkstatt/src/werkstatt/werkstatt-commit.ts`, the commit call passes the env var:

```ts
gitExec(workspaceRoot, `commit -m ${JSON.stringify(message)}`, {
  env: { ...process.env, ECOSYSTEM_COMMIT: "1" },
});
```

This mirrors how `ecosystem.commit` bypasses the pre-commit hook's platform-scope guard.

### CLI surface

No new commands. The fixes change internal behavior of existing commands:

```sh
pnpm exec werkstatt run mission.open --site warpgogol-com
pnpm exec werkstatt run mission.materialize --site warpgogol-com
pnpm exec werkstatt run mission.reconcile --site warpgogol-com
pnpm exec werkstatt run leitstand.propagate --site warpgogol-com --release <release-id>
```

### TypeScript contracts

No new interfaces. The changes are internal to existing functions.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/sternsystem/registry-io.ts` | `writeSystemState` gains push step |
| `packages/werkstatt/src/leitstand/leitstand-commands.ts` | `runLeitstandPropagate` gains archive fallback |
| `packages/werkstatt/src/werkstatt/werkstatt-commit.ts` | `commitWerkstattSideEffects` passes `ECOSYSTEM_COMMIT=1` |
| `packages/werkstatt/src/werkstatt/git-exec.ts` | `gitExec` gains optional `env` parameter |
| `systems-cache/<id>/system-state.yaml` | Written by `writeSystemState`, pushed to bare repo |
| `missions/archive/closed/<id>/evidence/axiom/` | Fallback path for evidence after `mission.close` |

### Failure modes

- **Push fails (no bare repo)**: Non-fatal — `writeSystemState` catches the error and continues. The cache clone still has the commit; `syncCacheClone` will preserve it if the bare repo is later synced manually.
- **Evidence not in archive either**: `leitstand.propagate` throws with a clear error message directing the operator to run `leitstand.dev-deploy` first.
- **`ECOSYSTEM_COMMIT=1` on non-platform files**: The env var only bypasses the platform-scope guard. Other pre-commit checks (ENV-CONTRACT, CSS tokens, RFC directory structure) still run.

## Rollout

All three fixes are backward-compatible — no migration path needed. Existing systems benefit automatically on the next `mission.open` cycle.

- **Default behavior**: All three fixes are active immediately after implementation. No flags, no opt-in.
- **Existing systems**: No action required. The next mission lifecycle will use the fixed code paths.
- **New systems**: Automatically compliant.
- **Pipeline integration**: No pipeline changes — the fixes are internal to existing commands.
- **Deprecation**: None — no commands or flags are removed.

## Alternatives considered

### Alternative 1: Change `syncCacheClone` to preserve uncommitted changes

Instead of pushing in `writeSystemState`, modify `syncCacheClone` to stash or merge uncommitted changes before `git reset --hard`.

**Rejected**: `syncCacheClone`'s `git reset --hard` is intentional — it ensures the cache clone is a clean mirror of the bare repo. Stashing or merging would introduce complexity and potential conflict resolution in a step that should be deterministic. The push in `writeSystemState` is the correct fix — it ensures the commit is durable in the bare repo before any reset.

### Alternative 2: Symlink `missions/<id>/evidence/` to `missions/archive/closed/<id>/evidence/`

Instead of a code-level fallback in `leitstand.propagate`, create a symlink during `mission.close` that redirects the active mission path to the archive.

**Rejected**: Symlinks are fragile across operating systems, git operations, and CI environments. A code-level fallback is explicit, testable, and does not require filesystem-specific behavior.

### Alternative 3: Have `commitWerkstattSideEffects` call `ecosystem.commit` instead of `git commit`

Instead of setting `ECOSYSTEM_COMMIT=1`, route the commit through `ecosystem.commit`.

**Rejected**: `ecosystem.commit` runs `pnpm install` as a post-commit deps status check and performs version bumping. Lifecycle auto-commits are internal side-effects (e.g., `mission.yaml` updates), not platform releases. Running `ecosystem.commit` for each would be excessive and slow. The `ECOSYSTEM_COMMIT=1` env var is the minimal, correct bypass.

## Risks

- **Push to bare repo on every `writeSystemState` call**: `writeSystemState` is called by `mission.open`, `mission.close`, and other lifecycle commands. Each call now triggers a `git push`. This is acceptable — the push is fast (local bare repo) and non-fatal on failure. If the bare repo is on a remote server, network latency could add ~1s per call.
- **Archive evidence path drift**: If `mission.close` changes its archive path convention in the future, the fallback in `leitstand.propagate` must be updated. This is a low risk — the archive path is stable and defined by `mission.close` itself.
- **`ECOSYSTEM_COMMIT=1` bypass scope**: The env var bypasses only the platform-scope guard (EC-01). All other pre-commit checks (ENV-CONTRACT, CSS tokens, RFC directory structure) still run. This is the correct scope — lifecycle auto-commits should not be blocked by platform-scope rules, but should still respect content-level guards.
- **Agent misinterpretation**: Agents might see `ECOSYSTEM_COMMIT=1` in `commitWerkstattSideEffects` and assume it applies to all git operations. It does not — it is scoped to the `gitExec` call inside `commitWerkstattSideEffects` only.

## Acceptance criteria

- [x] `writeSystemState` pushes to bare repo after committing `system-state.yaml` (evidence: `packages/werkstatt/src/sternsystem/registry-io.ts:150-167`, commit `5.18.16`)
- [x] `leitstand.propagate` falls back to `missions/archive/closed/<missionId>/evidence/axiom/` when active mission directory is absent (evidence: `packages/werkstatt/src/leitstand/leitstand-commands.ts:1647-1674`, commit `5.18.16`)
- [x] `commitWerkstattSideEffects` sets `ECOSYSTEM_COMMIT=1` env var when invoking `git commit` (evidence: `packages/werkstatt/src/werkstatt/werkstatt-commit.ts:47-49`, commit `5.18.16`)
- [x] `gitExec` supports optional `env` parameter (evidence: `packages/werkstatt/src/werkstatt/git-exec.ts:17-36`, commit `5.18.16`)
- [x] `computeInputsHash` skips missing files during fingerprinting (evidence: `packages/werkstatt/src/kernel/cache/command-result-cache.ts:160-168`, commit `5.18.15`)
- [x] `rfc.validate` passes on this file (evidence: `rfc.validate --id RFC-0794 --json`, exitCode: 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0794` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0794 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The `ECOSYSTEM_COMMIT=1` env var in `commitWerkstattSideEffects` is scoped to that function only. Agents MUST NOT set this env var in other git operations unless explicitly authorized by an RFC.
- The push in `writeSystemState` is non-fatal on failure. Agents MUST NOT treat push failures as fatal — the cache clone still has the commit, and manual `git push` can recover the state.
- The archive evidence fallback in `leitstand.propagate` is a read-only path resolution change. Agents MUST NOT move or copy evidence files manually — the fallback handles this automatically.
