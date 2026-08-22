---
id: RFC-0917
title: "Centralize placeholder route template filtering and fix sitemap coverage diagnostics"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-22
updatedAt: 2026-08-22
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0913
  - RFC-0915
  - RFC-0916
satisfies: []
versionBump: patch
commands:
  proposed: []
  added:
    - sitemap.template-filter.consistency.validate
  changed:
    - sitemap.coverage.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt-shared
  - werkstatt-site
successSignals:
  - "No SITEMAP-COV-01 false positives from placeholder route templates"
  - "All system.md consumers skip placeholder routes identically"
  - "Sitemap coverage validator emits errors before warnings in pretty output"
nonGoals:
  - "Adding routeType: template field to system.md schema (future RFC)"
  - "Rewriting sitemap generation pipeline"
---

# RFC-0917: Centralize placeholder route template filtering and fix sitemap coverage diagnostics

## Context

During m000085 deployment, a multi-layered placeholder route bug required fixes in three independent consumers of `system.md`:

1. `packages/werkstatt-site/src/domain/share/astro/routes/registry.ts` — route registry loader
2. `packages/werkstatt-site/src/checks/sitemap-helpers.ts` — sitemap cluster generation
3. `packages/werkstatt-site/src/checks/sitemap-coverage.ts` — coverage validator expected-URL set

Each consumer independently discovered that `system.md` pages with routes like `nachweise/[slug]` are route templates expanded by dedicated generators (e.g. `getNachweisRoutes`), not actual pages. Each added its own inline `slug.includes("[")` check. The third consumer (`sitemap-coverage.ts`) was only discovered after the first two fixes passed SITEMAP-PH-01 but then failed SITEMAP-COV-01 with `[slug]` URLs "missing from sitemap".

Additionally, two operational issues surfaced:

- **Stale dist**: After sitemap code changes, `dist/client/sitemap-content.xml` was not refreshed because `writeFileIfChanged` skipped identical content in `public/`, but the `dist/` copy was from a previous build. Required manual deletion of `public/sitemap-content.xml` and regeneration.
- **COV-02 masking COV-01**: In pretty output, SITEMAP-COV-02 warnings (extra URLs) appeared before SITEMAP-COV-01 errors (missing URLs). Output truncation showed only the COV-02 tail, hiding the 4 COV-01 errors that actually failed the pipeline. Required `--json` to see the real failures.

## Problem

1. **Placeholder filtering is duplicated across 3+ consumers.** Each new consumer of `system.md` page entries must independently discover and implement placeholder filtering. Forgetting to add the filter in a new consumer produces false-positive diagnostics or stale sitemap entries. There is no shared utility or regression test enforcing consistency.

2. **Stale sitemap files in dist/ survive code changes.** `sitemap.generate` writes to `public/sitemap-*.xml` via `writeFileIfChanged`. If the generated content is byte-identical to the previous run, the file is not rewritten. But `dist/client/sitemap-*.xml` is copied from `public/` during `astro build`, not from the generator. If the generator code changes but the output happens to match (or the dist copy is from a previous build), the dist sitemap is stale. There is no `clean` step that removes stale sitemap files from `dist/` before regeneration.

3. **SITEMAP-COV-02 warnings mask SITEMAP-COV-01 errors in pretty output.** The validator emits warnings (COV-02) and errors (COV-01) in the order they are discovered, not by severity. When output is truncated (common in CI logs), only the tail is visible — warnings dominate, errors are hidden. This caused a full `mission.validate` cycle (~3 min) to be wasted debugging the wrong diagnostic.

## Decision

### 1. Centralize placeholder route filtering in `werkstatt-shared`

Extract a shared utility function to `packages/werkstatt-shared/src/share/routes/template-filter.ts`:

```ts
/**
 * Returns true if any route value in the given routes map contains
 * unresolved placeholder patterns (e.g. [slug], [version]).
 * These are route templates expanded by dedicated generators
 * (getNachweisRoutes, getNachweisVerifyRoutes), not actual pages.
 */
export function hasPlaceholderRoutes(routes?: Record<string, string>): boolean {
  if (!routes) return false;
  return Object.values(routes).some(
    (slug) => typeof slug === "string" && (slug.includes("[") || slug.includes("]")),
  );
}
```

All three consumers (`registry.ts`, `sitemap-helpers.ts`, `sitemap-coverage.ts`) import and use this function instead of inline checks. New consumers automatically get correct filtering by importing the utility.

### 2. Add `sitemap.template-filter.consistency.validate` regression test

A unit test that verifies all `system.md` consumers skip placeholder route templates identically. The test constructs a minimal manifest with a template entry (`routes: { de: "x/[slug]" }`) and verifies that registry, sitemap-helpers, and sitemap-coverage all exclude it.

### 3. Clean stale sitemap files from dist/ before regeneration

Add a step in `sitemap.generate` (or `build.prepare`) that removes `dist/client/sitemap-*.xml` before writing new files to `public/`. This ensures that a subsequent `astro build` copies fresh sitemap files, not stale ones from a previous build.

