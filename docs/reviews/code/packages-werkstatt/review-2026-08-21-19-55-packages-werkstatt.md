---
reviewId: REVIEW-CODE-2026-08-21-01
date: 2026-08-21
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 9a1c5be3...HEAD
filesReviewed:
  - packages/werkstatt/src/plugin/commands-validate.ts
  - packages/werkstatt/os/werkstatt-commands-validate.module.ts
  - packages/werkstatt/src/tests/commands-validate.test.ts
  - packages/werkstatt-shared/src/checks/result-helpers.ts
  - packages/werkstatt/AGENTS.md
  - packages/werkstatt/package.json
  - tools/kernel.config.ts
  - docs/rfcs/rfc-0903-standardize-kernel-command-output-exitcode-summary-nextsteps.md
  - docs/plans/plan-rfc-0903-standardize-kernel-command-output-exitcode-summary-nextsteps.md
  - docs/audits/audit-rfc-0903-standardize-kernel-command-output-exitcode-summary-nextsteps.md
  - docs/COMMANDS.md
  - docs/command-manifest.generated.yaml
  - docs/ecosystem.generated.yaml
---

# Code Review: 9a1c5be3...HEAD (RFC-0903 implementation)

### Verdict: Needs revision

The implementation is architecturally sound and follows existing patterns well. However, `commands-validate.ts` has dead fields in `ReturnViolation`, an unused parameter, and a false-positive risk for `CMD-OUTPUT-03` when `exitCode` is a conditional expression rather than a literal.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt build:check` and `pnpm --filter @warpgogol/werkstatt-shared build:check` both pass. All 2514+604 tests pass.

### Axis A — Structural correctness

- **Dead field `ReturnViolation.line`**: The `line` field in `ReturnViolation` is always set to `0` in `analyzeReturnObject` (lines 142, 158) and never read by callers — the line number is passed separately from `findReturnStatements` and used directly in `scanFile`. Remove `line` from `ReturnViolation`.
- **Dead field `ReturnViolation.helperName`**: The `helperName` field is set in `analyzeReturnObject` (lines 149, 165) but never read by any caller. Remove it.
- **Unused parameter `returnText` in `analyzeReturnObject`**: The `returnText` parameter (line 133) is passed but never referenced inside the function — the helper detection uses `fullContent` and `returnStartIdx` instead. Remove the parameter and update the call site.

### Axis B — DNA alignment

No issues. DNA-82 is already documented and this implementation enforces it. DNA-64 (engine stack-agnosticism) is respected — `commands-validate.ts` imports only from `../kernel/types.ts` (same package). No site plugin imports.

### Axis C — Ecosystem fit

No issues. The new module follows the exact pattern of `werkstatt-shared-validate.module.ts`. The `package.json` subpath exports are correctly added in both source and dist sections. `kernel.config.ts` wiring follows the existing pattern. `AGENTS.md` is updated with the output standard. Generated artifacts (`COMMANDS.md`, `command-manifest.generated.yaml`, `ecosystem.generated.yaml`) are regenerated.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual paths, no legacy maintenance behind flags. The `result-helpers.ts` changes directly modify the summary format — old `${command}: OK` is replaced with `[${command}] OK`, not kept alongside.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding is present on both new source files (`commands-validate.ts` and `werkstatt-commands-validate.module.ts`). The test file also carries scaffolding. Variable and function names are descriptive. No ungrounded assertions.

### Axis F — Pragmatism

No issues. The implementation reuses the `scanDirectory` pattern from `import-scan-util.ts` rather than duplicating it (though it implements its own scanning because the detection criteria are different — file content patterns, not import specifiers). The command earns its existence — no existing command covers this scope. The `--mode` flag is a minimal addition.

### Axis G — Blind spots

- **False-positive risk in CMD-OUTPUT-03**: The `isFailure` check at line 226-228 treats any `exitCodeValue` that is not `"0"` or `"1"` as a failure. When `exitCode` is a conditional expression (e.g. `exitCode: result.status === "pass" ? 0 : 1`), the regex captures the variable name or expression, not a literal `"0"` or `"1"`. This causes false CMD-OUTPUT-03 positives for handlers that use ternary expressions for `exitCode`. The fix: when `exitCodeValue` is a non-numeric identifier (not `"0"` or `"1"`), skip the CMD-OUTPUT-03 check rather than assuming failure. Document this as a known limitation in the RFC or code.

### Spec compliance

| Requirement from the spec | Status | Evidence |
| --- | --- | --- |
| Register `werkstatt.commands.validate` command | Done | `werkstatt-commands-validate.module.ts:27` |
| Implement CMD-OUTPUT-01/02/03 rules | Done | `commands-validate.ts:195-238` |
| Helper-exempt returns | Done | `commands-validate.ts:64-66`, 137-151 |
| `--mode=warning\|error` flag | Done | `werkstatt-commands-validate.module.ts:34-38` |
| Fix `passResult`/`failResult` summary prefix | Done | `result-helpers.ts:91,118,61` |
| Unit tests for all rules and helpers | Done | `commands-validate.test.ts` — 15 tests |
| Update `packages/werkstatt/AGENTS.md` | Done | `AGENTS.md:281` |
| Do NOT add to `PACKAGES_CHECK_PIPELINE` | Done | Not in pipeline config |

### Questions for the author

1. Should `CMD-OUTPUT-03` skip the failure check when `exitCode` is a non-literal expression (e.g. ternary), to avoid false positives?
2. Are the dead `line` and `helperName` fields in `ReturnViolation` intentional for future use, or should they be removed?
