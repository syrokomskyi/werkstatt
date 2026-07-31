---
id: RFC-0623
title: "Add retry with backoff for transient Cloudflare API failures in wrangler deploy"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-07-31
updatedAt: 2026-07-31
enhancedAt: 2026-07-31
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-49
  - RFC-0358
  - RFC-0379
  - RFC-0587
  - RFC-0608
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-49
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - leitstand.propagate
    - leitstand.promote
    - leitstand.rollback
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "wrangler deploy retries on 502/503/504/522 Cloudflare API errors without operator intervention"
  - "Non-retryable errors (auth, 4xx, syntax) fail immediately without wasted retry attempts"
nonGoals:
  - "Retry for non-wrangler commands (health check already has fetchWithRetry)"
  - "Retry for non-Cloudflare adapters (null adapter has no network calls)"
  - "Exponential backoff jitter or circuit-breaker patterns"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0623: Add retry with backoff for transient Cloudflare API failures in wrangler deploy

## Context

The cloudflare-workers Leitstand adapter (`packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts`) calls `runner("npx", ["--yes", "wrangler", "deploy", ...], ...)` exactly once in both `propagate` and `rollback`. When the Cloudflare API returns transient 5xx errors (502, 503, 504, 522 — Gateway Timeout, malformed response), `wrangler deploy` exits with code 1 and the adapter immediately returns `state: "failed"`.

This was observed during the release of `warpgogol-com-r000005` on 2026-07-31: three consecutive `leitstand.propagate` calls failed due to Cloudflare API 504/522 errors (`GET /accounts/.../workers/services/...` → 504, then 522). The Cloudflare status page confirmed "Increased HTTP 5xx Errors" for that period. Each failure required manual re-invocation by the operator.

DNA-49 (Fleet propagation) requires that `leitstand.propagate` deploys published releases to Sternsystem deployment targets. Transient Cloudflare API outages break this contract without any retry mechanism, turning short-lived platform hiccups into blocked releases requiring operator intervention.

## Problem

The cloudflare-workers adapter has zero retry logic for `wrangler deploy`. A single transient Cloudflare API 5xx response causes the entire propagation to fail, leaving the release in `published` state and requiring manual re-invocation. This violates the spirit of DNA-49's propagation contract: the Leitstand should be resilient to transient platform failures, not brittle.

The health check in the same adapter already has `fetchWithRetry` with 5 attempts and exponential backoff — but the deploy step itself has no equivalent. This asymmetry means the adapter is more resilient verifying a deployment than making one.

## Decision

The cloudflare-workers adapter wraps `wrangler deploy` in a shared `runWranglerDeployWithRetry` helper that retries up to 2 times (3 total attempts) with 30s and 60s delays, but only when the stderr output matches transient Cloudflare API error patterns (502, 503, 504, 522, "Gateway Timeout", "malformed response"). Non-retryable errors (authentication, 4xx, syntax, build errors) fail immediately without retry. The helper is used in the adapter's `propagate` and `rollback` methods; `leitstand.promote` benefits transitively because it calls `adapter.propagate` for the main channel deployment.

## Architectural fit

- **DNA-49 (Fleet propagation):** This RFC strengthens the propagation contract by making it resilient to transient platform failures. The Leitstand's job is to deploy releases — transient 5xx errors from the Cloudflare API should not block that mission.
- **RFC-0358 / RFC-0379:** The original Leitstand and cloudflare-workers adapter RFCs established the adapter pattern. This RFC extends the adapter's internal resilience without changing its interface.
- **RFC-0587:** Fixed preflight checks and artifact store hashing. This RFC complements it by adding resilience to the deploy step itself.
- **RFC-0608:** Enforced the alt-to-main promotion chain. Retry ensures that transient failures don't break the chain unnecessarily.
- **Existing `fetchWithRetry`:** The health check already uses retry with exponential backoff. This RFC brings the deploy step to the same resilience standard.

## Design

### CLI surface

No new commands. No new flags. The retry is internal to the cloudflare-workers adapter and transparent to the operator. The existing commands behave identically:

```sh
pnpm exec site-kernel run leitstand.propagate --release warpgogol-com-r000005
pnpm exec site-kernel run leitstand.promote --release warpgogol-com-r000005
pnpm exec site-kernel run leitstand.rollback --release warpgogol-com-r000005 --to-release warpgogol-com-r000004
```

The only observable difference: on transient Cloudflare API 5xx errors, the command retries internally instead of failing immediately. Retry attempts and delays are logged to stderr.

### TypeScript contracts

