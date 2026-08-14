---
reviewId: REVIEW-CODE-2026-08-14-01
date: 2026-08-14
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: acd5a06a...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/playwright-chromium-ensure.ts
  - packages/werkstatt/src/release/release-commands.ts
  - packages/werkstatt-site/src/checks/tests/playwright-chromium-ensure.test.ts
---

# Code Review: acd5a06a...HEAD (RFC-0845 implementation)

### Verdict: Approved

The diff cleanly implements RFC-0845: retry logic in `ensureChromium` (3 attempts, 2s/4s backoff) and a Playwright pre-flight check in `release.prepare`. Both changes follow established ecosystem patterns (RFC-0813 pre-flight in `mission.validate`). No findings across all seven axes.

### Mechanical floor

Fail (pre-existing) — `@warpgogol/werkstatt` and `@warpgogol/werkstatt-site` `build:check` both fail with a `ViewportProfile` type error in `@syrokomskyi/axiom-factory-app/axiom-cli.ts:444`. This error exists on the base commit (verified via `git stash` + `build:check`), is unrelated to RFC-0845, and is in an external dependency. Unit tests: 9/9 pass. `rfc.validate`: 0 violations.

### Axis A — Structural correctness

No issues.

- Retry constants `ENSURE_CHROMIUM_MAX_ATTEMPTS` and `ENSURE_CHROMIUM_BACKOFF_DELAYS_MS` are named, not magic numbers.
- `sleep` helper is minimal and focused.
- `lastError` pattern is the standard retry-loop idiom — throws the last error after exhaustion.
- `preflightFailed` flag in `release-commands.ts` correctly avoids the try/catch swallowing the throw (a bug that was caught and fixed during implementation).
- No dead code, no unused exports, no commented-out blocks.

### Axis B — DNA alignment

No issues.

- DNA-64 (werkstatt autonomy): `executeKernelCommand` is imported from `@warpgogol/werkstatt/kernel` (self-import) — allowed.
- No other DNA invariants are directly relevant to this change.

### Axis C — Ecosystem fit

No issues.

- Pre-flight check follows the exact same pattern as RFC-0813 in `mission.validate`: `executeKernelCommand` → check `exitCode` → non-fatal catch for unexpected errors.
- No new commands, no pipeline changes, no package boundary crossings.
- `executeKernelCommand` import is consistent with `mission-materialization-commands.ts`.

### Axis D — Forward-only compliance

No issues.

- Old single-call path in `ensureChromium` is completely replaced by the retry loop — no dual paths.
- Old tests are replaced, not maintained alongside new ones.

### Axis E — Agent-facing clarity

No issues.

- `MODULE_CONTRACT` and `CHANGE_SUMMARY` updated in both source files with RFC-0845 entries.
- Comments reference RFC-0845 and explain the pre-flight placement (after distribution-reuse, before build.prepare).
- Variable names are clear: `preflightFailed`, `lastError`, `attempt`.

### Axis F — Pragmatism

No issues.

- Retry logic is minimal: 3 constants, 1 helper, 1 loop. No new dependencies.
- `preflightFailed` flag is the simplest way to separate "check returned failure" from "check threw unexpectedly".
- Logger type widening (`warn?` optional) is backward-compatible — existing callers unaffected.

### Axis G — Blind spots

No issues.

- Retry latency (worst case 6s) is documented in RFC risks section.
- Fast path (already installed) skips retry entirely — no latency impact.
- Tests use `vi.hoisted` + fake timers to avoid real delays and mock state leakage.

### Spec compliance

| Requirement from RFC-0845 | Status | Evidence |
| --- | --- | --- |
| Retry 3 attempts with 2s/4s backoff | Done | `playwright-chromium-ensure.ts:70-71` |
| Throw last error after exhaustion | Done | `playwright-chromium-ensure.ts:110` |
| No retry when already installed | Done | `playwright-chromium-ensure.ts:81-85` |
| Pre-flight in release.prepare before build steps | Done | `release-commands.ts:296-323` |
| Fail fast with actionable error | Done | `release-commands.ts:319-323` |
| Non-fatal if check itself throws | Done | `release-commands.ts:313-318` |
| Unit test: retry succeeds on 2nd attempt | Done | `playwright-chromium-ensure.test.ts:72-88` |
| Unit test: retry exhausts all 3 and throws | Done | `playwright-chromium-ensure.test.ts:109-118` |
| Unit test: no retry when installed | Done | `playwright-chromium-ensure.test.ts:120-127` |
| Existing tests pass | Done | 9/9 pass |
| rfc.validate passes | Done | 0 violations |

### Questions for the author

None.
