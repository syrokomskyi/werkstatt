---
id: RFC-0617
title: "Compass audit baseline in mission materialization"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
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
createdAt: 2026-07-31
updatedAt: 2026-07-31
enhancedAt: 2026-07-31
implementedAt: 2026-07-31
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0352
  - RFC-0356
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-43
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
    - compass.audit.baseline
    - mission.materialize
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/forge"
successSignals:
  - "release.prepare no longer fails on compass.audit.validate for workpiece files not in the ledger"
  - "mission.materialize automatically baselines new workpiece files"
  - "compass.audit.baseline --workpiece scans only the workpiece directory"
nonGoals:
  - "Changing the audit threshold or cadence logic"
  - "Adding new audit verdicts"
  - "Modifying compass.audit.validate behavior"
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

# RFC-0617: Compass audit baseline in mission materialization

## Context

DNA-43 requires every authored file to undergo periodic semantic-truth audit. `compass.audit.baseline` seeds the ledger for files at their current revision, and `compass.audit.validate --strict` in `build.post` fails the release if any file is audit-overdue (≥ 30 revisions since last audit, default threshold).

When a new mission workpiece is materialized (`mission.materialize`), it creates new authored files (e.g. `src/styles/local.css`, content files, route files). These files are not in the compass-audit ledger. The first time `release.prepare` runs `build.post`, `compass.audit.validate --strict` fails with `COMPASS-AUDIT-01: audit overdue (current=1, audited=never, threshold=30)`.

This was discovered during the `warpgogol-com-m000022` release cycle (2026-07-31). The operator had to manually run `compass.audit.record --file .../local.css --verdict baseline` to proceed.

## Problem

`mission.materialize` (RFC-0356) creates a workpiece with new authored files but does not seed them into the compass-audit ledger. The ledger is only populated when someone manually runs `compass.audit.baseline` or `compass.audit.record`. As a result, the first `release.prepare` after materialization fails at `compass.audit.validate --strict` in `build.post` because the new files have `audited=never`.

This relies on operator discipline: the operator must remember to run `compass.audit.baseline` after materialization. If they forget, the release fails mid-pipeline.

## Decision

`mission.materialize` runs `compass.audit.baseline --workpiece <path>` automatically after codegen, seeding all new workpiece authored files into the ledger at their current revision with `verdict=baseline`. The `compass.audit.baseline` command gains a `--workpiece <path>` flag that restricts scanning to the workpiece directory.

## Architectural fit

- **DNA-43** (Compass semantic-truth audit) — this RFC ensures new workpiece files are seeded into the audit ledger at materialization time, preventing false-positive audit-overdue failures during release.
- **RFC-0352** — established the compass audit command family (`plan`, `record`, `baseline`, `validate`). This RFC adds a `--workpiece` flag to `baseline` and integrates it into the mission lifecycle.
- **RFC-0356** — mission materialization from pinned Sternsystem bundles. This RFC extends `mission.materialize` with a post-codegen audit baseline step.
- **Release pipeline** — `release.prepare` runs `build.post` which includes `compass.audit.validate --strict`. With this RFC, the ledger is already seeded, so the strict gate passes for new workpiece files.

## Design

### CLI surface

New flag on existing command:

```sh
pnpm exec werkstatt run compass.audit.baseline --workpiece missions/warpgogol-com-m000022/workpiece
```

The `--workpiece <path>` flag restricts scanning to the specified workpiece directory. Only authored files within that directory are seeded into the ledger. The flag is mutually exclusive with `--packages` and `--site`.

**Why `--workpiece` instead of `--site`?** `mission.materialize` calls `compass.audit.baseline` via `executeKernelCommand` programmatically. While `--site <systemId>` could theoretically resolve to the workpiece via `registry.currentMission`, the site discovery chain adds unnecessary indirection during materialization (the mission is still being set up, and the workpiece path is already known directly as `workpieceDir`). `--workpiece <path>` bypasses site discovery and points directly to the directory, making the integration explicit and testable.