### 4. Sort sitemap coverage diagnostics by severity (errors first)

In `sitemap-coverage.ts`, sort the diagnostics array so that errors (COV-01) appear before warnings (COV-02) in both `--json` and pretty output. This ensures that output truncation shows the most severe issues first.

## Architectural fit

- **DNA-4** (Canonical content in `src/content/`): `system.md` is the canonical content source. Placeholder routes are content-level templates, not runtime routes. Centralizing the filter at the shared utility level ensures all consumers respect this distinction.
- **DNA-88** (Canonical slug generation ownership): This RFC extends the same principle — canonical utility ownership — to placeholder route filtering. `werkstatt-shared` is the canonical owner.
- **RFC-0916** (Utility provenance validator): The `utility.provenance.validate` command already enforces that shared utilities are imported from their canonical owner. This RFC adds a new shared utility that falls under the same enforcement.

## Design

### CLI surface

No new CLI commands for end users. The `sitemap.template-filter.consistency.validate` is a unit test, not a kernel command.

### TypeScript contracts

```ts
// packages/werkstatt-shared/src/share/routes/template-filter.ts

export function hasPlaceholderRoutes(routes?: Record<string, string>): boolean;
```

### File system responsibilities

| Path | Role |
|---|---|
| `packages/werkstatt-shared/src/share/routes/template-filter.ts` | New shared utility |
| `packages/werkstatt-site/src/domain/share/astro/routes/registry.ts` | Import and use shared utility |
| `packages/werkstatt-site/src/checks/sitemap-helpers.ts` | Import and use shared utility |
| `packages/werkstatt-site/src/checks/sitemap-coverage.ts` | Import and use shared utility, sort diagnostics by severity |
| `packages/werkstatt-shared/src/tests/template-filter.test.ts` | Unit test for the utility |
| `packages/werkstatt-site/src/tests/sitemap-consumer-consistency.test.ts` | Regression test for consumer consistency |

### Failure modes

- `hasPlaceholderRoutes` returns `false` for `undefined` or `null` routes — safe default, no false positives.
- Sitemap coverage validator sorts errors before warnings — if there are zero errors, warnings appear as before.
- Stale sitemap cleanup is non-fatal — if `dist/client/` doesn't exist, the cleanup step is skipped.

## Rollout

1. Create `template-filter.ts` in `werkstatt-shared` with `hasPlaceholderRoutes` function.
2. Add subpath export in `werkstatt-shared/package.json` for `./share/routes/template-filter`.
3. Replace inline placeholder checks in `registry.ts`, `sitemap-helpers.ts`, `sitemap-coverage.ts` with imports from the shared utility.
4. Add stale sitemap cleanup step in `sitemap.generate` or `build.prepare`.
5. Sort diagnostics by severity in `sitemap-coverage.ts`.
6. Add unit tests and consumer consistency regression test.
7. Run `mission.validate` to verify no regressions.

## Alternatives considered

- **Add `routeType: template` field to `system.md` schema**: More robust than string pattern matching, but requires schema migration across all Sternsystems. Deferred to a future RFC. The shared utility is a stepping stone — when `routeType` is added, the utility function changes from pattern matching to field checking, and all consumers automatically benefit.
- **Inline the filter in each consumer**: Status quo. Already proven fragile — three consumers needed three separate fixes in one session.
- **Filter at the manifest parser level**: Would require modifying the manifest loader to strip template entries. Rejected because template entries are legitimate data needed by dedicated route generators (e.g. `getNachweisRoutes`). The filter belongs at the consumer level, not the parser level.

## Risks

- **False positives**: `hasPlaceholderRoutes` checks for `[` and `]` in route strings. If a legitimate route contains these characters for other reasons, it would be incorrectly filtered. Risk is low — Astro dynamic route syntax is the only known use of brackets in route paths.
- **Consumer drift**: A new consumer could still forget to import the utility. The regression test mitigates this by testing known consumers, but cannot prevent future consumers from skipping the import. The `utility.provenance.validate` pattern (RFC-0916) could be extended to enforce that any file importing from `system.md` manifest pages also imports `hasPlaceholderRoutes`.

## Acceptance criteria

- [ ] `hasPlaceholderRoutes` utility created in `werkstatt-shared/src/share/routes/template-filter.ts`
- [ ] Subpath export added to `werkstatt-shared/package.json`
- [ ] `registry.ts`, `sitemap-helpers.ts`, `sitemap-coverage.ts` import from shared utility
- [ ] Inline placeholder checks removed from all three consumers
- [ ] Stale sitemap cleanup step added to `sitemap.generate` or `build.prepare`
- [ ] `sitemap-coverage.ts` sorts errors before warnings in diagnostics output
- [ ] Unit test for `hasPlaceholderRoutes` passes
- [ ] Consumer consistency regression test passes
- [ ] `mission.validate` passes on warpgogol with no SITEMAP-COV-01 false positives
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove the shared utility import in consumers without a new RFC that supersedes this one.
- The `hasPlaceholderRoutes` function is the canonical placeholder filter. Any new consumer of `system.md` page entries MUST import and use it.
