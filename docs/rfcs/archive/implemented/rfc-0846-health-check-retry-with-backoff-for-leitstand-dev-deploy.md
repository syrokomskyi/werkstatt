---
id: RFC-0846
title: "Health check retry with backoff for leitstand.dev-deploy"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-14
updatedAt: 2026-08-14
enhancedAt: 2026-08-14
implementedAt: 2026-08-14
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0747
amendedBy: []
related:
  - RFC-0724
  - RFC-0747
satisfies:
  - DNA-49
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - leitstand.dev-deploy
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "leitstand.dev-deploy retries the health check up to 3 times with 3s/6s backoff when the first attempt returns unhealthy."
  - "Axiom evidence is generated even when the first health check fails, as long as a retry succeeds."
  - "The dev-deploy summary reports the number of health check attempts when retries were needed."
nonGoals:
  - "This RFC does not add retry to leitstand.propagate's health check — that is already handled by RFC-0747."
  - "This RFC does not change the Axiom gate logic — Axiom still only runs when health is healthy."
  - "This RFC does not change the CDN purge delay (6 seconds) or the freshness verification logic."
---

# RFC-0846: Health check retry with backoff for leitstand.dev-deploy

## Context

RFC-0747 added health check retry with backoff to `leitstand.promote` — the alt health check retries 3 times with 3s/6s delays (`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt/src/leitstand/leitstand-commands.ts:2347-2367`). This prevents false "unhealthy" verdicts when the CDN cache is still purging after a deploy.

However, `leitstand.dev-deploy` does **not** have the same retry logic. It calls `adapter.health()` once (`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt/src/leitstand/leitstand-commands.ts:844-851`) and if the result is "unhealthy", Axiom is skipped entirely (`axiom: not-run`). This is exactly what happened during mission `warpgogol-com-m000056`:

1. `leitstand.dev-deploy` deployed to dev channel — deploy succeeded.
2. CDN cache was purged (109 URLs).
3. 6-second sleep after purge.
4. Health check ran — returned "unhealthy" (CDN still propagating).
5. Axiom was skipped because `healthy = false`.
6. `leitstand.propagate` failed: "no Axiom evidence found".
7. Operator had to re-run `leitstand.dev-deploy` — second attempt succeeded because CDN had fully propagated by then.

The total wasted time: ~6 minutes for the first failed dev-deploy + Axiom run, plus operator diagnosis time.

## Problem

`leitstand.dev-deploy` performs a single health check after CDN purge. If the CDN has not fully propagated (common with 109+ URLs), the health check returns "unhealthy" and Axiom is skipped. This creates a cascade:

1. No Axiom evidence → `leitstand.propagate` fails.
2. Operator must re-run `leitstand.dev-deploy` (another 6+ minutes).
3. The second attempt usually succeeds because the CDN has had time to propagate.

The existing `fetchWithRetry` in the Cloudflare Workers adapter (`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt/src/leitstand/adapters/cloudflare-workers.ts:329`) retries individual route fetches up to 5 times. But the overall health check result is computed once — if enough routes fail on the first pass, the health result is "unhealthy" even though a retry 3 seconds later would succeed.

## Decision

Add retry-with-backoff to the health check in `leitstand.dev-deploy`, using the same constants and pattern as RFC-0747's alt health check in `leitstand.promote`:

- **Max attempts:** 3
- **Backoff delays:** 3s, 6s (same as `ALT_HEALTH_MAX_ATTEMPTS` and `ALT_HEALTH_BACKOFF_DELAYS_MS`)
- **Break on healthy:** If any attempt returns "healthy", stop retrying and proceed to Axiom.
- **Final unhealthy:** If all 3 attempts return "unhealthy", Axiom is skipped (same as current behavior).

## Architectural fit

