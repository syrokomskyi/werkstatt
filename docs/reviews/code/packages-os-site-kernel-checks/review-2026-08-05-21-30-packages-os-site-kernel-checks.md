---
reviewId: REVIEW-CODE-2026-08-05-01
date: 2026-08-05
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 0d8636c9...HEAD
filesReviewed:
  - packages/forge/src/config/forge-config.ts
  - packages/os/site-kernel-checks/src/ecosystem-commit.ts
  - packages/forge/src/onboarding/doctor.ts
  - forge.yaml
  - AGENTS.md
  - packages/os/site-kernel-checks/src/tests/ecosystem-commit.test.ts
  - docs/rfcs/rfc-0704-independent-version-packages-skip-platform-bump-for-packages-with-autonomous-npm-versions.md
---

# Code Review: 0d8636c9...HEAD (RFC-0704 independent version packages)

### Verdict: Needs revision

The implementation is structurally sound and covers the RFC's acceptance criteria. Two findings require attention: the `--amend` flag is silently ignored in skip-bump mode, and the skip-bump path doesn't emit the `ECOSYSTEM_COMMIT` env var consistently with the normal path's contract.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/forge run build:check` and `pnpm --filter @warpgogol/site-kernel-checks run build:check` both pass. `pnpm --filter @warpgogol/site-kernel-checks run test` — 856 tests pass. `rfc.validate --id RFC-0704` — 0 violations.

### Axis A — Structural correctness

- **`--amend` silently ignored in skip-bump path** (`ecosystem-commit.ts:298-343`): When `skipPlatformBump` is true and `amend` is true, the skip-bump path executes `git commit -m message` without `--amend`. The `amend` variable is read at line 236 but never checked in the skip-bump branch. This means an operator passing `--amend` with independent-package-only changes gets a new commit instead of an amended one, with no warning or error. The normal path handles amend at lines 393-415 with EC-07/EC-09 violations.

### Axis B — DNA alignment

No issues. No DNA invariants are directly touched by this change.

### Axis C — Ecosystem fit

No issues. `site-kernel-checks` correctly reads `forge.yaml` directly via `fs.readFile` + `yamlParse` instead of importing from `@warpgogol/forge` (which would violate the forbidden-imports rule). The `forge.doctor` check follows the existing pattern of other doctor checks (pack-skills, knowledge-budgets).

### Axis D — Forward-only compliance

No issues. No compatibility shims or dual-paths. The `bumpType` type is extended inline from `"patch" | "minor" | "major"` to `"patch" | "minor" | "major" | "none"`.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` are updated in both `ecosystem-commit.ts` and `doctor.ts`. Root `AGENTS.md` documents the contract clearly at lines 92-99.

### Axis F — Pragmatism

No issues. The `isIndependentPackage` helper is minimal and correct. The `loadIndependentVersionPackages` function is focused and reusable. No speculative generality.

### Axis G — Blind spots

- **`--amend` in skip-bump mode** (`ecosystem-commit.ts:320`): The skip-bump commit path uses `["commit", "-m", message!]` without `--amend`. If an operator amends an independent-package commit, the amend is silently dropped. This is a blind spot — the operator gets no feedback that amend was ignored.
- **No test for `--amend` + skip-bump interaction**: The test suite covers skip-bump, mixed-files, invalid-path, path-matching, and backward-compat, but does not test the `--amend` flag with independent-package-only staged files.

### Spec compliance

| Requirement from RFC-0704 | Status | Evidence |
| --- | --- | --- |
| Schema accepts `independentVersionPackages` | Done | `forge-config.ts:208-209` |
| `forge.yaml` declares `packages/forge` | Done | `forge.yaml:67-68` |
| Skip bump when all staged files in independent packages | Done | `ecosystem-commit.ts:261-337` |
| Normal bump when mixed files | Done | `ecosystem-commit.ts:267-268` |
| Warning for invalid paths | Done | `ecosystem-commit.ts:263-266` |
| `forge.doctor` validates paths | Done | `doctor.ts:618-657` |
| AGENTS.md documents contract | Done | `AGENTS.md:92-99` |
| Unit tests cover scenarios | Done | `ecosystem-commit.test.ts:246-417` |
| `rfc.validate` passes | Done | mechanical floor pass |

### Questions for the author

1. Should `--amend` with skip-bump mode amend the previous commit (using `git commit --amend`), or should it be blocked with a violation explaining that amend only applies to platform-version commits?
2. Should the skip-bump path emit `ECOSYSTEM_COMMIT=1` in the env? It already does at line 322, but should this be documented as a deliberate choice to bypass the pre-commit hook for independent-package commits?
