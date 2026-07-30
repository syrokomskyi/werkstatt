---
id: RFC-0595
title: "Mark redirect routes with contentHash null and redirectTarget in behavior snapshot"
status: accepted
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
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-30
updatedAt: 2026-07-30
enhancedAt: 2026-07-30
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-49
  - DNA-53
  - RFC-0357
  - RFC-0588
  - RFC-0592
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
    - behavior.snapshot.capture
    - behavior.snapshot.generate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/ontology"
successSignals: []
nonGoals:
  - "Wildcard matching fix for isRouteRedirected (/de/* matching /de) — owned by RFC-0592"
  - "410 Gone handling (covered by RFC-0589)"
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

# RFC-0595: Mark redirect routes with contentHash null and redirectTarget in behavior snapshot

## Context

During deployment of release `warpgogol-com-r000003`, `leitstand.propagate` reported `health: unhealthy` for the `alt` channel. The root cause: the behavior snapshot for route `/de` contained the content hash of the redirect HTML page (`<title>Redirecting to: /</title>`), but the health check's `fetchWithRetry` follows redirects (`redirect: "follow"`) and receives the final page at `/`. The hash of the final page does not match the hash of the redirect page — so the health check reports a content mismatch.

The site was actually live and correct — the redirect from `/de` to `/` is expected behavior for the default-language route. The health check false-positive was caused by a mismatch between what the behavior snapshot captures (the redirect page HTML) and what the health check compares (the final page HTML after following redirects).

## Problem

`behavior.snapshot.capture` reads HTML files from `dist/client/` and computes `contentHash` via `@warpgogol/fingerprint` `hashHtml`. For redirect pages (e.g., `dist/client/de/index.html` containing `<meta http-equiv="refresh" content="0;url=/">`), the hash is of the redirect page itself, not the final destination page.

The Leitstand health check (`leitstand.health`) uses `fetch(url, { redirect: "follow" })` to probe routes. For redirect routes, the fetch follows the redirect and returns the final page's HTML. The health check computes `hashHtml` on the final page and compares it to the snapshot's `contentHash` — which is the redirect page's hash. The hashes never match for redirect routes.

This causes every redirect route to report a content mismatch, making the health check report `unhealthy` even when the site is perfectly functional. The operator must manually patch the behavior snapshot to work around this — which is what happened during the `warpgogol-com-r000003` deployment.

## Decision

`behavior.snapshot.capture` and `behavior.snapshot.generate` detect redirect HTML pages and mark them with `contentHash: null` and `redirectTarget: <path>` in the route entry. The Leitstand health check skips content-hash comparison for routes with `contentHash: null` and instead verifies only the HTTP status code (307/308 for redirects). Routes with `contentHash: null` and `redirectTarget` are verified by checking that the response is a redirect to the expected target path.

## Architectural fit

- **DNA-49 (Fleet propagation)** — health checks include per-route content verification. This RFC fixes false positives in that verification for redirect routes.
- **DNA-53 (Semantic fingerprint governance)** — uses `@warpgogol/fingerprint` `hashHtml` for content routes. Redirect routes are exempted from content hashing — they are verified by redirect status + target, not content.
- **RFC-0357** — established behavior snapshot diff gating. This RFC extends the route model with redirect metadata.
- **RFC-0588** — fixed behavior snapshot route collection to scan `dist/client/` and handle `_redirects`. This RFC extends redirect handling to HTML redirect pages (meta-refresh redirects generated by Astro for default-language routes).
- **RFC-0592** — fixes wildcard matching in `isRouteRedirected` (`/de/*` matching `/de`). This RFC complements RFC-0592: RFC-0592 owns the wildcard fix for `_redirects`-based exclusion, while this RFC owns meta-refresh stub marking with `contentHash: null` + `redirectTarget`. The two RFCs address different redirect detection mechanisms and do not overlap.

## Design

### CLI surface

No new commands. Two existing commands are modified:

```sh
# behavior.snapshot.capture — now detects redirect pages
pnpm exec site-kernel run behavior.snapshot.capture --dist releases/warpgogol-com-r000003/dist --system warpgogol-com --release warpgogol-com-r000003
# Route /de now has: { path: "/de", contentHash: null, redirectTarget: "/" }

# leitstand.health — skips content-hash for contentHash: null routes
pnpm exec site-kernel run leitstand.health --system warpgogol-com --channel alt
# Route /de: checks HTTP 307/308 + redirect target, skips content hash
```

### TypeScript contracts