- **DNA-49 (Fleet propagation / Leitstand):** DNA-49 defines the Leitstand deployment pipeline including health checks at each promotion step. This RFC strengthens DNA-49 by adding retry-with-backoff to the dev health check in `leitstand.dev-deploy`, ensuring the pipeline is resilient to transient CDN propagation delays — the same resilience RFC-0747 added to the alt health check in `leitstand.promote`. Without retry, a single false-negative health verdict blocks the entire pipeline (no Axiom evidence → propagate fails), defeating the reliability goal of DNA-49.
- **RFC-0747 amendment:** Extends the retry pattern from `leitstand.promote` (alt health check) to `leitstand.dev-deploy` (dev health check). Both commands face the same CDN propagation delay issue.
- **RFC-0724:** The Axiom gate (RFC-0724) requires `healthy` to be true before running Axiom. This RFC does not change that requirement — it only adds retries to achieve `healthy` before the gate is evaluated.
- **Consistent pattern:** Both `leitstand.dev-deploy` and `leitstand.promote` now use the same retry constants and pattern. Future commands that face the same issue can reuse the same constants.

## Design

### Constants

Rename the existing `ALT_HEALTH_*` constants to shared `HEALTH_CHECK_*` constants (forward-only rename). All references in `leitstand.promote` (lines 2347-2371) are updated to use the new names. No backward-compat aliases.

```ts
// Shared health check retry constants (RFC-0747, RFC-0846).
// Used by leitstand.dev-deploy (dev health) and leitstand.promote (alt health).
const HEALTH_CHECK_MAX_ATTEMPTS = 3;
const HEALTH_CHECK_BACKOFF_DELAYS_MS = [3_000, 6_000];
```

The rename replaces `ALT_HEALTH_MAX_ATTEMPTS` and `ALT_HEALTH_BACKOFF_DELAYS_MS` (defined at `leitstand-commands.ts:346-347`) with the shared names. All references in the `leitstand.promote` alt health check loop (lines 2347-2371) are updated in the same change.

### CLI surface

```sh
pnpm exec werkstatt run leitstand.dev-deploy --system <systemId> --mission <missionId> [--release <releaseId>] [--json]
```

No new flags. The retry behavior is always active — there is no `--no-retry` or `--max-attempts` flag. The fixed 3-attempt/3s-6s pattern is sufficient for all environments.

### `leitstand.dev-deploy` health check retry

Replace the single health check call (`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt/src/leitstand/leitstand-commands.ts:844-851`) with a retry loop:

```ts
// RFC-0846: Retry health check with backoff (same pattern as RFC-0747 alt health check)
let healthResult: { state: "healthy" | "unhealthy" | "unknown"; checks: HealthCheck[] } = {
  state: "unhealthy",
  checks: [],
};
for (let attempt = 1; attempt <= HEALTH_CHECK_MAX_ATTEMPTS; attempt++) {
  if (attempt > 1) {
    const delayMs = HEALTH_CHECK_BACKOFF_DELAYS_MS[attempt - 2];
    logger.info(
      `  Dev health retry ${attempt}/${HEALTH_CHECK_MAX_ATTEMPTS} after ${delayMs / 1000}s...`,
    );
    await sleep(delayMs);
  }
  healthResult = await adapter.health({
    systemId,
    channel,
    deploymentUrl: channelConfig.url,
    releaseId,
    expectedBehaviorSnapshotHash: (releaseManifest.behaviorSnapshotHash as string) ?? "",
    workspaceRoot,
  });
  if (healthResult.state === "healthy") break;
  if (attempt < HEALTH_CHECK_MAX_ATTEMPTS) {
    logger.warn(`  Dev health check: ${healthResult.state} — will retry...`);
  }
}

// Note: exceptions from adapter.health() propagate immediately — no retry on exceptions.
// Only `unhealthy` and `unknown` states trigger retry. Exceptions indicate infrastructure
// errors (auth failure, network unreachable), not CDN propagation delays.

const healthy = deployResult.state === "succeeded" && healthResult.state === "healthy";
```

### Summary reporting

When retries were needed, include the attempt count in the summary:

