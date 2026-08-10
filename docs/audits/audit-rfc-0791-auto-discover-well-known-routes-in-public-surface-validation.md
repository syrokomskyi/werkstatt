---
rfcId: RFC-0791
auditId: AUDIT-RFC-0791-01
date: 2026-08-10
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0791

## Verdict: Needs revision

The RFC identifies a real problem (PUBTXT-07 false positives for `.well-known/` routes) and proposes a reasonable solution direction, but contains a factual error in the command name (`public.surface.validate` vs actual `public.surface.lint`), an incomplete root cause analysis that misses the `isPublicTextArtifact` extension filter as the specific mechanism, and a forward-only violation in the rollout section.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0791` exits 0, zero violations.

## Axis A — Structural completeness

- **A-1 (FAIL): Wrong command name in `commands.changed` and CLI surface.** The RFC frontmatter lists `public.surface.validate` in `commands.changed` (line 28). The actual command is `public.surface.lint`, registered at `packages/werkstatt-site/src/checks/command-tables/31-public-surface.ts:138` with `scope: "app"`. There is no `public.surface.validate` command in the codebase. The CLI surface example at line 103 also uses the wrong name: `pnpm exec werkstatt run public.surface.validate --site warpgogol-com`.
- **A-2 (FAIL): Wrong `scope` in frontmatter.** The RFC has `scope: workspace` (line 6), but the command being changed (`public.surface.lint`) is `scope: app`. The RFC only modifies an app-scoped command in a single package — `scope: app` is correct.
- **A-3 (FAIL): TypeScript contract references non-existent type.** The proposed `discoverWellKnownRoutes` signature uses `io: WorkspaceIO` (line 112), but `WorkspaceIO` is not imported or used in the public-surface module. The existing code uses `context.io` (from `KernelRuntimeContext`). The contract should take `context: KernelRuntimeContext` or use the correct I/O type from `@warpgogol/werkstatt/kernel`.

## Axis B — DNA alignment

- **B-1 (FAIL): DNA-1 claim not reflected in `satisfies[]`.** The RFC body (line 85) claims "This strengthens DNA-1 (monorepo boundary)", but `satisfies[]` is empty (line 22). For a `command` kind RFC, `--satisfies` is not required (RFC-0331), but making a DNA alignment claim in the body without listing it in `satisfies[]` is inconsistent. Either add `DNA-1` to `satisfies[]` or remove the claim from the body. The claim itself is also weak — auto-discovering `.well-known/` routes has little to do with the monorepo boundary invariant (which governs package/app/service import directions).

## Axis C — Ecosystem fit

- **C-1 (FAIL): Root cause analysis is incomplete.** The RFC states `.well-known/` files are not in `routePaths` because they're "not pages and are not in the sitemap" (line 62). But the code already has a `publicPaths` set (`aggregate.ts:155`) containing all files in `public/` via `context.io.glob("**/*")`, and PUBTXT-07 checks BOTH `routePaths` AND `publicPaths` (lines 298-301). The real mechanism is: `isPublicTextArtifact` (`shared.ts:89-92`) filters by extension (`.txt`, `.md`, `.xml`, `.json`, `.webmanifest`, `.svg`). Files like `agent.json`, `server-card.json`, `agent.openapi.json` have `.json` extension and ARE already in `publicPaths`. The file that triggered the false positive — `api-catalog` — has NO extension, so `isPublicTextArtifact` returns `false` and it's excluded from `publicPaths`. The RFC should state this as the root cause.
- **C-2 (FAIL): Alternative approach not considered.** The RFC could extend `isPublicTextArtifact` to include extensionless files under `.well-known/`, or add a separate unfiltered glob for `.well-known/` into `publicPaths`. This would be simpler than a new `discoverWellKnownRoutes` function. The alternatives section should explain why a separate discovery function is preferred over extending the existing `publicPaths` mechanism.

## Axis D — Forward-only compliance

- **D-1 (FAIL): Deferred cleanup violates forward-only discipline.** The rollout section (lines 153-156) says manual `routePaths.add` calls "can be removed in a follow-up commit" and are "not removed in the same commit to keep the change minimal." The ecosystem is forward-only — no dual-paths, no deferred cleanup. The manual `routePaths.add` calls at `aggregate.ts:173-177` should be removed as part of this RFC's implementation, not left as "redundant but harmless" dead code.

## Axis E — Agent-facing policy

No issues. No NEEDS CLARIFICATION markers. Status gate is correct — implementation notes reference RFC-0224 for accepted→implemented transition.

## Axis F — Pragmatism

- **F-1 (WARN): `discoverWellKnownRoutes` may be over-engineered.** The existing `publicPaths` mechanism already scans all of `public/` — the only gap is the `isPublicTextArtifact` extension filter. A simpler fix would be to add a complementary glob for `.well-known/` that doesn't filter by extension, adding results to `publicPaths` (not `routePaths`). This is a 3-line change vs a new function with its own signature. The RFC should justify why a separate function is needed rather than extending the existing set.

## Axis G — Blind spots

- **G-1 (WARN): Directory handling not specified.** The `discoverWellKnownRoutes` function scans recursively, but `.well-known/` contains subdirectories (e.g. `mcp/`). The RFC says "Directories without an index.html produce a bare path" (line 117), but directories themselves are not routes — only files within them are. The function should skip directories and only add file paths to the route set.
- **G-2 (WARN): Non-route files not filtered.** `public/.well-known/` might contain files not meant to be served as routes (e.g. `.DS_Store`, temporary files). The discovery function should filter out hidden files and known non-route artifacts.

## Questions for the author

1. The actual command is `public.surface.lint`, not `public.surface.validate`. Should the RFC correct the command name in `commands.changed`, the CLI surface example, and the body text?
2. The root cause is `isPublicTextArtifact` filtering out extensionless files like `api-catalog`, not the absence of `.well-known/` routes from `routePaths`. Should the RFC amend its root cause analysis and consider extending `publicPaths` instead of adding to `routePaths`?
3. Should the manual `routePaths.add` calls at `aggregate.ts:173-177` be removed in the same commit as the auto-discovery implementation, per forward-only discipline?
