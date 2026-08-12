---
reviewId: REVIEW-CODE-2026-08-12-01
date: 2026-08-12
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 0edac1fe...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/template-peer-deps-validate.ts
  - packages/werkstatt-site/src/checks/tests/template-peer-deps-validate.test.ts
  - packages/werkstatt-site/src/checks/command-tables/20-ecosystem.ts
  - packages/werkstatt-site/src/checks/pipelines/build-check.ts
  - packages/werkstatt-site/src/checks/diagnostics/rules/governance.ts
  - packages/werkstatt-site/AGENTS.md
  - docs/rfcs/rfc-0815-add-template-peer-deps-validate-for-onboarding-package-template-integrity.md
---

# Code Review: 0edac1fe...HEAD (RFC-0815 implementation)

### Verdict: Needs revision

The implementation is structurally sound and follows existing patterns well. Three findings require attention: an unused `result` variable, an unused `violations` array in the early-return paths, and a `--site` flag requirement that contradicts the RFC's stated design.

### Mechanical floor

Pass — `pnpm --filter @warpgol/werkstatt-site run build:check` exits 0. `rfc.validate --id RFC-0815` exits 0, zero violations. All 6 unit tests pass.

### Axis A — Structural correctness

- **A-1: Unused `result` variable.** `template-peer-deps-validate.ts:213` declares `let result: { stdout: string; stderr: string }` but the variable is only assigned in the `try` block and never read — the success path returns a pass result without referencing `result`. The `let` should be removed and the `try` block should not assign to a variable. This is dead code.

- **A-2: `violations` array is populated but never returned in error paths.** The `violations` array is filled with `PeerViolation` objects at line 251, but the error path returns `diagnosticsResult(COMMAND, diagnostics)` which does not include the `violations` array in its data. The `violations` are only used to build `diagnostics` — the `violations` push is redundant since the same information is already in the diagnostics. Either remove the `violations` array or return it in the result data.

### Axis B — DNA alignment

No issues. The command extends the check ecosystem (DNA-35 `app.contract.full`) with a new validator. No DNA invariants are violated.

### Axis C — Ecosystem fit

- **C-1: `--site` flag is required but the RFC says the command validates the template, not a site.** The implementation requires `--site` (line 150-158, emits PEER-02 if missing), but the RFC's design says "the command validates the template, not workpiece package.json." The `--site` flag is used only for pipeline context — the template is shared across all sites. The `scope: app` and pipeline placement justify passing `--site` from the pipeline runner, but the command should not fail if `--site` is missing when invoked directly — it should default to `"template"` or similar, since the template is workspace-level. Alternatively, make `--site` optional and only use it for the result data's `site` field.

No issues on other C-axis items. Command registration, pipeline placement, and AGENTS.md documentation are correct.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no legacy paths.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` headers are present. Variable names are clear. No ungrounded assertions.

### Axis F — Pragmatism

- **F-1: Three regex patterns for parsing pnpm output is speculative generality.** The implementation has three regex patterns for parsing peer dep conflicts from pnpm output, but only one is tested (the first pattern). The other two patterns are speculative — they match pnpm output formats that may never occur. Consider keeping only the tested pattern and adding others when real pnpm output is observed.

### Axis G — Blind spots

- **G-1: `--ignore-scripts` flag is good but `--json` output may not contain peer dep errors.** The `--json` flag makes pnpm output JSON, but peer dep errors from `--strict-peer-dependencies` may appear in stderr as plain text, not JSON. The implementation parses `combinedOutput` with regex, which works, but the `--json` flag may suppress useful error formatting. Consider dropping `--json` and parsing plain-text output instead, since the regex patterns expect plain text.

### Spec compliance

| Requirement from RFC | Status | Evidence |
| --- | --- | --- |
| Command registered | Done | command-tables/20-ecosystem.ts:171-187 |
| PEER-01 emitted on violation | Done | template-peer-deps-validate.ts:259-264 |
| PEER-02 on missing template | Done | template-peer-deps-validate.ts:167-174 |
| PEER-03 on resolution failure | Done | template-peer-deps-validate.ts:231-238 |
| workspace:* stripping | Done | template-peer-deps-validate.ts:196-200 |
| Pipeline integration | Done | build-check.ts:53 |
| AGENTS.md documentation | Done | AGENTS.md:64 |
| Unit tests | Done | 6 tests, all passing |
| --site flag required | Partial | Implementation requires it, but RFC design says template is workspace-level |

### Questions for the author

1. Should `--site` be required when the command validates a shared template, not a site-specific artifact? The RFC says "the command validates the template, not workpiece package.json" — why does the implementation fail without `--site`?
2. Are the two untested regex patterns (lines 91 and 100) based on real pnpm output formats, or are they speculative?
3. Should `--json` be dropped from the pnpm command since the regex patterns expect plain text, not JSON?
