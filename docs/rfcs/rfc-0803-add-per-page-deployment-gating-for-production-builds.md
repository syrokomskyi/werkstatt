---
id: RFC-0803
title: "Add per-page deployment gating for production builds"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-11
updatedAt: 2026-08-11
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-9
  - DNA-13
  - RFC-0047
  - RFC-0802
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-9
  - DNA-13
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed:
    - deployment.gate.validate
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/werkstatt-site"
liveSpec: true
successSignals:
  - "Gated pages are excluded from production builds (no HTML output, no sitemap entry, no navigation link)"
  - "Gated pages are visible in astro dev (local development)"
  - "deployment.gate.validate catches references to gated pages from non-gated pages"
nonGoals:
  - Does not add per-block gating (only per-page)
  - Does not add multi-environment gating (only production vs. dev)
  - Does not automatically add retiredRoutes entries for gated pages
  - Does not gate package code, archetypes, or mission workpiece content
  - Does not add runtime feature flags — gating is build-time only
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

# RFC-0803: Add per-page deployment gating for production builds

## Context

The Werkstatt pipeline builds and deploys all pages declared in `system.md` to production. There is no mechanism to develop a page in a mission workpiece, commit it, and merge it into the cache clone — while excluding it from the production deployment.

RFC-0802 added a `/reife` (maturity mountain) page to warpgogol-com. The page is fully implemented, typechecked, and committed in mission `warpgogol-com-m000049`. But the operator does not want it live on the production site yet — the Cloudflare Worker endpoint is not ready, and the mountain illustration may need revision. Currently, when the mission closes and the cache clone is pushed, the `/reife` page will be built and deployed. Navigation entries (footer) will link to it. The sitemap will include it. There is no way to say "this page exists in the codebase but should not appear in production."

## Problem

DNA-13 ("Disabled content must not leak") states that "when a page or block is hidden, all references to it from navigation, breadcrumbs, and JSON-LD are also removed or updated." But there is no build-time mechanism to hide a page from production while keeping it in the codebase. The only options today are:

1. **Deploy everything** — unfinished or experimental features go live, potentially confusing visitors or breaking the site.
2. **Don't commit** — uncommitted work is lost on mission close, and the workpiece stays dirty.

This creates a gap: the operator needs a third option (commit the work, but gate it from production), but the pipeline does not support it. DNA-13 is not violated because gated pages are not "disabled" in the current model — they simply do not exist as a concept. This RFC introduces the concept and enforces DNA-13 for it.

## Decision

The `system.md` page entry schema gains a `deployment.production` boolean field (default `true`). When set to `false`, the page is excluded from production builds: no static HTML is generated, no sitemap entry, no navigation links, no `llms.txt` entry. The page remains visible in `astro dev` (local development). A new `deployment.gate.validate` command enforces that non-gated pages do not reference gated pages.

## Architectural fit

- **DNA-9 (Page block/shell visibility model)** — This RFC extends the visibility model from "which blocks appear on a page" to "which pages appear in a build." Gating is a new dimension of the same content-declarative visibility principle: no route-local `if` guards, no feature flags — just a `system.md` field.
- **DNA-13 (Disabled content must not leak)** — This RFC makes "disabled" a first-class concept for pages. `deployment.gate.validate` enforces that non-gated pages do not reference gated pages, closing the leak vector (navigation links, breadcrumbs, JSON-LD, sitemap).
- **RFC-0047 (Block-declarative pages)** — Gating is declared in `system.md`, not in page `.md` files or component code. It is a page-level property, not a block-level property. This aligns with the `system.md pages[]` schema as the single source of truth for page metadata.
- **Site OS operator model** — `deployment.gate.validate` is a check command registered in `packages/werkstatt-site/src/checks/`. It runs in the `build.check` pipeline. No new module is needed — it lives alongside existing page-level validators like `page.block.validate`.

## Design

### CLI surface

```sh
# Validate that non-gated pages do not reference gated pages
pnpm exec werkstatt run deployment.gate.validate --site warpgogol-com

# JSON output for CI integration
pnpm exec werkstatt run deployment.gate.validate --site warpgogol-com --json
```

Flags: `--site` (required, selects the site workspace), `--json` (optional, machine-readable output).

### TypeScript contracts

