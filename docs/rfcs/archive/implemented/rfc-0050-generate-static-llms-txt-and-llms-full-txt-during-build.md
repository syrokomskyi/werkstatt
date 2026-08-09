---
id: RFC-0050
title: "Generate static llms.txt and llms-full.txt during build"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-15
updatedAt: 2026-07-06
implementedAt: 2026-05-15
closedAt:
supersedes: []
supersededBy:
amendedBy:
  - RFC-0184
  - RFC-0185
  - RFC-0328
related:
  - DNA-22
  - DNA-25
  - RFC-0047
  - RFC-0048
  - RFC-0049
commands:
  proposed:
    - llms.generate
    - llms.validate
  added:
    - llms.generate
    - llms.validate
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/site-kernel-content"
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
  - "@gogol/business"
successSignals:
  - "public/llms.txt and public/llms-full.txt exist before Astro build and are copied to dist/."
  - "llms.txt.ts and llms-full.txt.ts API routes are removed from src/pages/."
  - "llms.validate confirms both files are non-empty and contain expected structural markers."
  - "No runtime server request is required to serve llms.txt or llms-full.txt."
nonGoals:
  - "Do not turn llms.txt into a content-managed CMS artifact — it remains a machine-readable projection."
  - "Do not introduce server-side rendering or API middleware for text files."
  - "Do not duplicate semantic model construction logic between @gogol/business and @gogol/site-kernel-content."
---

# RFC-0050: Generate static llms.txt and llms-full.txt during build

## Context

`apps/nicaragua-projekt` currently serves `llms.txt` and `llms-full.txt` through two Astro API routes:

- `src/pages/llms.txt.ts`
- `src/pages/llms-full.txt.ts`

Both endpoints are `APIRoute` handlers that call `buildSiteSemanticModel` from `@gogol/business` on every incoming GET request. That function relies on `astro:content` (`getCollection`, `getEntry`) to assemble a `SemanticSiteModel`, which is then passed to `buildLlmsIndex` / `buildLlmsFull` from `@gogol/share/semantic`.

This design has three problems:

1. **Runtime overhead.** Every request to `/llms.txt` or `/llms-full.txt` triggers a full content-collection scan, page frontmatter parsing, prose body loading, FAQ resolution, and semantic model assembly — work that is identical on every request.
2. **No static artifact.** Astro `output: 'static'` does not emit API routes into the build output. The current `llms.txt.ts` and `llms-full.txt.ts` endpoints exist only in dev mode or with a running SSR server; they are absent from the deployed `dist/` and cannot be served by static hosting or a CDN edge node.
3. **Inconsistent with sitemap.** RFC-0049 introduced `sitemap.generate` as a site-kernel command that writes `public/sitemap*.xml` before the Astro build so the files are copied to `dist/` as plain static assets. The LLMS endpoints should follow the same pattern.

## Problem

The unprotected invariants are:

> `llms.txt` and `llms-full.txt` must be available as static files in the build output without requiring a running server.

> Their content must be derived from the same semantic model that powers JSON-LD and page metadata, but the derivation must happen at build time, not request time.

Current failure modes:

1. **Request-time content scan.** The API routes rebuild the semantic model on every GET. Under load this creates unnecessary CPU and I/O pressure.
2. **No pre-build validation.** Because the files are ephemeral, there is no CI gate that verifies they are well-formed before deployment.
3. **Hard dependency on Astro runtime.** `buildSiteSemanticModel` uses `astro:content`, which is only available inside Astro. A standalone site-kernel command cannot reuse it without either (a) duplicating the logic or (b) running an Astro server.

## Decision

The kernel gains two new commands, `llms.generate` and `llms.validate`, registered in `@gogol/site-kernel-checks`.

**`llms.generate`** reads the app's content layer directly from disk (pages, prose, site labels, business data) using framework-agnostic helpers from `@gogol/site-kernel-content`, builds a `SemanticSiteModel` for the app's default language, passes it to the existing `buildLlmsIndex` / `buildLlmsFull` pure functions in `@gogol/share`, and writes the resulting text to `public/llms.txt` and `public/llms-full.txt` during `build.prepare`. Astro then copies these files to `dist/` during the static build.

**`llms.validate`** reads the two files from `public/` and checks that they exist, are non-empty, and contain the expected structural markers (`# <organization.name>` for the index, `## Organization facts` for the full file).