```ts
const healthAttempts = healthResult.state === "healthy" ? attempt : HEALTH_CHECK_MAX_ATTEMPTS;
summary: `[leitstand.dev-deploy] ${systemId}: release ${releaseId} deployed to dev (${deployResult.state}), health: ${healthResult.state}${healthy ? "" : " (unhealthy)"}${healthAttempts > 1 ? ` (${healthAttempts} attempts)` : ""}, axiom: ${axiomStatus}`
```

### `unknown` state handling

The health check may return `state: "unknown"` when no routes are available in the behavior snapshot for probing (`cloudflare-workers.ts:336`). The retry loop treats `unknown` the same as `unhealthy` — it retries. If all 3 attempts return `unknown`, Axiom is skipped (same as `unhealthy`). This is intentional: `unknown` may be transient (behavior snapshot not yet written), and a retry may resolve it.

### Output format

The `--json` output shape is unchanged from the existing `leitstand.dev-deploy` output. The only difference is the `summary` field, which now includes the attempt count when retries were needed:

```json
{
  "commandName": "leitstand.dev-deploy",
  "data": { ... },
  "exitCode": 0,
  "summary": "[leitstand.dev-deploy] warpgogol-com: release r000001 deployed to dev (succeeded), health: healthy (2 attempts), axiom: pass"
}
```

When no retries were needed, the summary is unchanged: `health: healthy, axiom: pass`.

### Failure modes

| Scenario | Behavior | Exit code |
| --- | --- | --- |
| Health check succeeds on attempt 1 | Proceed to Axiom gate | 0 (if Axiom passes) |
| Health check succeeds on attempt 2 or 3 | Proceed to Axiom gate, summary includes attempt count | 0 (if Axiom passes) |
| Health check fails all 3 attempts (`unhealthy` or `unknown`) | Axiom skipped, summary includes `(unhealthy)` and attempt count | 0 (deploy succeeded, but no Axiom evidence) |
| `adapter.health()` throws an exception | Exception propagates immediately — no retry | 1 (unhandled error) |
| Deploy itself fails | Health check is not reached | 1 |

### File system responsibilities

| File | Change |
| --- | --- |
| `packages/werkstatt/src/leitstand/leitstand-commands.ts` | Rename `ALT_HEALTH_*` → `HEALTH_CHECK_*` constants (line ~346). Add retry loop around dev health check (line ~844). Update all references in `leitstand.promote` (lines ~2347-2371). |
| `packages/werkstatt/src/tests-handoff/leitstand-0628-dev-deploy.test.ts` | Add test for health check retry |

### Unit tests

- **Health check succeeds on first attempt:** No retry needed. Verify `adapter.health` is called once.
- **Health check succeeds on second attempt:** Mock `adapter.health` to return "unhealthy" once, then "healthy". Verify retry happens with 3s delay.
- **Health check fails all attempts:** Mock `adapter.health` to always return "unhealthy". Verify 3 attempts with 3s/6s delays. Verify Axiom is skipped.
- **Axiom runs after successful retry:** Verify that when health check succeeds on retry, Axiom runs and evidence is generated.

## Rollout

1. **Extract shared constants** from RFC-0747's `ALT_HEALTH_*` or define new `DEV_HEALTH_*` constants.
2. **Add retry loop** to `leitstand.dev-deploy` health check.
3. **Update summary** to include attempt count when retries were needed.
4. **Add unit tests** for retry behavior.
5. **Run existing tests** to verify no regressions.

## Alternatives considered

- **Always run Axiom regardless of health:** Rejected because RFC-0724 intentionally gates Axiom on health — running Axiom against an unhealthy deployment produces misleading evidence. The retry approach is safer.

- **Increase the post-purge sleep from 6s to 15s:** Rejected because a fixed sleep is wasteful when propagation is fast (common case) and insufficient when propagation is slow (worst case). Retry with backoff adapts to both scenarios.

- **Use the Cloudflare API to check purge status before health check:** Rejected because it adds a Cloudflare-specific dependency to the health check flow. The retry approach is adapter-agnostic.

