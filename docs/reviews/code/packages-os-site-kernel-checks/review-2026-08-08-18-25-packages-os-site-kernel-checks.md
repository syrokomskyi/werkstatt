---
reviewId: REVIEW-CODE-2026-08-08-01
date: 2026-08-08
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: d2e19f22...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts
  - packages/os/site-kernel-checks/src/command-tables/build-infra.ts
  - packages/os/site-kernel-checks/src/content-regression.ts
  - packages/os/site-kernel-checks/src/tests/content-regression.test.ts
  - packages/os/site-kernel-checks/AGENTS.md
  - packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts
  - packages/os/site-kernel-handoff/src/mission/mission.module.ts
  - packages/os/site-kernel-handoff/src/mission/index.ts
---

# Code Review: RFC-0764 — --auto-accept flag for content.regression.check

### Verdict: Needs revision

The implementation is functionally correct and well-tested, but has a few findings: a missing CHANGE_SUMMARY entry, a potential edge case with removed-route decisions in auto-accept, and a minor type extension concern.

### Mechanical floor

Pass — both `@warpgogol/site-kernel-checks` and `@warpgogol/site-kernel-handoff` pass `build:check` (tsc --noEmit). All 22 content-regression tests pass. 789 handoff tests pass.

### Axis A — Structural correctness

- **CHANGE_SUMMARY missing**: `content-regression.ts` has a `MODULE_CONTRACT` and `CHANGE_SUMMARY` block at the top, but the RFC-0764 changes (auto-accept logic, CREG-06) are not recorded in the `CHANGE_SUMMARY`. The existing entries mention RFC-0732 and RFC-0734. A new `<item>RFC-0764: ...</item>` should be added.
- **Type extension via intersection**: `ContentRegressionApplyResult & { autoAccepted: boolean }` is used inline in the auto-accept path. This is a one-off type extension that doesn't exist on the `ContentRegressionApplyResult` interface. If `mission.close` ever reads `autoAccepted` from `apply-result.json`, it won't find it on the interface. Consider adding `autoAccepted?: boolean` to the interface or documenting that it's an auto-accept-specific extension.

### Axis B — DNA alignment

- **DNA-61 alignment**: The auto-accept flag writes the golden snapshot to the cache clone's `.cache/content-regression/` directory — consistent with DNA-61's requirement that snapshots live only in the cache clone. Pass.
- **DNA-63 alignment**: DNA-63 requires that content drift is "explicitly reviewed by the operator before the golden baseline is updated." The `--auto-accept` flag bypasses manual operator review but still generates a `review.yaml` audit trail with all decisions set to `accept`. This is a deliberate design decision documented in the RFC (amends DNA-63 via RFC-0764). The audit trail preserves the review record. Pass with note.

### Axis C — Ecosystem fit

- **Command registration**: The `auto-accept` flag is correctly registered in `build-infra.ts` and the `auto-accept-regression` flag is correctly registered in both `mission.module.ts` and `index.ts`. Pass.
- **AGENTS.md update**: The `packages/os/site-kernel-checks/AGENTS.md` was updated with RFC-0764 information. Pass.
- **Pipeline propagation**: `mission.validate` correctly propagates `auto-accept-regression` as `auto-accept` to the `build.check` pipeline. Pass.

### Axis D — Forward-only compliance

No issues. The `--auto-accept` flag is purely additive — the default fail-on-drift behavior is unchanged. No compatibility shims or legacy paths.

### Axis E — Agent-facing clarity

- **No ungrounded assertions**: All code references real functions and types. Pass.
- **Readable**: Variable names are clear. The `autoAccept` flag, `hasDrift` check, and `applyResult` construction are all self-documenting. Pass.

### Axis F — Pragmatism

- **Minimal command surface**: The `--auto-accept` flag is a boolean on an existing command — no new command. Pass.
- **Existing patterns**: The implementation reuses `buildReviewChanges`, `reviewToYaml`, `snapshotToYaml`, `writeFileIfChanged`, and `resolveMissionId` — all existing helpers. Pass.
- **Scope discipline**: The diff touches only the necessary files. Pass.

### Axis G — Blind spots

- **Removed-route decisions in auto-accept**: The code skips setting `decision: "accept"` for `removed-route` changes (`if (change.kind !== "removed-route")`). This means removed routes have `decision: "pending"` in the review.yaml. The `apply-result.json` counts only `accepted` changes (those with `decision: "accept"`), so removed routes won't be counted as accepted. This is intentional (removed routes can't be "accepted" — they represent content that no longer exists), but the `pending: 0` claim in `apply-result.json` may be inaccurate if there are removed routes with `decision: "pending"`. The `mission.close` CREG-05 check verifies `pending === 0`, so this could block close if removed routes exist. This needs verification or the removed routes should be set to `accept` as well.
- **Edge case — no mission ID**: When `resolveMissionId` returns null, the evidence directory falls back to the cache clone. This is handled, but the `apply-result.json` in the cache clone may not be found by `mission.close` which looks in `missions/{missionId}/evidence/content-regression/`. This is acceptable for standalone (non-mission) usage.

### Spec compliance

| Requirement from RFC-0764 | Status | Evidence |
| --- | --- | --- |
| `--auto-accept` flag on `content.regression.check` | Done | `build-infra.ts:178-184` |
| Auto-accept updates golden baseline | Done | `content-regression.ts:569-578` |
| Review manifest generated with all-accept decisions | Done | `content-regression.ts:529-567` |
| `apply-result.json` written | Done | `content-regression.ts:581-593` |
| CREG-06 diagnostic rule | Done | `core-infra.ts:526-530` |
| `--auto-accept-regression` on `mission.validate` | Done | `mission-materialization-commands.ts:380-383` |
| Default behavior unchanged | Done | Unit test verifies fail-on-drift without flag |
| `cacheable: false` on command | Done | `build-infra.ts:167` (pre-existing) |

### Questions for the author

1. Should removed-route changes be set to `decision: "accept"` in auto-accept mode? If they remain `pending`, `apply-result.json` reports `pending: 0` but the review.yaml has pending entries — is this inconsistent?
2. Should `autoAccepted` be added to the `ContentRegressionApplyResult` interface to formalize the type extension?
3. Should the `CHANGE_SUMMARY` in `content-regression.ts` be updated with the RFC-0764 changes?
