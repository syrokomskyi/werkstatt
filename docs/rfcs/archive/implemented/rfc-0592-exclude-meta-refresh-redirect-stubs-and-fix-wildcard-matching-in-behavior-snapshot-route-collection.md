---
id: RFC-0592
title: "Fix wildcard matching in behavior snapshot route collection"
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
createdAt: 2026-07-29
updatedAt: 2026-07-30
enhancedAt: 2026-07-30
implementedAt: 2026-07-30
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
  - RFC-0595
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
successSignals: []
nonGoals:
  - "Adding a --force flag to leitstand.propagate to bypass health gates"
  - "Changing dist-size-limit preflight checks (video size handled by separate RFC)"
  - "Modifying the health check probe logic or redirect-following behavior"
  - "410 Gone handling (covered by RFC-0589)"
  - "Meta-refresh redirect stub exclusion from the behavior snapshot (covered by RFC-0595, which marks redirect routes with contentHash: null + redirectTarget instead of excluding them)"
  - "Moving isHtmlRedirectPage between @warpgogol/share subpath modules (RFC-0595 imports it from its current location)"
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

# RFC-0592: Fix wildcard matching in behavior snapshot route collection

## Context

The second real-world Cloudflare Workers propagation of `warpgogol-com-r000002` revealed a remaining gap in behavior snapshot route collection that RFC-0588 did not cover. RFC-0588 excluded 301/308 routes by parsing `_redirects` rules and matching redirect source patterns against route paths. However, one edge case persisted:

**Wildcard matching gap**: The `isRouteRedirected` function converts `/de/*` to regex `^/de/.*$`, which matches `/de/agb` but not `/de` (no trailing slash, no path after). Since `collectRoutes` strips trailing slashes from route paths, the `/de` route is never excluded by the wildcard rule.

The meta-refresh redirect stub exclusion was originally part of this RFC but has been split into RFC-0595, which proposes a more complete approach: marking redirect routes with `contentHash: null` + `redirectTarget` and verifying the redirect itself via health checks (HTTP 307/308 + Location header), rather than simply excluding them.

## Problem

DNA-48 (Release discipline) requires behavior snapshots that accurately represent the deployable surface. DNA-49 (Fleet propagation) uses these snapshots for health verification. A wildcard matching gap causes false-negative health checks:

**Wildcard matching misses directory root** (`behavior-snapshot-commands.ts:65-73`): `isRouteRedirected` converts `/de/*` to `^/de/.*$`, which does not match `/de` (the route path without trailing slash). Since `collectRoutes` strips trailing slashes, redirected directory roots are never excluded from the snapshot.

During the `warpgogol-com-r000002` deployment, the `probe:/de` health check reported `unhealthy` with "Content hash mismatch" even though the deployment was correct. The operator had to manually edit `systems/registry.yaml` with `sed` to mark the channel as healthy, bypassing the health gate.

## Decision

`isRouteRedirected` matches wildcard patterns against the directory root (e.g. `/de/*` matches `/de`). The regex for `/de/*` becomes `^/de(/.*)?$` instead of `^/de/.*$`, so it matches `/de`, `/de/`, `/de/agb`, `/de/agb/terms`, etc.

## Architectural fit

- **DNA-48 (Release discipline)**: Behavior snapshots must accurately represent the deployable surface. Fixing wildcard matching ensures redirected directory roots are correctly excluded from the snapshot.
- **DNA-49 (Fleet propagation)**: Health verification probes routes from the behavior snapshot. False negatives from unmatched wildcard rules block valid deployments and erode trust in the health gate.
- **RFC-0588**: Introduced redirect exclusion for 301/308 routes from `_redirects`. This RFC fixes the wildcard matching logic in that exclusion.
- **RFC-0379**: Implemented the cloudflare-workers adapter with health verification. This RFC fixes the snapshot that health verification depends on.
- **RFC-0595**: Handles meta-refresh redirect stub detection and marking redirect routes with `contentHash: null` + `redirectTarget`. This RFC is complementary — it fixes the `_redirects`-based wildcard matching that RFC-0595 does not address.

## Design

### CLI surface

No new commands. Changed commands:

```sh
# behavior.snapshot.capture now fixes wildcard matching for _redirects rules
pnpm exec werkstatt run behavior.snapshot.capture --dist <html-dir> --system <id> --build-kind <readable|production>
```

No new flags. The wildcard matching fix is automatic — `/de/*` now matches `/de` in addition to `/de/anything`.

### TypeScript contracts

