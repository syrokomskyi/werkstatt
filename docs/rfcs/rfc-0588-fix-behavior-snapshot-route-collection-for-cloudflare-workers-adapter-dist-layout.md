---
id: RFC-0588
title: "Fix behavior snapshot route collection for Cloudflare Workers adapter dist layout"
status: accepted
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
createdAt: 2026-07-29
updatedAt: 2026-07-29
enhancedAt: 2026-07-29
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
    - behavior.snapshot.capture
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/site-kernel-checks"
successSignals: []
nonGoals:
  - "Preflight check fixes (covered by RFC-0587)"
  - "_redirects 410 Gone handling (covered by RFC-0589)"
  - "dist/client/ detection and behaviorSnapshot wrapper unwrapping — already fixed in commit 89085ed"
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

The first real-world Cloudflare Workers propagation of `warpgogol-com-r000001` revealed three bugs in behavior snapshot route collection. Bugs 1 and 2 were fixed in commit `89085ed` and are documented here for context. Bug 3 remains unfixed and is the sole focus of this RFC's decision.

**Bug 1 (fixed in `89085ed`):** The Astro Cloudflare adapter outputs HTML files to `dist/client/` and server code to `dist/server/`, but `release.prepare` passed `dist/` (the root) to `behavior.snapshot.capture`, causing all route paths to be prefixed with `/client/`. Health verification then probed `/client/agb` instead of `/agb`, and every route returned a content hash mismatch. The fix detects `dist/client/` and passes it as the HTML directory.

**Bug 2 (fixed in `89085ed`):** `readBehaviorSnapshot` in the Cloudflare Workers adapter expected the routes array at the top level of the snapshot JSON, but `behavior.snapshot.capture` wraps it in a `behaviorSnapshot` field. This caused the adapter to find zero routes and skip health verification entirely. The fix unwraps the `behaviorSnapshot` field via `raw.behaviorSnapshot ?? raw`.

**Bug 3 (unfixed — focus of this RFC):** Routes that are redirected by `_redirects` rules (e.g. `/de/*` → `/*` with 308) were included in the behavior snapshot. The health checker followed the redirect and received the content of the target page, which did not match the hash of the redirected page's prerendered HTML.

## Problem

DNA-48 (Release discipline) requires behavior snapshots that bind the live site to the build output. DNA-49 (Fleet propagation) uses these snapshots for health verification. Bugs 1 and 2 were fixed in commit `89085ed`. Bug 3 remains:

3. **Redirected routes in snapshot** (`packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts:63`): `collectRoutes` scans all `index.html` files in the dist directory, including those for routes that are redirected by `_redirects` rules. For example, `/de/agb` is prerendered but redirected to `/agb` (308). The health checker follows the redirect, receives `/agb`'s content, and the hash mismatches.

**Already fixed (for context):**

1. **`/client/` route prefix** — fixed in `89085ed`. `release.prepare` now detects `dist/client/` at `release-commands.ts:263-265`.

2. **Snapshot wrapper unwrapping** — fixed in `89085ed`. `readBehaviorSnapshot` now unwraps via `parsed.behaviorSnapshot ?? parsed` at `cloudflare-workers.ts:101-102`.

## Decision

`collectRoutes` reads `_redirects` and excludes routes that match redirect source patterns (301, 308) from the behavior snapshot. Bugs 1 and 2 were already fixed in commit `89085ed` and require no further changes.

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
# behavior.snapshot.capture now excludes redirected routes from the snapshot
pnpm exec site-kernel run behavior.snapshot.capture --dist <html-dir> --system <id> --build-kind <readable|production>
```

### TypeScript contracts

```ts
// collectRoutes — exclude redirected routes
// parseRedirectRules is exported from @warpgogol/site-kernel-checks
// (existing function in src/public-surface/managed-public.ts, now exported)

interface RedirectRule {
  from: string;   // e.g. "/de/*"
  to: string | undefined;  // e.g. "/:splat" (matches existing site-kernel-checks type)
  status: number; // e.g. 308
  line: string;   // original line (matches existing type)
}

