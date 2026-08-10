---
id: RFC-0791
title: "Auto-discover well-known routes in public-surface validation"
status: accepted
kind: command
scope: app
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-10
updatedAt: 2026-08-10
enhancedAt: 2026-08-10
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
    - public.surface.lint
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "PUBTXT-07 no longer fires for files present in public/.well-known/"
  - "No manual routePaths registration needed for new well-known endpoints"
nonGoals:
  - "Do not auto-discover routes outside public/.well-known/ — only well-known endpoints"
  - "Do not change PUBTXT-07 severity or reporting logic"
  - "Do not change isPublicTextArtifact — the extension filter stays for non-.well-known/ paths"
---

# RFC-0791: Auto-discover well-known routes in public-surface validation

## Context

RFC-0789 introduced agent discovery links (`/.well-known/api-catalog`, `/.well-known/mcp/server-card.json`, `/.well-known/agent.openapi.json`) in `llms.txt`. The public-surface linter (`public.surface.lint`, PUBTXT-07) flags any generated link target not present in the `routePaths` set or the `publicPaths` set. When new `.well-known/` endpoints are added, developers must manually register them in `aggregate.ts`:

```ts
routePaths.add("/.well-known/api-catalog");
routePaths.add("/.well-known/mcp/server-card.json");
routePaths.add("/.well-known/agent.openapi.json");
```

This is fragile — adding a new well-known endpoint without registering it causes a PUBTXT-07 false positive that blocks the build.

The root cause is that `publicPaths` is built from `context.io.glob("**/*")` filtered by `isPublicTextArtifact`, which only includes files with extensions `.txt`, `.md`, `.xml`, `.json`, `.webmanifest`, `.svg` (`shared.ts:89-92`). Extensionless files like `api-catalog` are filtered out and never enter `publicPaths`. The `routePaths` set is built from sitemap and manifest pages, but `.well-known/` files are not pages and are not in the sitemap. The manual `routePaths.add` calls were a workaround for this filtering gap.

## Problem

The invariant "every link target in `llms.txt` must be locally known" is protected by PUBTXT-07, but the set of locally-known routes is maintained manually for `.well-known/` endpoints. This creates a class of false positives that are trivially preventable by scanning the `public/.well-known/` directory at validation time.

Concrete failure mode (RFC-0789 session): three agent discovery routes were added to `llms.txt` but not to `routePaths`. The build failed with PUBTXT-07 errors. The fix was manual registration — three lines in `aggregate.ts`.

## Decision

The `public.surface.lint` command extends its `publicPaths` set with a complementary glob for `public/.well-known/**` that bypasses the `isPublicTextArtifact` extension filter. This ensures extensionless files like `api-catalog` enter `publicPaths` and are recognized as locally known by PUBTXT-07. The manual `routePaths.add` calls for `.well-known/` routes are removed in the same commit — they are no longer needed.

## Architectural fit

- **Anti-Patterns**: Prevents AP-class "manual registration that should be automatic" — the validator scans the filesystem instead of relying on developer discipline.
- **Site OS operator model**: No new command — extends an existing `public.surface.lint` command (`scope: app`). The change is internal to the validation logic in `packages/werkstatt-site/src/checks/public-surface/aggregate.ts`.

## Design

### CLI surface

No new command. The existing command is unchanged from the operator's perspective:

```sh
pnpm exec werkstatt run public.surface.lint --site warpgogol-com
```

### TypeScript contracts

No new helper function. The fix extends the existing `publicPaths` building logic in `runPublicSurfaceLint` (`aggregate.ts`) with a complementary glob for `.well-known/`:

```ts
// In runPublicSurfaceLint, after building publicPaths from isPublicTextArtifact:

// RFC-0791: Include extensionless .well-known/ files (e.g. api-catalog)
// that isPublicTextArtifact filters out. Node's fs.glob returns both
// files and directories — use stat to filter out directories.
const wellKnownEntries = await context.io.glob(".well-known/**/*", { cwd: app.publicDirectory });
for (const relPath of wellKnownEntries) {
  const normalized = normalizePublicRelPath(relPath);
  const stats = await stat(join(app.publicDirectory, normalized));
  if (stats.isFile()) {
    publicPaths.add(publicPathFromRelPath(normalized));
  }
}
```

