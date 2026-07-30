---
reviewId: REVIEW-CODE-2026-07-30-01
date: 2026-07-30
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: b5d58e4~1...878c530
filesReviewed:
  - packages/os/site-kernel-codegen/src/open-source-page.ts
  - packages/os/site-kernel-codegen/src/tests/open-source-fingerprint.test.ts
  - docs/rfcs/rfc-0599-fix-open-source-generate-output-completeness-verification.md
---

# Code Review: RFC-0599 implementation (b5d58e4~1...878c530)

### Verdict: Needs revision

The fix correctly replaces the single-file existence check with a loop over all declared output paths. However, the test suite has a coverage gap (THIRD_PARTY_NOTICES.txt is not explicitly tested) and the `declaredOutputPaths` array is hardcoded in the function body rather than derived from `GENERATOR_OWNERSHIP_MAP`, creating a maintenance drift risk.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-codegen run build:check` and `pnpm --filter @warpgogol/site-kernel-codegen run test` both pass with zero errors.

### Axis A — Structural correctness

1. **Duplicated path construction logic.** The `declaredOutputPaths` array at `open-source-page.ts:804-821` duplicates the path construction that appears later in the function body (lines 912-955) for the actual file writes. The same `path.join(paths.contentPagesDirectory, lang, "open-source.md")` pattern appears in both the completeness check and the write section. If a path changes in the write section, the check section must be manually kept in sync. Consider extracting a `buildDeclaredOutputPaths(paths, supportedLangs)` helper to eliminate the duplication.

2. **Test `computeFingerprint` duplicates generator logic.** The test's `computeFingerprint` function (`open-source-fingerprint.test.ts:131-157`) re-implements the fingerprint computation from the generator. If the generator's fingerprint inputs change, the test will silently produce a mismatched fingerprint and the "up to date" test will fail for the wrong reason. This is acceptable for a test helper but should be noted as a maintenance coupling.

### Axis B — DNA alignment

No issues. The fix does not touch any DNA invariant. RFC-0599 `satisfies: []` is correct — this is a bug fix, not an invariant enforcement.

### Axis C — Ecosystem fit

3. **`declaredOutputPaths` not derived from `GENERATOR_OWNERSHIP_MAP`.** The audit (finding 4) recommended that the `declaredOutputPaths` array match the `GENERATOR_OWNERSHIP_MAP` entries in `generator-ownership.ts:159-180`. The RFC body acknowledges this coupling, and a comment at line 801-803 points to the ownership map. However, the array is still hardcoded in the function body. If the ownership map adds a new output path, the completeness check will not automatically pick it up. The single source of truth is the ownership map; the check should ideally reference it. This is a design observation, not a blocking issue — the current approach works as long as developers keep both in sync.

### Axis D — Forward-only compliance

No issues. The old single-file check is fully replaced — no dual-path or compatibility shim.

### Axis E — Agent-facing clarity

4. **Test Compass scaffolding is present.** The test file carries `MODULE_CONTRACT` and `CHANGE_SUMMARY` — compliant.

5. **Test comments explain the mock strategy.** The `try/catch` pattern in the regeneration tests includes a comment explaining why the regeneration path is expected to throw. This is clear for future agents.

### Axis F — Pragmatism

6. **Missing test for `THIRD_PARTY_NOTICES.txt`.** The acceptance criteria mention regenerating when `THIRD_PARTY_NOTICES.txt` is deleted, but there is no explicit test for this artifact. The test for `THIRD_PARTY_LICENSES.txt` covers the same code path (both are public artifacts in the `declaredOutputPaths` array), and the acceptance criteria annotation claims "same code path covers all public artifacts including THIRD_PARTY_NOTICES.txt." This is technically correct — the `Promise.all` check treats all paths equally — but an explicit test would be more convincing for the acceptance criterion.

### Axis G — Blind spots

7. **`dryRun` interaction not tested.** The RFC (enhanced) clarifies that the `declaredOutputPaths` check runs regardless of `dryRun`. The test does not cover the `dryRun: true` scenario. In dry-run mode, the check inspects disk state from previous real runs; if outputs are missing, the generator proceeds to regeneration (which then skips writes). This is the correct behavior but is not verified by a test.

### Spec compliance

| Requirement from RFC-0599 | Status | Evidence |
| --- | --- | --- |
| Fingerprint cache short-circuit checks all declared output paths | Done | `open-source-page.ts:804-843` |
| Missing THIRD_PARTY_LICENSES.txt triggers regeneration | Done | Test at `open-source-fingerprint.test.ts` |
| Missing THIRD_PARTY_NOTICES.txt triggers regeneration | Partial | No explicit test — same code path as other public artifacts |
| Missing sbom.cdx.json triggers regeneration | Done | Test at `open-source-fingerprint.test.ts` |
| `generated.files.validate` passes | Done | Ownership map unchanged — no new paths |
| Unit test covers missing-output regeneration | Done | 5 tests, all passing |
| `rfc.validate` passes | Done | 0 violations |

### Questions for the author

1. Should the `declaredOutputPaths` array be extracted into a shared helper that both the completeness check and the write section use, to prevent drift if a path changes in one place but not the other?
2. Should an explicit test for `THIRD_PARTY_NOTICES.txt` deletion be added, or is the "same code path" argument sufficient given the `Promise.all` check?
3. Should a `dryRun: true` test be added to verify the check runs regardless of dry-run mode?