// New function in behavior-snapshot-commands.ts
function isRouteRedirected(routePath: string, rules: RedirectRule[]): boolean {
  // Convert _redirects glob patterns to regex matchers.
  // "*" in _redirects matches any sequence of characters.
  // Example: "/de/*" → /^\/de\/.*/$ which matches "/de/agb", "/de/agb/terms"
  // Literal paths match exactly.
  // Only 301 and 308 redirects trigger exclusion (410 is handled by RFC-0589).
  for (const rule of rules) {
    if (rule.status !== 301 && rule.status !== 308) continue;
    const pattern = rule.from.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    const regex = new RegExp(`^${pattern}$`);
    if (regex.test(routePath)) return true;
  }
  return false;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts` | `collectRoutes` reads `_redirects` and excludes redirected routes via `isRouteRedirected` |
| `packages/os/site-kernel-checks/src/public-surface/managed-public.ts` | `parseRedirectRules` exported (already exists, now exported for reuse) |
| `<distDir>/_redirects` | Read by `collectRoutes` to determine redirect rules (same `distDir` passed to `collectRoutes`) |

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
- **Malformed `_redirects` line**: `parseRedirectRules` skips lines it cannot parse (empty lines, comments starting with `#`, lines without a `from` field). This is existing behavior from the `site-kernel-checks` implementation.
- **410 Gone redirects**: Not excluded by this RFC. 410 tombstone handling is covered by RFC-0589, which moves 410 handling to middleware. If 410 routes remain in the snapshot after RFC-0589 implementation, a follow-up may be needed.

## Rollout

- **Default behavior**: Redirect exclusion is active immediately upon implementation. No feature flags.
- **Existing releases**: Releases with existing behavior snapshots that include redirected routes will fail health verification. Re-running `release.prepare` for the same mission regenerates the snapshot with redirect exclusion applied.
- **New releases**: Automatically use redirect exclusion from day one.
- **Pipeline integration**: No pipeline changes. `release.prepare` → `behavior.snapshot.capture` → `leitstand.propagate` flow is unchanged; only the `collectRoutes` internal implementation is fixed.

## Alternatives considered

1. **Follow redirects in health checker and compare target hash**: Rejected — redirected routes should not be in the snapshot at all. Including them adds noise and the hash comparison is meaningless (the redirected page's HTML is never served).

2. **Separate `behavior.snapshot.redirect.exclude` command**: Rejected — redirect exclusion is a concern of `collectRoutes`, not a separate command. Adding a command for this would be over-engineering.

3. **Exclude 410 Gone routes in this RFC**: Rejected — 410 tombstone handling is architecturally distinct (middleware-level, not `_redirects`-level) and is covered by RFC-0589. Mixing 410 exclusion into this RFC would create a coupling between two independent fixes.

## Risks

- **Redirect rule parsing**: `parseRedirectRules` handles whitespace-delimited `_redirects` lines (`from to status`). It does not handle advanced Cloudflare Pages syntax (e.g., query parameters, placeholders in `from`). Mitigation: the existing parser in `site-kernel-checks` is sufficient for the current `_redirects` format used by the ecosystem.
- **False negative on redirect exclusion**: If a route is redirected but the redirect rule is malformed, the route remains in the snapshot and will mismatch. Mitigation: `parseRedirectRules` skips unparseable lines (existing behavior).
- **Glob pattern edge cases**: The `*` wildcard in `_redirects` matches any sequence of characters. The regex conversion escapes all regex special characters before replacing `*` with `.*`. Edge case: a literal `*` in a route path (unlikely in practice) would be treated as a wildcard. Mitigation: route paths with literal `*` are not used in this ecosystem.
- **410 Gone routes**: This RFC does not exclude 410-redirected routes. If RFC-0589 does not fully address prerendered 410 pages, a follow-up RFC may be needed. Mitigation: RFC-0589 moves 410 handling to middleware, which should prevent 410 routes from being prerendered.

## Acceptance criteria

- [x] `release.prepare` passes `dist/client/` (when it exists) to `behavior.snapshot.capture` instead of `dist/` root (evidence: `release-commands.ts:263-265`, already fixed in commit `89085ed`)
- [x] `readBehaviorSnapshot` in the cloudflare-workers adapter unwraps the `behaviorSnapshot` field (evidence: `cloudflare-workers.ts:101-102`, already fixed in commit `89085ed`)
- [ ] `collectRoutes` reads `_redirects` and excludes routes matching redirect source patterns (301, 308) (evidence: `behavior-snapshot-commands.ts:<line>`, `/de/*` routes absent from snapshot)
- [ ] `parseRedirectRules` is exported from `@warpgogol/site-kernel-checks` and imported in `behavior-snapshot-commands.ts` (evidence: no duplicate redirect parsing logic)
- [ ] `isRouteRedirected` converts `*` wildcard patterns to regex matchers and excludes matching routes (evidence: `behavior-snapshot-commands.ts:<line>`, test with `/de/*` pattern)
- [ ] `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- [ ] `pnpm --filter @warpgogol/site-kernel-handoff test` passes
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
- Export `parseRedirectRules` from `packages/os/site-kernel-checks/src/public-surface/managed-public.ts` (add `export` keyword). The existing `RedirectRule` type (`to: string | undefined`, `line: string`) is used as-is — do not create a parallel type.
- Implement `isRouteRedirected` locally in `behavior-snapshot-commands.ts`. It converts `*` to `.*` in regex patterns, escaping all other regex special characters first. Only 301 and 308 redirects trigger exclusion.
- Bugs 1 and 2 are already fixed in commit `89085ed`. Do not re-implement `dist/client/` detection or `behaviorSnapshot` wrapper unwrapping.
- Related RFCs: RFC-0587 (preflight checks), RFC-0589 (_redirects 410 handling).