The manual `routePaths.add` calls for `.well-known/` routes (lines 173-177) are removed — `publicPaths` now covers them.

### File system responsibilities

| Path | Role |
| --- | --- |
| `public/.well-known/**` | Globbed without extension filter for `publicPaths` |
| `aggregate.ts` | Updated: complementary `.well-known/` glob added to `publicPaths`; manual `routePaths.add` calls removed |

### Output format

No change to `--json` output. The `routePaths` set is internal; the diagnostics output is unchanged.

### Failure modes

- If `public/.well-known/` does not exist: the glob returns an empty array. No error, no warning — the site simply has no well-known endpoints.
- If a file in `.well-known/` is not valid UTF-8: it is still added to `routePaths` (route existence is independent of content validity). The existing UTF-8 check (PUBTXT-03) handles content validation.

## Rollout

- **Default behavior**: The complementary `.well-known/` glob is enabled immediately. Manual `routePaths.add` calls for `.well-known/` routes are removed in the same commit — they are redundant now that `publicPaths` covers them.
- **Existing apps**: No migration needed. All `.well-known/` files are now in `publicPaths` regardless of extension.
- **New apps**: Automatically compliant — any file placed in `public/.well-known/` is discovered.
- **Pipeline integration**: No change — `public.surface.lint` is already part of the `sites-check-author` pipeline.

## Alternatives considered

- **Separate `discoverWellKnownRoutes` function returning `Set<string>`**: A dedicated helper that scans `public/.well-known/` recursively and returns route paths for merging into `routePaths`. Rejected in favor of extending `publicPaths` because the existing `publicPaths` mechanism already handles the PUBTXT-07 check at `aggregate.ts:298-301` — adding to `publicPaths` is a 5-line change vs a new function with its own signature. The `publicPaths` approach is also semantically correct: these are files on disk, not abstract routes.

- **Extending `isPublicTextArtifact` to include extensionless files under `.well-known/`**: Modifying the filter to accept extensionless paths when they start with `.well-known/`. Rejected because it would change the filter's behavior for all callers, not just `publicPaths` building. The complementary glob is scoped to the `publicPaths` building logic only.

- **Contract test extracting links from `llms.txt`**: A test that parses `llms.txt`, extracts all links, and verifies each is in `routePaths`. Rejected as primary solution because it catches the problem at test time, not at validation time — the developer still needs to register routes manually. Auto-discovery eliminates the manual step entirely.

- **Sitemap inclusion for `.well-known/` files**: Adding well-known endpoints to the sitemap. Rejected because `.well-known/` files are machine-readable endpoints, not human-navigable pages — they do not belong in a sitemap.

## Risks

- **Performance**: The complementary glob for `public/.well-known/**` adds one directory walk to validation. The directory is typically small (<20 files), so the impact is negligible.
- **False negatives**: If a `.well-known/` file exists on disk but is not linked from any page, it enters `publicPaths` and PUBTXT-07 will not flag it. This is correct behavior — PUBTXT-07 checks that link targets exist, not that all files are linked.
- **Stray files**: `public/.well-known/` is generated by `build.prepare` and should not contain stray files. Hidden files like `.DS_Store` would be added to `publicPaths` but this is harmless — they would only suppress PUBTXT-07 for links to those files, which do not exist in practice.

## Acceptance criteria

- [ ] Complementary `.well-known/` glob added to `publicPaths` in `aggregate.ts`
- [ ] Manual `routePaths.add` calls for `.well-known/` routes removed from `aggregate.ts`
- [ ] `public.surface.lint` recognizes extensionless `.well-known/` files (e.g. `api-catalog`) via `publicPaths`
- [ ] Unit test: site with `public/.well-known/api-catalog` (extensionless) → no PUBTXT-07
- [ ] Unit test: site with `public/.well-known/agent.json` → no PUBTXT-07 (already worked, regression guard)
- [ ] Unit test: site without `public/.well-known/` → no error, `publicPaths` unchanged
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0791 --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
