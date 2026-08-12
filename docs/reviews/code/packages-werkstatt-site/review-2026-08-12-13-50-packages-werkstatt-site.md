---
reviewId: REVIEW-CODE-2026-08-12-01
date: 2026-08-12
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: a72fb459...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/env/deploy-preflight.ts
  - packages/werkstatt-site/src/checks/tests/deploy-preflight-test.test.ts
  - docs/policies/agent-surface-ops.md
  - AGENTS.md
  - .env.example
  - docs/rfcs/rfc-0819-allow-null-as-intentional-not-required-marker-in-env-files.md
---

# Code Review: a72fb459...HEAD (RFC-0819 implementation)

### Verdict: Needs revision

The implementation is a minimal, well-scoped one-string change with proper tests and documentation. One cosmetic finding: the test file name `deploy-preflight-test.test.ts` has a redundant `-test` suffix inconsistent with the naming convention of other test files in the same directory.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-site run build:check` and `vitest run` both pass with zero errors.

### Axis A — Structural correctness

**Finding A-1:** The test file is named `deploy-preflight-test.test.ts` — the `-test` suffix before `.test.ts` is redundant. All other test files in `src/checks/tests/` use the pattern `<feature>.test.ts` without a `-test` suffix (e.g., `deployment-gate.test.ts`, `content-filename.test.ts`, `ci-local.test.ts`). Rename to `deploy-preflight.test.ts` for consistency.

### Axis B — DNA alignment

No issues. DNA-40 (env-file standard) is extended with a usage pattern, not modified. The RFC explicitly states "does not change the DNA invariant itself — it adds a usage pattern within the existing contract."

### Axis C — Ecosystem fit

No issues. Package boundaries respected (test imports from `../env/deploy-preflight.ts` and `@warpgogol/werkstatt/kernel`). No new commands, no pipeline changes. AGENTS.md and `docs/policies/agent-surface-ops.md` updated with the convention.

### Axis D — Forward-only compliance

No issues. The `fixHint` string is changed directly — no dual-path, no compatibility shim.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` present in the new test file. `CHANGE_SUMMARY` updated in `deploy-preflight.ts` with RFC-0819 entry. Variable and function names are clear.

### Axis F — Pragmatism

No issues. The change is minimal: one string update, one test file, three documentation touch-ups. No new dependencies, no new commands, no over-engineering.

### Axis G — Blind spots

No issues. Tests create temp directories and clean up in `afterEach`. No security or privacy concerns — the change only affects error message text.

### Spec compliance

| Requirement from RFC-0819 | Status | Evidence |
| --- | --- | --- |
| fixHint includes null suggestion | Done | `deploy-preflight.ts:186` |
| KEY=null passes deploy.preflight | Done | `deploy-preflight-test.test.ts:51-58` |
| KEY= (empty) fails with null mention | Done | `deploy-preflight-test.test.ts:38-48` |
| .env.example with null still rejected | Done | `env-contract.ts:148` (existing code) |
| agent-surface-ops.md documents convention | Done | `agent-surface-ops.md:35` |
| AGENTS.md has one-line pointer | Done | `AGENTS.md:252` |
| .env.example header mentions null | Done | `.env.example:4` |
| --dev mode also gets null suggestion | Done | `deploy-preflight-test.test.ts:61-81` |
| rfc.validate passes | Done | `rfc.validate --id RFC-0819` → pass |

### Questions for the author

1. Should the test file be renamed from `deploy-preflight-test.test.ts` to `deploy-preflight.test.ts` to match the naming convention of other test files in the same directory?