```ts
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
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts` | `isRouteRedirected` fixes wildcard matching for directory root |
| `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot.test.ts` | Update existing test asserting `/de` does NOT match `/de/*` (now it should match); add test for `/de/` matching |

### Output format

No change to the `behavior.snapshot.capture` output shape. The `routes[]` array in the snapshot may contain fewer entries (redirected directory roots now excluded by wildcard rules), but the `RouteFact` interface and JSON wrapper are unchanged.

### Failure modes

- **Wildcard over-matching risk**: Making `/de/*` match `/de` could over-exclude if there were a legitimate non-redirected `/de` route. In practice, if `/de/*` is in `_redirects` with 308, then `/de` is also a redirect — they are semantically the same route.

## Rollout

- **Default behavior**: The wildcard matching fix is automatic. No flags, no opt-in.
- **Existing apps**: The next `release.prepare` will produce a snapshot with fewer routes (redirected directory roots now excluded). This is a smaller snapshot, not a breaking change — health checks will probe fewer routes.
- **New apps**: Automatically comply from day one.
- **Pipeline integration**: `behavior.snapshot.capture` runs inside `build.post` via `behavior.snapshot.generate`. No pipeline changes needed.
- **Migration**: The next release for each system will have a behavior snapshot diff (fewer routes). The diff is expected and should be reviewed by the operator before committing the refreshed snapshot.

## Alternatives considered

1. **Only fix wildcard matching, no meta-refresh exclusion** — This is the chosen approach. Meta-refresh redirect stub detection and marking is handled by RFC-0595, which proposes a more complete solution (marking redirect routes with `contentHash: null` + `redirectTarget` and verifying the redirect via health checks) rather than simply excluding them.

2. **Add `--force` flag to `leitstand.propagate`** — Rejected by the operator. Health check false negatives are bugs to fix in the code, not to bypass with flags. A `--force` flag would mask real deployment issues.

## Risks

- **Snapshot diff noise**: The first release after implementation will show a behavior snapshot diff (fewer routes — redirected directory roots now excluded). Operators must understand this is expected, not a regression. The diff should be reviewed before committing.
- **Agent misinterpretation**: Agents might think this RFC changes the `_redirects` format or adds new redirect rules. It does not — it only fixes the wildcard matching logic in `isRouteRedirected`.
- **Existing test breakage**: The existing test at `behavior-snapshot.test.ts:32` asserts `expect(isRouteRedirected("/de", rules)).toBe(false)`. This test must be updated to `toBe(true)` as part of the implementation.
- **AGENTS.md update**: `packages/os/site-kernel-handoff/AGENTS.md` has a section about `collectRoutes` and RFC-0588 redirect exclusion. It should be updated to mention the wildcard matching fix from this RFC.

## Acceptance criteria

- [x] `isRouteRedirected` matches `/de` for wildcard rule `/de/*` (evidence: `behavior-snapshot.test.ts:30`, `expect(isRouteRedirected("/de", rules)).toBe(true)`)
- [x] `isRouteRedirected` still matches `/de/agb` and `/de/agb/terms` for wildcard rule `/de/*` (evidence: `behavior-snapshot.test.ts:31-32`, `expect(isRouteRedirected("/de/agb", rules)).toBe(true)` and `/de/agb/terms`)
- [x] `isRouteRedirected` does NOT match `/agb` for wildcard rule `/de/*` (evidence: `behavior-snapshot.test.ts:33`, `expect(isRouteRedirected("/agb", rules)).toBe(false)`)
- [x] Existing test at `behavior-snapshot.test.ts:30` updated from `toBe(false)` to `toBe(true)` for `/de` matching `/de/*` (evidence: commit `eb6f078`)
- [x] `pnpm --filter @warpgogol/site-kernel-handoff test` passes with updated tests (evidence: 354 tests passed, 0 failures)
- [x] `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes (evidence: `tsc --noEmit` exit 0)
- [x] `rfc.validate` passes on this file before merging (evidence: no RFC-0592 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The wildcard regex change MUST be tested with both `/de` (directory root) and `/de/agb` (sub-path) to ensure both match `/de/*`.
- The existing test asserting `isRouteRedirected("/de", rules)` returns `false` MUST be updated to `true` — this is a behavior change, not a test bug.
- After implementation, the next `release.prepare` for each system will produce a behavior snapshot diff (fewer routes). Agents MUST NOT auto-commit the refreshed snapshot — the operator must review and commit it manually.
- `packages/os/site-kernel-handoff/AGENTS.md` should be updated to mention the wildcard matching fix in the `collectRoutes` / RFC-0588 section.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N` instead of working around it (RFC-0334).
