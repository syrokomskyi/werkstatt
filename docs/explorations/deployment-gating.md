# Exploration: Deployment Gating for Pages

**Date:** 2026-08-11 **Status:** Idea stage — awaiting operator feedback before RFC creation

## Problem Statement

The Werkstatt pipeline builds and deploys all pages declared in `system.md` to production. There is no mechanism to develop a feature (page, section, asset) in a mission workpiece, commit it, and merge it into the cache clone — while **excluding it from the production deployment**.

This creates a dilemma:

1. **Deploy everything** — unfinished or experimental features go live, potentially confusing visitors or breaking the site.
2. **Don't commit** — uncommitted work is lost on mission close, and the workpiece stays dirty.

The operator needs a third option: **commit the work, but gate it from production**.

## Concrete Example

RFC-0802 adds a `/reife` (maturity mountain) page to warpgogol-com. The page is fully implemented, typechecked, and committed in mission `warpgogol-com-m000049`. But the operator does not want it live on the production site yet — the Cloudflare Worker endpoint is not ready, and the mountain illustration may need revision.

Currently, when the mission closes and the cache clone is pushed, the `/reife` page will be built and deployed. Navigation entries (footer) will link to it. The sitemap will include it. There is no way to say "this page exists in the codebase but should not appear in production."

## Requirements

### Functional

1. **Per-page gating** — declare in `system.md` that a page is excluded from production builds.
2. **Navigation filtering** — navigation entries (header, footer, legal, transparency) referencing a gated page are automatically excluded from production builds. No manual removal needed.
3. **Sitemap exclusion** — gated pages are not in `sitemap.xml`.
4. **Route exclusion** — gated pages are not generated as static HTML files in production builds.
5. **Dev visibility** — gated pages ARE visible in `astro dev` (local development). The developer can access the page by URL.
6. **Reference safety** — non-gated pages must not link to gated pages. A validator catches this at build time.

### Non-functional

1. **No code changes required** — gating is declared in content (`system.md`), not in code.
2. **No mission workpiece changes** — the gating declaration lives in `system.md`, which is part of the workpiece. Closing the mission preserves the gate.
3. **Reversible** — removing the gate declaration is a one-line edit in `system.md`.
4. **Build-time only** — no runtime overhead. Gating is resolved at build time, not request time.

## Proposed Design

### 1. Schema extension in `system.md`

Add a `deployment` field to `pages[]` entries:

```yaml
  - pageId: reife
    semanticType: content
    deployment:
      production: false  # exclude from production builds (default: true)
    routes:
      de: reife
      uk: zrilist
    cosmicStar: Polaris
    planets:
      - cosmicPlanet: Prometheus
        pin: 1.0.0
```

**Default**: `deployment.production: true` — all existing pages deploy to production without changes.

### 2. Build pipeline integration

The build pipeline reads `deployment.production` and passes a `gatedPageIds: Set<string>` to:

- **Route generation** — skip gated pages when generating static HTML in production builds.
- **Navigation rendering** — filter out navigation targets whose `semanticTarget.pageId` is in `gatedPageIds`.
- **Sitemap generation** — exclude gated pages.
- **`llms.txt` generation** — exclude gated pages.
- **JSON-LD / breadcrumbs** — no breadcrumbs trail includes a gated page.

### 3. Environment detection

The build pipeline needs to know whether it's a production build or a dev build.

**Option A: `import.meta.env.PROD`** — Astro's built-in environment variable. `true` during `astro build`, `false` during `astro dev`.

**Option B: Explicit `--mode` flag** — `astro build --mode production` vs. `astro build --mode preview`. More control, but requires changing build commands.

**Recommendation**: Option A. It's already available, well-understood, and matches the use case.

### 4. Reference safety validator

A new check command `deployment.gate.validate` (or extension of `page.block.validate`) that:

1. Collects all `gatedPageIds` from `system.md`.
2. Scans all non-gated pages for references to gated pages:
   - Navigation targets (`navigation.md`)
   - `labels.md` `navIds` / `legalIds` / `transparencyIds`
   - Block props that reference `pageId` (e.g. `section-cta` with `kind: internal`)
   - Prose content with internal links
3. Reports violations as errors: "Non-gated page X references gated page Y."

This ensures gating is **leak-proof** — no link on the production site points to a page that doesn't exist.

### 5. What is NOT gated

