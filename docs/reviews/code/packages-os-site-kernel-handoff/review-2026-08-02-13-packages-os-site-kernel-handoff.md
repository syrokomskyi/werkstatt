---
reviewId: REVIEW-CODE-2026-08-02-13
date: 2026-08-02
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: d0049d2d...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - packages/os/site-kernel-handoff/src/leitstand/cache-purge.ts
  - packages/os/site-kernel-handoff/src/tests/leitstand-0649-freshness.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/architecture-dna.md
  - docs/rfcs/archive/implemented/rfc-0628-amend-dev-deployment-channel-workpiece-based-dev-deploy-with-pre-release-axiom-verification.md
  - docs/rfcs/rfc-0649-axiom-gate-freshness-guarantee-for-dev-deploys.md
---

# Code Review: d0049d2d...HEAD (RFC-0649 freshness guarantee for dev deploys)

### Verdict: Needs revision

Implementation is functionally correct — all tests pass, typecheck passes, rfc.validate passes. Two minor findings: a `FreshnessResult` type placement issue and a `logger.error` call that may not exist on all logger implementations.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff run build:check` exits 0. `vitest run src/tests/leitstand-0649-freshness.test.ts` — 5/5 pass. `rfc.validate --id RFC-0649` — 0 errors, 0 warnings, 0 notices.

### Axis A — Structural correctness

- **Finding A1 (minor)**: `FreshnessResult` interface is declared at line 406, but `verifyFreshness` function at line 143 references it via return type `Promise<FreshnessResult>`. TypeScript hoists interface declarations, so this compiles, but the ordering is misleading — the function appears before the type it returns. Consider moving `FreshnessResult` above `verifyFreshness` or moving `verifyFreshness` below `DevDeployResult`.

### Axis B — DNA alignment

No issues. DNA-49 prose updated to reflect freshness guarantee. RFC-0628 `amendedBy` updated with RFC-0649.

### Axis C — Ecosystem fit

No issues. `BUILD_IDENTITY_PATH` exported from `cache-purge.ts` for reuse — follows existing export patterns. AGENTS.md updated with fatal purge + freshness check semantics. No package boundary violations.

### Axis D — Forward-only compliance

No issues. No backward compatibility shims. The `freshness` field is added to `DevDeployResult.axiom` as a required field — all return paths updated, no optional fallback.

### Axis E — Agent-facing clarity

- **Finding E1 (minor)**: `logger.error(...)` is called at lines 698 and 728. The `runPurgeStep` function's logger parameter only types `info`, `success`, `warn` — it does not include `error`. The `context.logger` in `runLeitstandDevDeploy` uses the full `KernelRuntimeContext` logger which does include `error`. This is fine in production but could cause issues if a test provides a partial logger mock. Not a runtime issue, but worth noting for test robustness.

No issues with Compass scaffolding — `MODULE_CONTRACT` and `CHANGE_SUMMARY` updated in `leitstand-commands.ts`. New test file carries proper `MODULE_CONTRACT` and `CHANGE_SUMMARY`.

### Axis F — Pragmatism

No issues. `verifyFreshness` is a minimal single-fetch function — no retry, no over-engineering. The `isNullAdapter` check is a simple string comparison, consistent with `resolveAdapter` pattern. `FreshnessResult` type is lean — 4 fields, all necessary.

### Axis G — Blind spots

No issues. Performance impact documented in RFC (~200ms for one HTTP fetch). Edge cases covered: null adapter skip, missing env vars, hash mismatch, network error. All produce fatal exit with descriptive error.

### Spec compliance

| Requirement from RFC-0649 | Status | Evidence |
| --- | --- | --- |
| Purge failure fatal for cloudflare-workers | Done | `leitstand-commands.ts:690-717` |
| Null adapter skips purge + freshness | Done | `leitstand-commands.ts:673-679` |
| Freshness fetch + distTreeHash comparison | Done | `leitstand-commands.ts:146-182`, `725-749` |
| Freshness mismatch fatal | Done | `leitstand-commands.ts:727-747` |
| FreshnessResult in --json output | Done | `DevDeployResult.axiom.freshness` field |
| AGENTS.md update | Done | `packages/os/site-kernel-handoff/AGENTS.md:51` |
| DNA-49 prose update | Done | `docs/architecture-dna.md:213` |
| RFC-0628 amendedBy | Done | `docs/rfcs/archive/implemented/rfc-0628-*.md:28` |
| rfc.validate passes | Done | 0 errors, 0 warnings, 0 notices |
| verifyFreshness single fetch, no retry | Done | `leitstand-commands.ts:146-182` — single `fetch()` call |
| PurgeResult schema unchanged | Done | No changes to `@warpgogol/ontology/operations` |

### Questions for the author

1. Should `FreshnessResult` be moved above `verifyFreshness` for readability, or is the current placement intentional (keeping all exported types near the command function)?
2. The `logger.error` calls in the fatal purge/freshness paths — is the `KernelRuntimeContext` logger guaranteed to have an `error` method in all runtime contexts, or should these be `logger.warn` for consistency with the existing `runPurgeStep` logger signature?