**Dynamic API routes are removed.** `src/pages/llms.txt.ts` and `src/pages/llms-full.txt.ts` are deleted. The app no longer carries runtime endpoints for machine-readable text files.

**`@gogol/site-kernel-content` gains a semantic loader.** A new `loadSemanticSiteModel(contentDir, lang, siteUrl)` function is added to `@gogol/site-kernel-content`. It walks `src/content/pages/`, `src/content/prose/`, `src/content/site/`, and `src/content/business/` directly, parses frontmatter with the existing `parseMarkdownFrontmatter` utility, resolves language fallbacks to the default language, filters out pages marked `sitemapExclude: true`, and returns a `SemanticSiteModel` shape compatible with `@gogol/share/semantic`. This keeps the command free of `astro:content` and makes the semantic layer usable by any site-kernel command.

**`@gogol/business` becomes a thin Astro adapter.** Its `buildSiteSemanticModel` delegates to the new framework-agnostic loader from `@gogol/site-kernel-content` and then enriches the result with any Astro-specific runtime data (if needed in the future). Immediately after this RFC it is a re-export wrapper.

## Architectural fit

**RFC-0047 / CMS-friendly thin-app surface.** The command reads the same content folders (`pages/`, `prose/`, `site/`, `business/`) that RFC-0047 established. No new content schema is introduced.

**RFC-0048 / localized route registry.** The semantic model needs absolute page URLs. `loadSemanticSiteModel` resolves them from `system.md pages[].routes` using the same registry that `sitemap.generate` uses.

**RFC-0049 / sitemap generation pattern.** `llms.generate` follows the exact same prepare-step model: a site-kernel command writes into `public/` before Astro build, Astro copies to `dist/`, and a paired validation command guards correctness in CI.

**DNA-25 / thin delivery.** All heavy lifting (content parsing, semantic model construction, LLMS text formatting) lives in shared packages. The command file in `site-kernel-checks` is a thin delivery point: load model → call formatter → writeFile.

**DNA-22 / no server state.** After this RFC, `llms.txt` and `llms-full.txt` are pure static files. No runtime fetch, no server memory, no cookies.

**Package boundaries.** `@gogol/share` owns the pure `buildLlmsIndex` / `buildLlmsFull` formatters. `@gogol/site-kernel-content` owns the framework-agnostic content loader. `@gogol/site-kernel-checks` owns the commands. `apps/*` only delete the obsolete API routes.

## Design

### CLI surface

```sh
pnpm exec werkstatt run llms.generate --app nicaragua-projekt
pnpm exec werkstatt run llms.generate --all --json

pnpm exec werkstatt run llms.validate --app nicaragua-projekt
pnpm exec werkstatt run llms.validate --all --json
```

`llms.generate` is **app-scoped** because each app has its own content layer, default language, and site URL. It is registered with `mutatesState: true` because it writes files into `public/`.

`llms.validate` is also **app-scoped**.

Both support `--json` for agent-parseable output and `--dry-run` for `llms.generate` (prints byte counts and preview paths without writing files).

### TypeScript contracts

```ts
// packages/os/site-kernel-content/src/semantic-loader.ts

export interface SemanticLoaderOptions {
  contentDir: string;
  lang: string;
  siteUrl: string;
}

export async function loadSemanticSiteModel(
  options: SemanticLoaderOptions,
): Promise<SemanticSiteModel>;
```

```ts
// packages/os/site-kernel-checks/src/llms.ts

export async function runLlmsGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult>;

export async function runLlmsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult>;
```

