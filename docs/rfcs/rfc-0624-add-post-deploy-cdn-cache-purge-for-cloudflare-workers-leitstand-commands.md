---
id: RFC-0624
title: "Add post-deploy CDN cache purge for cloudflare-workers Leitstand commands"
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
  - RFC-0608
  - RFC-0618
  - RFC-0623
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
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "Health check reports healthy after deploy when CDN cache is purged"
  - "Main channel serves new release content immediately after promote without manual cache purge"
nonGoals:
  - "Purge for non-Cloudflare adapters (null adapter has no CDN)"
  - "Purge everything (zone-level) — only URL-level purge is supported"
  - "Changing health check content hash comparison logic"
  - "Changing RFC-0618 cache-buster for build-identity fetch"
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

# RFC-0624: Add post-deploy CDN cache purge for cloudflare-workers Leitstand commands

## Context

After `wrangler deploy` succeeds, the Cloudflare CDN continues serving cached responses from the previous deployment. This causes two observable problems:

1. **Health check reports `unhealthy`:** The Leitstand health check (`adapter.health`) probes routes from the behavior snapshot and compares content hashes. RFC-0618 explicitly prohibits cache-buster query parameters on health check probe URLs. After a deploy, the CDN serves stale HTML, causing content hash mismatches and `state: "unhealthy"`.

2. **Main channel serves old release:** After `leitstand.promote`, `warpgogol.com` continues serving the previous release's cached content. Verified during `warpgogol-com-r000005` promotion on 2026-07-31: `curl https://warpgogol.com/.well-known/build-identity.json` returned r000004 (stale cache), while `curl 'https://warpgogol.com/.well-known/build-identity.json?cb=...'` returned r000005 (fresh origin).

Both channels (alt and main) are affected. The `alt-warpgogol-com.syrokomskyi.workers.dev` subdomain and `warpgogol.com` domain both cache responses at the Cloudflare edge.

## Problem

DNA-49 requires that `leitstand.propagate` and `leitstand.promote` deploy releases with health verification. The health check compares live HTML content hashes against the behavior snapshot. After a successful `wrangler deploy`, the CDN serves stale cached content, causing:

- Health check content hash mismatches → `state: "unhealthy"` despite successful deploy
- Registry records `healthy: false` for both alt and main channels after every deployment
- `leitstand.promote` proceeds despite `unhealthy` alt state (it checks build-identity with cache-buster per RFC-0618, not route content hashes)
- Main channel visitors see old content until natural cache expiry

There is no post-deploy CDN cache purge mechanism in the Leitstand command flow. The adapter deploys code; the command runs health checks — but neither clears the CDN cache between deploy and health check.

## Decision

The `leitstand.propagate` and `leitstand.promote` commands purge CDN cache by URL after `adapter.propagate` succeeds and before running health checks. The purge sends `POST /zones/{zoneId}/purge_cache` with `{"files": [...]}` containing all behavior snapshot route URLs plus `/.well-known/build-identity.json`. A fixed 6-second delay follows the purge to allow CDN propagation. Purge failures are non-blocking warnings — the command logs the error and continues to health check. The `CLOUDFLARE_ZONE_ID` env var is read from the existing secretsFile mechanism (same .env file that provides `CLOUDFLARE_API_TOKEN`).

## Architectural fit

- **DNA-49 (Fleet propagation):** This RFC completes the propagation contract by ensuring the CDN serves fresh content after deploy, enabling accurate health verification.
- **RFC-0358 / RFC-0379:** The Leitstand and cloudflare-workers adapter RFCs established the deploy + health check flow. This RFC inserts a purge step between deploy and health check.
- **RFC-0608:** Enforced the alt-to-main promotion chain with build-identity verification. This RFC ensures route-level content verification also sees fresh content.
- **RFC-0618:** Added cache-buster for build-identity fetch in `leitstand.promote`. This RFC complements it by purging route URLs so health check probes (which must NOT use cache-busters per RFC-0618) see fresh content.
- **RFC-0623:** Adds retry for wrangler deploy. This RFC is independent — purge runs after deploy succeeds, retry runs before deploy succeeds.
- **Separation of concerns:** Purge is implemented at the command level (leitstand), not in the adapter. The adapter deploys code; the command manages post-deploy operations (purge, health, IndexNow). This keeps the adapter portable and focused.