`mission.materialize` calls this internally after codegen completes:

```sh
# Inside mission.materialize, after runKernelWire and codegen:
compass.audit.baseline --workpiece <workpieceDir>
```

### TypeScript contracts

```ts
interface BaselineInput {
  // Existing flags
  packages?: boolean;
  package?: string;
  // New flag
  workpiece?: string; // path to workpiece directory (relative to workspaceRoot)
}
```

The `mission.materialize` handler adds a post-codegen step:

```ts
// After codegen + git commit completes successfully
const workpieceRelPath = path.relative(workspaceRoot, workpieceDir);
try {
  await executeKernelCommand({
    workspaceRoot,
    commandName: "compass.audit.baseline",
    argv: [`--workpiece=${workpieceRelPath}`],
  });
} catch (err) {
  logger.warn(`  Warning: compass.audit.baseline failed: ${err instanceof Error ? err.message : String(err)}`);
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/os/compass/handlers/compass-audit-handler.ts` | `compass.audit.baseline` handler (add `--workpiece` flag handling) |
| `packages/forge/os/compass/handlers/resolve-scan-root.ts` | `resolveCompassScanRoot` (add `--workpiece` path resolution, mutual exclusivity with `--site` and `--packages`) |
| `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` | `runMissionMaterialize` (add post-codegen baseline call via `executeKernelCommand`) |
| `docs/compass-audit-ledger.generated.yaml` | Ledger file (updated by baseline) |
| `missions/<missionId>/workpiece/` | Workpiece directory scanned by `--workpiece` |

### Revision tracking for workpiece files

Workpiece files are not tracked by the integrity registry (`.integrity/index/` covers only `apps/`, `packages/`, `services/`) and exist in the workpiece's own `.git`, not the monorepo's git history. `getRevisionByPath` falls back to `getFileRevisionFromHistory` which runs `git log` in `workspaceRoot` — this returns 0 revisions for workpiece files, so `revision = 1` always.

This means the audit cadence is effectively static for workpiece files: they are seeded at revision 1 and `1 - 1 = 0 < 30` → never overdue. This is acceptable because workpiece files are ephemeral — they exist only during the mission lifecycle. After reconcile and close, content changes are pushed to the Sternsystem repo. The audit cadence applies to permanent codebase files, not to temporary workpiece copies.

### Inventory classification for workpiece paths

`createCompassInventoryEntries` classifies files by path prefix: `apps/` → `app`, `packages/` → `package`, `services/` → `service`. Workpiece files at `missions/<id>/workpiece/` don't match any prefix, so `detectWorkspaceKind` returns `"app"` (fallback), `detectWorkspaceName` returns the mission ID (second segment), and `detectLayer` returns `"other"` (no prefix match). This classification is incorrect but cosmetic — `compass.audit.baseline` only needs `path` and `authoringStatus === "authored"`, both of which are correct. No changes to `compass-inventory.ts` are needed.

### Output format

No changes to `--json` output shape. The baseline command reports `seeded: <N>, total: <M>` as before.

### Failure modes

- **Workpiece path does not exist**: `compass.audit.baseline --workpiece` throws `[compass.audit.baseline] workpiece path not found: <path>`.
- **No authored files in workpiece**: Baseline completes with `seeded=0`, no error. This is valid — some missions may not introduce new authored files.
- **Baseline fails during mission.materialize**: The baseline call is wrapped in a try/catch and logs a warning. Materialization succeeds despite baseline failure — the operator can run `compass.audit.baseline --workpiece <path>` manually later. This is non-fatal because audit baseline is a bookkeeping step, not a correctness gate.
- **`--workpiece` and `--packages` both passed**: Throws `[compass.audit.baseline] --workpiece and --packages are mutually exclusive`.
- **`--workpiece` and `--site` both passed**: Throws `[compass.audit.baseline] --workpiece and --site are mutually exclusive`.

