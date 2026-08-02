---
reviewId: REVIEW-CODE-2026-08-02-01
date: 2026-08-02
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: 7bb2b756~1...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-status.ts
  - packages/os/site-kernel-handoff/src/mission/mission-close.ts
  - packages/os/site-kernel-handoff/src/mission/mission-materialize.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync-integration.test.ts
  - packages/os/site-kernel-handoff/src/tests/helpers/materialize-fixture.ts
  - packages/os/site-kernel-handoff/src/tests/mission-build-check-phase.test.ts
  - packages/os/site-kernel-handoff/src/tests/mission-close-state-file.test.ts
  - packages/os/site-kernel-handoff/src/tests/mission-dirty-guard.test.ts
  - packages/os/site-kernel-handoff/src/tests/mission-materialize-baseline.test.ts
  - packages/os/site-kernel-handoff/src/tests/mission-open-clean-tree.test.ts
  - packages/os/site-kernel-handoff/src/tests/mission-validate-cache-clone-warning.test.ts
  - packages/os/site-kernel-handoff/src/tests/mission-validate-distribution-reuse.test.ts
  - packages/os/site-kernel-handoff/src/tests/mission-validate-snapshot-auto-regen.test.ts
  - packages/os/site-kernel-handoff/src/tests/rfc-0614-public-well-known-bordbuch-conflict.test.ts
  - packages/os/site-kernel-handoff/src/tests/werkstatt-commit.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
---

# Code Review: 7bb2b756~1...HEAD (RFC-0648 implementation)

### Verdict: Approved

The diff is a clean, minimal implementation of RFC-0648. It adds a `branch-convention` validation rule following the exact pattern of existing rules, changes hardcoded `"master"` fallbacks to `"main"`, updates comments, and updates all test helpers to `git init -b main`. No findings across all seven axes.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff run build:check` (tsc --noEmit) passes. `pnpm --filter @warpgogol/site-kernel-handoff run test` — 492 passed, 7 pre-existing failures (unrelated `logger.warn is not a function` in Playwright Chromium ensure path, confirmed pre-existing via stash test). `rfc.validate --id RFC-0648` — 0 violations.

### Axis A — Structural correctness

No issues. The `branch-convention` rule in `sternsystem-validate.ts:296-350` follows the exact pattern of existing rules (`mirror-remote-mismatch`, `mirror-credentials`): `execSync` with `stdio: ["pipe", "pipe", "pipe"]`, try/catch, push to `violations` array. No `any`, no magic numbers, no dead code. Error handling pushes descriptive violation messages with actionable fix commands. The cache clone and bare repo checks have similar structure but follow the established inline-check pattern of the file — no helper extraction is warranted as the existing rules don't use helpers either.

### Axis B — DNA alignment

No issues. RFC-0648 `satisfies: [DNA-44, DNA-45]`. The `branch-convention` rule extends DNA-44 (bundle contract) with a branch name convention and enforces DNA-45 (implicit conventions enforced by `sternsystem.validate`). No conflicts with any DNA invariant.

### Axis C — Ecosystem fit

No issues. All changes are within `packages/os/site-kernel-handoff` — no package boundary violations. No new commands — extends existing `sternsystem.validate` with a new rule. `AGENTS.md` updated with branch convention section (lines 214-220). No pipeline changes needed (`sternsystem.validate` is not in any build pipeline). Command manifest regenerated.

### Axis D — Forward-only compliance

No issues. The fallback change from `"master"` to `"main"` is a direct replacement — no compatibility shim, no dual-path, no grace period. The `git init` → `git init -b main` change is a direct replacement. Legacy `"master"` fallback is deleted, not maintained behind a flag.

### Axis E — Agent-facing clarity

No issues. `CHANGE_SUMMARY` in `sternsystem-validate.ts` updated with `RFC-0648: add branch-convention rule enforcing main as default branch for cache clone and bare repo.` Comments in `mission-materialize.ts` reference real RFCs (RFC-0568, RFC-0648). Variable names are clear (`cacheBranch`, `bareBranch`, `cacheGitDir`). Violation messages include actionable fix commands.

### Axis F — Pragmatism

No issues. No new commands — extends existing `sternsystem.validate`. No new types — reuses existing `violations` array shape. Follows existing pattern of inline validation rules. Scope is tight — only touches files listed in the RFC's file system responsibilities table. The formatting changes in `mission-build-check-phase.test.ts` and `werkstatt-commit.test.ts` are from the pre-commit Prettier hook, not scope creep.

### Axis G — Blind spots

No issues. Performance: `git symbolic-ref HEAD` is a fast file read — negligible. False positives: the rule only checks repos with `.git` directory and resolvable HEAD — empty directories and non-git repos are skipped. Edge cases: detached HEAD is handled by the catch block (pushes a violation with "no resolvable HEAD" message). Migration path: documented in RFC rollout section and AGENTS.md.

### Spec compliance

No spec available — skipped. The RFC itself is the spec and all acceptance criteria are met with evidence.

### Questions for the author

None.
