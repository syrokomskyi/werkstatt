---
id: RFC-0592
title: "Exclude meta-refresh redirect stubs and fix wildcard matching in behavior snapshot route collection"
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
createdAt: 2026-07-29
updatedAt: 2026-07-29
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-48
  - DNA-49
  - RFC-0588
  - RFC-0379
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-48
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
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/share"
  - "@warpgogol/site-kernel-handoff"
successSignals: []
nonGoals:
  - "Adding a --force flag to leitstand.propagate to bypass health gates"
  - "Changing dist-size-limit preflight checks (video size handled by separate RFC)"
  - "Modifying the health check probe logic or redirect-following behavior"
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

# RFC-0592: Exclude meta-refresh redirect stubs and fix wildcard matching in behavior snapshot route collection

## Context

The second real-world Cloudflare Workers propagation of `warpgogol-com-r000002` revealed two remaining gaps in behavior snapshot route collection that RFC-0588 did not cover. RFC-0588 excluded 301/308 routes by parsing `_redirects` rules and matching redirect source patterns against route paths. However, two edge cases persisted:

1. **Meta-refresh redirect stub pages**: Astro generates `de/index.html` as a meta-refresh redirect stub (RFC-0160 prefixed-default-language convention) that redirects `/de/` → `/`. The `_redirects` rule `/de/* /:splat 308` covers `/de/anything` but not `/de` itself (the route path produced by `collectRoutes` has no trailing slash). The health checker follows the redirect chain (`/de` → 307 → `/de/` → 308 → `/`) and receives the homepage content, which does not match the stub page's hash.

2. **Wildcard matching gap**: The `isRouteRedirected` function converts `/de/*` to regex `^/de/.*$`, which matches `/de/agb` but not `/de` (no trailing slash, no path after). Since `collectRoutes` strips trailing slashes from route paths, the `/de` route is never excluded by the wildcard rule.

## Problem

DNA-48 (Release discipline) requires behavior snapshots that accurately represent the deployable surface. DNA-49 (Fleet propagation) uses these snapshots for health verification. Two gaps cause false-negative health checks:

1. **Meta-refresh stubs in snapshot** (`packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts:75-94`): `collectRoutes` scans all `index.html` files and includes routes whose HTML is a meta-refresh redirect stub. The existing `isHtmlRedirectPage` function in `@warpgogol/share/semantic/image-sitemap` detects these pages but is not used by `collectRoutes`. Health checks on these routes always fail because the live server follows the redirect and returns different content.

2. **Wildcard matching misses directory root** (`behavior-snapshot-commands.ts:65-73`): `isRouteRedirected` converts `/de/*` to `^/de/.*$`, which does not match `/de` (the route path without trailing slash). Since `collectRoutes` strips trailing slashes, redirected directory roots are never excluded from the snapshot.

During the `warpgogol-com-r000002` deployment, the `probe:/de` health check reported `unhealthy` with "Content hash mismatch" even though the deployment was correct. The operator had to manually edit `systems/registry.yaml` with `sed` to mark the channel as healthy, bypassing the health gate.

## Decision

`collectRoutes` excludes routes whose `index.html` is a meta-refresh redirect stub by reusing the existing `isHtmlRedirectPage` detector. `isRouteRedirected` matches wildcard patterns against the directory root (e.g. `/de/*` matches `/de`). The `isHtmlRedirectPage` function is moved from `@warpgogol/share/semantic/image-sitemap` to `@warpgogol/share/redirects` where redirect-detection logic belongs.

## Architectural fit

- **DNA-48 (Release discipline)**: Behavior snapshots must accurately represent the deployable surface. Excluding redirect stubs ensures the snapshot only contains routes with real content.
- **DNA-49 (Fleet propagation)**: Health verification probes routes from the behavior snapshot. False negatives from redirect stubs block valid deployments and erode trust in the health gate.
- **RFC-0588**: Introduced redirect exclusion for 301/308 routes from `_redirects`. This RFC extends that logic with meta-refresh stub detection and wildcard matching fix.
- **RFC-0379**: Implemented the cloudflare-workers adapter with health verification. This RFC fixes the snapshot that health verification depends on.
- **RFC-0160**: Established prefixed-default-language convention where `/de/` redirects to `/`. The meta-refresh stub pages are generated by this convention.

