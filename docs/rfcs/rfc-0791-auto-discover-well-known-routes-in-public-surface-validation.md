---
id: RFC-0791
title: "Auto-discover well-known routes in public-surface validation"
status: draft
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-10
updatedAt: 2026-08-10
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0789
  - RFC-0307
  - RFC-0316
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - public.surface.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "PUBTXT-07 no longer fires for files present in public/.well-known/"
  - "No manual routePaths registration needed for new well-known endpoints"
nonGoals:
  - "Do not auto-discover routes outside public/.well-known/ — only well-known endpoints"
  - "Do not remove existing manually-registered routes — additive only"
  - "Do not change PUBTXT-07 severity or reporting logic"
---

# RFC-0791: Auto-discover well-known routes in public-surface validation

## Context

RFC-0789 introduced agent discovery links (`/.well-known/api-catalog`,
`/.well-known/mcp/server-card.json`, `/.well-known/agent.openapi.json`) in
`llms.txt`. The public-surface linter (`public.surface.validate`, PUBTXT-07)
flags any generated link target not present in the `routePaths` set. When
new `.well-known/` endpoints are added, developers must manually register
them in `aggregate.ts`:

```ts
routePaths.add("/.well-known/api-catalog");
routePaths.add("/.well-known/mcp/server-card.json");
routePaths.add("/.well-known/agent.openapi.json");
```

This is fragile — adding a new well-known endpoint without registering it
in `routePaths` causes a PUBTXT-07 false positive that blocks the build.
The root cause is that `routePaths` is built from sitemap and manifest
pages, but `.well-known/` files are not pages and are not in the sitemap.

## Problem

The invariant "every link target in `llms.txt` must be locally known" is
protected by PUBTXT-07, but the set of locally-known routes is maintained
manually for `.well-known/` endpoints. This creates a class of false
positives that are trivially preventable by scanning the `public/.well-known/`
directory at validation time.

Concrete failure mode (RFC-0789 session): three agent discovery routes were
added to `llms.txt` but not to `routePaths`. The build failed with PUBTXT-07
errors. The fix was manual registration — three lines in `aggregate.ts`.

## Decision

The `public.surface.validate` command auto-discovers all files under
`public/.well-known/` and adds their paths to `routePaths` before running
the PUBTXT-07 link-target check. This eliminates the need for manual
registration of well-known endpoints.

## Architectural fit

- **Architecture DNA**: This strengthens DNA-1 (monorepo boundary) by
  ensuring the public-surface validator is self-contained and does not
  require cross-file manual synchronization.
- **Anti-Patterns**: Prevents AP-class "manual registration that should be
  automatic" — the validator scans the filesystem instead of relying on
  developer discipline.
- **Site OS operator model**: No new command — extends an existing
  `public.surface.validate` command. The change is internal to the
  validation logic in `packages/werkstatt-site/src/checks/public-surface/aggregate.ts`.

## Design

### CLI surface

No new command. The existing command is unchanged from the operator's
perspective:

```sh
pnpm exec werkstatt run public.surface.validate --site warpgogol-com
```

### TypeScript contracts

```ts
// New helper in aggregate.ts (or shared.ts):
async function discoverWellKnownRoutes(
  publicDir: string,
  io: WorkspaceIO,
): Promise<Set<string>> {
  // Scan publicDir/.well-known/ recursively.
  // Return a set of route paths: /.well-known/agent.json, /.well-known/api-catalog, etc.
  // Directories without an index.html produce a bare path (no trailing slash).
  // Files produce their full path.
  // Returns empty set if publicDir/.well-known/ does not exist.
}
```

### File system responsibilities

| Path | Role |
|---|---|
| `public/.well-known/**` | Scanned for route auto-discovery |
| `aggregate.ts` | Updated to call `discoverWellKnownRoutes` and merge into `routePaths` |

### Output format

No change to `--json` output. The `routePaths` set is internal; the
diagnostics output is unchanged.

### Failure modes

- If `public/.well-known/` does not exist: `discoverWellKnownRoutes`
  returns an empty set. No error, no warning — the site simply has no
  well-known endpoints.
- If a file in `.well-known/` is not valid UTF-8: it is still added to
  `routePaths` (route existence is independent of content validity).
  The existing UTF-8 check (PUBTXT-03) handles content validation.

## Rollout

- **Default behavior**: Auto-discovery is enabled immediately. Existing
  manually-registered routes remain in `routePaths` — auto-discovery is
  additive (union), not replacement.
- **Existing apps**: No migration needed. Apps with manually-registered
  `.well-known/` routes continue to work; the manual entries are now
  redundant but harmless.
- **New apps**: Automatically compliant — any file placed in
  `public/.well-known/` is discovered.
- **Cleanup**: After this RFC is implemented, the manual `routePaths.add`
  calls for `.well-known/` endpoints in `aggregate.ts` can be removed in
  a follow-up commit. They are not removed in the same commit to keep
  the change minimal and avoid breaking anything during the transition.
- **Pipeline integration**: No change — `public.surface.validate` is
  already part of the standard check pipeline.

## Alternatives considered

- **Contract test extracting links from `llms.txt`**: A test that parses
  `llms.txt`, extracts all links, and verifies each is in `routePaths`.
  Rejected as primary solution because it catches the problem at test
  time, not at validation time — the developer still needs to register
  routes manually. Auto-discovery eliminates the manual step entirely.
  A contract test can be added as a secondary defense-in-depth measure.

- **Sitemap inclusion for `.well-known/` files**: Adding well-known
  endpoints to the sitemap. Rejected because `.well-known/` files are
  machine-readable endpoints, not human-navigable pages — they do not
  belong in a sitemap.

## Risks

- **Performance**: Scanning `public/.well-known/` adds a directory walk
  to validation. The directory is typically small (<20 files), so the
  impact is negligible.
- **False negatives**: If a `.well-known/` file exists on disk but is
  not linked from any page, auto-discovery adds it to `routePaths` and
  PUBTXT-07 will not flag it. This is correct behavior — PUBTXT-07 checks
  that link targets exist, not that all files are linked.
- **Maintenance burden**: Minimal — the discovery logic is a single
  recursive directory scan.

## Acceptance criteria

- [ ] `discoverWellKnownRoutes` helper implemented in `aggregate.ts` or `shared.ts`
- [ ] `public.surface.validate` auto-discovers `.well-known/` routes and merges into `routePaths`
- [ ] Existing manually-registered `.well-known/` routes remain (additive, not replacement)
- [ ] Unit test: site with `public/.well-known/agent.json` → route auto-discovered, no PUBTXT-07
- [ ] Unit test: site without `public/.well-known/` → no error, empty set
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it.
