---
reviewId: REVIEW-CODE-2026-08-05-01
date: 2026-08-05
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 58151139...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts
  - packages/os/site-kernel-handoff/src/tests/leitstand-0700-release-dev-deploy.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/rfcs/rfc-0700-allow-leitstand-dev-deploy-from-release-directory-without-open-mission.md
  - docs/command-manifest.generated.yaml
---

# Code Review: 58151139...HEAD (RFC-0700 implementation)

### Verdict: Needs revision

The implementation correctly adds the `--release` path to `leitstand.dev-deploy` with proper lock management, CDN purge, and health check. However, there are two findings: an unused variable in the success path and a missing `logger.success` call that the workpiece path uses for consistency.

### Mechanical floor

Pass — `tsc --noEmit` passes, `rfc.validate --id RFC-0700` passes, 7 unit tests pass.

### Axis A — Structural correctness

1. **Unused variable `healthy`** — `leitstand-commands.ts:737` declares `const healthy = deployResult.state === "succeeded" && healthResult.state === "healthy";` but never uses it beyond a ternary in the summary string. The variable adds no value — inline the expression in the summary or use it to determine `deployState`.

2. **Unused variable `releaseMissionId` / `releaseCommitSha`** — `leitstand-commands.ts:738-739` extracts these into local variables but they are only used once in the return object. Minor — acceptable but slightly verbose.

### Axis B — DNA alignment

No issues. DNA-48 (Release discipline) is not affected — the release state machine is unchanged. DNA-49 (Fleet propagation) is respected — the release path uses the same adapter, lock, and channel model. The RFC explicitly amends RFC-0628 and does not weaken any invariant.

### Axis C — Ecosystem fit

No issues. Package boundaries are respected, command registration is correct, `reads` is updated, AGENTS.md is updated, command manifest is regenerated.

### Axis D — Forward-only compliance

No issues. No compatibility shims or dual-paths. The `--release` flag is a new optional path, not a legacy bridge.

### Axis E — Agent-facing clarity

1. **Missing `logger.info` for release path start** — The workpiece path logs `[leitstand.dev-deploy] Deploying workpiece for <systemId>...` early in the function. The release path has no equivalent initial log line. An agent watching logs cannot distinguish a release-path execution from a workpiece-path execution until the summary. Add a `logger.info` at the start of the release branch, e.g. `[leitstand.dev-deploy] Deploying release ${releaseId} for ${systemId}...`.

### Axis F — Pragmatism

No issues. The `--release` flag extends an existing command rather than creating a new one. The implementation reuses existing helpers (`resolveConventionSecretsPath`, `runPurgeStep`, `adapter.propagate`, `adapter.health`).

### Axis G — Blind spots

1. **No `--force-build` warning test** — The RFC specifies that when `--force-build` is set alongside `--release`, a warning is logged. The implementation logs the warning correctly, but no test verifies this behavior. A test should assert `logger.warn` was called with the expected message.

### Spec compliance

| Requirement from RFC-0700 | Status | Evidence |
| --- | --- | --- |
| `--release` flag accepted by command registration | Done | `leitstand.module.ts:44-48` |
| Deploys from `releases/<id>/dist/` without `currentMission` | Done | `leitstand-commands.ts:618-772` |
| Without `--release`, behaves as before | Done | `leitstand-commands.ts:774-785` |
| CDN purge runs after release deploy | Done | `leitstand-commands.ts:713-724` |
| Health check runs after release deploy | Done | `leitstand-commands.ts:727-735` |
| `--json` output includes `releaseDeployed` and `buildSkipped` | Done | `leitstand-commands.ts:741-768` |
| Unit test covers release path | Done | `leitstand-0700-release-dev-deploy.test.ts`, 7 tests |
| `leitstand.module.ts` `reads` updated | Done | `leitstand.module.ts:59-63` |
| `rfc.validate` passes | Done | 0 errors |
| `--force-build` ignored warning when `--release` is set | Partial | Implementation logs warning, but no test verifies it |

### Questions for the author

1. Should the `healthy` variable at line 737 be used to determine `deployState` (e.g. set `deployState: "failed-stale"` when deploy succeeded but health is unhealthy), or is the current behavior intentional — reporting the deploy state independently of health?
2. Is the missing initial `logger.info` for the release path intentional (to keep logs quiet) or an oversight?