```ts
// packages/werkstatt-site/src/domain/ontology/schemas/page-entry.ts

/** Deployment gating configuration for a page entry. */
export interface DeploymentGate {
  /** When false, the page is excluded from production builds. Default: true. */
  production: boolean;
}

// Extended PageEntrySchema includes optional deployment field:
// deployment: z.object({ production: z.boolean().default(true) }).optional()
```

```ts
// packages/werkstatt-site/src/domain/share/page.ts

/** Set of pageIds excluded from production builds. Empty when all pages are deployed. */
export type GatedPageIds = Set<string>;

/** Reads system.md pages[] and returns pageIds where deployment.production === false. */
export function collectGatedPageIds(pages: PageEntry[]): GatedPageIds;
```

```ts
// packages/werkstatt-site/src/checks/deployment-gate.ts

export interface DeploymentGateViolation {
  rule: "GATE-01" | "GATE-02";
  sourcePageId: string;
  gatedPageId: string;
  referenceType: "navigation" | "block-cta" | "prose-link";
  message: string;
}

export function runDeploymentGateValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<DeploymentGateViolation[]>>;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/domain/ontology/schemas/page-entry.ts` | Extended with `deployment` field in `PageEntrySchema` |
| `packages/werkstatt-site/src/domain/share/page.ts` | `collectGatedPageIds()` function added |
| `packages/werkstatt-site/src/checks/deployment-gate.ts` | New validator: `deployment.gate.validate` |
| `packages/werkstatt-site/src/checks/command-tables/04-content-quality.ts` | Register `deployment.gate.validate` in command table |
| `packages/werkstatt-site/src/codegen/` | Sitemap, llms.txt generators skip gated pages in production |
| `packages/werkstatt-site/src/domain/ui/` | Navigation rendering filters out gated page targets in production |
| `src/content/system.md` (per-site) | Operator adds `deployment.production: false` to gated pages |

### Output format

```json
{
  "command": "deployment.gate.validate",
  "status": "fail",
  "violations": [
    {
      "rule": "GATE-01",
      "sourcePageId": "home",
      "gatedPageId": "reife",
      "referenceType": "navigation",
      "message": "Non-gated page 'home' references gated page 'reife' in navigation.md (target id: reife)"
    }
  ]
}
```

When no violations are found:

```json
{
  "command": "deployment.gate.validate",
  "status": "pass",
  "violations": []
}
```

**Rule codes:**

- `GATE-01` — Non-gated page references a gated page in navigation (`navigation.md` targets, `labels.md` `navIds`/`legalIds`/`transparencyIds`).
- `GATE-02` — Non-gated page references a gated page in block props (e.g. `section-cta` with `kind: internal` targeting a gated `pageId`).

### Failure modes

- **GATE-01 / GATE-02 violations** — the command exits non-zero (`exitCode: 1`). In `--json` mode, violations are returned in the `violations` array. In pretty mode, violations are printed to stderr with file paths and line numbers.
- **No gated pages** — the command passes trivially (no `deployment.production: false` entries in `system.md`). No overhead for sites that do not use gating.
- **Missing `system.md`** — the command fails with a standard `KERNEL-CONTEXT-01` error (same as other site-level validators).
- **Gated page references another gated page** — this is allowed. Gated pages can link to each other; they are all excluded from production together. Only non-gated → gated references are violations.

## Rollout

- **Default behavior** — `deployment.production` defaults to `true`. All existing pages deploy to production without changes. The `deployment` field is optional in the schema.
- **Existing apps** — no migration needed. Apps without `deployment.production: false` entries behave exactly as before. The validator passes trivially when no gated pages exist.
- **New apps** — automatically compliant. The schema accepts the `deployment` field from day one, but it is not required.
- **Pipeline integration** — `deployment.gate.validate` is registered in the `build.check` pipeline. It runs alongside `page.block.validate` and other content validators. No separate invocation needed.
- **Build-time filtering** — `collectGatedPageIds()` is called during `build.prepare` and the resulting `Set<string>` is passed to route generation, navigation rendering, sitemap generation, and `llms.txt` generation. In `astro dev` mode (`import.meta.env.PROD === false`), the set is empty — all pages are visible.
- **Adoption for RFC-0802** — after this RFC is implemented, add `deployment.production: false` to the `reife` page entry in `system.md` (mission `warpgogol-com-m000049`). This gates the page from production while keeping it in the codebase.

## Alternatives considered

1. **Git branch-based gating** — keep gated features on a separate branch, merge to main only when ready for production. Rejected: the Werkstatt workflow is mission-based, not branch-based. Missions commit to the cache clone's main branch. Branch-based gating would conflict with the mission lifecycle.

