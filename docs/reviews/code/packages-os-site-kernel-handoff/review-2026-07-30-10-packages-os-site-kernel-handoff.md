---
reviewId: REVIEW-CODE-2026-07-30-02
date: 2026-07-30
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 74fb21f...82f48f8
filesReviewed:
  - packages/os/site-kernel-handoff/src/mission/mission-open.ts
  - packages/os/site-kernel-handoff/src/mission/mission-close.ts
  - packages/os/site-kernel-handoff/src/tests/mission-open-bordbuch-gate.test.ts
  - packages/os/site-kernel-handoff/src/tests/mission-close-validate-gate.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/rfcs/rfc-0593-add-validation-gates-to-mission-lifecycle-bordbuch-validate-before-mission-open-and-mission-validate-before-mission-close.md
---

# Code Review: 74fb21f...82f48f8 (RFC-0593 validation gates)

### Verdict: Needs revision

Implementation is architecturally sound and aligns with DNA-46/DNA-47. One finding: an unused parameter in `runInlineValidate`.

### Mechanical floor

Pass — `tsc --noEmit` passes, `rfc.validate` passes, 358 tests pass.

### Axis A — Structural correctness

1. **Unused parameter `workspaceRoot` in `runInlineValidate`** — `mission-close.ts:88` declares `workspaceRoot` as the first parameter but never uses it inside the function body. The `workspaceRoot` is available via `context.workspaceRoot` and the function already receives `context`. Remove the parameter and update the call site at line 148.

### Axis B — DNA alignment

No issues. The diff extends DNA-46 (mission lifecycle) by adding validation gates to `mission.open` and `mission.close`, and makes DNA-47 (materialization) `mission.validate` mandatory before close. Both gates enforce existing invariants — no new invariants introduced.

### Axis C — Ecosystem fit

No issues. `validateBordbuch` and `runMissionValidate` are reused from existing modules. No new commands introduced. AGENTS.md updated with new gate behavior. Package boundaries respected — all changes within `packages/os/site-kernel-handoff`.

### Axis D — Forward-only compliance

No issues. No backward compatibility layers, no shims, no dual-paths. The gates are additive enforcement — they don't replace existing logic, they add a precondition check.

### Axis E — Agent-facing clarity

No issues. New functions `preflightBordbuch` and `runInlineValidate` have clear names. CHANGE_SUMMARY blocks updated with RFC-0593 entries. Comments reference the RFC and explain the TOCTOU tradeoff. Test files carry MODULE_CONTRACT scaffolding.

### Axis F — Pragmatism

No issues. `preflightBordbuch` is a thin wrapper around `validateBordbuch` — minimal and focused. `runInlineValidate` reuses `runMissionValidate` directly instead of duplicating validation logic. The synthetic `KernelCommandInput` is minimal (`{ argv: [], args: [], flags: { mission } }`).

### Axis G — Blind spots

No issues. TOCTOU for `preflightBordbuch` is documented in AGENTS.md and in code comments. Lock scope design avoids holding locks for 2+ minutes. State re-check inside locks catches the TOCTOU window for `mission.close`. Double build cost is documented in RFC Risks section.

### Spec compliance

| Requirement from RFC-0593             | Status | Evidence                                    |
| ------------------------------------- | ------ | ------------------------------------------- |
| bordbuch.validate before mission.open | Done   | mission-open.ts:83-96                       |
| mission.validate before mission.close | Done   | mission-close.ts:148-154                    |
| No --force bypass flag                | Done   | No flag added                               |
| State re-check inside lock            | Done   | mission-close.ts:173-180                    |
| AGENTS.md documentation               | Done   | AGENTS.md:118-124                           |
| Unit tests for both gates             | Done   | 2 test files, 4 tests                       |
| Lock re-check test                    | Done   | mission-close-validate-gate.test.ts:140-170 |

### Questions for the author

1. `runInlineValidate` accepts `workspaceRoot` but doesn't use it — should this parameter be removed?