## Design

### CLI surface

No new commands. Changed commands:

```sh
# behavior.snapshot.capture now excludes meta-refresh redirect stubs and fixes wildcard matching
pnpm exec site-kernel run behavior.snapshot.capture --dist <html-dir> --system <id> --build-kind <readable|production>
```

No new flags. The exclusion is automatic — any `index.html` containing `<meta http-equiv="refresh">` is excluded from the snapshot.

### TypeScript contracts

```ts
// Moved from @warpgogol/share/semantic/image-sitemap to @warpgogol/share/redirects
// Existing function, no signature change:

/**
 * True when the HTML is a meta-refresh redirect stub (no real content) — e.g. the
 * RFC-0160 prefixed-default-language `/de/…` → `/…` stubs.
 *
 * Note: we deliberately do NOT treat `window.location` as a stub signal. Full
 * content pages (the root home, RFC-0159) carry a *soft* client-side language
 * redirect for non-default browser locales while still serving complete HTML;
 * those must be harvested, not skipped.
 */
export function isHtmlRedirectPage(html: string): boolean;

// Updated in behavior-snapshot-commands.ts:

export function isRouteRedirected(routePath: string, rules: RedirectRule[]): boolean {
  // When a wildcard rule is /de/*, also match /de (directory root without trailing slash).
  // The regex for /de/* becomes ^/de(/.*)?$ instead of ^/de/.*$,
  // so it matches /de, /de/, /de/agb, /de/agb/terms, etc.
  for (const rule of rules) {
    if (rule.status !== 301 && rule.status !== 308) continue;
    const escaped = rule.from.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    // Replace /* with (/.*)? — makes the trailing slash + path optional,
    // so /de/* matches /de as well as /de/anything
    const pattern = escaped.replace(/\/\*$/, "(/.*)?$").replace(/\*/g, ".*");
    const regex = new RegExp(`^${pattern}$`);
    if (regex.test(routePath)) return true;
  }
  return false;
}

// Updated collectRoutes — adds meta-refresh stub exclusion:
export async function collectRoutes(
  distDir: string,
  redirectRules: RedirectRule[] = [],
): Promise<RouteFact[]> {
  // ... existing logic ...
  for (const fullPath of await collectFiles(distDir, { extensions: [".html"] })) {
    if (path.basename(fullPath) !== "index.html") continue;
    const routePath = /* ... existing path derivation ... */;
    if (isRouteRedirected(routePath || "/", redirectRules)) continue;
    const html = await fs.readFile(fullPath, "utf8");
    if (isHtmlRedirectPage(html)) continue; // NEW: skip meta-refresh stubs
    const contentHash = hashHtml(html);
    routes.push({ path: routePath || "/", contentHash });
  }
  // ...
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/redirects.ts` | Receives `isHtmlRedirectPage` (moved from `semantic/image-sitemap`) |
| `packages/share/src/semantic/image-sitemap.ts` | Re-exports `isHtmlRedirectPage` from `@warpgogol/share/redirects` for backward compatibility |
| `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts` | `collectRoutes` adds `isHtmlRedirectPage` check; `isRouteRedirected` fixes wildcard matching |
| `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot.test.ts` | New tests for meta-refresh exclusion and wildcard root matching |

### Output format

No change to the `behavior.snapshot.capture` output shape. The `routes[]` array in the snapshot will contain fewer entries (redirect stubs excluded), but the `RouteFact` interface and JSON wrapper are unchanged.

### Failure modes

