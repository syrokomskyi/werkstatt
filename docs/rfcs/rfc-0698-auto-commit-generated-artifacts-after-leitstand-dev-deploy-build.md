---
id: RFC-0698
title: "Auto-commit generated artifacts after leitstand.dev-deploy build"
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
createdAt: 2026-08-05
updatedAt: 2026-08-05
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0628
amendedBy: []
related:
  - RFC-0644
  - RFC-0580
  - RFC-0626
  - RFC-0653
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
    - leitstand.dev-deploy
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "After leitstand.dev-deploy completes successfully, the workpiece git working tree is clean (no uncommitted generated files)."
  - "The workpiece git log contains a commit with message prefix 'chore: regenerate artifacts from dev-deploy build.prepare' if and only if generated files were modified by the build."
  - "The commitSha in build-identity.json and Axiom evidence matches the workpiece HEAD after the auto-commit."
  - "leitstand.dev-deploy with a clean workpiece (no generated file changes) does not create a commit (idempotent skip)."
  - "If mission.git.commit fails (e.g. pre-commit hook block), leitstand.dev-deploy aborts with a fatal error and does not proceed to deploy."
nonGoals:
  - "Do not auto-commit the cache clone — RFC-0580 and RFC-0626 cover werkstatt-level and bordbuch auto-commit respectively."
  - "Do not add a --skip-auto-commit flag — if the operator has unfinished manual edits, they should commit or stash before running dev-deploy."
  - "Do not auto-commit workpiece changes from other lifecycle commands (mission.materialize, mission.close) — only leitstand.dev-deploy triggers this auto-commit."
  - "Do not change the build-skip cache logic (RFC-0653) — the cache key remains based on pre-build commitSha and platform semantic hash."
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

# RFC-0698: Auto-commit generated artifacts after leitstand.dev-deploy build

## Context

`leitstand.dev-deploy` (RFC-0628) deploys the active mission's workpiece to the dev channel. The command runs `pnpm build` (which executes `build.prepare` → `astro build` → `build.post`), producing 60+ generated files: markdown twins (`page.markdown.generate`), surface YAML (`surface.generate`), behavior snapshots (`behavior.snapshot.generate`), open-source artifacts (`open-source.generate`), SBOM, biome CSS, icons, and more.

None of these generated files are committed after the build. The `build.prepare` pipeline includes `bordbuch.commit` (RFC-0626) which auto-commits bordbuch projections in the cache clone, but no equivalent step commits the workpiece working tree after the full build completes.

RFC-0644 established the auto-commit pattern for `mission.reconcile` — it auto-commits the workpiece before fetch+merge into the cache clone. RFC-0580 auto-commits werkstatt-level side-effects. But neither covers the workpiece working tree after `leitstand.dev-deploy`'s build step.

## Problem

After `leitstand.dev-deploy` completes, the workpiece git working tree is dirty with uncommitted generated files. This causes:

1. **Manual commit burden** — the operator or agent must manually run `mission.git.commit` after every dev-deploy. During mission `warpgogol-com-m000028`, 58 generated files were left uncommitted after a dev-deploy run, requiring a manual `mission.git.commit` to clean up.
2. **Stale commitSha** — `commitSha` is captured before the build (leitstand-commands.ts:683) and used in `build-identity.json` and Axiom evidence. If generated files are committed after the build but `commitSha` is not refreshed, the build-identity and evidence reference a pre-build commit that does not include the generated artifacts.
3. **Broken mission lifecycle** — a dirty workpiece causes `mission.validate` and `mission.close` to fail (SNAP-01, generated.drift.validate, bordbuch.commit conflicts). The operator must remember to commit before closing the mission.
4. **Inconsistency with RFC-0644** — `mission.reconcile` auto-commits the workpiece, but `leitstand.dev-deploy` (which runs more frequently during dev iteration) does not, creating an asymmetry in lifecycle hygiene.

DNA-46 (Mission lifecycle) requires reliable state transitions. DNA-51 (Werkstatt consistency primitives) requires automated primitives for state mutations. The absence of auto-commit after dev-deploy is a gap in both invariants.

## Decision

`leitstand.dev-deploy` auto-commits all uncommitted changes in the workpiece git repository via `mission.git.commit` after `pnpm build` completes (including `build.post`) and before computing `distTreeHash`. The `commitSha` is re-read from the workpiece HEAD after the auto-commit so that `build-identity.json` and Axiom evidence reference the post-commit HEAD. If `mission.git.commit` fails, `leitstand.dev-deploy` aborts with a fatal error and does not proceed to deploy. The auto-commit is idempotent — if the workpiece working tree is clean, no commit is created.

