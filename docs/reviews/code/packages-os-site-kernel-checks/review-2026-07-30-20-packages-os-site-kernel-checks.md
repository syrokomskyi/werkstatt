---
reviewId: REVIEW-CODE-2026-07-30-01
date: 2026-07-30
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: e77695c...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/command-args-validate.ts
  - packages/os/site-kernel-checks/src/command-tables/07-structure-naming.ts
  - packages/os/site-kernel-checks/src/pipelines/packages-check.ts
  - packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts
  - packages/os/site-kernel-checks/src/tests/command-args-validate.test.ts
  - packages/os/site-kernel-checks/AGENTS.md
---

# Code Review: RFC-0610 implementation (e77695c...HEAD)

### Verdict: Needs revision

Two findings: significant code duplication from `kernel-flags-lint.ts` (~90 lines of identical utility functions), and a `reads` field that doesn't cover all scanned directories. Neither is blocking, but both should be fixed for long-term maintainability.

### Mechanical floor

Pass — `tsc --noEmit` clean, 14/14 tests pass, `command.args.validate --json` exits 0, `rfc.validate --id RFC-0610` passes.

### Axis A — Structural correctness

**Finding A-1: Duplicated Code** — `extractObjectBlock`, `extractCommandTableHandlers`, `extractFunctionBody`, `indexFunctionSources`, `collectTsFiles`, and `toPosixPath` are copied verbatim from `kernel-flags-lint.ts` (lines 103-191 vs kernel-flags-lint.ts:484-555). The comment on line 100 says "adapted from kernel-flags-lint.ts" but the functions are identical, not adapted. This is ~90 lines of duplicated logic. If a bug is found in one copy, it must be fixed in both. These utilities should be extracted into a shared module (e.g. `src/lib/command-table-tracing.ts`) and imported by both modules.

### Axis B — DNA alignment

No issues. The implementation follows established patterns for check commands: `diagnosticsResult` for canonical result shape, registered rule IDs in `core-infra.ts`, data-driven command table registration.

### Axis C — Ecosystem fit

**Finding C-1: `reads` field mismatch** — The command registration in `07-structure-naming.ts:213-217` declares:

```
reads: [
  "packages/forge/os/**/*.ts",
  "packages/os/site-kernel-checks/src/command-tables/*.ts",
  "packages/os/site-kernel-*/src/**/*.ts",
],
```

But `SCAN_DIRS` at `command-args-validate.ts:41-51` includes `packages/os/site-kernel-checks/src` (all subdirectories, not just `command-tables`). The `reads` pattern `packages/os/site-kernel-checks/src/command-tables/*.ts` should be `packages/os/site-kernel-checks/src/**/*.ts` to cover all scanned files. While `cacheable: false` means this doesn't cause stale cache hits, the `reads` field should be accurate for documentation and `command.reads.validate` compliance.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths, no legacy code maintained behind flags.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding present. Function names are self-documenting. Error messages reference RFC-0609 and include actionable `fixHint` strings.

### Axis F — Pragmatism

No issues. The command earns its existence — it enforces RFC-0609's flag-only standard which no existing command covers. The diff is scoped to the minimum necessary files.

### Axis G — Blind spots

No issues. Performance is bounded (~60-90 files scanned with regex). Comment/string exclusion prevents false positives. The `as any` escape hatch risk is documented in the RFC and delegated to the `no-as-any` ESLint rule. Empty states (no violations) produce a clean pass result.

### Spec compliance

| Requirement from RFC-0610 | Status | Evidence |
| --- | --- | --- |
| `command.args.validate` registered in `07-structure-naming.ts` | Done | `07-structure-naming.ts:204-219` |
| `runCommandArgsValidate` in `command-args-validate.ts` | Done | `command-args-validate.ts:268-356` |
| ARG-COMPLIANCE-01 detects `input.args` | Done | `command-args-validate.ts:221-238`, test passes |
| ARG-COMPLIANCE-02 detects empty flags + named flag read | Done | `command-args-validate.ts:250-262,298-352`, tests pass |
| ARG-COMPLIANCE-03 detects dual-path fallback | Done | `command-args-validate.ts:222-230`, tests pass |
| Comment/string-literal exclusion | Done | `command-args-validate.ts:219`, tests pass |
| Added to `PACKAGES_CHECK_PIPELINE` | Done | `packages-check.ts:142-143` |
| `--json` follows `CheckResult` shape | Done | Verified via `--json` output |
| Unit test covers all three rules + exclusion + clean-pass | Done | 14 tests pass |
| `rfc.validate` passes | Done | Exit 0, zero violations |

### Questions for the author

1. Should the duplicated utility functions (`extractObjectBlock`, `extractCommandTableHandlers`, `extractFunctionBody`, `indexFunctionSources`, `collectTsFiles`) be extracted into a shared module before merging, or is this acceptable as-is given the `kernel-flags-lint.ts` precedent?
2. Should the `reads` field be corrected to `packages/os/site-kernel-checks/src/**/*.ts` to match the actual scan scope?