## Design

### CLI surface

No new commands. No new flags. The purge is internal to the leitstand command flow and transparent to the operator:

```sh
pnpm exec site-kernel run leitstand.propagate --release warpgogol-com-r000005
pnpm exec site-kernel run leitstand.promote --release warpgogol-com-r000005
```

The operator observes new log lines:

```
[leitstand] Purging CDN cache for 15 URLs on zone abc123...
[leitstand] CDN cache purged. Waiting 6s for propagation...
[leitstand] Running health checks...
```

### TypeScript contracts

```ts
interface PurgeInput {
  zoneId: string;
  apiToken: string;
  urls: string[];
}

interface PurgeResult {
  success: boolean;
  purgedUrls: number;
  error?: string;
}

// Collects URLs from behavior snapshot routes + build-identity
function collectPurgeUrls(
  deploymentUrl: string,
  routes: RouteFact[],
): string[]

// Calls POST https://api.cloudflare.com/client/v4/zones/{zoneId}/purge_cache
async function purgeCacheByUrls(
  input: PurgeInput,
): Promise<PurgeResult>

// Orchestrates: deploy → purge → 6s delay → health check
// Used by leitstand.propagate and leitstand.promote command handlers
async function deployWithPurgeAndHealth(
  ...
): Promise<PropagationResult & { purgeResult?: PurgeResult }>
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | Add purge step in `runLeitstandPropagate` and `runLeitstandPromote` after adapter.propagate, before health check |
| `packages/os/site-kernel-handoff/src/leitstand/cache-purge.ts` | New file: `collectPurgeUrls`, `purgeCacheByUrls` helpers |
| `packages/os/site-kernel-handoff/src/tests/cache-purge.test.ts` | New file: unit tests for purge URL collection and API call |
| `.env.example` | Add `CLOUDFLARE_ZONE_ID` with comment |

### Output format

The `--json` output gains a `purgeResult` field in the command result data:

```json
{
  "command": "leitstand.propagate",
  "status": "ok",
  "data": {
    "propagation": { "state": "succeeded", "...": "..." },
    "purgeResult": {
      "success": true,
      "purgedUrls": 15
    },
    "health": { "state": "healthy", "checks": [...] }
  }
}
```

When purge fails, `purgeResult.success` is `false` with an `error` message, but `status` remains `"ok"` (non-blocking).

### Failure modes

| Scenario | Behavior |
| --- | --- |
| Purge API returns 200 | URLs purged, 6s delay, health check proceeds |
| Purge API returns 5xx | Non-blocking warning logged, health check proceeds with stale cache risk |
| Purge API returns 4xx (auth, invalid zone) | Non-blocking warning logged, health check proceeds |
| Network timeout on purge API | Non-blocking warning logged, health check proceeds |
| `CLOUDFLARE_ZONE_ID` not set | Purge step skipped entirely, warning logged, health check proceeds |
| Behavior snapshot has no routes | Purge only `/.well-known/build-identity.json` |
| 6s delay completes | Health check runs normally |

The purge is always non-blocking. The deploy already succeeded — purge failure means the health check might see stale cache, but the release is deployed. The operator can manually purge later if needed.

## Rollout

- **Default behavior:** Purge is always on when `CLOUDFLARE_ZONE_ID` is present in the secretsFile env. No opt-in flag.
- **Missing `CLOUDFLARE_ZONE_ID`:** Purge step is skipped with a warning. This allows existing systems to adopt incrementally — add the env var when ready.
- **Existing apps:** Add `CLOUDFLARE_ZONE_ID` to the secretsFile .env. No code changes needed.
- **New apps:** Automatically get purge on first deployment if `CLOUDFLARE_ZONE_ID` is set.
- **`.env.example` update:** Add `CLOUDFLARE_ZONE_ID=` with a comment explaining how to obtain it (Cloudflare Dashboard → Overview → Zone ID).
- **No deprecation:** This extends existing behavior, does not replace any command.
- **Pipeline integration:** No changes to `build.check`. Purge is runtime-only, affecting `leitstand.propagate` and `leitstand.promote`.

## Alternatives considered

- **Purge everything (zone-level):** Rejected — `alt-warpgogol-com.syrokomskyi.workers.dev` is on the shared `workers.dev` zone where zone-level purge is not available. URL-level purge is the only option that works for both alt and main channels. Also, purge everything causes a cache miss spike for all visitors.
- **Purge in the adapter instead of the command:** Rejected — the adapter does not have access to behavior snapshot routes. The command layer reads the snapshot and knows all route URLs. Putting purge in the adapter would limit it to homepage + build-identity only. Also, the adapter should remain portable and focused on deploy.
- **Purge in adapter + command (defense in depth):** Rejected as over-engineering — two purge API calls, two error handling paths, and duplication. If command-level purge is fast enough (it is), adapter-level purge adds complexity without value.
- **No delay between purge and health check:** Rejected — Cloudflare purge propagation takes a few seconds. Without a delay, health check may still see stale cache. 6 seconds is a reasonable fixed delay.
- **Adaptive delay (poll build-identity until new releaseId):** Rejected as over-engineering — a fixed 6s delay is simpler and sufficient for the vast majority of cases.
- **Blocking purge failure:** Rejected — the deploy already succeeded. Blocking on purge failure would prevent health check and leave the release in an ambiguous state. Non-blocking warning is the correct behavior.

## Risks

- **6s delay is insufficient:** If Cloudflare purge propagation takes longer than 6s, health check may still see stale cache. Risk is low — Cloudflare purge is typically sub-second. If observed, the delay can be increased in a follow-up patch.
- **Purge API rate limits:** Cloudflare limits purge API calls (typically 30/min for free plan). With 2 commands (propagate + promote), this is well within limits. Risk only if many systems deploy simultaneously.
- **Missing `CLOUDFLARE_ZONE_ID`:** If the env var is not set, purge is silently skipped. The operator might not notice stale health check results. Mitigated by a warning log line.
- **URL count limits:** Cloudflare purge API accepts max 30 URLs per call for URL-based purge. If a site has more than 30 routes, the purge must be batched. The implementation MUST batch URLs in chunks of 30.
- **Agent misinterpretation:** Agents might assume purge is in the adapter. The RFC is clear: purge is at the command level (leitstand), not in the adapter.

## Acceptance criteria

- [ ] `collectPurgeUrls` helper implemented in `packages/os/site-kernel-handoff/src/leitstand/cache-purge.ts`
- [ ] `purgeCacheByUrls` helper implemented with URL batching (max 30 per API call)
- [ ] `runLeitstandPropagate` calls purge after `adapter.propagate` succeeds, before health check
- [ ] `runLeitstandPromote` calls purge after adapter deploy succeeds, before health check
- [ ] 6-second delay between purge and health check
- [ ] Purge failure is non-blocking (warning logged, health check proceeds)
- [ ] Missing `CLOUDFLARE_ZONE_ID` skips purge with warning
- [ ] `.env.example` updated with `CLOUDFLARE_ZONE_ID` entry
- [ ] Unit tests verify: URL collection, batching, non-blocking failure, missing zone ID skip
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
- The purge logic MUST be at the command level (leitstand-commands.ts), NOT in the cloudflare-workers adapter. Agents MUST NOT add purge logic to `adapter.propagate` or `adapter.rollback`.
- The `CLOUDFLARE_ZONE_ID` env var MUST be read from the existing secretsFile mechanism — agents MUST NOT add new registry fields or new env var patterns.
- URL batching: Cloudflare purge API accepts max 30 URLs per call. Agents MUST batch URLs in chunks of 30 and make sequential API calls.
- The 6-second delay MUST be a fixed `await sleep(6_000)` — agents MUST NOT make it configurable or adaptive.
- Purge failures MUST be non-blocking warnings. Agents MUST NOT throw or return `state: "failed"` on purge failure.
- Unit tests MUST mock `fetch` for the purge API call — agents MUST NOT make real API calls in tests.
