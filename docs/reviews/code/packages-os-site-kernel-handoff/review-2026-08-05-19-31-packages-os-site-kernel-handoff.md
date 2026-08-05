---
reviewId: REVIEW-CODE-2026-08-05-01
date: 2026-08-05
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: 7c42e016...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - packages/os/site-kernel-handoff/src/tests/rfc-0701-propagate-warning-only.test.ts
  - docs/rfcs/rfc-0701-make-disttreehash-and-sitecontenthash-mismatches-warning-only-in-leitstand-propagate-when-commitsha-matches.md
---

# Code Review: 7c42e016...HEAD

## Verdict: Approved

RFC-0701 implementation is minimal, correct, and fully tested. The code change in `leitstand-commands.ts` converts `distTreeHash` and `siteContentHash` mismatch from hard errors to `logger.warn` while preserving the `commitSha` hard error. The new test file covers the warning-only path and the `commitSha` mismatch hard error. Documentation and acceptance criteria are updated with evidence. Mechanical checks pass.

## Mechanical floor

Pass.

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passed.
- `pnpm --filter @warpgogol/site-kernel-handoff run test` passed (618 passed, 2 skipped).
- `pnpm exec site-kernel run rfc.validate --id RFC-0701` passed with 0 violations.
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0701` skipped due to no probes (expected).

## Axis A — Structural correctness

No issues.

The test file follows the existing pattern from `leitstand-0608-propagate-channel-removed.test.ts` and `rfc-0634-propagate-dev-verification.test.ts`. `vi.stubGlobal("fetch", ...)` is used correctly. The `BordbuchCommitResult` and `runBordbuchCommit` mock setup is consistent. The `setMockBuildIdentity` side-channel on the mock function is a pragmatic test-only helper and is not exported.

## Axis B — DNA alignment

No issues.

RFC-0701 amends the behavior described in DNA-49 (Fleet propagation). The verification remains but mismatches in `distTreeHash` and `siteContentHash` are advisory warnings rather than hard errors when `commitSha` matches. The `commitSha` hard error is preserved as the primary integrity gate.

## Axis C — Ecosystem fit

No issues.

The test file is located in `packages/os/site-kernel-handoff/src/tests/` alongside the other leitstand tests. The behavior change is internal to `leitstand.propagate`; no CLI surface or command registration changes are needed.

## Axis D — Forward-only compliance

No issues.

The change is a clean replacement of `throw new Error(...)` with `logger.warn(...)` for secondary hashes. No backward compatibility shim, dual-path, or legacy flag is introduced.

## Axis E — Agent-facing clarity

No issues.

The new test file carries `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding. Variable and constant names (`MANIFEST_DIST_TREE_HASH`, `DEVIATING_DIST_TREE_HASH`, `MATCHING_COMMIT_SHA`) are descriptive. Warning messages in `leitstand-commands.ts` include both `manifest='...'` and `identity='...'` hash values, making the mismatch visible to operators and agents.

## Axis F — Pragmatism

No issues.

The test file covers exactly the cases required by the RFC's acceptance criteria: `distTreeHash` mismatch warning, `siteContentHash` mismatch warning, both mismatches, `commitSha` mismatch hard error, and warning message format. No speculative generality or unused abstractions were added.

## Axis G — Blind spots

No issues.

The test file does not explicitly exercise the `commitSha === "0000000"` workpiece placeholder or empty hash field edge cases, but these are documented in the RFC's `Decision` and `Failure modes` sections. The acceptance criteria are fully covered. The `build:check` and full test suite pass, and the warnings provide adequate diagnostic visibility for build non-determinism.

## Spec compliance

| Requirement from RFC-0701 | Status | Evidence |
| --- | --- | --- |
| `distTreeHash` mismatch with matching `commitSha` produces a warning | Done | `leitstand-commands.ts:1740`, test case 1 |
| `siteContentHash` mismatch with matching `commitSha` produces a warning | Done | `leitstand-commands.ts:1752`, test case 2 |
| `commitSha` mismatch remains a hard error | Done | `leitstand-commands.ts:1727`, test case 4 |
| Warning message includes both hash values | Done | `leitstand-commands.ts:1740-1741`, test case 5 |
| Propagation succeeds when only secondary hashes mismatch | Done | test cases 1-2 |
| Unit test covers the warning-only path | Done | `rfc-0701-propagate-warning-only.test.ts` |
| `rfc.validate` passes | Done | `rfc.validate --id RFC-0701` output |

## Questions for the author

None. The implementation is ready for stamp.
