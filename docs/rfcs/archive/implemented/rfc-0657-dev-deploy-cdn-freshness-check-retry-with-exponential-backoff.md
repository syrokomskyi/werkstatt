---
id: RFC-0657
title: "Dev-deploy CDN freshness check retry with exponential backoff"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-02
updatedAt: 2026-08-02
enhancedAt: 2026-08-02
implementedAt: 2026-08-02
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0649
amendedBy:
  - RFC-0724
related:
  - DNA-49
  - RFC-0649
  - RFC-0624
  - RFC-0628
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
    - leitstand.dev-deploy
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/os/site-kernel-handoff
successSignals:
  - leitstand.dev-deploy freshness check passes on first or second retry for normal CDN propagation
  - No manual wrangler deploy needed after dev-deploy
  - Axiom gate always runs when CDN freshness is eventually verified
nonGoals:
  - Changing the CDN purge mechanism itself (RFC-0624)
  - Adding retry to leitstand.propagate or leitstand.promote — those verify build-identity from an already-fresh alt channel
  - Making freshness check asynchronous or background-scheduled
  - Making retry constants configurable per-site — hardcoded constants are sufficient for a dev-only command
  - Interacting with --force-build (RFC-0653) — the retry loop runs after build, --force-build only affects build-skip cache
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0657: Dev-deploy CDN freshness check retry with exponential backoff

## Context

During the 2026-08-02 release session, `leitstand.dev-deploy` for `warpgogol-com-m000026` succeeded in deploying the Worker to the dev channel, but the CDN freshness check (RFC-0649) failed because the CDN was still serving stale content after the purge + 6s sleep. The `verifyFreshness` function in `leitstand-commands.ts:158-196` performs a single HTTP fetch with no retry — if the CDN has not yet propagated the new content, the check fails immediately and the Axiom gate is skipped.

This forced the operator to manually deploy the release artifact via `wrangler` from outside the kernel pipeline, breaking the canonical dev-deploy → propagate → promote flow.

## Problem

DNA-49 requires that `leitstand.dev-deploy` verifies CDN freshness before running the Axiom gate. The current implementation (RFC-0649) uses a single fetch after a fixed 6-second sleep. Cloudflare CDN propagation can take 10-30 seconds depending on edge location and cache state. A single fetch is insufficient — it fails on the first attempt if the CDN has not yet propagated, and the pipeline stops before the Axiom gate runs.

This creates a gap: the Worker is deployed successfully, but no Axiom evidence is captured because the freshness check is a single-attempt gate. The operator must either re-run `leitstand.dev-deploy` (which rebuilds and redeploys) or manually deploy via `wrangler` and then run `mission.check --external-preview` separately.

## Decision

The `verifyFreshness` function in `leitstand.dev-deploy` is changed from a single-fetch check to a retry loop with exponential backoff. The loop makes up to 5 attempts: the first attempt is immediate (no delay) after CDN purge, and subsequent attempts are separated by exponential backoff delays of 3s, 6s, 12s, 24s (total max wait ~45s). If freshness is verified on any attempt, the pipeline proceeds to the Axiom gate. If all 5 attempts fail, the pipeline stops with exit 1 and a clear error message.

This RFC amends RFC-0649, which explicitly prohibited retry in its implementation notes and nonGoals. The production experience on 2026-08-02 showed that a single fetch after a fixed 6s sleep is insufficient — CDN propagation can take 10-30s. The retry loop replaces the fixed sleep with adaptive polling that exits early when the CDN is fresh.

## Architectural fit

- **DNA-49** (fleet propagation): The retry loop ensures that CDN freshness verification is reliable, not a single-attempt gate that fails on normal CDN propagation latency.
- **RFC-0649**: Extends the freshness check introduced by RFC-0649 with retry logic. The fundamental approach (fetch build-identity.json, compare distTreeHash) is unchanged.
- **RFC-0624**: The CDN purge step (RFC-0624) remains unchanged — only the post-purge verification gains retry.
- **Site OS operator model**: No new command. The change is internal to `leitstand.dev-deploy` and transparent to the operator.

## Design

### CLI surface

No CLI surface change. The `leitstand.dev-deploy --system <id>` command is unchanged externally. The retry behavior is internal.

### TypeScript contracts

```ts
// RFC-0657: Retry constants for verifyFreshness (hardcoded — no caller customization needed)
const FRESHNESS_MAX_ATTEMPTS = 5;
const FRESHNESS_BACKOFF_DELAYS_MS = [3_000, 6_000, 12_000, 24_000]; // delays between attempts

// Updated verifyFreshness signature (no config parameter — constants are internal)
async function verifyFreshness(
  deploymentUrl: string,
  localDistTreeHash: string,
): Promise<FreshnessResult>;

// FreshnessResult gains attempts field
interface FreshnessResult {
  verified: boolean;
  cdnDistTreeHash: string | null;
  localDistTreeHash: string;
  attempts: number;
  error?: string;
}
```

