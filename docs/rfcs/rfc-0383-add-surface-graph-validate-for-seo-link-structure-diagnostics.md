---
id: RFC-0383
title: "Add surface.graph.validate for SEO link-structure diagnostics"
status: draft
kind: command
scope: app
owners:
  - architecture
reviewers: []
createdAt: 2026-07-13
updatedAt: 2026-07-13
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0275
  - RFC-0384
  - RFC-0274
  - RFC-0192
  - DNA-39
satisfies: []
commands:
  proposed:
    - surface.graph.validate
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/surface"
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "Orphan indexable pages in the generated surface are detected and reported before deployment."
  - "Internal-link distribution is visible as machine-readable diagnostics, not guessed from manual inspection."
  - "Crawl depth and link-budget violations are caught in build.check, not after Googlebot discovers them."
  - "The validator works on the existing monolithic surface artifact — no sharding or architecture change required."
nonGoals:
  - "Do not introduce sharded artifacts or registry-plus-shards layout (RFC-0275, superseded by RFC-0384)."
  - "Do not precompute adjacency indexes as a separate data structure — compute graph in-memory from the artifact."
  - "Do not modify surface.generate output format."
  - "Do not add runtime server rendering or SSR for PSEO pages."
---

# RFC-0383: Add surface.graph.validate for SEO link-structure diagnostics

## Context

RFC-0275 proposed a comprehensive scaling overhaul of the programmatic surface pipeline, including a `surface.graph.validate` command. RFC-0275 is superseded by RFC-0384 — most of its scaling proposals are premature for the current product stage (bounded managed coverage, not six-figure route counts). However, the graph-validation command has independent SEO value at any scale and is extracted here as a standalone command.

The generated surface artifact (`surface.generated.yaml`) contains `VirtualRouteEntry[]` with page IDs, routes, depth, indexable/noindex status, and redirect targets. Internal links are baked into page blocks during `expandBlueprint`. Today there is no automated check for:

- **Orphan indexable pages** — pages that Googlebot can reach (indexable, not noindex) but that no internal link points to. These pages exist in the sitemap but receive no PageRank flow from the site, making indexation unlikely and slow.
- **Inbound link distribution** — a small number of pages receiving most internal links while many receive none. This signals poor information architecture to search engines.
- **Excessive crawl depth** — pages reachable only through long chains of clicks from the root. Googlebot deprioritizes deep pages.
- **Link budget violations** — pages with too many outbound links diluting PageRank, or too few outbound links creating dead ends.

These are SEO quality issues, not scale issues. They harm a surface of 50 pages as much as a surface of 5,000.

## Problem

`surface.validate` (`@/packages/os/site-kernel-checks/src/surface/validate.ts`) checks structural integrity: duplicate page IDs, slug collisions with authored pages, redirect-stub targets, localized slug conflicts, phantom levels, and missing narratives. It does **not** check the internal-link graph.

The internal-link graph is currently implicit — baked into page blocks as `<a>` tags during `bakePage` — and never extracted or validated as a whole. An agent or operator has no way to answer "which indexable pages have zero inbound links?" without manually inspecting every generated page.

## Decision

The kernel gains a `surface.graph.validate` command that reads the existing `surface.generated.yaml` artifact, extracts the internal-link graph from baked page blocks, and reports SEO link-structure diagnostics.

## Architectural fit

- **DNA-39** (route registry as merge of route sources): the command reads the same `surface.generated.yaml` that `surface.validate` reads. No new artifact format.
- **RFC-0192** (route-source port): the artifact is the single route-source entrypoint; `surface.graph.validate` is a read-only consumer.
- **RFC-0274** (evidence gates): `surface.graph.validate` complements evidence gates by checking the _link structure_ rather than page-level evidence. A page can pass evidence gates and still be an orphan.
- **RFC-0275** (superseded by RFC-0384): this command was originally AC-8 of RFC-0275. It is extracted here because it has independent value and does not depend on sharding, adjacency indexes, or any other RFC-0275 infrastructure.

## Design

### CLI surface

```sh
pnpm exec site-kernel run surface.graph.validate --app warpgogol-com --json
pnpm exec site-kernel run surface.graph.validate --app warpgogol-com
```

App-scoped: run for a single app. The command reads `src/surface.generated.yaml` (the same artifact `surface.validate` reads). If no artifact exists, it passes with a skip message (same behavior as `surface.validate`).

### TypeScript contracts

```ts
interface GraphDiagnostic {
  ruleId: string;
  severity: "error" | "warning";
  pageId: string;
  message: string;
  fixHint: string;
  data?: Record<string, unknown>;
}

interface SurfaceGraphReport {
  command: "surface.graph.validate";
  status: "pass" | "fail";
  pageCount: number;
  indexableCount: number;
  diagnostics: GraphDiagnostic[];
  summary: {
    orphans: number;
    avgInboundLinks: number;
    maxCrawlDepth: number;
    pagesOverLinkBudget: number;
  };
}
```

### Link extraction

The command extracts internal links from baked page blocks. A link is internal when its `href` resolves to a route within the same surface (not external, not `mailto:`, not `tel:`). Links are resolved to `pageId` by matching the href against the route entries' slug maps.

