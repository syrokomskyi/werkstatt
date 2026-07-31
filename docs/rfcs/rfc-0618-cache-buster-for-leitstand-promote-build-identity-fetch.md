---
id: RFC-0618
title: "Cache-buster for leitstand.promote build-identity fetch"
status: draft
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
    - leitstand.promote
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "leitstand.promote succeeds on first attempt even when CDN has cached a stale 404"
  - "build-identity.json fetch uses cache-buster query param"
nonGoals:
  - "Changing the promotion state machine or release state transitions"
  - "Modifying health check logic"
  - "Adding retry logic for other fetch operations"
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

# RFC-0618: Cache-buster for leitstand.promote build-identity fetch

## Context

`leitstand.promote` (RFC-0608) verifies the alt deployment before promoting it to main. The first step is fetching `/.well-known/build-identity.json` from the alt URL to verify `releaseId`, `distTreeHash`, `behaviorSnapshotHash`, and `siteContentHash` against the release manifest.

Cloudflare Workers CDN caches responses. When a previous deployment returned 404 for `build-identity.json` (e.g. because the file did not exist in the prior release), the CDN may serve a cached 404 even after the new deployment has the file. This causes `leitstand.promote` to fail with: `build-identity.json not found at alt URL (404)`.

This was discovered during the `warpgogol-com-r000004` release cycle (2026-07-31). The first `leitstand.promote` failed; a retry succeeded after the CDN cache expired.

## Problem

`leitstand.promote` fetches `build-identity.json` from the alt URL without a cache-busting mechanism. If the CDN has a cached 404 from a previous deployment, the fetch fails even though the file exists on the new deployment. This makes promotion non-deterministic: it depends on CDN cache state rather than the actual deployment content.

The operator must retry manually, adding latency and reducing confidence in the promotion pipeline.

## Decision

`leitstand.promote` appends a cache-buster query parameter (`?cb=<timestamp>`) when fetching `build-identity.json` from the alt URL, bypassing CDN cache for that request. The timestamp is `Date.now()` at fetch time.

## Architectural fit

- **DNA-49** (Fleet propagation / Leitstand) — this RFC improves the reliability of `leitstand.promote` by eliminating CDN cache as a failure mode. The promotion state machine and verification logic are unchanged.
- **RFC-0608** — established the alt-to-main promotion chain with `build-identity.json` verification. This RFC fixes a CDN cache edge case in the fetch step of that chain.
- **Cloudflare Workers CDN** — `cf-cache-status: HIT` on 404 responses means the CDN serves stale negative responses. A cache-buster query param forces a fresh request to the origin worker.

## Design

### CLI surface

No CLI changes. The fix is internal to `leitstand.promote`'s build-identity fetch logic.

### TypeScript contracts

```ts
// Current
const url = `${altUrl}/.well-known/build-identity.json`;

// After fix
const url = `${altUrl}/.well-known/build-identity.json?cb=${Date.now()}`;
```

The cache-buster is a query parameter that CDN edge nodes treat as a unique URL, forcing a cache miss and origin fetch.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | `runLeitstandPromote` — build-identity fetch URL |

### Output format

No `--json` output changes. The log line changes from: `Fetching build identity from https://alt-.../.well-known/build-identity.json...` to: `Fetching build identity from https://alt-.../.well-known/build-identity.json?cb=......`

### Failure modes

- **Alt worker not deployed**: Fetch returns 404 (genuine, not cached). `leitstand.promote` fails with the same error message. The cache-buster does not mask real deployment failures.
- **Network error**: Fetch throws. `leitstand.promote` fails with network error. Unchanged behavior.
- **CDN cache miss (fresh deployment)**: Cache-buster ensures the CDN fetches from origin. If the file exists, 200. If not, 404 (genuine).

## Rollout

- **Automatic adoption**: All `leitstand.promote` calls automatically use the cache-buster. No operator action required.
- **No configuration**: No flags or env vars. The cache-buster is always applied.
- **No migration**: Existing deployments are unaffected. The cache-buster only changes the fetch URL, not the deployment or verification logic.

## Alternatives considered

1. **`Cache-Control: no-cache` header** — Send a no-cache header with the fetch. Rejected: CDN edge nodes may not honor request-side `Cache-Control` headers for cached responses. Cloudflare's behavior with request-side headers is inconsistent and depends on edge configuration.

2. **Retry with delay** — On 404, wait 2-3 seconds and retry. Rejected: adds latency and is non-deterministic. The retry might still hit the cached 404 if the cache TTL hasn't expired. The cache-buster is deterministic.

3. **Purge CDN cache after deploy** — Call Cloudflare API to purge the `build-identity.json` URL after `leitstand.propagate`. Rejected: requires Cloudflare API credentials in the propagate flow, adds complexity, and is adapter-specific. The cache-buster is adapter-agnostic.

## Risks

- **Log noise** — The cache-buster query param appears in logs, making URLs slightly longer. This is cosmetic and does not affect functionality.
- **CDN edge behavior** — Some CDN configurations might ignore query params for caching. Cloudflare Workers CDN honors query params by default; this is the target deployment for all current systems.
- **False sense of security** — The cache-buster only applies to the `build-identity.json` fetch. Other health check fetches in `leitstand.promote` (route probes) do not use cache-busters. This is intentional: route probes compare content hashes, and CDN-cached HTML is valid for comparison. Only `build-identity.json` needs a fresh fetch because it carries the deployment identity.

## Acceptance criteria

- [ ] `leitstand.promote` appends `?cb=<timestamp>` to the `build-identity.json` fetch URL
- [ ] First `leitstand.promote` after a fresh `leitstand.propagate` succeeds without manual retry
- [ ] Unit test: build-identity fetch URL includes cache-buster query param
- [ ] Unit test: health check route probe URLs do NOT include cache-buster query param
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The cache-buster MUST be applied only to the `build-identity.json` fetch in `leitstand.promote`, not to health check route probes.
- Agents MUST NOT add retry logic as a substitute for the cache-buster. The cache-buster is the primary fix; retries are a fallback, not the solution.
- The implementation is a one-line change in `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` where the build-identity URL is constructed.