- **Make the retry constants configurable via flags:** Rejected for now — the fixed 3-attempt/3s-6s pattern is sufficient. If different environments need different values, env vars can be added in a future RFC.

## Risks

- **Increased dev-deploy time:** Worst case (3 failed attempts with 3s + 6s backoff): 9 seconds of waiting plus 3 health check calls. This is acceptable — the current alternative is a complete failure requiring manual re-run (6+ minutes lost).

- **False positive health on retry:** If the deployment is genuinely broken but a retry happens to hit a cached "healthy" response, Axiom runs against a broken deployment. This is unlikely — the health check probes multiple routes with content hash verification. A genuinely broken deployment would fail content hash checks on all retries.

- **Shared constants divergence:** If `leitstand.promote`'s alt health check constants are later changed without updating the shared constants, the dev health check would diverge. Using shared constants (not separate `DEV_HEALTH_*`) mitigates this.

## Acceptance criteria

- [x] Health check retry loop added to `leitstand.dev-deploy` with 3 attempts and 3s/6s backoff (evidence: `packages/werkstatt/src/leitstand/leitstand-commands.ts:844-873`, commit `ed6fc9c0`)
- [x] Retry breaks early when health check returns "healthy" (evidence: `leitstand-commands.ts:869` `if (healthResult.state === "healthy") break;`, test "succeeds on first attempt")
- [x] Axiom runs when health check succeeds on any retry attempt (evidence: test "Axiom runs after successful health check retry" asserts `axiom: pass` in summary)
- [x] Axiom is skipped when all 3 attempts return "unhealthy" (same as current behavior) (evidence: test "fails all 3 attempts" asserts `axiom.status` is `not-run`)
- [x] Summary includes attempt count when retries were needed (evidence: `leitstand-commands.ts:942-953`, tests assert `(2 attempts)` / `(3 attempts)`)
- [x] Shared constants extracted via forward-only rename (`ALT_HEALTH_*` → `HEALTH_CHECK_*`) with all references in `leitstand.promote` updated (evidence: `leitstand-commands.ts:340-341`, no `ALT_HEALTH` references remain)
- [x] Unit test: health succeeds on first attempt (no retry) (evidence: `leitstand-0628-dev-deploy.test.ts` test "succeeds on first attempt")
- [x] Unit test: health succeeds on second attempt (1 retry with 3s delay) (evidence: `leitstand-0628-dev-deploy.test.ts` test "succeeds on second attempt")
- [x] Unit test: health fails all 3 attempts (Axiom skipped) (evidence: `leitstand-0628-dev-deploy.test.ts` test "fails all 3 attempts")
- [x] Unit test: Axiom runs after successful retry (evidence: `leitstand-0628-dev-deploy.test.ts` test "Axiom runs after successful health check retry")
- [x] Existing `leitstand.dev-deploy` tests pass (evidence: 23/23 tests pass in `leitstand-0628-dev-deploy.test.ts`)
- [x] `rfc.validate` passes on this file before merging (evidence: `rfc.validate --id RFC-0846` returns `ok: true`)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT change the Axiom gate logic (RFC-0724) — Axiom still requires `healthy` to be true.
- Agents MUST NOT remove the CDN purge or the 6-second post-purge sleep — the retry is additive, not a replacement.
- Agents MUST rename `ALT_HEALTH_MAX_ATTEMPTS` → `HEALTH_CHECK_MAX_ATTEMPTS` and `ALT_HEALTH_BACKOFF_DELAYS_MS` → `HEALTH_CHECK_BACKOFF_DELAYS_MS` (forward-only rename). All references in `leitstand.promote` must be updated in the same change. No backward-compat aliases.
- Agents MUST NOT retry on exceptions from `adapter.health()` — only on `unhealthy` and `unknown` states. Exceptions indicate infrastructure errors, not propagation delays (same policy as RFC-0747).
- Agents MUST treat `unknown` state the same as `unhealthy` for retry purposes — both trigger a retry.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0846 --reason "..." --invariant "DNA-N"` instead of working around it.
