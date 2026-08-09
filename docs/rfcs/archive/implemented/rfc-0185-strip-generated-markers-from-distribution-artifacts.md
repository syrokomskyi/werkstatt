---
id: RFC-0185
title: "Strip generated markers from distribution artifacts"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-09
updatedAt: 2026-06-09
implementedAt: 2026-06-09
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0081
  - RFC-0049
  - RFC-0050
  - RFC-0172
amendedBy: []
related:
  - RFC-0087
  - RFC-0184
commands:
  proposed:
    - dist.generated-marker.strip
    - dist.generated-marker.validate
  added:
    - dist.generated-marker.strip
    - dist.generated-marker.validate
  changed:
    - dist.sitemap.images.generate
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/os/site-kernel
  - packages/os/site-kernel-astro
  - packages/os/site-kernel-checks
  - packages/os/site-kernel-codegen
successSignals:
  - "Generated ownership markers remain present in apps/* source and public files before build/deploy."
  - "Published dist/client text artifacts do not expose the RFC-0081 generated marker line or comment."
  - "sitemap-images.xml remains post-build generated, and marker cleanup runs after all post-build generators that write into dist/client."
  - "The marker string and marker-stripping patterns are exported from one shared package surface instead of duplicated across generators and validators."
nonGoals:
  - "Do not remove RFC-0081 generated ownership markers from tracked apps/* files."
  - "Do not convert generated public files to manually maintained files."
  - "Do not add runtime request-time filtering in Cloudflare Workers, Astro routes, or middleware."
  - "Do not change the semantic content of sitemap, robots, llms, ai, headers, or redirect artifacts."
---

# RFC-0185: Strip generated markers from distribution artifacts

## Context

RFC-0081 established a repository-wide generated-file governance marker:

```text
GENERATED. Do not change this line unless the file contains project specific changes.
```

That marker is useful in tracked `apps/*` files because generators use it to decide whether a file is still generator-owned and safe to overwrite. The same marker currently appears in public-facing files copied from `apps/<site>/public/` into `dist/client/`, including `robots.txt`, `ai.txt`, `llms.txt`, `llms-full.txt`, `_headers`, `_redirects`, `.assetsignore`, and `sitemap*.xml`.

The ecosystem already has one post-build distribution generator: `dist.sitemap.images.generate` in `packages/os/site-kernel-checks/src/sitemap-images.ts`. It reads rendered HTML under `dist/client`, harvests final render-resolved content-image URLs, and writes `dist/client/sitemap-images.xml`. This proves that the Site OS already treats `dist/client` as a build artifact surface with post-generation steps.

## Problem

The RFC-0081 marker is an internal ownership signal, not visitor-facing content. When it is copied into `dist/client`, it becomes published payload:

- `llms.txt` starts with an internal governance line before the AI-readable H1.
- `robots.txt` and `ai.txt` expose repository workflow details to crawlers.
- XML sitemaps include an implementation-only comment after the XML prolog.
- `_headers`, `_redirects`, and `.assetsignore` may carry internal comments into platform-specific upload artifacts.

Removing the marker directly from `apps/*/public/*` is wrong because that would break generated-file governance. Duplicating ad-hoc strip logic inside each generator is also wrong because the marker string and comment wrappers would drift.

## Decision

The Site OS gains a distribution-only generated-marker cleanup pass.

Tracked generated source files keep their RFC-0081 marker. Distribution artifacts under `dist/client` MUST NOT expose the marker after the full build/post-generation pipeline completes.

The marker text and marker cleanup helpers are centralized in one shared package surface:

- `GENERATED_MARKER` remains the canonical raw marker string.
- A new exported marker pattern/strip helper owns all supported comment syntaxes.
- Generators and validators MUST import the shared marker utilities instead of duplicating the raw string or regexes.

The cleanup pass is modeled as a post-generation Site OS command because `sitemap-images.xml` is already generated after Astro build and therefore cannot be fully handled by an Astro-only build hook.

## Architectural fit