```ts
// RouteFact is currently a local interface in behavior-snapshot-commands.ts
// and cloudflare-workers.ts. This RFC moves it to @warpgogol/ontology/operations
// for canonical typing, then updates both consumers.

// Current shape (behavior-snapshot-commands.ts:34–39):
//   interface RouteFact { path: string; canonical?: string; status?: number; contentHash?: string }

// New shape in @warpgogol/ontology/operations/leitstand.ts:
interface RouteFact {
  path: string;
  canonical?: string;
  status?: number;
  contentHash: string | null;      // null for redirect routes (was optional string)
  redirectTarget?: string;          // present when contentHash is null
}

// Reuses existing isHtmlRedirectPage from @warpgogol/share/semantic/image-sitemap.
// If RFC-0592 later moves it to @warpgogol/share/redirects, the import path updates.
// No new redirect detection helper is created.

// New helper: extract redirect target from meta-refresh tag
function extractRedirectTarget(html: string): string | null {
  // Parses the url= value from <meta http-equiv="refresh" content="0;url=...">
  // Returns null if the target cannot be parsed.
}

// Health check: redirect route verification (in cloudflare-workers.ts)
// For routes with contentHash: null, fetchWithRetry uses redirect: "manual"
// instead of redirect: "follow".
function verifyRedirectRoute(
  response: Response,
  route: RouteFact,
): boolean {
  // Checks: response.status is 307 or 308,
  // and response.headers.get("location") matches route.redirectTarget
  // (when redirectTarget is known and not "unknown")
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/src/operations/leitstand.ts` | `RouteFact` type moved here from local interfaces; `contentHash` becomes `string \| null`, add optional `redirectTarget` |
| `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts` | `collectRoutes` reuses `isHtmlRedirectPage` from `@warpgogol/share/semantic/image-sitemap`; sets `contentHash: null` + `redirectTarget` for redirect pages; imports `RouteFact` from ontology |
| `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts` | Health check: `fetchWithRetry` uses `redirect: "manual"` for `contentHash: null` routes; verifies HTTP 307/308 + `Location` header; imports `RouteFact` from ontology |
| `packages/os/site-kernel-checks/src/behavior-snapshot.ts` | `buildBehaviorSnapshot` excludes meta-refresh redirect stubs from `RouteBehavior[]` (golden snapshot drift detection — redirect stubs are not real content routes and would create noise in drift diffs) |

### Output format

```json
{
  "routes": [
    {
      "path": "/de",
      "contentHash": null,
      "redirectTarget": "/"
    },
    {
      "path": "/",
      "contentHash": "sha256:d69f67da9d26ab4b15d936e9f010cbd975140855017f5f932902cd85b8b64339"
    }
  ]
}
```

### Failure modes

- **Redirect page detected**: `contentHash` is set to `null`, `redirectTarget` is extracted from the meta-refresh tag (the immediate target, not the final destination after multi-hop chains). Health check verifies HTTP 307/308 + `Location` header matches `redirectTarget`.
- **Redirect target cannot be parsed**: `contentHash` is set to `null`, `redirectTarget` is set to `"unknown"`. Health check verifies only HTTP 307/308 status.
- **Non-redirect page**: `contentHash` is computed normally. `redirectTarget` is absent. Health check does content-hash comparison as before.
- **Health check for redirect route**: `fetchWithRetry` uses `redirect: "manual"` for routes with `contentHash: null`. If the response is 307/308, the route is healthy. If the response is 200 (redirect not followed), the route is unhealthy — the redirect is broken.
- **Multi-hop redirects**: `/de` → `/de/` → `/`. The `redirectTarget` is the immediate target from the meta-refresh tag (`/de/`), not the final destination (`/`). The health check verifies the first hop only — subsequent hops are verified as separate routes in the snapshot.
- **External redirect target**: meta-refresh may redirect to an absolute URL (e.g., `https://example.com/`). The health check compares the full `Location` header value against `redirectTarget`, including the origin.

## Rollout

- **Default behavior**: active from day one. All new behavior snapshots automatically detect redirect pages.
- **Existing snapshots**: existing behavior snapshots with redirect routes have non-null `contentHash` for redirect pages. The operator regenerates the snapshot via `behavior.snapshot.capture` / `behavior.snapshot.generate` to get the new `contentHash: null` format. The health check does not support the old format for redirect routes — old snapshots must be regenerated.
- **Pipeline integration**: `behavior.snapshot.capture` and `behavior.snapshot.generate` already run in `release.prepare` and `build.post`. No pipeline changes needed.