The extraction reuses the existing block structure: `entry.page.blocks[]` may contain link arrays in CTA blocks, list blocks, and rich-text blocks. The extractor walks blocks looking for `href` fields or `link` objects that resolve to surface routes.

### Diagnostic rules

| Rule ID | Severity | Condition |
| --- | --- | --- |
| `GRAPH-01` | error | Indexable page with zero inbound internal links (orphan) |
| `GRAPH-02` | warning | Indexable page with inbound link count below 10th percentile of the surface |
| `GRAPH-03` | warning | Indexable page at crawl depth > 4 from the root (d0) page |
| `GRAPH-04` | warning | Page with outbound internal link count > 100 (link-budget dilution) |
| `GRAPH-05` | warning | Indexable page with zero outbound internal links (dead end) |
| `GRAPH-06` | warning | d4/d5 cluster page with no sibling links (isolated cluster) |
| `GRAPH-07` | warning | Lazy page whose links cannot be validated (lazy entries have empty blocks) |

### File system responsibilities

| Path | Role |
| --- | --- |
| `src/surface.generated.yaml` | Read-only input (the generated surface artifact) |
| `packages/os/site-kernel-checks/src/surface/graph-validate.ts` | New command handler |
| `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts` | Command registration (existing surface commands table) |

### Output format

```json
{
  "command": "surface.graph.validate",
  "status": "fail",
  "pageCount": 142,
  "indexableCount": 87,
  "diagnostics": [
    {
      "ruleId": "GRAPH-01",
      "severity": "error",
      "pageId": "website-local:elektriker:freiburg:elektroinstallation",
      "message": "indexable page has zero inbound internal links (orphan)",
      "fixHint": "Add a link from the parent hub page or a sibling page to this page."
    }
  ],
  "summary": {
    "orphans": 3,
    "avgInboundLinks": 4.2,
    "maxCrawlDepth": 5,
    "pagesOverLinkBudget": 0
  }
}
```

### Failure modes

- No surface artifact: pass with skip message (same as `surface.validate`).
- Artifact is not valid YAML/JSON: fail with parse error.
- GRAPH-01 (orphan) is an error; all other rules are warnings.
- `--json` output is machine-readable; pretty output is human-readable with grouped diagnostics by rule.

## Rollout

1. **Default behavior on introduction**: warnings only — GRAPH-01 through GRAPH-07 all report as warnings. This avoids breaking existing apps on first introduction.
2. **Promotion to error**: after one release cycle, GRAPH-01 (orphan) is promoted to error. Apps with orphans must fix them or explicitly suppress via a per-page `graph.suppress` marker in the surface record.
3. **Pipeline integration**: added to `SITES_BUILD_CHECK_PIPELINE` after `surface.validate`. Runs only when `surface.generated.yaml` exists.
4. **New apps**: automatically compliant from day one — the validator runs as part of `build.check`.

## Alternatives considered

- **Precompute adjacency indexes during generation (RFC-0275 AC-5).** Rejected: the current surface has dozens to low-hundreds of entries. In-memory graph computation from the artifact is milliseconds. Adjacency indexes are a premature optimization for 10K+ page surfaces.
- **Add graph checks to `surface.validate`.** Rejected: `surface.validate` already has a broad scope (structural integrity, slug collisions, redirects, narratives). Graph diagnostics are a distinct concern with different rule semantics. A separate command keeps each validator focused and allows independent pipeline gating.
- **Use a third-party SEO crawler.** Rejected: external crawlers run after deployment, not in CI. They cannot inspect the generated surface before Astro SSG. They also cannot map links to `pageId` — they see URLs, not the surface model.

## Risks

- **False positives for lazy pages.** Lazy entries have empty blocks (blocks are stripped for lazy baking). GRAPH-07 warns but does not error. The fix is to validate lazy pages after they are materialized, which is out of scope for this RFC.
- **Link extraction misses non-standard link formats.** The extractor looks for `href` fields and `link` objects in blocks. If a section component renders links from non-standard props, those links may not be detected. Mitigation: the extractor is extensible — new block types can be added without changing the command interface.
- **Crawl depth calculation assumes a tree.** The surface is a tree (d0 → d1 → d2 → … → d5), so depth is well-defined. Cross-links (e.g. d5 → d3) do not reduce crawl depth — Googlebot still needs to reach the page through the shortest click path from the root.

## Acceptance criteria

- [ ] `surface.graph.validate` command registered in `@warpgogol/site-kernel-checks` with correct name and scope.
- [ ] Command reads `surface.generated.yaml` and extracts internal links from baked page blocks.
- [ ] GRAPH-01 (orphan) reports indexable pages with zero inbound internal links.
- [ ] GRAPH-02 through GRAPH-07 report inbound distribution, crawl depth, link budget, dead ends, cluster isolation, and lazy-page limitations.
- [ ] `--json` output format matches `SurfaceGraphReport` contract.
- [ ] Command integrated into `SITES_BUILD_CHECK_PIPELINE` after `surface.validate`.
- [ ] Existing apps pass without changes (warnings-only mode on first introduction).
- [ ] `rfc.validate` passes on this file before merging.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The link extractor MUST be pure — it reads the artifact and returns diagnostics. It must not modify the artifact or write any files.
- The command MUST NOT depend on sharding, adjacency indexes, or any RFC-0275 infrastructure. It works on the existing monolithic artifact.