- **False positive risk**: A page that uses `<meta http-equiv="refresh">` for a legitimate non-redirect purpose (e.g. auto-refresh of a dashboard) would be excluded from the snapshot. This is acceptable because: (a) the existing `isHtmlRedirectPage` comment already documents this trade-off, (b) such pages are rare in static marketing sites, (c) the page is still deployed and accessible — just not health-checked.
- **Wildcard over-matching risk**: Making `/de/*` match `/de` could over-exclude if there were a legitimate non-redirected `/de` route. In practice, if `/de/*` is in `_redirects` with 308, then `/de` is also a redirect — they are semantically the same route.

## Rollout

- **Default behavior**: The exclusion is automatic. No flags, no opt-in.
- **Existing apps**: The next `release.prepare` will produce a snapshot with fewer routes (redirect stubs excluded). This is a smaller snapshot, not a breaking change — health checks will probe fewer routes, all of which have real content.
- **New apps**: Automatically comply from day one.
- **Pipeline integration**: `behavior.snapshot.capture` runs inside `build.post` via `behavior.snapshot.generate`. No pipeline changes needed.
- **Migration**: The next release for each system will have a behavior snapshot diff (fewer routes). The diff is expected and should be reviewed by the operator before committing the refreshed snapshot.

## Alternatives considered

1. **Only fix wildcard matching** — Rejected because meta-refresh stubs from other conventions (not covered by `_redirects` rules) would still be included. The `isHtmlRedirectPage` detector catches all meta-refresh stubs regardless of `_redirects` rules.

2. **Only add meta-refresh stub exclusion** — Rejected because the wildcard matching gap would still cause `/de` to be included if a non-meta-refresh redirect method were used in the future. Both fixes are needed for defense-in-depth.

3. **Add `--force` flag to `leitstand.propagate`** — Rejected by the operator. Health check false negatives are bugs to fix in the code, not to bypass with flags. A `--force` flag would mask real deployment issues.

4. **Move `isHtmlRedirectPage` to a new `@warpgogol/share/html` module** — Rejected as over-engineering. `@warpgogol/share/redirects` already exists and is the natural home for redirect-detection logic.

## Risks

- **Snapshot diff noise**: The first release after implementation will show a behavior snapshot diff (fewer routes). Operators must understand this is expected, not a regression. The diff should be reviewed before committing.
- **False positive on legitimate meta-refresh**: A page using meta-refresh for auto-refresh (not redirect) would be excluded from health checks. Acceptable trade-off — the page is still deployed, just not probed.
- **Agent misinterpretation**: Agents might think this RFC changes the `_redirects` format or adds new redirect rules. It does not — it only changes which routes are included in the behavior snapshot.
- **Backward compatibility**: `isHtmlRedirectPage` is moved to a new module. The old import path (`@warpgogol/share/semantic/image-sitemap`) must re-export it to avoid breaking existing consumers.

## Acceptance criteria

- [ ] `isHtmlRedirectPage` moved from `@warpgogol/share/semantic/image-sitemap` to `@warpgogol/share/redirects` with backward-compatible re-export
- [ ] `collectRoutes` excludes routes whose `index.html` contains `<meta http-equiv="refresh">` (evidence: `behavior-snapshot.test.ts`, test with meta-refresh stub HTML)
- [ ] `isRouteRedirected` matches `/de` for wildcard rule `/de/*` (evidence: `behavior-snapshot.test.ts`, test with `/de/*` rule and `/de` route)
- [ ] `pnpm --filter @warpgogol/site-kernel-handoff test` passes with new tests
- [ ] `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- [ ] `pnpm --filter @warpgogol/share build:check` passes
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The `isHtmlRedirectPage` move MUST include a backward-compatible re-export from `@warpgogol/share/semantic/image-sitemap` to avoid breaking existing consumers.
- The wildcard regex change MUST be tested with both `/de` (directory root) and `/de/agb` (sub-path) to ensure both match `/de/*`.
- After implementation, the next `release.prepare` for each system will produce a behavior snapshot diff. Agents MUST NOT auto-commit the refreshed snapshot — the operator must review and commit it manually.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
