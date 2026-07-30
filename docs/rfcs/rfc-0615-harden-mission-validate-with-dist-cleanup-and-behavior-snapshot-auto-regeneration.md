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
reviewers: []
createdAt: 2026-07-30
updatedAt: 2026-07-30
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
appsImpacted:
  - warpgogol-com
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

`mission.validate` cleans `dist/` before running the astro build and markdown twin validation. When `behavior.snapshot.validate` reports SNAP-01, `mission.validate` auto-regenerates the behavior snapshot via `behavior.snapshot.generate`, commits the updated snapshot, and re-validates.

This amends RFC-0593 (mission validation gates) to reduce manual intervention during mission closure.

## Architectural fit

- **DNA-58 (Generated-file content determinism)**: Cleaning `dist/` before validation ensures only fresh build output is checked, preventing stale artifacts from producing false positives.
- **RFC-0593 (mission validation gates)**: Amended — two pre-flight steps (dist cleanup, snapshot auto-regeneration) are added to the validation pipeline.
- **RFC-0592 (exclude meta-refresh redirect stubs)**: Compatible — snapshot regeneration includes redirect stub handling.
- **RFC-0595 (mark redirect routes)**: Compatible — regenerated snapshot includes `contentHash: null` and `redirectTarget` for redirect routes.
- **RFC-0480 (mission git workpiece edits)**: Compatible — the auto-regenerated snapshot is committed via the existing workpiece commit mechanism.

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

2. **behavior snapshot auto-regeneration** (after build, when SNAP-01 is detected):
   ```ts
   // After behavior.snapshot.validate fails with SNAP-01
   if (snapshotResult.status === "fail" && snapshotResult.violations.some(v => v.rule === "SNAP-01")) {
     // Auto-regenerate snapshot
     await executeKernelCommand({ command: "behavior.snapshot.generate", site, workspaceRoot });
     // Commit updated snapshot in workpiece
     await executeKernelCommand({ command: "mission.git.commit", site, workspaceRoot, message: "chore: auto-regenerate behavior snapshot" });
     // Re-validate
     snapshotResult = await executeKernelCommand({ command: "behavior.snapshot.validate", site, workspaceRoot });
   }
   ```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/mission/mission-validate.ts` | Add dist cleanup and snapshot auto-regeneration logic |
| `missions/<missionId>/workpiece/dist/` | Cleaned before build |
| `missions/<missionId>/workpiece/behavior-snapshot.json` | Auto-regenerated when SNAP-01 detected |

### Failure modes

- **dist/ cleanup fails**: If `fs.rm` fails (permissions, locked files), log a warning and continue with the existing dist/. The build will overwrite stale files.
- **snapshot regeneration fails**: If `behavior.snapshot.generate` fails, report the error and exit non-zero. The operator must manually investigate.
- **snapshot re-validation fails**: If the snapshot still fails after regeneration, report the persistent SNAP-01 error and exit non-zero. This indicates a genuine route mismatch, not a stale snapshot.
- **Non-SNAP-01 errors**: STALE-01, MDMETA-04, GEN-FILES-01, and other validation errors are NOT auto-resolved. Only SNAP-01 is auto-regenerated.

## Rollout

- **No migration needed**: The dist cleanup and snapshot auto-regeneration apply immediately to all missions. Existing and future missions benefit from the hardening without any flag day.
- **No pipeline position change**: `mission.validate` remains in the same lifecycle position (before `mission.close`).
- **Idempotent**: Re-running `mission.validate` after auto-regeneration will find the snapshot up-to-date and skip regeneration.
- **Commit hygiene**: The auto-generated snapshot commit uses the existing `mission.git.commit` mechanism, ensuring proper authorship and staging.

## Alternatives considered

- **Warn-only mode for SNAP-01**: Rejected because a stale snapshot is a genuine validation failure that should be fixed, not warned about. Auto-regeneration is the correct fix — the snapshot is deterministic and should always match the current build.
- **Clean dist/ in build.prepare instead of mission.validate**: Rejected because `build.prepare` is also used outside mission validation (e.g., `mission.preview`), and cleaning dist/ there could remove artifacts needed by other consumers. `mission.validate` is the right scope because it runs a fresh build anyway.
- **Manual-only snapshot regeneration**: Rejected because it requires operator intervention for a deterministic operation. The operator's time is better spent on genuine validation failures, not mechanical snapshot updates.

## Risks

- **dist/ cleanup on network filesystems**: `fs.rm` with `recursive: true` may be slow on network filesystems. Mitigation: log the cleanup step and allow it to fail gracefully.
- **Auto-regeneration masking real issues**: If routes are genuinely missing from the build (not just a stale snapshot), auto-regeneration will produce a snapshot that matches the broken build. Mitigation: the re-validation step after regeneration will still catch other validation errors (STALE-01, MDMETA-04) that indicate real problems.
- **Commit churn**: Auto-regeneration creates an extra commit in the workpiece. This is acceptable — the commit is deterministic and necessary for validation to pass.
- **Agent confusion**: Agents may think all validation errors are auto-resolved. Only SNAP-01 is auto-resolved; all other errors require manual investigation.

## Acceptance criteria

- [ ] `mission.validate` cleans `dist/` before running the astro build (evidence: unit test or integration test verifying dist/ is removed)
- [ ] `mission.validate` auto-regenerates the behavior snapshot when `behavior.snapshot.validate` reports SNAP-01 (evidence: unit test in `packages/os/site-kernel-handoff/src/tests/mission-validate.test.ts`)
- [ ] After auto-regeneration, `mission.validate` re-validates the snapshot and passes if the routes match (evidence: unit test)
- [ ] `mission.validate` does NOT auto-resolve non-SNAP-01 errors (STALE-01, MDMETA-04, GEN-FILES-01) (evidence: unit test)
- [ ] `pnpm --filter @warpgogol/site-kernel-handoff test -- --run` passes with new tests (evidence: test output)
- [ ] `rfc.validate` passes on this file before merging (evidence: `pnpm exec site-kernel run rfc.validate --id RFC-0615 --json`)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST clean `dist/` before the astro build, not after — the build needs a clean slate.
- Agents MUST only auto-regenerate the snapshot for SNAP-01 errors, not for other snapshot validation failures.
- Agents MUST re-validate the snapshot after regeneration — do not assume regeneration always fixes the issue.
- Agents MUST commit the regenerated snapshot via `mission.git.commit`, not by directly editing the workpiece git repo.
- Agents MUST NOT auto-resolve non-SNAP-01 validation errors — only SNAP-01 is deterministic.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