- **RFC-0081:** preserved. Generated ownership remains encoded in tracked `apps/*` files. This RFC only strips published copies in `dist/client`.
- **RFC-0087:** reinforces idempotent, generator-owned output. Cleanup is deterministic and acts only on build artifacts.
- **RFC-0049:** sitemap index and sub-sitemaps may keep markers in `public/`; the copied `dist/client` versions are cleaned before deploy.
- **RFC-0050 / RFC-0184:** `llms.txt` remains generated and validated in `public/`, but the final distribution file starts with the AI-readable Markdown contract rather than an internal marker.
- **RFC-0172:** image sitemap remains post-build generated from rendered HTML. The marker cleanup command runs after `dist.sitemap.images.generate` so `sitemap-images.xml` is cleaned too.
- **Site OS operator model:** build artifact mutation belongs in an app-scoped command that derives paths from `KernelRuntimeContext`, not in app-local scripts.

## Design

### CLI surface

Two app-scoped commands are introduced:

```sh
pnpm exec werkstatt run dist.generated-marker.strip --app warpgogol-com
pnpm exec werkstatt run dist.generated-marker.validate --app warpgogol-com --json
```

`dist.generated-marker.strip` mutates only `apps/<site>/dist/client/**`.

`dist.generated-marker.validate` scans only `apps/<site>/dist/client/**` and fails if any supported text artifact still contains the generated marker.

The standard app build/deploy pipeline MUST run these commands after all post-build generators that can write into `dist/client`, including `dist.sitemap.images.generate`.

### TypeScript contracts

The shared marker surface exposes one raw marker and distribution cleanup helpers:

```ts
export const GENERATED_MARKER: string;

export interface StripGeneratedMarkerOptions {
  collapseLeadingBlankLine?: boolean;
}

export interface StripGeneratedMarkerResult {
  changed: boolean;
  content: string;
}

export function hasGeneratedMarker(content: string): boolean;
export function stripGeneratedMarker(content: string, options?: StripGeneratedMarkerOptions): StripGeneratedMarkerResult;
export function isGeneratedMarkerTextCandidate(path: string): boolean;
```

Implementation requirements:

- `stripGeneratedMarker` MUST recognize the canonical marker in supported wrappers: `#`, `//`, `/* */`, `<!-- -->`, and plain text.
- XML prologs MUST remain the first bytes of XML files. If the marker appears after `<?xml ...?>`, stripping must preserve the prolog and remove only the marker comment plus one adjacent newline when safe.
- The helper MUST NOT remove arbitrary comments that lack `GENERATED_MARKER`.
- The helper SHOULD be pure and unit-tested in the package that owns `GENERATED_MARKER`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/generated-marker.ts` | Canonical marker string, marker detector, and strip helper |
| `packages/os/site-kernel-codegen/src/generated-marker.ts` | Re-export shim only |
| `packages/os/site-kernel-checks/src/*` | Commands that generate or validate public and dist artifacts consume shared marker helpers |
| `apps/<site>/public/**` | Tracked generated source artifacts; markers remain |
| `apps/<site>/dist/client/**` | Distribution artifacts; markers are stripped after all post-generation writes |
| `apps/<site>/tools/kernel.config.ts` and generator templates | Pipeline wiring for all current and future sites |

### Output format

`dist.generated-marker.strip --json` returns a stable summary:

```json
{
  "command": "dist.generated-marker.strip",
  "status": "pass",
  "filesScanned": 42,
  "filesChanged": 8,
  "changedFiles": [
    "dist/client/llms.txt",
    "dist/client/sitemap.xml"
  ]
}
```

`dist.generated-marker.validate --json` returns violations on failure:

```json
{
  "command": "dist.generated-marker.validate",
  "status": "fail",
  "violations": [
    {
      "file": "dist/client/llms.txt",
      "rule": "DIST-GENMARK-01",
      "message": "Distribution artifact still contains the generated ownership marker. Run dist.generated-marker.strip after post-build generators."
    }
  ]
}
```

### Failure modes

| Rule | Command | Severity | Meaning |
| --- | --- | --- | --- |
| `DIST-GENMARK-01` | `dist.generated-marker.validate` | error | A file under `dist/client` still contains `GENERATED_MARKER`. |
| `DIST-GENMARK-02` | `dist.generated-marker.strip` | error | `dist/client` is missing when strip is invoked in a context that expects a built app. |
| `DIST-GENMARK-03` | `dist.generated-marker.strip` | warning | A file cannot be read as text although it matched the text-candidate filter; skip and report. |

`strip` should be idempotent: running it twice changes files only on the first pass.

## Rollout

1. Add shared marker stripping utilities next to the canonical `GENERATED_MARKER` source.
2. Add `dist.generated-marker.strip` and `dist.generated-marker.validate` as app-scoped Site OS commands.
3. Wire `dist.generated-marker.strip` into the standard build/deploy pipeline after `dist.sitemap.images.generate`.
4. Wire `dist.generated-marker.validate` into app build validation after strip or as a post-build assertion.
5. Update app boilerplate/kernel templates so new sites inherit the behavior automatically.
6. Keep existing generated `apps/*/public/**` files unchanged except normal generator regeneration.
7. Validate both existing apps and confirm `dist/client` has no generated marker while `public/` still does.

## Alternatives considered

- **Remove markers from `public/` generation:** rejected because it breaks RFC-0081 ownership detection and would make generated files look manually maintained.
- **Astro integration only:** rejected because `sitemap-images.xml` is produced after Astro build by `dist.sitemap.images.generate`; an Astro build hook would not clean later post-build artifacts.
- **Strip inside each generator:** rejected because it duplicates marker syntax knowledge and misses files copied by Astro from `public/`.
- **Runtime Worker filtering:** rejected because static artifacts should be correct before deployment and because platform-specific request filtering would add unnecessary runtime complexity.
- **Stop writing markers into dist-only generators:** insufficient alone. It solves `sitemap-images.xml` but not copied `public/` artifacts.

## Risks

- **Over-stripping comments:** mitigated by requiring the exact canonical `GENERATED_MARKER` string in every pattern.
- **Pipeline order drift:** mitigated by a validate command that fails if any post-build generator writes a marker after cleanup.
- **Binary-file reads:** mitigated by a conservative text-candidate filter and warning-only unreadable-file handling.
- **Agents editing generated public files:** mitigated by explicitly preserving RFC-0081 in `public/` and documenting that cleanup is distribution-only.
- **XML validity regressions:** mitigated by preserving XML prologs and adding tests for sitemap marker placement.

## Acceptance criteria

- [x] `GENERATED_MARKER`, `hasGeneratedMarker`, and `stripGeneratedMarker` are exported from one canonical package surface. (evidence: implemented historically)
- [x] Existing marker consumers stop duplicating raw marker strings or regexes. (evidence: implemented historically)
- [x] `dist.generated-marker.strip` is registered as an app-scoped Site OS command. (evidence: implemented historically)
- [x] `dist.generated-marker.validate` is registered as an app-scoped Site OS command with stable rule IDs. (evidence: implemented historically)
- [x] Standard app build/deploy pipelines run marker stripping after `dist.sitemap.images.generate`. (evidence: implemented historically)
- [x] New app boilerplate/template wiring includes the cleanup step. (evidence: implemented historically)
- [x] `apps/*/public/**` generated files retain markers before build. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/*/dist/client/**` contains no `GENERATED_MARKER` after the build/post-generation pipeline. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `sitemap-images.xml` remains generated post-build and is included in cleanup/validation. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Package build checks pass for affected packages. (evidence: implemented historically)
- [x] Targeted app build/deploy check passes for at least one existing app. (evidence: implemented historically)
- [x] `rfc.validate RFC-0185` passes before implementation. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC is `accepted`.
- Agents MUST NOT hand-edit generated `apps/*/public/**` files to remove markers.
- Agents MUST implement cleanup in shared packages and pipeline wiring, not in site-specific scripts.
- Agents MUST preserve the RFC-0081 overwrite/skip semantics for tracked generated files.
- Agents MUST place the strip step after every command that writes into `dist/client`, especially `dist.sitemap.images.generate`.
- Agents SHOULD add tests for plain text, hash comment, JS comment, CSS comment, HTML/XML comment, and XML-prolog cases.
