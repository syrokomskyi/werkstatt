---
reviewId: REVIEW-CODE-2026-08-12-03
date: 2026-08-12
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: 621fbe21...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/playwright-chromium-ensure.ts
  - packages/werkstatt-site/src/checks/playwright-preflight.ts
  - packages/werkstatt-site/src/checks/command-tables/infra-contracts.ts
  - packages/werkstatt-site/src/checks/index.ts
  - packages/werkstatt-site/src/checks/tests/playwright-preflight.test.ts
  - packages/werkstatt/src/mission/mission-materialization-commands.ts
  - docs/rfcs/rfc-0813-add-playwright-preflight-check-to-mission-validate.md
---

# Code Review: 621fbe21...HEAD (RFC-0813)

### Verdict: Approved

Zero findings across all seven axes. The diff is a clean extraction + new command + wiring with tests.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-site build:check` exits 0, `pnpm --filter @warpgogol/werkstatt build:check` exits 0, 9/9 tests pass (6 existing + 3 new), `rfc.validate --id RFC-0813` passes, `rfc.acceptance.run --id RFC-0813` passes.

### Axis A — Structural correctness

No issues. `isChromiumInstalled` is a clean extraction from `ensureChromium` — same `chromium.launch({ headless: true })` detection logic, now returning a structured `ChromiumInstallStatus` with `error` field for the original launch error. `ensureChromium` correctly delegates to it as its first phase. The preflight handler is a thin wrapper that maps the two outcomes (installed/not-installed) to exit codes and summaries.

### Axis B — DNA alignment

No issues. DNA-64 (autonomy guard) is respected — `mission-materialization-commands.ts` uses `executeKernelCommand` with `playwright.preflight.check` instead of directly importing `isChromiumInstalled` from `@warpgogol/werkstatt-site/checks`, because the `checks` subpath is not in the autonomy exemption list. This is the plan's documented escalation fallback (§6).

### Axis C — Ecosystem fit

No issues. The new command is registered in `infra-contracts.ts` alongside `playwright.chromium.ensure`, following the existing command table pattern. The command manifest was regenerated (747 commands). No pipeline definitions were changed — the preflight is a direct `executeKernelCommand` call inside `runMissionValidate`, not a pipeline step, as specified in the RFC.

### Axis D — Forward-only compliance

No issues. No legacy code paths, no compatibility shims. The `isChromiumInstalled` extraction is purely additive — `ensureChromium` behavior is unchanged (same launch check, same auto-install fallback).

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding added to `playwright-preflight.ts`. `CHANGE_SUMMARY` updated in `playwright-chromium-ensure.ts` and `infra-contracts.ts`. RFC-0813 references are clear in all comments.

### Axis F — Pragmatism

No issues. The `executeKernelCommand` approach is slightly heavier than a direct function call (kernel registry lookup), but it's the correct choice given DNA-64 constraints. The non-fatal catch block in `runMissionValidate` is pragmatic — if the preflight check itself throws unexpectedly, the build proceeds rather than failing on an unrelated error.

### Axis G — Blind spots

No issues. The test mocks are well-structured — same pattern as the existing `playwright-chromium-ensure.test.ts`. The `vi.mock("playwright")` factory correctly controls `chromium.launch` behavior per test. The three test cases cover the two acceptance criteria (pass/fail) plus the error-message-includes-original-launch-error requirement.

### Spec compliance

| Requirement from RFC-0813 | Status | Evidence |
| --- | --- | --- |
| playwright.preflight.check registered | Done | `infra-contracts.ts:439-448` |
| isChromiumInstalled extracted | Done | `playwright-chromium-ensure.ts:46-59` |
| Runs after distribution-reuse, before build.prepare | Done | `mission-materialization-commands.ts:427-476` |
| Fails fast with error message | Done | `playwright-preflight.ts:42-48` |
| Silent pass when installed | Done | `playwright-preflight.ts:36-40` |
| Skipped on distribution-reuse path | Done | `mission-materialization-commands.ts:425` (after early-return) |
| Unit test: missing → exit 1 | Done | `playwright-preflight.test.ts:56-66` |
| Unit test: installed → exit 0 | Done | `playwright-preflight.test.ts:42-53` |
| rfc.validate passes | Done | 0 errors |

### Questions for the author

None.