## Architectural fit

- **DNA-46 (Mission lifecycle)** — dev-deploy is part of the mission dev iteration loop. Auto-commit ensures the workpiece git state is clean and consistent after each dev-deploy, preventing dirty-tree failures during `mission.validate` and `mission.close`.
- **DNA-51 (Werkstatt consistency primitives)** — extends the auto-commit pattern established by RFC-0580 (werkstatt side-effects) and RFC-0626 (bordbuch projections) to cover the workpiece working tree after dev-deploy builds.
- **RFC-0628** — introduced `leitstand.dev-deploy` as a workpiece-based dev deployment flow. This RFC amends RFC-0628 by adding the auto-commit step.
- **RFC-0644** — established the `commitWorkpieceIfDirty` pattern for `mission.reconcile`. This RFC applies the same pattern to `leitstand.dev-deploy`.
- **RFC-0653** — build-skip cache remains based on pre-build `commitSha`. Auto-commit does not invalidate the cache because the cache key tracks source changes (commitSha + platform semantic hash), not generated file changes.

## Design

### CLI surface

No new CLI commands. The change is internal to the existing `leitstand.dev-deploy` handler:

```sh
pnpm exec site-kernel run leitstand.dev-deploy --system <systemId>
```

The handler now auto-commits the workpiece after `pnpm build` completes and before computing `distTreeHash`.

### TypeScript contracts

The auto-commit is invoked via `executeKernelCommand` (same pattern as `methodologies.validate`, `axiom.report`, `evidence.sync` calls already in `leitstand.dev-deploy`):

```ts
// After pnpm build completes (including build.post), before distTreeHash:
const { executeKernelCommand: executeCommit } = await import("@warpgogol/site-kernel");
const commitResult = await executeCommit({
  workspaceRoot,
  commandName: "mission.git.commit",
  argv: [
    `--mission=${missionId}`,
    `--message=chore: regenerate artifacts from dev-deploy build.prepare`,
  ],
});
if (commitResult.exitCode !== 0) {
  // Fatal: abort deploy
  return { data: { ... }, exitCode: 1, summary: `[leitstand.dev-deploy] ${systemId}: auto-commit failed — ${commitResult.summary}` };
}

// Re-read commitSha from workpiece HEAD after auto-commit
commitSha = execSync("git rev-parse HEAD", { cwd: workpiecePath, encoding: "utf-8", stdio: "pipe" }).trim();
```

