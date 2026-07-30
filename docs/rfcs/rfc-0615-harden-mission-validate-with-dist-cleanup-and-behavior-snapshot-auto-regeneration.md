---
id: RFC-0615
title: "Harden mission.validate with dist cleanup and behavior snapshot auto-regeneration"
status: draft
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
createdAt: 2026-07-30
updatedAt: 2026-07-31
enhancedAt: 2026-07-31
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0593
amendedBy: []
related:
  - RFC-0593
  - RFC-0592
  - RFC-0595
  - RFC-0480
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-47
  - DNA-58
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
    - mission.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "mission.validate cleans dist/ before markdown twin validation, eliminating false positives from stale build artifacts."
  - "mission.validate auto-regenerates the behavior snapshot when behavior.snapshot.validate reports SNAP-01, then re-validates."
  - "After auto-regeneration, mission.validate passes without manual intervention for SNAP-01 errors."
  - "mission.validate still fails on genuine validation errors (STALE-01, MDMETA-04, GEN-FILES-01) that are not snapshot-related."
nonGoals:
  - "Do not auto-resolve STALE-01 or MDMETA-04 errors — only SNAP-01 is auto-regenerated."
  - "Do not remove the behavior snapshot validation step — the snapshot is re-validated after regeneration."
  - "Do not clean dist/ during mission.reconcile — only during mission.validate."
  - "Do not skip the astro build in mission.validate — the build is still required to produce fresh dist/ output."
  - "Do not auto-regenerate the snapshot when the workpiece has uncommitted changes — only auto-regenerate from a clean workpiece state."
  - "Do not auto-resolve non-SNAP-01 errors — only SNAP-01 is deterministic."
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

# RFC-0615: Harden mission.validate with dist cleanup and behavior snapshot auto-regeneration

## Context

During mission `warpgogol-com-m000022` validation (2026-07-30), two operational issues caused avoidable false positives and manual intervention:

1. **Stale `dist/` artifacts**: After route changes, old `dist/client/website/` files persisted from a previous build. `page.markdown.validate` found these stale HTML files and reported "markdown twin missing" errors because the corresponding `.md` files no longer existed. The fix was manual `rm -rf dist/` — but `mission.validate` already runs an astro build that produces fresh `dist/` output. The stale files should have been cleaned before validation.

2. **SNAP-01 behavior snapshot mismatch**: `behavior.snapshot.validate` reported routes present in the committed snapshot but missing from the current build. The fix was manual `behavior.snapshot.generate` + commit. This is a deterministic operation — the snapshot should be auto-regenerated when the validator detects a mismatch, then re-validated.

## Problem

`mission.validate` (RFC-0593) runs static checks and an astro build, but:

1. It does not clean `dist/` before the build, causing stale build artifacts to produce false positives in markdown twin validation.
2. It does not auto-regenerate the behavior snapshot when `behavior.snapshot.validate` reports SNAP-01, requiring manual intervention for a deterministic fix.

These gaps are protected by manual discipline only — the operator or agent must remember to clean `dist/` and regenerate the snapshot.

## Decision

`mission.validate` cleans `dist/` before running the astro build and markdown twin validation. When `behavior.snapshot.validate` reports SNAP-01 inside the `build.post` pipeline, `mission.validate` auto-regenerates the behavior snapshot via `behavior.snapshot.generate`, commits the updated snapshot via `mission.git.commit`, and re-validates. Auto-regeneration requires a clean workpiece (no uncommitted changes) before `build.post` runs — if the workpiece is dirty, `mission.validate` warns and skips auto-regeneration.

This amends RFC-0593 (mission validation gates) to reduce manual intervention during mission closure. The auto-regeneration also fires inside `mission.close`'s inline `mission.validate` gate (RFC-0593), since `mission.close` already requires a clean workpiece before closing.

## Architectural fit

