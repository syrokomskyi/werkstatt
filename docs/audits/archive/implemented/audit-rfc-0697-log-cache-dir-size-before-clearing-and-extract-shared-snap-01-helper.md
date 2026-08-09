---
rfcId: RFC-0697
auditId: AUDIT-RFC-0697-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0697

## Verdict: Needs revision

The RFC correctly identifies two improvement opportunities in the RFC-0689 implementation, but contains a factual error in the command name (`mission.materialize` vs `mission.validate`) and the proposed `orchestrateSnap01Recovery` interface does not account for the build-skip case (no rebuild) or the `dirtyBeforeBuildPost` pre-condition in `mission.validate`.

## Mechanical validation (rfc.validate)

Pass with 1 warning:

- **V-19 (warning):** `RFC-0697.amends` includes `RFC-0689`, but `RFC-0689.amendedBy` does not include `RFC-0697`. Expected for a draft amending RFC — the backreference on RFC-0689 will be added when RFC-0697 is accepted. No action needed now.

## Axis A — Structural completeness

- **Wrong command name in `commands.changed`:** The RFC lists `mission.materialize` in `commands.changed`, but the SNAP-01 detection logic at `mission-materialization-commands.ts:447-495` is inside `runMissionValidate`, not `runMissionMaterialize`. The command is `mission.validate`, not `mission.materialize`. The same error appears in the Context section: "mission.materialize in mission-materialization-commands.ts both implement SNAP-01 detection" — the file name `mission-materialization-commands.ts` was confused with the command name. The file contains both `runMissionMaterialize` and `runMissionValidate`; only `runMissionValidate` has SNAP-01 logic.
- **File system responsibilities table** lists `mission-materialization-commands.ts` as "Modified: use shared helper instead of inline SNAP-01 logic" — this is correct for the file, but the RFC should clarify it's the `mission.validate` handler within that file, not `mission.materialize`.

## Axis B — DNA alignment

No issues. `satisfies: []` is acceptable for a `command` kind RFC. No DNA invariants are claimed or needed.

## Axis C — Ecosystem fit

- **Command lifecycle:** `commands.changed` should list `mission.validate` instead of `mission.materialize`. The `mission.validate` command is the one that has the SNAP-01 detection logic at `mission-materialization-commands.ts:447-495`. `mission.materialize` does not have SNAP-01 detection.
- **Package boundaries:** `@warpgogol/site-kernel-handoff` is the correct package. All three files (`leitstand-commands.ts`, `mission-materialization-commands.ts`, `snapshot-auto-regen.ts`) are in this package. ✓
- **No new commands or pipeline steps.** ✓

## Axis D — Forward-only compliance

No issues. The RFC extracts shared code and adds logging — no backward compatibility layers, no shims, no dual-paths. The inline SNAP-01 logic in both callers will be replaced by the shared helper (forward-only replacement, not parallel coexistence).

## Axis E — Agent-facing policy

No issues. Status gate is correct ("Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)"). Implementation notes are explicit behavioral rules. No content authoring involved. No storage policy issues.

## Axis F — Pragmatism

- **`Snap01OrchestrationOptions` interface does not account for the build-skip case.** `leitstand.dev-deploy` has three SNAP-01 paths: (1) build failure → detect → regenerate → re-build, (2) build-skip → detect → regenerate (no rebuild). The proposed interface has `rebuildFn: () => Promise<void>` as required, but the build-skip path at `leitstand-commands.ts:747-781` does not re-build after regeneration. The interface needs either an optional `rebuildFn` or a separate code path for the no-rebuild case.
- **`dirtyBeforeBuildPost` pre-condition not accounted for.** `mission.validate` at `mission-materialization-commands.ts:413-418` checks `isWorkpieceDirty(workpieceDir)` before attempting SNAP-01 regeneration. If the workpiece is dirty, regeneration is skipped. The proposed `Snap01OrchestrationOptions` interface has no way to express this pre-condition. The caller would need to check this before calling the helper, reducing the amount of shared logic.
- **Different detection mechanisms.** `mission.validate` detects SNAP-01 from `postPipelineReport.steps.find(s => s.commandName === "behavior.snapshot.validate")?.data` — i.e., from the pipeline step data already available. `leitstand.dev-deploy` runs `behavior.snapshot.validate` separately via `executeKernelCommand` because `pnpm build` is opaque (`execSync`). The `validateFn` abstraction handles this, but the caller still needs to construct the validate function differently, which limits the deduplication.
- **Different post-regeneration handling.** `mission.validate` re-runs `executeKernelPipeline({ pipelineName: "build.post" })` and checks `revalidateReport.ok`. `leitstand.dev-deploy` re-runs `execSync("pnpm build")` and catches the exception. The `rebuildFn` abstraction handles this, but the callers handle the outcome differently: `mission.validate` sets `buildSucceeded` and `buildError`; `leitstand.dev-deploy` sets `buildState` and `snapshotRegenerated` and writes build-skip cache. The helper returns `Snap01OrchestrationResult`, but each caller still needs custom post-processing logic.

## Axis G — Blind spots

- **Build-skip path not mentioned in Design.** The RFC's Design section and TypeScript contracts do not mention the build-skip SNAP-01 path at `leitstand-commands.ts:747-781`. This path has different behavior (no rebuild) and would need a different call to `orchestrateSnap01Recovery` or a separate helper. The acceptance criteria say "No duplicated SNAP-01 detection + re-build code between the two callers" but the build-skip path is a third caller location that also has SNAP-01 detection logic.
- **`dirtyBeforeBuildPost` check not mentioned.** The `mission.validate` SNAP-01 path has a pre-condition check (`isWorkpieceDirty`) that gates whether regeneration is attempted. The RFC does not mention this check or how the shared helper should handle it.
- **Cache size logging performance.** The RFC addresses `readdirSync` performance in Risks. The cache is cleared every deploy, so it should not accumulate thousands of files. This is adequate. ✓

## Questions for the author

1. Should `commands.changed` list `mission.validate` instead of `mission.materialize`? The SNAP-01 detection logic is in `runMissionValidate` (the `mission.validate` command handler), not `runMissionMaterialize`.
2. How should `orchestrateSnap01Recovery` handle the build-skip case where no rebuild is needed? The proposed interface has `rebuildFn` as required, but the build-skip path at `leitstand-commands.ts:747-781` only regenerates the snapshot without re-building.
3. How should the `dirtyBeforeBuildPost` pre-condition in `mission.validate` be expressed in the shared helper? Should it be an option on `Snap01OrchestrationOptions`, or should the caller check it before invoking the helper?
