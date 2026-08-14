# Handoff: RFC-0846 Health Check Retry with Backoff

**Date:** 2026-08-14
**Session:** RFC-0846 implementation complete

## Summary

RFC-0846 is fully implemented and stamped as `implemented`. The RFC adds a retry mechanism with backoff to the health check in `leitstand.dev-deploy`'s release path, matching the pattern already used in `leitstand.promote` (RFC-0747).

## What was done

### Code changes

1. **Constant rename** (`leitstand-commands.ts:340-341`): `ALT_HEALTH_MAX_ATTEMPTS` → `HEALTH_CHECK_MAX_ATTEMPTS`, `ALT_HEALTH_BACKOFF_DELAYS_MS` → `HEALTH_CHECK_BACKOFF_DELAYS_MS`. Forward-only, no backward-compat aliases. All references in `leitstand.promote` updated.

2. **Retry loop** (`leitstand-commands.ts:844-873`): Replaced single `adapter.health()` call with a 3-attempt retry loop. 3s/6s backoff delays. Breaks early on `healthy`. No retry on exceptions (immediate propagation). `unknown` state treated as `unhealthy` for retry purposes.

3. **Summary update** (`leitstand-commands.ts:942-953`): Includes `(N attempts)` when retries were needed.

### Tests

5 unit tests added to `leitstand-0628-dev-deploy.test.ts`:
- Success on first attempt (no retry)
- Success on second attempt (1 retry)
- Fail all 3 attempts (Axiom skipped)
- Retry on `unknown` state then succeed
- Axiom runs after successful retry (with mocked `fetch` for freshness verification)

All 23 tests in the file pass.

### Commits

- `b4a0f9fb` — step 1: rename constants
- `b401931d` — step 2+3: retry loop + summary
- `fdfd1cef` — feat: retry with backoff (release path)
- `ed6fc9c0` — test: Axiom-after-retry test + acceptance criteria checked
- `376890c5` — docs: evidence annotations
- `e60949f4` — stamp: mark as implemented

## Validation results

- **Tests:** 23/23 pass in `leitstand-0628-dev-deploy.test.ts`. 6 pre-existing failures in `mission-close-state-file`, `rfc-0797`, `rfc-0801` tests are unrelated.
- **Typecheck:** Pre-existing error in `axiom-cli.ts` (`ViewportProfile` missing `isMobile`/`hasTouch`) — unrelated to RFC-0846.
- **rfc.validate:** `ok: true` for RFC-0846.
- **rfc.implement.stamp:** Successfully stamped at `2026-08-14T14:52:06Z`.

## Key decisions

- Used real timers (not fake timers) for tests because `acquireLock` and other async operations use `setTimeout` internally, causing deadlocks with `vi.useFakeTimers()`.
- Omitted `distTreeHash` from test release manifests to skip `verifyFreshness` (which makes real HTTP calls). The Axiom-after-retry test includes `distTreeHash` with a mocked `fetch` to verify the full path.
- Mocked `../leitstand/adapters/index.ts` to control `adapter.health` and `adapter.propagate` responses.

## Nothing left to do

RFC-0846 is complete. No pending tasks.