- **DNA-47 (Materialization)**: `mission.validate` is part of the materialization flow (DNA-47 names it as an enforcer). This RFC strengthens it by ensuring dist cleanup and snapshot auto-regeneration are automatic, not manual.
- **DNA-58 (Generated-file content determinism)**: Cleaning `dist/` before validation ensures only fresh build output is checked, preventing stale artifacts from producing false positives. The auto-regenerated snapshot is a deterministic generated file — `behavior.snapshot.generate` produces it from the current build output, and `writeFileIfChanged` ensures byte-identical output for identical builds.
- **RFC-0593 (mission validation gates)**: Amended — two pre-flight steps (dist cleanup, snapshot auto-regeneration) are added to the validation pipeline. The auto-regeneration also fires inside `mission.close`'s inline `mission.validate` gate.
- **RFC-0592 (exclude meta-refresh redirect stubs)**: Compatible — snapshot regeneration includes redirect stub handling.
- **RFC-0595 (mark redirect routes)**: Compatible — regenerated snapshot includes `contentHash: null` and `redirectTarget` for redirect routes.
- **RFC-0480 (mission git workpiece edits)**: Compatible — the auto-regenerated snapshot is committed via the existing `mission.git.commit` mechanism.

## Design

### CLI surface

No CLI change — `mission.validate` keeps its existing flags and interface. The changes are internal to the validation pipeline.

### Pipeline changes

The `mission.validate` pipeline gains two pre-flight steps:

1. **dist/ cleanup** (before astro build):

   ```ts
   // Remove stale dist/ directory before build
   const distDir = join(workpieceDir, "dist");
   if (existsSync(distDir)) {
     await fs.rm(distDir, { recursive: true, force: true });
   }
   ```

2. **dirty workpiece check** (before `build.post`):

   `mission.validate` checks `isWorkpieceDirty(workpieceDir)` before running `build.post`. If the workpiece has uncommitted changes, `mission.validate` warns and skips auto-regeneration — the operator must commit or stash first. This is necessary because `mission.git.commit` stages all changes (`git add -A`), so auto-committing from a dirty workpiece would mix the snapshot with unrelated changes.

   When the workpiece is clean, `build.post` runs. `build.post` steps that modify git-tracked files (e.g., `text.normalize.apply`) only write to `dist/` (gitignored), so the workpiece remains clean in git terms. The only git-tracked file that changes is `behavior.snapshot.generated.yaml` — but only if `behavior.snapshot.generate` runs, which happens AFTER `behavior.snapshot.validate` in the pipeline.

3. **behavior snapshot auto-regeneration** (after `build.post` fails with SNAP-01):

   The `build.post` pipeline (`SITES_BUILD_POST_PIPELINE`) runs `behavior.snapshot.validate` inside `SITES_CHECK_POSTBUILD_PIPELINE`. The pipeline executor stops on first failure (`execute-pipeline.ts:399-414`) — when `behavior.snapshot.validate` fails with SNAP-01, `behavior.snapshot.generate` (which runs later in `build.post`) never executes. The separate `behavior.snapshot.generate` call is therefore necessary, not redundant.

   `mission.validate` must use `executeKernelPipeline` directly (instead of `runPipelinePhase`, which throws on failure) to inspect the pipeline report:

   ```ts
   // Run build.post and inspect the pipeline report
   const postResult = await executeKernelPipeline({
     workspaceRoot,
     pipelineName: "build.post",
     siteName: manifest.systemId,
     outputFormat: "pretty",
   });
   const postReport = Array.isArray(postResult) ? postResult[0] : postResult;

   // Check if behavior.snapshot.validate failed with SNAP-01
   const snapshotStep = postReport.steps.find(
     (s) => s.commandName === "behavior.snapshot.validate"
   );
   const snap01Diagnostics = snapshotStep?.data?.diagnostics?.filter(
     (d: { ruleId: string }) => d.ruleId === "SNAP-01"
   ) ?? [];

   if (!postReport.ok && snap01Diagnostics.length > 0 && !wasDirtyBeforeBuildPost) {
     // Auto-regenerate snapshot
     await executeKernelCommand({
       workspaceRoot,
       commandName: "behavior.snapshot.generate",
       siteName: manifest.systemId,
     });
     // Commit updated snapshot — safe because workpiece was clean before build.post
     await executeKernelCommand({
       workspaceRoot,
       commandName: "mission.git.commit",
       argv: [`--mission=${missionId}`, `--message=chore: auto-regenerate behavior snapshot`],
     });
     // Re-run build.post to re-validate
     const revalidateResult = await executeKernelPipeline({
       workspaceRoot,
       pipelineName: "build.post",
       siteName: manifest.systemId,
       outputFormat: "pretty",
     });
     const revalidateReport = Array.isArray(revalidateResult) ? revalidateResult[0] : revalidateResult;
     if (!revalidateReport.ok) {
       // Persistent failure after regeneration — genuine route mismatch
       // Report and exit non-zero
     }
   } else if (!postReport.ok) {
     // Non-SNAP-01 failure or dirty workpiece — report and exit non-zero
   }
   ```

   **Note:** `behavior.snapshot.validate` returns `KernelCommandResult<CheckResult>` via `diagnosticsResult()`. The `CheckResult` shape is `{ command, status, diagnostics, summary }` where `diagnostics` is an array of `{ ruleId, severity, message, fixHint?, data? }`. The field is `diagnostics` (not `violations`) and the property is `ruleId` (not `rule`).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Add dist cleanup, dirty check, and snapshot auto-regeneration logic to `runMissionValidate` |
