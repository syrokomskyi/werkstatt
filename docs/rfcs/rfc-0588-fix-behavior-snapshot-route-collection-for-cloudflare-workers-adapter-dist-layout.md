---
id: RFC-0588
title: "Fix behavior snapshot route collection for Cloudflare Workers adapter dist layout"
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
  - RFC-0269
  - RFC-0357
  - RFC-0585
  - RFC-0587
  - RFC-0589
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
    - release.prepare
    - behavior.snapshot.capture
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals: []
nonGoals:
  - "Preflight check fixes (covered by RFC-0587)"
  - "_redirects 410 handling (covered by RFC-0589)"
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

# RFC-0588: Fix behavior snapshot route collection for Cloudflare Workers adapter dist layout

## Context

The first real-world Cloudflare Workers propagation of `warpgogol-com-r000001` revealed that behavior snapshot route collection was incompatible with the Astro Cloudflare adapter's dist layout. The adapter outputs HTML files to `dist/client/` and server code to `dist/server/`, but `release.prepare` passed `dist/` (the root) to `behavior.snapshot.capture`, causing all route paths to be prefixed with `/client/`. Health verification then probed `/client/agb` instead of `/agb`, and every route returned a content hash mismatch.

Additionally, `readBehaviorSnapshot` in the Cloudflare Workers adapter expected the routes array at the top level of the snapshot JSON, but `behavior.snapshot.capture` wraps it in a `behaviorSnapshot` field. This caused the adapter to find zero routes and skip health verification entirely.

Finally, routes that are redirected by `_redirects` rules (e.g. `/de/*` → `/*` with 308) were included in the behavior snapshot. The health checker followed the redirect and received the content of the target page, which did not match the hash of the redirected page's prerendered HTML.

## Problem

DNA-48 (Release discipline) requires behavior snapshots that bind the live site to the build output. DNA-49 (Fleet propagation) uses these snapshots for health verification. Three bugs prevent this contract from being upheld:

1. **`/client/` route prefix** (`packages/os/site-kernel-handoff/src/release/release-commands.ts:268`): `release.prepare` passes `distDest` (the dist root) to `behavior.snapshot.capture`. The Astro Cloudflare adapter outputs HTML to `dist/client/`, so `collectRoutes` scans `dist/` and finds HTML under `client/`, prefixing all 154 routes with `/client/`.

2. **Snapshot wrapper unwrapping** (`packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts:94`): `readBehaviorSnapshot` reads `snapshot.routes` directly, but `behavior.snapshot.capture` writes `{ behaviorSnapshot: { routes: [...] } }`. The adapter found zero routes and skipped all health checks.

3. **Redirected routes in snapshot** (`packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts:63`): `collectRoutes` scans all `index.html` files in the dist directory, including those for routes that are redirected by `_redirects` rules. For example, `/de/agb` is prerendered but redirected to `/agb` (308). The health checker follows the redirect, receives `/agb`'s content, and the hash mismatches.

## Decision

`release.prepare` detects the HTML output directory (`dist/client/` for Cloudflare adapter, `dist/` for static) and passes it to `behavior.snapshot.capture`. `readBehaviorSnapshot` in the adapter unwraps the `behaviorSnapshot` field. `collectRoutes` reads `_redirects` and excludes routes that match redirect source patterns from the behavior snapshot.

## Architectural fit

- **DNA-48 (Release discipline)**: Behavior snapshots are a core requirement of DNA-48. This RFC fixes the route collection so snapshots accurately represent the deployable surface.
- **DNA-49 (Fleet propagation)**: Health verification uses behavior snapshot routes to probe the live site. This RFC fixes the snapshot so health checks compare the correct URLs.
- **RFC-0269**: Introduced behavior snapshots. This RFC fixes the route collection implementation.
- **RFC-0357**: Established release discipline. This RFC fixes `release.prepare`'s use of snapshots.
- **RFC-0585**: Restored release.prepare production build. This RFC fixes the snapshot capture dist path.
- **RFC-0587**: Fixes Leitstand preflight. This RFC complements it by fixing the snapshot that health verification depends on.

## Design

### CLI surface

No new commands. Changed commands:

```sh
# release.prepare now detects dist/client/ automatically
pnpm exec site-kernel run release.prepare --mission <id>

# behavior.snapshot.capture can be called directly with the HTML directory
pnpm exec site-kernel run behavior.snapshot.capture --dist <html-dir> --system <id>
```

### TypeScript contracts

```ts
// release.prepare — detect HTML output directory
function resolveHtmlDir(distDir: string): string {
  const clientDir = path.join(distDir, "client");
  return existsSync(clientDir) ? clientDir : distDir;
}

// collectRoutes — exclude redirected routes
interface RedirectRule {
  from: string;   // e.g. "/de/*"
  to: string;     // e.g. "/:splat"
  status: number; // e.g. 308
}

function parseRedirectRules(redirectsContent: string): RedirectRule[];
function isRouteRedirected(routePath: string, rules: RedirectRule[]): boolean;

// readBehaviorSnapshot — unwrap behaviorSnapshot field
function readBehaviorSnapshot(snapshotPath: string): {
  routes: RouteFact[];
  sitemapHash: string | null;
  robotsHash: string | null;
} {
  const raw = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const snapshot = raw.behaviorSnapshot ?? raw;  // handle both wrapped and unwrapped
  return { routes: snapshot.routes ?? [], ... };
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/release/release-commands.ts` | `release.prepare` resolves `dist/client/` for snapshot capture |
| `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts` | `collectRoutes` reads `_redirects` and excludes redirected routes |
| `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts` | `readBehaviorSnapshot` unwraps `behaviorSnapshot` field |
| `releases/<id>/dist/client/_redirects` | Read by `collectRoutes` to determine redirect rules |
| `releases/<id>/behavior-snapshot.json` | Written by `release.prepare`, read by adapter |