`SemanticSiteModel` is the existing type from `@gogol/share/semantic/models`. The loader must produce a value that satisfies this interface so that `buildLlmsIndex` and `buildLlmsFull` accept it without modification.

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/<app>/src/pages/llms.txt.ts` | **Deleted** — obsolete dynamic API route |
| `apps/<app>/src/pages/llms-full.txt.ts` | **Deleted** — obsolete dynamic API route |
| `apps/<app>/public/llms.txt` | Generated by `llms.generate`; copied to `dist/` by Astro |
| `apps/<app>/public/llms-full.txt` | Generated by `llms.generate`; copied to `dist/` by Astro |
| `apps/<app>/src/content/system.md` | Read for route registry and default language |
| `apps/<app>/src/content/pages/{lang}/*.md` | Read for page frontmatter and markdown blocks |
| `apps/<app>/src/content/prose/{lang}/*.md` | Read for prose body text |
| `apps/<app>/src/content/site/{lang}/labels.md` | Read for site-level labels (home label, etc.) |
| `apps/<app>/src/content/business/{lang}/legal.md` | Read for organization profile data |
| `packages/os/site-kernel-content/src/semantic-loader.ts` | New module: framework-agnostic semantic model construction |
| `packages/os/site-kernel-checks/src/llms.ts` | Command implementations for `llms.generate` and `llms.validate` |
| `packages/os/site-kernel-checks/src/module.ts` | Registers both commands and adds `llms.generate` to `STANDARD_BUILD_PREPARE_PIPELINE` |

### Output format

`llms.generate --json`:

```json
{
  "command": "llms.generate",
  "status": "pass",
  "app": "nicaragua-projekt",
  "files": [
    "apps/nicaragua-projekt/public/llms.txt",
    "apps/nicaragua-projekt/public/llms-full.txt"
  ],
  "pageCount": 12,
  "llmsTxtBytes": 2847,
  "llmsFullTxtBytes": 15423
}
```

`llms.validate --json`:

```json
{
  "command": "llms.validate",
  "status": "pass",
  "app": "nicaragua-projekt",
  "checks": {
    "llms.txtExists": true,
    "llms.txtNonEmpty": true,
    "llms.txtHasOrganizationHeader": true,
    "llmsFull.txtExists": true,
    "llmsFull.txtNonEmpty": true,
    "llmsFull.txtHasOrganizationFacts": true
  }
}
```

Failure example:

```json
{
  "command": "llms.validate",
  "status": "fail",
  "app": "nicaragua-projekt",
  "violations": [
    {
      "rule": "missing-file",
      "severity": "error",
      "file": "public/llms.txt",
      "message": "llms.txt not found. Run llms.generate first."
    }
  ]
}
```

### Failure modes

`llms.generate`:

- **Missing `site:` in `astro.config.mjs`** → falls back to `https://example.com` and logs a warning. The warning is surfaced as a non-fatal notice in `--json` output.
- **Missing `system.md`** → exits non-zero with a clear message.
- **Empty pages list** → writes files with organization profile only; exits zero but warns.
- **I/O error during write** → exits non-zero.

`llms.validate`:

- **Missing file** → error, non-zero exit.
- **Empty file** → error, non-zero exit.
- **Missing `# <name>` header in `llms.txt`** → error (file is malformed).
- **Missing `## Organization facts` in `llms-full.txt`** → error.
- **Byte count below a sanity threshold** (e.g. < 100 bytes) → warning, does not fail.

Warnings do not cause non-zero exit. Errors do.

## Rollout

1. **Phase 1 — shared loader.** Implement `loadSemanticSiteModel` in `@gogol/site-kernel-content` and refactor `@gogol/business` into a thin Astro adapter that delegates to it.
2. **Phase 2 — commands.** Implement `llms.generate` and `llms.validate` in `@gogol/site-kernel-checks`.
3. **Phase 3 — pipeline integration.** Add `llms.generate` to `STANDARD_BUILD_PREPARE_PIPELINE` immediately after `sitemap.generate`.
4. **Phase 4 — app cleanup.** Delete `src/pages/llms.txt.ts` and `src/pages/llms-full.txt.ts` from `apps/nicaragua-projekt`.
5. **Phase 5 — validation gate.** Add `llms.validate` to `app.contract.full`.

For existing apps that still carry the dynamic API routes:

- No flag day. The `llms.generate` step is part of `STANDARD_BUILD_PREPARE_PIPELINE`. Apps that include the pipeline automatically gain static files.
- Apps that do not include the pipeline step continue to serve the dynamic routes until they adopt the new pipeline.
- Once an app deletes its API routes, `astro check` and `astro build` will still succeed because the static files in `public/` satisfy the same public URLs.

For new apps created via `onboarding.scaffold`:

- `llms.generate` is already present in the scaffolded `build.prepare` pipeline.
- No API routes for LLMS are scaffolded.

## Alternatives considered

**Keep dynamic API routes and add `prerender = true`.** Rejected. Astro would generate the files into `dist/` during build, but they would not exist in `public/` and could not be pre-validated by a site-kernel command. It also does not solve the problem of making the generation logic reusable across apps or runnable without Astro server context.

**Generate llms.txt via an Astro integration hook (`astro:build:done`).** Rejected. Integration hooks run _after_ the Astro build, making it impossible to validate the files before deployment. It also ties the generation to Astro internals instead of the site-kernel command model that RFC-0049 established.

**Duplicate semantic model construction inside `site-kernel-checks`.** Rejected. The parsing logic for pages, prose, site labels, and business data already exists in `@gogol/business`. Extracting it into `@gogol/site-kernel-content` as a framework-agnostic loader avoids duplication and keeps the command thin.

**Generate only `llms.txt` and drop `llms-full.txt`.** Rejected. Both formats serve different consumers: `llms.txt` is the compact index required by the `llms.txt` standard, while `llms-full.txt` provides the complete semantic content for deeper model context windows.

## Risks

**Content loader drift.** If `loadSemanticSiteModel` in `@gogol/site-kernel-content` diverges from the Astro-specific path in `@gogol/business`, the static files and the runtime JSON-LD could differ. Mitigation: `@gogol/business` becomes a thin adapter; all parsing logic lives in one place (`site-kernel-content`).

**Performance at scale.** Walking `src/content/` and parsing every `.md` file during `build.prepare` adds I/O. Mitigation: the same files are already read by Astro during the subsequent build; the overhead is comparable to `sitemap.generate`.

**Agent adds back API routes.** An agent might recreate `src/pages/llms.txt.ts` because it looks like the obvious Astro pattern. Mitigation: this RFC explicitly prohibits dynamic API routes for LLMS text files, and the prohibition is listed in `nonGoals` and `Implementation notes for agents`.

**Missing content collections.** If an app uses content collections that are not covered by the semantic loader (e.g. custom experimental collections), the loader might omit them silently. Mitigation: the loader reads exactly the collections that `buildSiteSemanticModel` currently reads (`pages`, `prose`, `site`, `business`). Any new collection requires an explicit loader update.

## Acceptance criteria

- [x] `loadSemanticSiteModel` exported from `@gogol/site-kernel-content` and produces a valid `SemanticSiteModel`. (evidence: packages/ directory, package exists)
- [x] `@gogol/business` `buildSiteSemanticModel` delegates to the new loader (or re-exports it). (evidence: packages/ directory, package exists)
- [x] `llms.generate` command writes `public/llms.txt` and `public/llms-full.txt` during `build.prepare`. (evidence: implemented historically)
- [x] Astro build copies both files to `dist/` without errors. (evidence: implemented historically)
- [x] `llms.validate` command checks existence, non-emptiness, and structural markers. (evidence: implemented historically)
- [x] `llms.generate` and `llms.validate` registered in `@gogol/site-kernel-checks` with correct scope (`app`) and `mutatesState: true` on `llms.generate`. (evidence: packages/ directory, package exists)
- [x] `llms.generate` added to `STANDARD_BUILD_PREPARE_PIPELINE`. (evidence: implemented historically)
- [x] `llms.validate` added to `app.contract.full`. (evidence: implemented historically)
- [x] `src/pages/llms.txt.ts` and `src/pages/llms-full.txt.ts` removed from `apps/nicaragua-projekt`. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `pnpm --filter nicaragua-projekt build` completes and produces `dist/llms.txt` + `dist/llms-full.txt`. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST NOT re-create `src/pages/llms.txt.ts` or `src/pages/llms-full.txt.ts` as dynamic API routes — these files are explicitly replaced by static generation.
- Agents MUST NOT duplicate semantic model construction logic in the command file; they MUST use the shared loader from `@gogol/site-kernel-content`.
- Agents MUST keep `llms.generate` thin: load model → call formatter → writeFile. No additional formatting or business logic in the command.
- Agents MUST add `llms.generate` to `STANDARD_BUILD_PREPARE_PIPELINE` in the same PR that implements the command.
- Agents MUST delete the obsolete API routes in the same PR that adds the command.
- When implementing, agents MUST reference `RFC-0050` in commit messages or PR descriptions.
- Agents MUST run `llms.validate --app <app>` after any change to content that affects semantic output.