| `packages/os/site-kernel-checks/src/pipelines/build-post.ts` | Read-only reference — `behavior.snapshot.validate` runs inside `SITES_CHECK_POSTBUILD_PIPELINE` spread here |
| `packages/os/site-kernel-checks/src/behavior-snapshot.ts` | Read-only reference — `runBehaviorSnapshotValidate` returns `CheckResult` with `diagnostics[]` using `ruleId` field |
| `packages/os/site-kernel/src/runtime/execute-pipeline.ts` | Read-only reference — pipeline executor stops on first failure (line 399-414), confirming separate `behavior.snapshot.generate` call is necessary |
| `missions/<missionId>/workpiece/dist/` | Cleaned before build |
| `missions/<missionId>/workpiece/behavior.snapshot.generated.yaml` | Auto-regenerated when SNAP-01 detected |

### Failure modes

- **dist/ cleanup fails**: If `fs.rm` fails (permissions, locked files), log a warning and continue with the existing dist/. The build will overwrite stale files.
- **dirty workpiece before build.post**: If `isWorkpieceDirty()` returns true before `build.post`, `mission.validate` warns: "workpiece has uncommitted changes — snapshot auto-regeneration skipped. Commit or stash changes first." Validation continues normally; if SNAP-01 is detected, it is reported as a regular failure (no auto-regeneration).
- **snapshot regeneration fails**: If `behavior.snapshot.generate` fails, report the error and exit non-zero. The operator must manually investigate.
- **snapshot re-validation fails**: If the snapshot still fails after regeneration, report the persistent SNAP-01 error and exit non-zero. `behavior.snapshot.validate` produces the same SNAP-01 diagnostic for both stale and genuine mismatches — there is no programmatic way to distinguish them. The re-validation result is interpreted as: if it passes, the mismatch was stale; if it fails again, the mismatch is genuine (routes are actually missing from the build).
- **Non-SNAP-01 errors**: STALE-01, MDMETA-04, GEN-FILES-01, and other validation errors are NOT auto-resolved. Only SNAP-01 is auto-regenerated.
- **mission.git.commit stages all changes**: `mission.git.commit` runs `git add -A` (line 349 of `mission-git-commit.ts`), staging ALL uncommitted changes. This is safe because the dirty check before `build.post` ensures the workpiece was clean — the only git-tracked file that changes between the dirty check and the commit is `behavior.snapshot.generated.yaml` (regenerated by the explicit `behavior.snapshot.generate` call). `build.post` steps that modify files only write to `dist/` (gitignored).

## Rollout

- **No migration needed**: The dist cleanup and snapshot auto-regeneration apply immediately to all missions. Existing and future missions benefit from the hardening without any flag day.
- **No pipeline position change**: `mission.validate` remains in the same lifecycle position (before `mission.close`).
- **mission.close interaction**: `mission.close` calls `mission.validate` inline (RFC-0593). The auto-regeneration fires inside this inline call. `mission.close` already requires a clean workpiece before closing (line 225-230 of `mission-close.ts`), so the dirty check passes automatically. The auto-commit creates a workpiece commit as a side effect of `mission.close`'s validation gate — this is acceptable because the commit is deterministic (only the snapshot file changes).
- **Idempotent**: Re-running `mission.validate` after auto-regeneration will find the snapshot up-to-date and skip regeneration.
- **Commit hygiene**: The auto-generated snapshot commit uses the existing `mission.git.commit` mechanism, ensuring proper authorship and staging. The dirty check before `build.post` ensures only the snapshot file is staged.

## Alternatives considered