The retry loop uses `FRESHNESS_BACKOFF_DELAYS_MS` as inter-attempt delays: attempt 1 is immediate, then `delays[0]` before attempt 2, `delays[1]` before attempt 3, etc. The `FRESHNESS_MAX_ATTEMPTS` constant equals `delays.length + 1`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | Changed — `verifyFreshness` gains retry loop; `sleep(6_000)` after purge removed |
| `packages/os/site-kernel-handoff/src/tests/leitstand-0649-freshness.test.ts` | Changed — existing tests updated for retry behavior (hash mismatch test expects multiple fetch calls; freshness verified test unchanged) |
| `packages/os/site-kernel-handoff/AGENTS.md` | Changed — Leitstand section updated: freshness check uses retry with exponential backoff |

### Output format

No output format change. The `FreshnessResult` in `--json` output gains an `attempts` field:

```json
{
  "freshness": {
    "verified": true,
    "cdnDistTreeHash": "sha256:abc123...",
    "localDistTreeHash": "sha256:abc123...",
    "attempts": 2
  }
}
```

### Failure modes

- If all retry attempts fail, `leitstand.dev-deploy` exits 1 with `freshness.verified: false` and `freshness.attempts: 5`. The Axiom gate is not run. The operator should verify CDN configuration (purge API credentials, zone ID) and re-run `leitstand.dev-deploy`. If the CDN is persistently stale despite a successful purge response, the Cloudflare zone may need manual cache purge via the dashboard.
- If the CDN returns a non-200 status on all attempts, the error message includes the last HTTP status code.
- If the CDN returns 200 but the `distTreeHash` mismatches on all attempts, the error message includes both hashes.
- Network errors (DNS, timeout, connection refused) are retried like any other failure.
- The `null` adapter skips freshness check entirely (unchanged from RFC-0649).

## Rollout

- The retry loop replaces the single-fetch check in `verifyFreshness`. No flag or opt-in is needed — the behavior is strictly better (success on first attempt if CDN is fresh, retry if not).
- The existing 6-second sleep after purge (RFC-0624) is removed. The first freshness attempt is immediate after purge completes. If the first attempt fails, the retry loop's first backoff delay (3s) provides the CDN propagation window. This reduces total wait time when the CDN is fresh immediately after purge.
- The `attempts` field is added to `FreshnessResult` for observability. Existing consumers of the `--json` output that do not read `attempts` are unaffected.
- Existing unit tests in `leitstand-0649-freshness.test.ts` require modification: the hash mismatch test must expect multiple `fetch` calls (5 attempts) instead of one; the freshness verified test remains unchanged (first attempt succeeds). New tests are added for retry-then-success and all-attempts-fail scenarios. Tests exercising the retry loop should use `vi.useFakeTimers()` to avoid real-time delays in the test suite.

## Alternatives considered

- **Increase the fixed sleep from 6s to 30s**: Rejected — adds 24s of wasted time when the CDN is fresh after 3s. The retry loop adapts to actual CDN latency.
- **Skip freshness check entirely and always run Axiom gate**: Rejected — RFC-0649 established that freshness verification is required before the Axiom gate to avoid checking stale content.
- **Make freshness check asynchronous with a webhook callback**: Rejected — over-engineered for a CLI command. The retry loop is simple and sufficient.
- **Add a `--skip-freshness-check` flag**: Rejected — the freshness check exists for correctness, not convenience. Skipping it would allow the Axiom gate to run on stale content.

## Risks

- **Total wait time**: In the worst case (all 5 attempts fail), the operator waits ~45s before the command exits 1. This is acceptable — the alternative is a manual wrangler deploy which takes longer.
- **CDN edge variability**: Different Cloudflare edge locations may propagate at different speeds. The retry loop polls from the machine running the command, which may hit a different edge than end users. This is acceptable — the check verifies that the content is available, not that all edges are fresh.
- **Rate limiting**: 5 HTTP GETs to the same URL with exponential backoff is unlikely to trigger rate limiting. The requests are spaced 3-30s apart.

## Acceptance criteria

- [x] `verifyFreshness` makes 5 attempts: first immediate, then 4 retries with exponential backoff (3s, 6s, 12s, 24s) (evidence: `leitstand-commands.ts` lines 159-218, `FRESHNESS_MAX_ATTEMPTS = 5`, `FRESHNESS_BACKOFF_DELAYS_MS = [3_000, 6_000, 12_000, 24_000]`)
- [x] `FreshnessResult` includes `attempts` field (evidence: `leitstand-commands.ts` line 155, `attempts: number` in interface)
- [x] `leitstand.dev-deploy` proceeds to Axiom gate when freshness is verified on any attempt (evidence: test "RFC-0657: retry-then-success" — `freshness.attempts === 2`, `axiom.status === "pass"`)
- [x] `leitstand.dev-deploy` exits 1 with clear error when all attempts fail (evidence: test "RFC-0657: all-attempts-fail with HTTP 404" — `exitCode === 1`, `freshness.attempts === 5`; test "RFC-0649: hash mismatch" — `exitCode === 1`, `freshness.attempts === 5`)
- [x] `null` adapter skips freshness check (unchanged) (evidence: test "RFC-0649: null adapter skips purge and freshness check" — `freshness.attempts === 0`, `mockFetch not called`)
- [x] Unit tests cover: first-attempt success, retry-then-success, all-attempts-fail, null adapter skip (evidence: `leitstand-0649-freshness.test.ts` — 8 tests, all passing)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0657 --json` — exit 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