No new TypeScript interfaces are needed. The `DevDeployResult` type already has `commitSha: string` — it now reflects the post-commit HEAD.

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/<missionId>/workpiece/` | Workpiece git repository — auto-committed after build |
| `missions/<missionId>/workpiece/dist/` | Build output — not committed (ephemeral, .gitignored in workpiece) |
| `missions/<missionId>/workpiece/dist/client/.well-known/build-identity.json` | Written with post-commit `commitSha` |

### Output format

The `--json` output shape is unchanged. The `commitSha` field in `DevDeployResult` now reflects the post-auto-commit HEAD:

```json
{
  "command": "leitstand.dev-deploy",
  "systemId": "warpgogol-com",
  "missionId": "warpgogol-com-m000028",
  "commitSha": "f1b9eef...",
  "buildState": "succeeded",
  "buildSkipped": false,
  "deployState": "succeeded",
  "deploymentUrl": "https://dev.warpgogol.com",
  "buildIdentity": { "releaseId": "workpiece-warpgogol-com-m000028", "written": true, "path": "dist/client/.well-known/build-identity.json" },
  "axiom": { "status": "pass", "errors": 0, "warnings": 12, "exitCode": 0, "freshness": { "verified": true, "...": "..." } },
  "evidenceSynced": true,
  "evidenceSyncError": null
}
```

### Failure modes

| Scenario | Behavior |
| --- | --- |
| Build succeeds, workpiece clean | No commit created (idempotent skip). Deploy proceeds with pre-build commitSha. |
| Build succeeds, workpiece dirty | `mission.git.commit` creates a commit. `commitSha` re-read. Deploy proceeds with post-commit HEAD. |
| Build succeeds, `mission.git.commit` fails | **Fatal error.** Deploy aborted. Operator must resolve (e.g. pre-commit hook block) and re-run. |
| Build skipped (cache hit), workpiece dirty (e.g. snapshot regenerated) | `mission.git.commit` creates a commit. `commitSha` re-read. Deploy proceeds. |
| Build skipped, workpiece clean | No commit. Deploy proceeds with existing commitSha. |
| Build fails | No auto-commit attempt. Deploy aborted at build failure step (existing behavior). |

## Rollout

- **Default behavior**: auto-commit is always on. No opt-in flag, no grace period.
- **Existing apps**: no migration needed. The first `leitstand.dev-deploy` after implementation will auto-commit any existing dirty workpiece files.
- **New apps**: automatically benefit from clean workpiece state after every dev-deploy.
- **No deprecation path**: this amends RFC-0628 behavior without removing any existing functionality.
- **Pipeline integration**: the auto-commit runs inside `leitstand.dev-deploy` between `pnpm build` completion and `distTreeHash` computation. No pipeline step changes needed.

## Alternatives considered

1. **Non-fatal warning on commit failure** — continue deploy with pre-build commitSha if auto-commit fails. Rejected: deploying with a stale commitSha in build-identity.json creates incorrect Axiom evidence and makes debugging harder. A fatal error forces the operator to resolve the issue immediately.

2. **Two commits (after build.prepare, after build.post)** — commit generated files after `build.prepare`, then commit `behavior.snapshot.generated.yaml` after `build.post`. Rejected: unnecessary complexity. A single commit after the full `pnpm build` captures all generated files including the behavior snapshot.

3. **Direct `git add -A && git commit` instead of `mission.git.commit`** — simpler, but duplicates logic and bypasses PASSPORT signing. Rejected: `mission.git.commit` is the canonical workpiece commit command and is already used by the operator manually.

4. **`--skip-auto-commit` flag** — allow operator to opt out. Rejected: follows RFC-0644 precedent. If the operator has unfinished manual edits, they should commit or stash before running dev-deploy. An opt-out flag creates a footgun.

5. **Auto-commit only after `build.prepare`, not `build.post`** — would leave `behavior.snapshot.generated.yaml` uncommitted. Rejected: incomplete coverage. The behavior snapshot is a generated artifact that should be committed like any other.

## Risks

1. **Pre-commit hook blocks** — if the workpiece has a pre-commit hook (e.g. lint-staged), generated files may fail the hook. Mitigation: fatal error with descriptive message directs the operator to resolve the hook failure. Generated files are deterministic and should pass lint, but if a hook enforces non-deterministic checks, it may block.

2. **Commit noise** — every dev-deploy creates a commit even for trivial generated file changes. Mitigation: `mission.git.commit` is idempotent — if the working tree is clean, no commit is created. Generated files only change when source or config changes, so commits are proportional to real changes.

3. **Agent confusion** — agents may not expect the workpiece HEAD to change during dev-deploy. Mitigation: the `commitSha` in `DevDeployResult` reflects the post-commit HEAD, and the log clearly states when an auto-commit is created.

4. **Build-skip cache staleness** — the build-skip cache (RFC-0653) uses pre-build `commitSha`. After auto-commit, the workpiece HEAD changes, but the cache key (commitSha + platform semantic hash) still matches because the cache was written before the auto-commit. On the next dev-deploy, the cache will miss (commitSha changed) and a rebuild will occur. This is correct behavior — the cache should miss after any commit.

## Acceptance criteria

- [ ] `leitstand.dev-deploy` calls `mission.git.commit` after `pnpm build` completes and before `distTreeHash` computation (evidence: leitstand-commands.ts)
- [ ] `commitSha` is re-read from workpiece HEAD after auto-commit (evidence: leitstand-commands.ts)
- [ ] `build-identity.json` in `dist/client/.well-known/` uses the post-commit `commitSha` (evidence: leitstand-commands.ts)
- [ ] If `mission.git.commit` fails, `leitstand.dev-deploy` returns `exitCode: 1` and does not proceed to deploy (evidence: leitstand-commands.ts)
- [ ] If the workpiece is clean after build, no commit is created (idempotent skip) (evidence: unit test)
- [ ] Auto-commit works when build is skipped (cache hit) but snapshot was regenerated (evidence: unit test)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The auto-commit MUST use `mission.git.commit` via `executeKernelCommand`, not a direct `git commit` call. This ensures PASSPORT signing and consistent commit message formatting.
- The `commitSha` re-read MUST happen after the auto-commit and before `build-identity.json` is written to `dist/`. The preliminary `build-identity.json` in `public/.well-known/` uses the pre-build `commitSha` — this is correct because it is replaced by the final one in `dist/`.
- If `mission.git.commit` fails, the handler MUST return a fatal error (`exitCode: 1`) with a descriptive summary. Do NOT fall back to continuing the deploy with a stale commitSha.