- **Warn-only mode for SNAP-01**: Rejected because a stale snapshot is a genuine validation failure that should be fixed, not warned about. Auto-regeneration is the correct fix — the snapshot is deterministic and should always match the current build.
- **Clean dist/ in build.prepare instead of mission.validate**: Rejected because `build.prepare` is also used outside mission validation (e.g., `mission.preview`), and cleaning dist/ there could remove artifacts needed by other consumers. `mission.validate` is the right scope because it runs a fresh build anyway.
- **Manual-only snapshot regeneration**: Rejected because it requires operator intervention for a deterministic operation. The operator's time is better spent on genuine validation failures, not mechanical snapshot updates.

## Risks

- **dist/ cleanup on network filesystems**: `fs.rm` with `recursive: true` may be slow on network filesystems. Mitigation: log the cleanup step and allow it to fail gracefully.
- **Auto-regeneration masking real issues**: If routes are genuinely missing from the build (not just a stale snapshot), auto-regeneration will produce a snapshot that matches the broken build. Mitigation: the re-validation step after regeneration will still catch other validation errors (STALE-01, MDMETA-04) that indicate real problems. The re-validation SNAP-01 failure is reported as a persistent error.
- **Commit churn**: Auto-regeneration creates an extra commit in the workpiece. This is acceptable — the commit is deterministic and necessary for validation to pass.
- **Semantic shift — mission.validate becomes mutating**: `mission.validate` currently only writes evidence reports. With auto-regeneration, it creates a workpiece commit via `mission.git.commit`. This is a semantic shift from read-only validation to mutating validation. Mitigation: the mutation is deterministic (only the snapshot file), the dirty check prevents mixing unrelated changes, and the commit is necessary for validation to pass.
- **Agent confusion**: Agents may think all validation errors are auto-resolved. Only SNAP-01 is auto-resolved; all other errors require manual investigation.
- **build.post modifies git-tracked files**: If a future `build.post` step modifies git-tracked files (beyond `dist/`), the dirty check before `build.post` would not catch it, and `mission.git.commit` would stage those changes alongside the snapshot. Mitigation: current `build.post` steps only write to `dist/` (gitignored). If a future step writes to git-tracked files, the dirty check must be re-evaluated.

## Acceptance criteria

- [ ] `mission.validate` cleans `dist/` before running the astro build (evidence: unit test or integration test verifying dist/ is removed)
- [ ] `mission.validate` checks `isWorkpieceDirty()` before `build.post` and skips auto-regeneration when dirty (evidence: unit test)
- [ ] `mission.validate` auto-regenerates the behavior snapshot when `behavior.snapshot.validate` reports SNAP-01 and the workpiece was clean (evidence: unit test in `packages/os/site-kernel-handoff/src/tests/mission-validate.test.ts`)
- [ ] After auto-regeneration, `mission.validate` re-runs `build.post` and passes if the routes match (evidence: unit test)
- [ ] `mission.validate` does NOT auto-regenerate when the workpiece is dirty (evidence: unit test)
- [ ] `mission.validate` does NOT auto-resolve non-SNAP-01 errors (STALE-01, MDMETA-04, GEN-FILES-01) (evidence: unit test)
- [ ] `mission.git.commit` during auto-regeneration stages only the snapshot file (evidence: unit test verifying git-tracked files before and after commit)
- [ ] `pnpm --filter @warpgogol/site-kernel-handoff test -- --run` passes with new tests (evidence: test output)
- [ ] `rfc.validate` passes on this file before merging (evidence: `pnpm exec site-kernel run rfc.validate --id RFC-0615 --json`)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST clean `dist/` before the astro build, not after — the build needs a clean slate.
- Agents MUST check `isWorkpieceDirty()` before `build.post` and skip auto-regeneration when the workpiece is dirty.
- Agents MUST use `executeKernelPipeline` directly (not `runPipelinePhase`) for `build.post` so they can inspect `report.steps[]` for SNAP-01 diagnostics.
- Agents MUST only auto-regenerate the snapshot for SNAP-01 errors (`data.diagnostics[].ruleId === "SNAP-01"`), not for other snapshot validation failures.
- Agents MUST re-run `build.post` after regeneration — do not assume regeneration always fixes the issue.
- Agents MUST commit the regenerated snapshot via `mission.git.commit`, not by directly editing the workpiece git repo.
- Agents MUST NOT auto-regenerate from a dirty workpiece — `mission.git.commit` stages all changes (`git add -A`), which would mix unrelated changes with the snapshot.
- Agents MUST NOT auto-resolve non-SNAP-01 validation errors — only SNAP-01 is deterministic.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
