---
reviewId: REVIEW-CODE-2026-08-02-10
date: 2026-08-02
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: a3eeb41...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/command-args-validate.ts
  - packages/os/site-kernel-checks/src/command-tables/01-codegen.ts
  - packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts
  - packages/os/site-kernel-checks/src/generated-drift-validate.ts
  - packages/os/site-kernel-checks/src/generated-timestamp-validate.ts
  - packages/os/site-kernel-checks/src/pipelines/build-check.ts
  - packages/os/site-kernel-checks/src/tests/generated-drift-validate.test.ts
  - packages/os/site-kernel-checks/src/tests/generated-timestamp-validate.test.ts
  - packages/os/site-kernel-checks/AGENTS.md
  - docs/verification-plan.xml
---

# Code Review: RFC-0645 — eliminate timestamp allowlist and source-scanning timestamp validator

### Verdict: Approved

The diff cleanly eliminates `generated.timestamp.validate`, its allowlist, and the `TS-TIME-01` diagnostic rule. The `stripCommentsAndStrings` utility was correctly inlined into its sole consumer (`command-args-validate.ts`) before deletion. DRIFT-02 severity promotion from info to error is consistent across the validator, the rule descriptor, and the test. All 716 tests pass, `generated.drift.validate` E2E produces zero errors, and `rfc.validate` passes.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks build:check` (tsc --noEmit) exits 0. `pnpm --filter @warpgogol/site-kernel-checks test` — 716/716 tests pass.

### Axis A — Structural correctness

No issues. The inlined `stripCommentsAndStrings` function at `command-args-validate.ts:54-103` is a verbatim copy of the original (minus inline comments), preserving the same block-comment state tracking and string-literal skipping logic. No dead code, no unused exports, no magic numbers introduced.

### Axis B — DNA alignment

No issues. DNA-58 (generated-file content determinism) is strengthened by promoting DRIFT-02 to error — generators without dryRun support now fail validation rather than being silently skipped. The RFC `satisfies` DNA-58 and DNA-51.

### Axis C — Ecosystem fit

No issues. Command removed from `CODEGEN_COMMANDS` array (`01-codegen.ts`), pipeline step removed from `SITES_BUILD_CHECK_PIPELINE` (`build-check.ts`), rule descriptor removed from `CORE_INFRA_RULES` (`core-infra.ts`). Command manifest, ecosystem manifest, and COMMANDS.md regenerated. `AGENTS.md` module table and agent rules updated. `docs/verification-plan.xml` vm-11 entry updated to reference `generated.drift.validate` instead of the deleted command.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no deprecation grace period, no dual-path. The command, its test, its rule descriptor, and its allowlist are fully deleted in the same change. The `stripCommentsAndStrings` function was moved (not duplicated) — the original export was removed with the file.

### Axis E — Agent-facing clarity

No issues. `AGENTS.md` agent rules at line 112 and 115 clearly document the elimination and the new home for `stripCommentsAndStrings`. `CHANGE_SUMMARY` entries in all modified files reference RFC-0645. The inlined function carries a header comment explaining its origin.

### Axis F — Pragmatism

No issues. Each change is minimal and directly serves the RFC's goal. No scope creep — the diff touches only files related to the timestamp validator and its dependencies.

### Axis G — Blind spots

No issues. The E2E test (`generated.drift.validate --site warpgogol-com`) confirmed zero DRIFT-02 errors, proving all generators in `GENERATOR_OWNERSHIP_MAP` support dryRun mode. The risk of blocking builds (noted in RFC §Risks) is mitigated by the pre-implementation audit. Performance cost is unchanged — the validator already invoked all generators; only the severity changed.

### Spec compliance

| Requirement from RFC-0645 | Status | Evidence |
| --- | --- | --- |
| Remove `generated.timestamp.validate` command | Done | `01-codegen.ts:653` — array ends after `runOpenSourceValidate` |
| Remove pipeline step | Done | `build-check.ts:39` — pipeline ends after `generated.drift.validate` |
| Delete `generated-timestamp-validate.ts` | Done | File deleted in commit 477d559 |
| Delete test file | Done | File deleted in commit 477d559 |
| Inline `stripCommentsAndStrings` | Done | `command-args-validate.ts:54-103` |
| Remove TS-TIME-01 rule | Done | `core-infra.ts:492-497` — only DRIFT-01/02 remain |
| Promote DRIFT-02 to error | Done | `generated-drift-validate.ts:181,193` + `core-infra.ts:496` |
| Update AGENTS.md | Done | `packages/os/site-kernel-checks/AGENTS.md:48,112,115` |
| All generators support dryRun | Done | E2E test: 0 errors, exitCode 0 |
| `rfc.validate` passes | Done | All 1 RFC(s) passed validation |

### Questions for the author

1. The `DRIFT-02` diagnostic message still says "skipped" even though it is now an error — should the message be updated to reflect that it is a hard failure, not a skip?
