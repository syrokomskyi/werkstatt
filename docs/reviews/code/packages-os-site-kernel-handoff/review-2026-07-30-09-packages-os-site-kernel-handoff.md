---
reviewId: REVIEW-CODE-2026-07-30-01
date: 2026-07-30
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 8e7a499...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts
  - packages/os/site-kernel-handoff/src/tests/mission-git-commit-validation.test.ts
  - AGENTS.md
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/rfcs/rfc-0594-add-targeted-content-validators-to-mission-git-commit-based-on-changed-file-paths.md
---

# Code Review: 8e7a499...HEAD (RFC-0594 pre-commit content validators)

### Verdict: Needs revision

One finding: unused `workpieceDir` parameter in `runPreCommitValidation`. The function signature accepts it but never reads it — validators resolve the site workspace from `siteName` + `workspaceRoot` via `executeKernelCommand`, not from the workpiece directory. This is a Fowler "Dead Code" smell and a type-level lie: the signature suggests the function needs the workpiece path, but it doesn't.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff build:check` exits 0, 365 tests pass, `rfc.validate RFC-0594` passes.

### Axis A — Structural correctness

- **Finding A1 (Dead parameter):** `runPreCommitValidation` at `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts:81` accepts `workpieceDir: string` but never uses it in the function body. The validators are invoked via `executeKernelCommand({ workspaceRoot, commandName, siteName })` which resolves the site workspace from the registry, not from the workpiece path. Remove the parameter and update the call site at line 379.

### Axis B — DNA alignment

No issues. DNA-46 (Mission lifecycle) is satisfied — the pre-commit validation gate runs inside `mission.git.commit`, which is part of the mission lifecycle. DNA-47 (Materialization) is not affected — the validators do not depend on `build.prepare` generated artifacts. DNA-35 (`app.contract.full`) is not bypassed — the pre-commit validators are a targeted subset, not a replacement for full validation.

### Axis C — Ecosystem fit

No issues. `executeKernelCommand` is the standard pattern for invoking app-scoped commands from workspace context (same as `mission-materialize.ts:430-459`, `mission-preview.ts:70-119`). No new commands registered — the feature extends an existing command. AGENTS.md files updated at both root and package level.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no `--skip-validation` flag, no dual-paths. The validation gate is mandatory from day one.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` updated in `mission-git-commit.ts`. New test file carries scaffolding. Variable and function names are descriptive (`selectValidators`, `matchesPrefix`, `runPreCommitValidation`).

### Axis F — Pragmatism

No issues. `VALIDATOR_MAPPINGS` is a simple array — the single point of extension. No speculative generality. The `PreCommitValidationResult` type is minimal. The feature extends an existing command rather than creating a new one.

### Axis G — Blind spots

No issues. Performance is documented in the RFC (directory-level scan cost, proportional to total files in the content directory). False positives are addressed (unregistered validators are skipped). Edge cases are tested (no content files, unregistered validator, validator crash). No security/privacy concerns.

### Spec compliance

| Requirement from RFC-0594 | Status | Evidence |
| --- | --- | --- |
| Run targeted validators based on changed file paths | Done | `mission-git-commit.ts:377-384` |
| Mapping table covers business-profile, pages, faq | Done | `mission-git-commit.ts:58-62` |
| Commit refused with exit code 1 on validator failure | Done | `mission-git-commit.ts:386-407` |
| Staged changes remain in git index after failure | Done | Test at `mission-git-commit-validation.test.ts:275-285` |
| No validators when no content files changed | Done | `mission-git-commit.ts:87-89`, test at line 117-127 |
| Unregistered validators skipped with warning | Done | `mission-git-commit.ts:119-127`, test at line 129-141 |
| All failures collected and reported together | Done | `mission-git-commit.ts:91-145` |
| AGENTS.md updated | Done | `AGENTS.md:201`, `packages/os/site-kernel-handoff/AGENTS.md:134` |
| Unit tests cover three paths | Done | 7 tests in `mission-git-commit-validation.test.ts` |
| rfc.validate passes | Done | `rfc.validate RFC-0594` → pass, 0 violations |

### Questions for the author

1. Why is `workpieceDir` passed to `runPreCommitValidation` if it is never used? Was it intended for future use (e.g., passing the workpiece path as `argv` to the validator), or is it a leftover from an earlier design?
