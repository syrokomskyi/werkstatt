---
id: RFC-0747
title: "Add retry loop to leitstand.promote alt health check"
status: accepted
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-08
updatedAt: 2026-08-08
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0657
  - RFC-0649
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - leitstand.promote
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "leitstand.promote succeeds on first attempt when alt CDN propagation is delayed by < 30s"
  - "No manual re-run of leitstand.promote needed after leitstand.propagate"
nonGoals:
  - "Does not change the health check logic itself — only adds retry around the existing adapter.health call"
  - "Does not add retry to main health check (main is promoted after alt is confirmed healthy)"
---

# RFC-0747: Add retry loop to leitstand.promote alt health check

## Context

`leitstand.promote` verifies the alt (staging) deployment is healthy before promoting to main. The health check calls `adapter.health()` once and fails immediately if the state is not `"healthy"`.

After `leitstand.propagate` deploys to alt, CDN propagation may take a few seconds. The promote command runs immediately after propagate, and the first health check may see `unhealthy` because the CDN is still serving the previous version or the Worker is still initializing.

This was observed during mission `warpgogol-com-m000037`: the first `leitstand.promote` call failed with `alt deployment is not healthy (state: unhealthy)`, and the second call (30 seconds later) succeeded with `health: healthy`.

## Problem

The alt health check in `leitstand.promote` is a single-attempt check with no retry. CDN propagation delays cause false-negative health failures, requiring manual re-runs.

## Decision

The alt health check in `leitstand.promote` is wrapped in a retry loop with 3 attempts and exponential backoff (3s, 6s). The first attempt is immediate; subsequent attempts wait before retrying.

## Architectural fit

- **RFC-0657**: Same retry pattern as `verifyFreshness` (5 attempts, exponential backoff). This RFC uses fewer attempts (3) because health checks are more reliable than CDN freshness — the failure is typically a brief propagation delay, not a stale cache.
- **RFC-0649**: `verifyFreshness` already retries in promote. The alt health check runs after freshness is verified, so the CDN is already serving the correct content — the health check failure is a Worker cold-start or initialization delay.

## Design

### Retry constants

```ts
const ALT_HEALTH_MAX_ATTEMPTS = 3;
const ALT_HEALTH_BACKOFF_DELAYS_MS = [3_000, 6_000];
```

### Retry logic

Replace the single `adapter.health()` call (lines 2118-2131) with a retry loop:

```ts
let altHealthResult;
for (let attempt = 1; attempt <= ALT_HEALTH_MAX_ATTEMPTS; attempt++) {
  if (attempt > 1) {
    const delayMs = ALT_HEALTH_BACKOFF_DELAYS_MS[attempt - 2];
    logger.info(`  Alt health retry ${attempt}/${ALT_HEALTH_MAX_ATTEMPTS} after ${delayMs / 1000}s...`);
    await sleep(delayMs);
  }
  altHealthResult = await adapter.health({ ... });
  if (altHealthResult.state === "healthy") break;
  if (attempt < ALT_HEALTH_MAX_ATTEMPTS) {
    logger.warn(`  Alt health check: ${altHealthResult.state} — will retry...`);
  }
}

if (altHealthResult.state !== "healthy") {
  throw new Error(
    `[leitstand.promote] alt deployment is not healthy after ${ALT_HEALTH_MAX_ATTEMPTS} attempts (state: ${altHealthResult.state}). Cannot promote to main.`,
  );
}
```

### Failure modes

- All 3 attempts return `unhealthy`: promote fails with an error message indicating the number of attempts.
- First or second attempt returns `healthy`: promote proceeds immediately.
- `adapter.health()` throws: the error propagates immediately (no retry on exceptions — only on `unhealthy` state).

## Rollout

- **Default behavior**: Always active. No flag needed.
- **Existing apps**: No migration — behavior change is transparent.
- **--force flag**: The existing `--force` flag bypasses CDN freshness verification but does NOT bypass the health check. This RFC does not change that — `--force` still requires a healthy alt deployment.

## Alternatives considered

1. **Reuse `verifyFreshness` retry constants (5 attempts)**: Rejected — health checks are more reliable than CDN freshness. 3 attempts is sufficient for Worker cold-start delays.
2. **Add `--skip-health-check` flag**: Rejected — promoting an unhealthy deployment to main is a production risk.
3. **Sleep before health check**: Rejected — adds latency to the common case (healthy on first attempt) to fix the rare case.

## Risks

- **Delayed failure detection**: If the alt deployment is genuinely unhealthy, the promote command takes 9s longer (3s + 6s backoff) before failing. This is acceptable — the alternative is a manual re-run which takes longer.
- **False positive on retry**: If the alt deployment is intermittently healthy, the retry may succeed on a transiently healthy state. This is acceptable — the main health check after promotion provides a second verification.

## Acceptance criteria

- [ ] Retry loop implemented in `leitstand.promote` around `adapter.health()` call
- [ ] `ALT_HEALTH_MAX_ATTEMPTS` and `ALT_HEALTH_BACKOFF_DELAYS_MS` constants defined
- [ ] Error message includes attempt count when all retries fail
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST NOT add retry for exceptions — only for `unhealthy` state. Exceptions indicate infrastructure errors, not propagation delays.