- **Package code** — components, scripts, archetypes remain in `packages/werkstatt-site/**`. They are inert without a page that uses them.
- **Mission workpiece content** — the page `.md` file, assets, and `system.md` entry remain in the workpiece. They are just not built.
- **Archetype registry** — the archetype remains registered. No need to unregister it.

Gating is **page-level** and **build-time only**. It does not affect the codebase or the workpiece.

### 6. Interaction with mission lifecycle

- **`mission.open`** — no change. Gating is declared in `system.md` content.
- **`mission.materialize`** — no change. The workpiece includes the gated page.
- **`mission.git.commit`** — no change. The gated page is committed normally.
- **`mission.close`** — no change. The cache clone receives the gated page.
- **`build.prepare`** — reads `deployment.production: false` and collects `gatedPageIds`.
- **`build.check`** — runs `deployment.gate.validate` to catch reference leaks.
- **`build` (production)** — skips gated pages in route generation, navigation, sitemap.
- **`astro dev`** — includes gated pages (developer can preview them).

### 7. Interaction with Leitstand deploy

- **`leitstand.dev-deploy`** — deploys to the dev/preview environment. Gated pages ARE included (dev environment shows everything).
- **`leitstand.propagate`** — deploys to production. Gated pages are excluded.

This means the operator can preview the gated page on the dev environment before ungateing it for production.

## Open Questions

1. **Granularity** — should gating be per-page only, or also per-block? (e.g. "this section block is not rendered in production, but the page is.") **Recommendation**: per-page only for now. Per-block adds complexity with minimal benefit.

2. **Multiple environments** — currently we have "dev" and "production." Should the gate support arbitrary environments (e.g. `deployment.staging: false`)? **Recommendation**: start with `production` only. Extend later if needed.

3. **SEO impact** — gated pages are not in sitemap, not built, not linked. No 404 risk because no links point to them (validator ensures this). But if a gated page was previously live and then gated, search engines will see a 404. **Recommendation**: add a `retiredRoutes` entry in `system.md` when ungateing a previously-live page, or use a 410 tombstone.

4. **Interaction with `retiredRoutes`** — `retiredRoutes` already handles 301/410 for removed pages. Gating is different: the page still exists in the codebase but is not deployed. Should gating automatically add a `retiredRoutes` entry? **Recommendation**: no — gating is a build-time concept, `retiredRoutes` is a runtime concept. They are orthogonal.

5. **Audit trail** — should there be a log of when a page was gated/ungated? **Recommendation**: the git history of `system.md` is the audit trail. No additional mechanism needed.

## Affected Artifacts

| Artifact | Change |
| --- | --- |
| `packages/werkstatt-site/src/domain/ontology/schemas/page-entry.ts` | Add `deployment` field to schema |
| `packages/werkstatt-site/src/domain/share/page.ts` | Read `deployment.production` and build `gatedPageIds` |
| `packages/werkstatt-site/src/domain/ui/sections/` (navigation rendering) | Filter navigation targets by `gatedPageIds` |
| `packages/werkstatt-site/src/checks/` | New `deployment.gate.validate` check |
| `packages/werkstatt-site/src/codegen/` | Sitemap, llms.txt generators skip gated pages |
| `system.md` (per-site) | Add `deployment.production: false` to gated pages |

## Alternatives Considered

### A. Git branch-based gating

Keep gated features on a separate branch. Merge to main only when ready for production.

**Rejected**: The Werkstatt workflow is mission-based, not branch-based. Missions commit to the cache clone's main branch. Branch-based gating would conflict with the mission lifecycle.

### B. Feature flags in environment variables

Use `import.meta.env.PUBLIC_FEATURE_REIFE` to conditionally render content.

**Rejected**: Requires code changes in components and pages. Not content-declarable. Does not prevent route generation or sitemap inclusion.

### C. Separate content directory

Put gated pages in a separate `src/content/pages-gated/` directory that is excluded from production builds.

**Rejected**: Changes the content architecture. Requires moving files when ungateing. Does not handle navigation filtering.

## Recommendation

Proceed with the proposed design (schema extension in `system.md` + build-time filtering + reference safety validator). It is:

- **Minimal** — one new field in `system.md`, no code changes in components.
- **Content-declarable** — gating is declared in content, not in code.
- **Leak-proof** — validator catches reference leaks.
- **Reversible** — one-line edit to ungate.
- **Compatible** — default `production: true` means no changes needed for existing pages.

Next step: create an RFC formalising this design with acceptance criteria and implementation notes.
