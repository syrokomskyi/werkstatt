---
rfcId: RFC-0597
auditId: AUDIT-RFC-0597-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0597

## Verdict: Needs revision

The RFC proposes three sound optimizations to `mission.materialize` and is well-structured, but has several gaps that would cause implementation ambiguity: the `.dev` pipeline registration/invocation mechanism is unspecified, the `mission.close` vs `mission.reconcile` responsibility split is inconsistent between sections, and the relationship between the existing `--skip-preflight` flag and the new state-file-based skip is unaddressed.

## Mechanical validation (rfc.validate)

Pass — zero violations targeting RFC-0597. (The global `rfc.validate` run reports pre-existing violations in archived RFCs, none in this file.)

## Axis A — Structural completeness

- **Pipeline registration gap.** The RFC exports `SITES_BUILD_PREPARE_DEV_PIPELINE` from `build-prepare.ts` but does not explain how this pipeline is registered in the kernel registry or invoked by `mission.materialize`. The current code at `@/packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:784-789` calls `executeKernelPipeline({ pipelineName: "build.prepare" })`, which looks up the pipeline by name from the kernel registry (`registry.getPipeline(options.pipelineName)` in `@/packages/os/site-kernel/src/runtime/execute-pipeline.ts:631`). The RFC must specify: (1) which kernel module registers the new pipeline (e.g., `createStandardCheckModule` in `site-kernel-checks/src/module.ts`), (2) what pipeline name is registered (e.g., `"build.prepare.dev"`), and (3) how `mission.materialize` invokes it (new `pipelineName` or a different API).

- **`mission.close` vs `mission.reconcile` inconsistency.** The file system responsibilities table (lines 229-230) assigns both the state file write and `.cache/` copy to `mission-close.ts` only. But the acceptance criteria (lines 295-296) say "mission.close (or mission.reconcile)" for both operations. The `commands.changed` frontmatter (line 55) includes `mission.reconcile`. These three locations disagree on which command writes the state file and copies `.cache/`. The RFC must pick one owner (or split responsibilities) and align all three locations.

- **`.dev` pipeline classification unexplained for validators.** The excluded list (lines 205-213) omits `manifest.contract.validate`, `mirror.quintet.validate`, `generated.files.validate`, and `uni.registry.build` from `.dev`. The classification rule (line 312) says "a step belongs in `.dev` if and only if its output is consumed by `astro dev`". But `generated.files.validate` is a validator — it doesn't produce output, it catches missing generated files. Excluding it means a silently failed codegen generator won't be caught until `mission.validate`. The RFC should either include these validators in `.dev` or explicitly justify their exclusion.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-46, DNA-47]` are real invariants. DNA-46 (mission lifecycle) is preserved — states and bordbuch contract unchanged. DNA-47 (materialization) is refined — workpiece still materialized from pinned bundle, production artifacts deferred to `mission.validate` / `release.prepare`. `related[]` RFCs are all relevant. No new DNA invariant established. No conflicts with existing DNA.

## Axis C — Ecosystem fit

- **AGENTS.md update not specified.** The Risks section (line 285) says "the RFC and AGENTS.md must clearly state that `build.prepare.dev` is for dev-mode materialization" but does not list which `AGENTS.md` files need updating. At minimum, `packages/os/site-kernel-handoff/AGENTS.md` should document the pipeline split in its mission lifecycle section, and `packages/os/site-kernel-checks/AGENTS.md` should document the new pipeline export. The RFC should list these explicitly.

- **Pipeline placement is correct.** The new pipeline constant lives in `site-kernel-checks/src/pipelines/build-prepare.ts` alongside the existing `SITES_BUILD_PREPARE_PIPELINE`. `packagesImpacted` lists both `site-kernel-handoff` and `site-kernel-checks`. ✓

## Axis D — Forward-only compliance

No issues. No compatibility shim, no dual-path, no flags. The existing `SITES_BUILD_PREPARE_PIPELINE` is preserved (not deleted) and continues to be used by `mission.validate` and `release.prepare`. The optimizations are additive — missing state file or `.cache/` falls back to current behavior.

## Axis E — Agent-facing policy

- **`--skip-preflight` flag relationship unaddressed.** The current code at `@/packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:552` already has a `--skip-preflight` flag that unconditionally skips preflight. The RFC introduces an automatic state-file-based skip. The RFC does not specify the precedence relationship: if `--skip-preflight` is set AND the state file says HEAD is unchanged, what happens? If `--skip-preflight` is NOT set but the state file says HEAD is unchanged, does the automatic skip still append a bordbuch entry (the current `--skip-preflight` path does at line 816-829)? The RFC should clarify that the state-file skip and the flag skip are independent mechanisms with defined precedence.

- **Status gate is correct.** The RFC is `draft` and says "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." ✓

## Axis F — Pragmatism

No issues. No new commands, no new flags. `MaterializationState` interface is minimal (4 fields). The RFC extends existing commands rather than creating new ones. `packagesImpacted` is accurate. `nonGoals` are meaningful (preserve bordbuch.validate, preserve build.prepare for production, no new flags).

## Axis G — Blind spots

- **`.cache/` copy time not quantified.** The RFC states `.cache/video/` can grow to "hundreds of MB" (line 284) but does not estimate the copy time. Copying 500MB between cache clone and workpiece takes seconds — is this faster than re-encoding? The RFC should state the expected copy time and confirm it is negligible compared to the 180s+ re-encoding it replaces.

- **Existing workpiece `.cache/` not considered.** If a previous materialization attempt failed and left a `.cache/` in the workpiece, the RFC does not specify whether the cache clone's `.cache/` replaces or merges with it. The copy should likely be a replace (rm + copy) to avoid stale entries.

- **Concurrent materialization not mentioned.** The lock mechanism (`acquireLock` at `@/packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:565-578`) prevents concurrent materialization for the same system. The RFC does not need to add new locking but should mention that existing locks protect the state file and `.cache/` copy from race conditions.

- **`.dev` pipeline cost not quantified.** The success signal says "under 30 seconds" for unchanged cache, but the RFC does not estimate the `.dev` pipeline cost for the changed-cache case. The operator needs a concrete estimate (e.g., "~15 seconds for 38 codegen steps") to validate the success signal.

## Questions for the author

1. How is `SITES_BUILD_PREPARE_DEV_PIPELINE` registered in the kernel registry and invoked by `mission.materialize`? Specify the pipeline name, the registering module, and the invocation API.
2. Which command owns the state file write and `.cache/` copy — `mission.close` only, `mission.reconcile` only, or both? Align the file system responsibilities table, acceptance criteria, and `commands.changed` frontmatter.
3. Why are `generated.files.validate`, `manifest.contract.validate`, and `mirror.quintet.validate` excluded from `.dev`? If a codegen generator silently fails, the dev server will start with missing files and the error won't be caught until `mission.validate`. Is this acceptable, or should these validators be included in `.dev`?
4. What is the precedence relationship between the existing `--skip-preflight` flag and the new automatic state-file-based skip? Does the state-file skip append a bordbuch entry like the flag skip does?
