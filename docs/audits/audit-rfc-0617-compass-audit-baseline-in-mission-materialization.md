---
rfcId: RFC-0617
auditId: AUDIT-RFC-0617-01
date: 2026-07-31
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0617

## Verdict: Needs revision

The RFC solves a real release-pipeline blocker and the core mechanism (auto-baseline during materialization) is sound. However, the file system responsibilities table names the wrong source file for `mission.materialize`, the command lifecycle bucket misclassifies a flag change to an existing command as `proposed`, and the RFC doesn't address how the Compass inventory will classify workpiece files that don't match the `apps/`/`packages/`/`services/` path prefixes.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **A-1: Wrong file name for `mission.materialize`.** The file system responsibilities table (line 151) and implementation notes (line 199) name `mission-materialization-commands.ts` as the file containing `mission.materialize`. The actual `runMissionMaterialize` function lives in `@/packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:561`. The `mission-materialization-commands.ts` file contains `runMissionValidate`, `runMissionBuild`, `runMissionDiff`, and `runMissionReconcile` — not `runMissionMaterialize`.
- **A-2: Missing `resolve-scan-root.ts` in file system responsibilities.** The `--workpiece` flag requires modifying `resolveCompassScanRoot` in `@/packages/forge/os/compass/handlers/resolve-scan-root.ts:20` to handle the new flag. This file is not listed in the table. The current function only handles `--packages` and `--site` (via `context.site`); a `--workpiece` path would fall through to `undefined` scan root, scanning the entire workspace instead of just the workpiece.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-43]` is correct — DNA-43 mandates periodic semantic-truth audit, and this RFC ensures new workpiece files enter the audit ledger at materialization time. `related: [RFC-0352, RFC-0356]` are both directly relevant.

## Axis C — Ecosystem fit

- **C-1: `compass.audit.baseline --workpiece` is in `commands.proposed` but should be in `commands.changed`.** `compass.audit.baseline` is an existing registered command added by RFC-0352. Per the command lifecycle convention, `proposed` is for new commands that will land in `added`; changes to existing registered commands go in `changed`. The RFC already correctly lists `mission.materialize` in `changed` — `compass.audit.baseline` should also be in `changed`.
- **C-2: Compass inventory classification for workpiece paths is unaddressed.** `createCompassInventoryEntries` in `@/packages/forge/os/compass/handlers/compass-inventory.ts:39` uses `DEFAULT_SCAN_ROOTS = ["apps", "packages", "services"]` and classifies files as `app`, `package`, or `service` based on path prefixes. Workpiece files at `missions/<id>/workpiece/` don't match any of these prefixes. The RFC doesn't explain whether the inventory function needs changes to handle workpiece paths, or whether the existing `scanRoot`-based scanning already works correctly for arbitrary directories.

## Axis D — Forward-only compliance

No issues. The `--workpiece` flag is additive, no compatibility shims or dual paths.

## Axis E — Agent-facing policy

No issues. Status gate is respected (draft → no implementation). Implementation notes are explicit behavioral rules.

## Axis F — Pragmatism

- **F-1: The RFC should justify why `--workpiece` is needed instead of `--site`.** When a mission is active, the kernel's site resolver already resolves `--site <systemId>` to the workpiece directory (via `registry.currentMission`). The RFC doesn't explain why `--site` is insufficient. If `mission.materialize` calls `compass.audit.baseline` programmatically via `executeKernelCommand` without a site context, that would justify a direct path flag — but the RFC should state this explicitly.

## Axis G — Blind spots

- **G-1: Revision tracking for workpiece files is not acknowledged.** `getRevisionByPath` in `@/packages/forge/os/compass/handlers/git-revision.ts:95` looks up the integrity registry at `.integrity/index/` in `workspaceRoot`, then falls back to `getFileRevisionFromHistory` which runs `git log` in `workspaceRoot`. Workpiece files are not in the integrity registry (it covers `apps/`, `packages/`, `services/`) and are not in the monorepo's git history (the workpiece has its own `.git`). So `revision = 1` always for workpiece files. This means the audit cadence is effectively disabled: files are seeded at revision 1 and `1 - 1 = 0 < 30` → never overdue. This is acceptable for ephemeral workpiece files, but the RFC should be explicit about it.
- **G-2: Imprecise insertion point description.** The RFC says "after codegen, before the first `mission.build`" (line 171) but `runMissionMaterialize` doesn't call `mission.build` — it runs the `build.prepare.dev` pipeline (`@/packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:862`). The RFC should specify the exact insertion point: after `generateFullBoilerplate` (line 807) and after `build.prepare.dev` completes (line 878), and after the git commit (line 941) so files have a git revision.
- **G-3: `--workpiece` and `--site` mutual exclusivity is unspecified.** The current `resolveCompassScanRoot` throws for `--site` + `--packages`. The RFC specifies `--workpiece` + `--packages` exclusivity but doesn't address `--workpiece` + `--site`.

## Questions for the author

1. How will `createCompassInventoryEntries` classify workpiece files at `missions/<id>/workpiece/` that don't match the `apps/`, `packages/`, or `services/` path prefixes? Does the inventory function need changes beyond what's listed in the file system responsibilities table?
2. Why is a new `--workpiece` flag needed when `--site` already resolves to the workpiece directory during an active mission? Is `--site` insufficient because `mission.materialize` calls the command programmatically without a site context?
3. What is the exact insertion point in `runMissionMaterialize` for the baseline call? The RFC says "after codegen, before the first `mission.build`" but `mission.materialize` doesn't call `mission.build` — it runs `build.prepare.dev`. Should the baseline run after `build.prepare.dev` (to capture all generated files) or before it (since authored files are already present from `generateFullBoilerplate`)?
