---
reviewId: REVIEW-CODE-2026-08-08-01
date: 2026-08-08
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 20fa18cc~1...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/ecosystem-commit.ts
  - packages/os/site-kernel-checks/src/tests/ecosystem-commit.test.ts
  - packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts
  - AGENTS.md
  - packages/os/site-kernel-checks/AGENTS.md
  - docs/rfcs/rfc-0754-unify-commit-path.md
  - docs/COMMANDS.md
---

# Code Review: RFC-0754 unify commit path (20fa18cc~1...HEAD)

## Verdict: Needs revision

Implementation is architecturally sound and all 961 tests pass, but one unused variable in the test file is dead code that should be removed.

## Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks run build:check` exits 0; `pnpm --filter @warpgogol/site-kernel-checks run test` passes 961/961; `rfc.validate --id RFC-0754` exits 0.

## Axis A — Structural correctness

- **Dead code — unused `prevMsg` variable**: In `ecosystem-commit.test.ts:172`, the test "RFC-0754: mixed-scope commit splits into two commits (actual)" declares `const { stdout: prevMsg } = await execFileAsync("git", ["log", "-2", "--format=%B", "--reverse"], { cwd: root })` but never asserts on `prevMsg`. The variable is unused. Remove the declaration or add an assertion using it.

## Axis B — DNA alignment

No issues. The diff touches `ecosystem.commit` (RFC-0533) and preserves RFC-0704 `skipPlatformBump` within the platform subset. No DNA invariants are violated.

## Axis C — Ecosystem fit

No issues. `AGENTS.md` (root) updated to direct agents to always use `ecosystem.commit`. `packages/os/site-kernel-checks/AGENTS.md` updated with `ecosystem-commit.ts` module table entry. Command manifest regenerated. `docs/COMMANDS.md` regenerated.

## Axis D — Forward-only compliance

No issues. The old EC-01 behavior (blocking non-platform-only commits) is replaced, not kept behind a flag. No compatibility shims.

## Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` purpose updated with RFC-0754. `CHANGE_SUMMARY` has RFC-0754 entry. `EcosystemCommitResult` interface extended with `nonPlatformCommit` — optional field, no breaking change.

## Axis F — Pragmatism

No issues. The implementation extends the existing `runEcosystemCommit` function rather than creating a new command or abstraction. Scope partitioning reuses `isPlatformScope` from `@warpgogol/site-kernel`. Minimal contract extension (one optional field).

## Axis G — Blind spots

No issues. Split-commit atomicity is addressed with EC-12 (non-platform commit failure after platform commit succeeds). Error message includes the platform commit SHA and manual recovery instructions.

## Spec compliance

| Requirement from RFC-0754 | Status | Evidence |
| --- | --- | --- |
| Platform-scope-only commits with version bump | Done | `ecosystem-commit.ts:488-748`, test "actual commit bumps version and writes trailers" |
| Non-platform-only commits without version bump | Done | `ecosystem-commit.ts:328-374`, test "RFC-0754: non-platform-only commit succeeds without version bump" |
| Mixed-scope commits split into two sequential commits | Done | `ecosystem-commit.ts:377-386,691-729`, test "RFC-0754: mixed-scope commit splits into two commits" |
| RFC-0704 skipPlatformBump preserved | Done | `ecosystem-commit.ts:285-300,385-486`, test "RFC-0754: skipPlatformBump preserved" |
| --rfc trailer on platform commit only | Done | `ecosystem-commit.ts:616-618`, non-platform commit uses plain message |
| --bump override on platform commit only | Done | `ecosystem-commit.ts:488-501`, non-platform commit has no bump |
| --amend amends platform commit; errors without platform files | Done | `ecosystem-commit.ts:276-283` EC-11, test "RFC-0754: EC-11" |
| --dry-run reports per scope | Done | `ecosystem-commit.ts:329-346,387-413,627-661` |
| nonPlatformCommit in --json output | Done | `ecosystem-commit.ts:74-77,743` |
| Direct git commit guard remains | Done | `hooks/pre-commit` unchanged |
| Root AGENTS.md updated | Done | `AGENTS.md:108-113` |
| Unit tests cover all three scope scenarios | Done | 7 new tests added |
| rfc.validate passes | Done | exit 0, zero errors |

## Questions for the author

1. The `prevMsg` variable in the mixed-scope actual commit test is declared but never used — was this intended for an assertion that was removed, or is it leftover from debugging?