```ts
// Transient error patterns that trigger retry
const TRANSIENT_ERROR_PATTERNS: readonly RegExp[] = [
  /\b502\b/,
  /\b503\b/,
  /\b504\b/,
  /\b522\b/,
  /Gateway Timeout/i,
  /malformed response/i,
  /Received a malformed response from the API/i,
];

// Reuse existing types from adapter.ts:
//   CommandRunner opts: { cwd?: string; env?: Record<string, string> }
//   CommandRunner return: { exitCode: number; stdout: string; stderr: string }
// No new interfaces needed — the helper uses CommandRunner's existing types.

// Shared helper used by propagate and rollback
async function runWranglerDeployWithRetry(
  runner: CommandRunner,
  args: string[],
  opts: { cwd: string; env: Record<string, string> },
  maxRetries: number = 2,
  delaysMs: number[] = [30_000, 60_000],
): Promise<{ exitCode: number; stdout: string; stderr: string }>
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts` | Add `runWranglerDeployWithRetry` helper, refactor `propagate` and `rollback` to use it |
| `packages/os/site-kernel-handoff/src/tests/cloudflare-workers.test.ts` | Add unit tests for retry behavior |
| `packages/os/site-kernel-handoff/AGENTS.md` | Update Leitstand section to document retry behavior for `wrangler deploy` |

### Output format

No changes to the `--json` output shape. The `PropagationResult` interface remains unchanged. Retry attempts are logged to stderr as:

```
[cloudflare-workers] wrangler deploy failed (attempt 1/3): transient Cloudflare API error
[cloudflare-workers] Retrying in 30s...
```

### Failure modes

| Scenario | Behavior |
| --- | --- |
| Transient 5xx (502/503/504/522/Gateway Timeout/malformed response) | Retry up to 2 times (30s, 60s delays). If all retries fail, return `state: "failed"` |
| Non-retryable error (auth, 4xx, syntax, build error) | No retry, immediate `state: "failed"` |
| All retries exhausted | `state: "failed"`, same as current behavior |
| Retry succeeds on attempt 2 or 3 | `state: "succeeded"`, normal flow continues |

The retry logic only applies to the `wrangler deploy` step. Health checks, build-identity fetches, and other network calls retain their existing retry mechanisms.

## Rollout

- **Default behavior:** Retry is always on. No opt-in flag. The retry parameters (max retries, delays) are hardcoded constants, not configurable.
- **Existing apps:** No migration needed. The retry is internal to the adapter and transparent to all callers.
- **New apps:** Automatically benefit from retry on first deployment.
- **No deprecation:** This extends existing behavior, does not replace any command.
- **Pipeline integration:** No changes to `build.check` or other pipelines. The retry is runtime-only, affecting `leitstand.propagate`, `leitstand.promote`, and `leitstand.rollback`.

## Alternatives considered

- **Always retry on any exit 1:** Rejected — causes unnecessary 30-60s delays for authentication errors, syntax errors, and build failures that will never succeed on retry.
- **Retry at the command level (leitstand) instead of adapter:** Rejected — the adapter is the correct layer for deploy-specific retry logic. The command layer doesn't know about wrangler internals or stderr patterns. Also, rollback uses the same adapter and would need duplicate retry logic.
- **Exponential backoff with jitter:** Rejected as over-engineering for 2 retries. Fixed delays (30s, 60s) are simpler and sufficient for transient Cloudflare API outages.
- **Circuit breaker pattern:** Rejected — the Leitstand is not a high-frequency caller. Circuit breakers are for services making many calls per second, not for manual deployment commands.

## Risks

- **False positive on stderr pattern matching:** A non-transient error that happens to contain "502" or "504" in its output would trigger unnecessary retries. Risk is low — these patterns are specific to Cloudflare API responses and unlikely to appear in build or auth errors.
- **Increased wall-clock time on failure:** Worst case adds 90s (30s + 60s) before final failure. This is acceptable — the operator is already waiting for a deploy, and 90s is negligible compared to manual retry overhead.
- **Cloudflare API outage longer than 90s:** If the outage lasts longer than the total retry window, all retries fail. This is the correct behavior — the operator should be notified that the platform is down, not wait indefinitely.
- **Agent misinterpretation:** Agents might assume retry applies to all commands. The RFC is clear: retry is internal to the cloudflare-workers adapter's `wrangler deploy` step only.

## Acceptance criteria

- [ ] `runWranglerDeployWithRetry` helper implemented in `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts`
- [ ] `propagate` method refactored to use `runWranglerDeployWithRetry` instead of direct `runner` call
- [ ] `rollback` method refactored to use `runWranglerDeployWithRetry` instead of direct `runner` call
- [ ] Transient error pattern matching covers 502, 503, 504, 522, "Gateway Timeout", "malformed response"
- [ ] Non-retryable errors fail immediately without retry (verified by unit test)
- [ ] Retry attempts and delays logged to stderr
- [ ] Unit tests verify: retry on transient error, no retry on auth error, success after retry
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
- The `TRANSIENT_ERROR_PATTERNS` array MUST be a `readonly RegExp[]` constant — agents MUST NOT make it configurable via flags or env vars. The patterns are deploy-specific and should not be exposed as a public interface.
- The retry helper MUST be shared between `propagate` and `rollback` — agents MUST NOT duplicate retry logic in each method.
- Unit tests MUST use `vi.useFakeTimers()` to avoid real 30s/60s waits in the test suite.
