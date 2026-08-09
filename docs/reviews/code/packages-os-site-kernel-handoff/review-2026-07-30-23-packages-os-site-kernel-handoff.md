---
reviewId: REVIEW-CODE-2026-07-30-01
date: 2026-07-30
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: f213cf2...HEAD
filesReviewed:
  - packages/os/site-kernel/src/types.ts
  - packages/os/site-kernel/src/cli/index.ts
  - packages/os/site-kernel/src/runtime/execute-command.ts
  - packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts
  - packages/os/site-kernel-handoff/src/mission/mission.module.ts
  - packages/os/site-kernel-handoff/src/tests/mission-validate-distribution-reuse.test.ts
  - packages/os/site-kernel-handoff/src/tests/mission-build-check-phase.test.ts
  - packages/os/site-kernel/AGENTS.md
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/rfcs/rfc-0635-reuse-distribution-in-mission-validate-when-build-input-hash-matches.md
---

# Code Review: f213cf2...HEAD (RFC-0635 implementation)

## Verdict: Needs revision

The implementation is architecturally sound and well-tested, but has two findings: a data contract mismatch in the reuse path (reading fields that don't exist in `build-manifest.json`) and a duplicated dirty-check/nextSteps pattern.

## Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel run build:check` and `pnpm --filter @warpgogol/site-kernel-handoff run build:check` both pass. All 488 unit tests pass. `rfc.validate --id RFC-0635` passes.

## Axis A — Structural correctness

**Finding A-1: Data contract mismatch in distribution reuse path.** `mission-materialization-commands.ts:214-226` reads `routeCount` and `sitemapHash` from `distribution/build-manifest.json`, but `runMissionBuild` (line 695-702) writes only `builtAt`, `missionId`, `systemId`, `succeeded`, and optionally `error` to that file — `routeCount` and `sitemapHash` are never written. The fallback values (`0`, `"sha256:reused"`) mask the missing fields, but the code suggests a data contract that doesn't exist. Either add `routeCount` and `sitemapHash` to the `build-manifest.json` writer in `runMissionBuild`, or remove the read attempt and use the fallback values directly.

**Finding A-2: Duplicated dirty-check + nextSteps pattern.** The `dirtyCheck` + `nextSteps` construction is duplicated between the reuse path (lines 248-275) and the normal path (lines 547-567). Both blocks construct the same `KernelNextStep[]` based on `dirtyCheck.dirty`. Extract a helper like `buildValidateNextSteps(missionId, dirtyCheck)` to eliminate the duplication.

## Axis B — DNA alignment

No issues. The change respects ADR-0008 (full three-phase build pipeline), DNA-47 (workpiece materialized from pinned bundle), and the mission lifecycle invariants. `computeBuildInputHash` is reused from `build-pipeline-helpers.ts` per DNA-53 (fingerprint governance).

## Axis C — Ecosystem fit

No issues. Package boundaries are correct (`site-kernel-handoff` imports from `site-kernel`). `build.check` is placed in the correct pipeline position. `mission.validate` registration now declares `cacheable: false`. AGENTS.md files are updated for both packages.

## Axis D — Forward-only compliance

No issues. No compatibility shims or legacy paths. The `--force` flag injection is a new capability, not a bridge.

## Axis E — Agent-facing clarity

No issues. New test files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`. Comments reference RFC-0635. The `as unknown as MissionValidateData` cast is an existing pattern in the file (used by all report construction sites) — not ideal but consistent.

## Axis F — Pragmatism

No issues. The `--force` flag delivery via `KernelRuntimeContext` is minimal and non-intrusive. The `build.check` phase in `mission.build` uses the existing `runPipelinePhase` helper. No new commands or speculative generality.

## Axis G — Blind spots

**Finding G-1: Empty `distribution/dist/` edge case.** `existsSync(distributionDistDir)` returns `true` for an empty directory. If `distribution/dist/` exists but is empty (e.g., from a partially failed `mission.build` that wrote the hash but not the dist), the reuse path would copy an empty directory to `workpiece/dist/`. In practice, `mission.build` only writes `build-input-hash.json` when `buildSucceeded` is true, and a successful build always produces a non-empty `dist/`. This is a low-risk edge case but worth documenting.

## Spec compliance

| Requirement from RFC-0635 | Status | Evidence |
| --- | --- | --- |
| Check `build-input-hash.json` before build cycle | Done | mission-materialization-commands.ts:175-284 |
| Copy `distribution/dist/` to `workpiece/dist/` when missing | Done | mission-materialization-commands.ts:207-212 |
| `--force` bypasses hash check | Done | mission-materialization-commands.ts:177 |
| `build.check` in `mission.build` between `build.prepare` and `astro build` | Done | mission-materialization-commands.ts:633-645 |
| `MissionValidateData` includes `distributionReused`, `buildInputHash`, `fullBuildRan` | Done | mission-materialization-commands.ts:72-81 |
| Unit test: hash match → skip, `distributionReused: true` | Done | mission-validate-distribution-reuse.test.ts test 1 |
| Unit test: hash mismatch → full build, `distributionReused: false` | Done | mission-validate-distribution-reuse.test.ts test 2 |
| Unit test: `--force` → full build regardless | Done | mission-validate-distribution-reuse.test.ts test 3 |
| Unit test: `mission.build` includes `build.check` | Done | mission-build-check-phase.test.ts test 1 |
| Existing tests updated for reuse path | Done | No assertion changes needed — all 488 tests pass |
| `cacheable: false` on `mission.validate` | Done | mission.module.ts:202 |
| `rfc.validate` passes | Done | status: pass, violations: [] |

## Questions for the author

1. Should `build-manifest.json` in `runMissionBuild` be extended to include `routeCount` and `sitemapHash`, or should the reuse path stop reading them from there and use fixed fallback values?
2. Is the empty `distribution/dist/` edge case (G-1) worth adding a guard for, or is it sufficiently mitigated by `mission.build` only writing the hash on success?