2. **Feature flags in environment variables** — use `import.meta.env.PUBLIC_FEATURE_REIFE` to conditionally render content. Rejected: requires code changes in components and pages. Not content-declarative. Does not prevent route generation or sitemap inclusion. Violates DNA-9 (no route-local `if` guards).

3. **Separate content directory** — put gated pages in `src/content/pages-gated/` excluded from production builds. Rejected: changes the content architecture. Requires moving files when ungateing. Does not handle navigation filtering automatically.

4. **Per-block gating** — gate individual blocks within a page rather than whole pages. Rejected for now: adds complexity with minimal benefit. The current use case (RFC-0802) requires whole-page gating. Per-block can be added as a follow-up RFC if needed.

## Risks

1. **Stale gate** — an operator forgets to remove `deployment.production: false` when the page is ready for production. The page stays hidden indefinitely. Mitigation: the validator reports gated pages as informational notices (not warnings) so they are visible in build output. Operators can grep `system.md` for `production: false` to audit gates.

2. **SEO impact for previously-live pages** — if a page was live and then gated, search engines will see a 404 on the next crawl. Mitigation: operators should add a `retiredRoutes` entry when gateing a previously-live page. This is a manual step, not automated (per the orthogonal relationship between gating and `retiredRoutes`).

3. **Agent misinterpretation** — agents may confuse deployment gating with feature flags (DNA-9 violation) or with `retiredRoutes`. Mitigation: the `nonGoals` section explicitly states "Does not add runtime feature flags" and "Does not automatically add retiredRoutes entries." The implementation notes reinforce that gating is build-time only.

4. **False positives in reference safety** — `deployment.gate.validate` may flag references that are intentional (e.g. a "coming soon" link). Mitigation: GATE-01 and GATE-02 are errors, not warnings. If an operator intentionally wants a non-gated page to link to a gated page, they must ungate the target page. There is no "intentional leak" escape hatch — it defeats the purpose of gating.

5. **Build pipeline complexity** — adding `collectGatedPageIds()` to multiple build stages (route generation, navigation, sitemap, llms.txt) increases coupling. Mitigation: the function is a single utility in `page.ts` with one responsibility. All consumers receive the same `Set<string>`. No conditional logic is added to individual generators — they simply skip entries in the set.

## Acceptance criteria

- [ ] `deployment` field added to `PageEntrySchema` in `packages/werkstatt-site/src/domain/ontology/schemas/page-entry.ts` with `production: z.boolean().default(true)`
- [ ] `collectGatedPageIds()` function added to `packages/werkstatt-site/src/domain/share/page.ts`
- [ ] `deployment.gate.validate` command registered in `packages/werkstatt-site/src/checks/` and command table
- [ ] GATE-01 rule detects non-gated pages referencing gated pages in navigation (`navigation.md`, `labels.md`)
- [ ] GATE-02 rule detects non-gated pages referencing gated pages in block props (`section-cta` with `kind: internal`)
- [ ] Production build (`astro build`) excludes gated pages from static HTML output, sitemap, navigation, and `llms.txt`
- [ ] Dev mode (`astro dev`) includes gated pages — all pages visible locally
- [ ] `deployment.gate.validate` integrated into `build.check` pipeline
- [ ] Existing apps pass without changes (no `deployment` field → defaults to `production: true`)
- [ ] `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST use `ecosystem.commit` (not `git commit`) for platform-scope changes in `packages/werkstatt-site/**` — the pre-commit hook blocks direct `git commit` for `packages/**`.
- Agents MUST use `mission.git.commit` for site-scope changes in mission workpieces (e.g. adding `deployment.production: false` to `system.md`).
- Agents MUST NOT add runtime feature flags or route-local `if` guards — gating is build-time only, declared in `system.md`.
- Agents MUST NOT automatically add `retiredRoutes` entries when gateing a page — gating and `retiredRoutes` are orthogonal concepts.
- Agents MUST NOT gate individual blocks within a page — this RFC covers per-page gating only.
- Agents MUST NOT add a "coming soon" link from a non-gated page to a gated page — GATE-01/GATE-02 are hard errors with no escape hatch.
- Agents MUST ensure `collectGatedPageIds()` returns an empty set when `import.meta.env.PROD` is false (dev mode) — all pages are visible in dev.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0803 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