## Alternatives considered

1. **Health check: `redirect: "manual"` for all routes** — don't follow redirects in the health check at all. Rejected: non-redirect routes that are accidentally redirected (e.g., misconfigured CDN) would not be detected. The fix should be targeted: only skip content-hash for routes explicitly marked as redirects in the snapshot.

2. **Snapshot stores final hash** — `behavior.snapshot.capture` follows the redirect and stores the final page's hash. Rejected: the snapshot should describe what's in `dist/`, not what's at the end of a redirect chain. The redirect page is the actual artifact in `dist/`; the final page is a different route. Storing the final hash for `/de` would be semantically wrong — it's the hash of `/`, not `/de`.

3. **Health check: ignore `/de` specifically** — hardcode redirect route paths. Rejected: not generalizable. Different sites have different redirect routes (e.g., `/en` → `/`, `/de/` → `/de`). The detection must be dynamic based on the HTML content.

## Risks

- **False negative**: if a redirect page is not detected (e.g., non-standard redirect format), the old behavior applies — content hash mismatch, unhealthy. This is safe — it's the current behavior, not worse.
- **Redirect target mismatch**: if the redirect target in the HTML doesn't match the actual `Location` header (e.g., CDN rewrites), the health check reports unhealthy. Mitigation: when `redirectTarget` is `"unknown"`, only HTTP status is checked.
- **Schema change**: `contentHash` changes from `string` to `string | null` in `RouteFact`. Consumers that expect `string` will get `null` for redirect routes. Consumers must handle `null` by skipping content comparison and verifying redirect status instead.
- **Agent confusion**: agents may try to manually set `contentHash: null` in snapshots. Mitigation: `behavior.snapshot.generate` is the only valid way to produce snapshots — manual edits are already discouraged.

## Acceptance criteria

- [x] `behavior.snapshot.capture` detects HTML redirect pages (meta-refresh) and sets `contentHash: null` + `redirectTarget` (evidence: `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts:84-91` — `isHtmlRedirectPage` + `extractRedirectTarget`)
- [x] `behavior.snapshot.generate` excludes meta-refresh redirect stubs from the golden snapshot (redirect stubs are not real content routes) (evidence: `packages/os/site-kernel-checks/src/behavior-snapshot.ts:263` — `if (isHtmlRedirectPage(html)) continue`)
- [x] `RouteFact` moved to `@warpgogol/ontology/operations/leitstand.ts` with `contentHash: string | null` and optional `redirectTarget` (evidence: `packages/ontology/src/operations/leitstand.ts:72-78` — `routeFactSchema`)
- [x] Health check skips content-hash comparison for routes with `contentHash: null` (evidence: `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts:262` — `if (route.contentHash === null)` branch with `continue`)
- [x] Health check verifies HTTP 307/308 status for redirect routes (evidence: `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts:278` — `isRedirectStatus = response.status === 307 || response.status === 308`)
- [x] Health check verifies `Location` header matches `redirectTarget` when `redirectTarget` is known (evidence: `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts:280-281` — `targetKnown` + `locationMatches`)
- [x] Non-redirect routes are unaffected — content-hash comparison works as before (evidence: `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts:330-345` — `if (route.contentHash)` branch unchanged)
- [x] Unit tests cover: redirect page detection, redirect health check (307 pass, 200 fail), non-redirect route unaffected, multi-hop redirect target extraction (evidence: `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot.test.ts:104-149`, `packages/share/src/redirects.test.ts:1-65`)
- [x] `rfc.validate` passes on this file (evidence: `pnpm exec site-kernel run rfc.validate RFC-0595 --json` exit 0, 1 warning V-30 non-blocking)
- [x] `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes (evidence: exit 0, `tsc --noEmit` clean)
- [x] `pnpm --filter @warpgogol/site-kernel-handoff test` passes (evidence: 87 test files, 369 tests passed)
- [x] `pnpm --filter @warpgogol/ontology build:check` passes (evidence: exit 0, `tsc --noEmit` clean)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT manually set `contentHash: null` in behavior snapshot files — only `behavior.snapshot.capture` / `behavior.snapshot.generate` may produce redirect markers.
- Agents MUST NOT skip health checks for redirect routes — they must verify HTTP 307/308 status and redirect target.
- Agents MUST NOT change `contentHash` to `null` for non-redirect routes — only HTML redirect pages (meta-refresh) qualify.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