## Rollout

- **Automatic adoption**: All new missions automatically get audit baseline during materialization. No operator action required.
- **Existing missions**: Missions that were materialized before this RFC may still have unbaselined files. The operator can run `compass.audit.baseline --workpiece <path>` manually for those.
- **No pipeline changes**: `build.post` and `compass.audit.validate --strict` remain unchanged. They simply pass because the ledger is now seeded.
- **Integration point**: The baseline call is added to `runMissionMaterialize` after the `build.prepare.dev` pipeline completes and after the initial `mission.git.commit`, before the materialization report is written.

## Alternatives considered

1. **Run `compass.audit.baseline` in `mission.validate`** — Seed the ledger during validation before mission close. Rejected: `release.prepare` can be run after `mission.close` without `mission.validate`, so the ledger might still be empty.

2. **Run `compass.audit.baseline` in `release.prepare` before `build.post`** — Seed the ledger at the start of the release pipeline. Rejected: this couples release preparation with audit bookkeeping. `release.prepare` should not mutate the audit ledger; that belongs in the mission lifecycle.

3. **Remove `--strict` from `compass.audit.validate` in `build.post`** — Downgrade the release gate from hard fail to warning. Rejected: this weakens DNA-43 enforcement. The strict gate is intentional for releases.

## Risks

- **Performance** — `compass.audit.baseline --workpiece` scans the workpiece directory for authored files. Workpieces are typically small (tens to hundreds of files), so this is fast (< 1s).
- **Ledger churn** — Each materialization adds entries to the ledger. If a mission is aborted and the workpiece deleted, stale entries remain. This is benign: `compass.audit.validate` only checks files that still exist.
- **Agent confusion** — Agents might think `compass.audit.baseline` is only for workspace-wide seeding. The `--workpiece` flag makes it clear that scoped baseline is supported.

## Acceptance criteria

- [x] `compass.audit.baseline` accepts `--workpiece <path>` flag and scans only that directory (evidence: packages/forge/os/compass/handlers/resolve-scan-root.ts:41-48, packages/forge/os/compass/handlers/resolve-scan-root-workpiece.test.ts:33-41)
- [x] `--workpiece` and `--packages` are mutually exclusive (throws on both) (evidence: packages/forge/os/compass/handlers/resolve-scan-root.ts:29-33, packages/forge/os/compass/handlers/resolve-scan-root-workpiece.test.ts:43-49)
- [x] `mission.materialize` calls `compass.audit.baseline --workpiece` after codegen (evidence: packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:982-997, packages/os/site-kernel-handoff/src/tests/mission-materialize-baseline.test.ts:162-175)
- [x] `release.prepare` passes `compass.audit.validate --strict` for new workpiece files without manual baseline (evidence: packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:988-992 — baseline call seeds ledger before release.prepare runs build.post)
- [x] Unit test: `compass.audit.baseline --workpiece` seeds only files within the workpiece directory (evidence: packages/forge/os/compass/handlers/resolve-scan-root-workpiece.test.ts:33-41, packages/os/site-kernel-handoff/src/tests/mission-materialize-baseline.test.ts:162-175)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The `--workpiece` flag MUST be added to the canonical handler in `packages/forge/os/compass/handlers/compass-audit-handler.ts`, not to the re-export shim in `packages/os/site-kernel-checks/src/compass-audit.ts` (RFC-0556).
- The `mission.materialize` change MUST be in `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` (where `runMissionMaterialize` lives), after the `build.prepare.dev` pipeline and git commit, before the materialization report is written. The `mission-materialization-commands.ts` file contains `runMissionValidate`, `runMissionBuild`, `runMissionDiff`, and `runMissionReconcile` — not `runMissionMaterialize`.
- Agents MUST NOT add `compass.audit.baseline` to `release.prepare` — it belongs in `mission.materialize` only.
- Agents MUST NOT weaken the `--strict` flag on `compass.audit.validate` in `build.post`.