### Output format

`behavior.snapshot.capture --json` output — routes now have correct paths (no `/client/` prefix):

```json
{
  "command": "behavior.snapshot.capture",
  "status": "ok",
  "data": {
    "behaviorSnapshotHash": "sha256:abc...",
    "behaviorSnapshot": {
      "routes": [
        { "path": "/", "contentHash": "sha256:4f4f..." },
        { "path": "/agb", "contentHash": "sha256:8a9e..." }
      ],
      "sitemapHash": "sha256:def...",
      "robotsHash": null
    }
  }
}
```

Routes that match `_redirects` source patterns (e.g. `/de/*`) are excluded from the `routes` array.

### Failure modes

- **Missing `_redirects` file**: `collectRoutes` proceeds without redirect exclusion. All HTML routes are included. This is the current behavior and is safe — redirected routes will mismatch in health checks, but the snapshot is still usable.
- **Malformed `_redirects` line**: `parseRedirectRules` skips lines it cannot parse. A warning is logged.
- **Missing `dist/client/` directory**: `resolveHtmlDir` falls back to `dist/` root. This handles static-only builds (no Cloudflare adapter).
- **Snapshot without `behaviorSnapshot` wrapper**: `readBehaviorSnapshot` handles both wrapped and unwrapped formats via `raw.behaviorSnapshot ?? raw`.

## Rollout

- **Default behavior**: All fixes are active immediately upon implementation. No feature flags.
- **Existing releases**: Releases with existing behavior snapshots that have `/client/` prefixed routes will fail health verification. Re-running `release.prepare` for the same mission regenerates the snapshot with correct paths.
- **New releases**: Automatically use `dist/client/` detection and redirect exclusion from day one.
- **Pipeline integration**: No pipeline changes. `release.prepare` → `behavior.snapshot.capture` → `leitstand.propagate` flow is unchanged; only the internal implementations are fixed.

## Alternatives considered

1. **Hardcode `dist/client/` path**: Rejected — not all adapters use `dist/client/`. Static-only builds output HTML to `dist/` root. The `resolveHtmlDir` helper detects the correct directory.

2. **Strip `/client/` prefix in health checker**: Rejected — the behavior snapshot should have correct route paths from the start. Stripping prefixes in the health checker is a workaround that hides the root cause.

3. **Follow redirects in health checker and compare target hash**: Rejected — redirected routes should not be in the snapshot at all. Including them adds noise and the hash comparison is meaningless (the redirected page's HTML is never served).

4. **Separate `behavior.snapshot.redirect.exclude` command**: Rejected — redirect exclusion is a concern of `collectRoutes`, not a separate command. Adding a command for this would be over-engineering.

## Risks

- **Adapter-specific dist layout**: This fix assumes Cloudflare adapter uses `dist/client/` for HTML. If a future adapter uses a different layout, `resolveHtmlDir` must be updated. Mitigation: the helper is a single function in `release-commands.ts`.
- **Redirect rule parsing**: `parseRedirectRules` must handle all `_redirects` syntax variants (splat `*`, named `:splat`, literal paths). Mitigation: reuse the existing `parseRedirectRules` from `redirect.map.validate` in `site-kernel-checks`.
- **False negative on redirect exclusion**: If a route is redirected but the redirect rule is malformed, the route remains in the snapshot and will mismatch. Mitigation: `parseRedirectRules` logs a warning on malformed lines.
- **Agent misinterpretation**: Agents may think `dist/client/` is a hardcoded path. Mitigation: AGENTS.md should document that `resolveHtmlDir` is adapter-aware.

## Acceptance criteria

- [ ] `release.prepare` passes `dist/client/` (when it exists) to `behavior.snapshot.capture` instead of `dist/` root (evidence: `release-commands.ts:<line>`, snapshot routes have no `/client/` prefix)
- [ ] `readBehaviorSnapshot` in the cloudflare-workers adapter unwraps the `behaviorSnapshot` field (evidence: `cloudflare-workers.ts:<line>`, `raw.behaviorSnapshot ?? raw` pattern)
- [ ] `collectRoutes` reads `_redirects` and excludes routes matching redirect source patterns (evidence: `behavior-snapshot-commands.ts:<line>`, `/de/*` routes absent from snapshot)
- [ ] `parseRedirectRules` is reused from `site-kernel-checks` or extracted to a shared helper (evidence: no duplicate redirect parsing logic)
- [ ] `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- [ ] `pnpm --filter @warpgogol/site-kernel-handoff test` passes
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The `parseRedirectRules` function SHOULD be reused from `packages/os/site-kernel-checks/src/public-surface/managed-public.ts` or extracted to `@warpgogol/share` if shared. Do not duplicate redirect parsing logic.
- The `resolveHtmlDir` helper MUST be exported from `release-commands.ts` or moved to `@warpgogol/site-kernel-astro` if other commands need it.
- Related RFCs: RFC-0587 (preflight checks), RFC-0589 (_redirects 410 handling).
