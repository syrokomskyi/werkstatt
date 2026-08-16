---
reviewId: REVIEW-CODE-2026-08-16-01
date: 2026-08-16
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 1e10267f...HEAD
filesReviewed:
  - packages/werkstatt/src/certification/storage/r2-adapter.ts
  - packages/werkstatt/src/certification/storage/tests/r2-adapter.test.ts
  - packages/werkstatt/src/leitstand/deploy-helpers.ts
  - packages/werkstatt/src/leitstand/deploy-execution.ts
  - packages/werkstatt/src/leitstand/adapters/cloudflare-workers.ts
  - packages/werkstatt/src/leitstand/certify.ts
  - packages/werkstatt/src/leitstand/leitstand-commands.ts
  - packages/werkstatt/src/mission/mission-materialization-commands.ts
---

# Code Review: 1e10267f...HEAD (ADR-0032 — R2 REST API switch)

### Verdict: Needs revision

Two minor findings in `certify.ts`: an empty catch block and a timer leak in `Promise.race`. The core R2 REST API switch is clean, well-structured, and properly tested. The findings are cosmetic-level robustness issues, not architectural violations.

### Mechanical floor

**Partial pass.**

- TypeScript: 1 pre-existing error in `pipelines/apps/axiom/factory/run/axiom-cli.ts` (ViewportProfile type mismatch) — unrelated to ADR-0032.
- Tests: 7 pre-existing failures in `tests-handoff/` (all about `--gate-decision` flag check ordering vs. artifact hash check) — unrelated to ADR-0032.
- R2 adapter tests: all pass.
- The `build:check` failure is caused by the pre-existing `axiom-cli.ts` error, not by any ADR-0032 change.

### Axis A — Structural correctness

**Finding A-1: Empty catch block in `certify.ts:213`.**

```ts
try {
  const identity = JSON.parse(await fs.readFile(buildIdentityPath, "utf8"));
  missionId = identity.missionId;
} catch {}
```

The bare `catch {}` swallows all errors without context. An agent debugging why `missionId` is undefined cannot distinguish between "file not found", "malformed JSON", or "missing `missionId` field". Add a comment or a non-fatal log line: `catch { /* build-identity.json not yet written — missionId unavailable */ }`.

**Finding A-2: Timer leak in `Promise.race` timeout in `certify.ts:228-236`.**

```ts
const result = await Promise.race([
  executeKernelCommand({ ... }),
  new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`mission.check timed out after ${MISSION_CHECK_TIMEOUT_MS / 1000}s`)),
      MISSION_CHECK_TIMEOUT_MS,
    ),
  ),
]);
```

If `executeKernelCommand` resolves before the timeout, the `setTimeout` timer continues running for up to 5 minutes, keeping the process alive. Store the timer handle and clear it after the race:

```ts
let timer: ReturnType<typeof setTimeout>;
const timeoutPromise = new Promise<never>((_, reject) => {
  timer = setTimeout(() => reject(new Error(...)), MISSION_CHECK_TIMEOUT_MS);
});
try {
  const result = await Promise.race([executeKernelCommand({ ... }), timeoutPromise]);
  // ...
} finally {
  if (timer) clearTimeout(timer);
}
```

### Axis B — DNA alignment

No issues. The R2 adapter implements `CertificationStorageAdapterV1` — the interface is unchanged. The switch from SigV4 to REST API maintains DNA-64 (no SDK dependency, `fetch()` only). No DNA invariants are violated.

### Axis C — Ecosystem fit

No issues. All changes are within `packages/werkstatt`. No new commands, no package boundary changes, no AGENTS.md updates needed. The ADR documents the decision.

### Axis D — Forward-only compliance

No issues. The S3 SigV4 code (`signSigV4`, `uriEncodePath`, `uriEncodeQueryValue`, `hmacSha256`, `sha256Hex`, `R2_REGION`, `R2_SERVICE`) is completely removed — no compatibility shim, no dual path. `accessKeyId` and `secretAccessKey` are retained in `R2StorageConfig` for interface stability, which the ADR explicitly acknowledges as technical debt.

### Axis E — Agent-facing clarity

**Finding E-1: Same as A-1** — the empty `catch {}` block at `certify.ts:213` is not agent-friendly. An agent debugging certification failures would not know why `missionId` is undefined. Add a comment or log line.

MODULE_CONTRACT and CHANGE_SUMMARY are present in `r2-adapter.ts` with ADR-0032 reference. Error codes (`CERT-R2-01` through `CERT-R2-04`) are clear and consistent.

### Axis F — Pragmatism

No issues. The switch from SigV4 to REST API is a simplification — ~120 lines removed. No new dependencies. The `r2ApiFetch` helper centralizes the API call logic cleanly. The `headObject` via `Range: bytes=0-0` is a pragmatic workaround for the R2 REST API's lack of HEAD support.

### Axis G — Blind spots

**Finding G-1: Same as A-2** — the timer leak in `Promise.race` is a minor resource leak. In a long-running process, multiple timed-out `mission.check` calls could accumulate uncleared timers.

The R2 REST API rate limit difference is acknowledged in the ADR's consequences section. The `headObject` 206/404/error handling is correct. Bearer token is passed via standard `Authorization` header.

### Spec compliance

| Requirement from ADR-0032 | Status | Evidence |
| --- | --- | --- |
| Use R2 REST API with Bearer token | Done | `r2-adapter.ts:35-56` — `r2ApiFetch` with `Authorization: Bearer` |
| headObject via GET with Range | Done | `r2-adapter.ts:91-93` — `Range: bytes=0-0` |
| No @aws-sdk/* dependency | Done | `r2-adapter.ts:6` — MODULE_CONTRACT non-goal |
| Retain accessKeyId/secretAccessKey | Done | `r2-adapter.ts:26-27` — fields retained |
| Update tests for REST API | Done | `r2-adapter.test.ts` — Bearer token, REST API URL assertions |

### Questions for the author

1. Should the empty `catch {}` at `certify.ts:213` log a warning when `build-identity.json` is missing or malformed, to aid debugging certification pipelines?
2. Is the timer leak in `Promise.race` acceptable for a short-lived certify process, or should it be cleaned up with `clearTimeout`?
