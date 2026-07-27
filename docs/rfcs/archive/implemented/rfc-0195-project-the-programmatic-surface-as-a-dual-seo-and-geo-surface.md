---
id: RFC-0195
title: "Project the Programmatic Surface as a dual SEO and GEO surface"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-15
updatedAt: 2026-07-05
implementedAt: 2026-06-16
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0324
related:
  - RFC-0143
  - RFC-0165
  - RFC-0166
  - RFC-0184
  - RFC-0192
  - RFC-0194
commands:
  proposed: []
  added: []
  changed:
    - surface.generate
    - llms.generate
  removed: []
appsImpacted:
  - apps/webgogol-com
packagesImpacted:
  - packages/surface
  - packages/share
successSignals:
  - "Every indexable generated page also exposes a clean Markdown twin and an llms.txt entry, so AI answer engines can ingest the long-tail corpus without scraping rendered HTML."
  - "The same dataset × axes that target Google long-tail produce a machine-readable corpus for generative engines, with no separate authoring."
  - "Suppressed (thin/noindex) pages are excluded from the GEO corpus exactly as they are from the sitemap."
nonGoals:
  - "Do not build a chat/RAG endpoint — this only emits static GEO artifacts."
  - "Do not change the SEO HTML rendering path; GEO twins are an additional projection."
  - "Do not include suppressed pages in any GEO output."
---

# RFC-0195: Project the Programmatic Surface as a dual SEO and GEO surface

## Context

Search is no longer only ten blue links. Generative engines (AI Overviews, ChatGPT search, Perplexity, Claude) increasingly answer the same long-tail intents the studio's programmatic pages target — but they consume _machine-readable_ content (clean Markdown, llms.txt) more reliably than rendered HTML. The ecosystem already invested in this seam: per-page output projection and llms depth (RFC-0143), per-page Markdown twins (RFC-0166), and the AI-readable Markdown contract (RFC-0184).

Because RFC-0192 makes every generated page a first-class registry entry that flows through the normal projection pipeline, the long-tail surface can feed generative engines essentially for free. Treating programmatic SEO as **also** programmatic GEO (Generative Engine Optimization) is the highest-leverage extension of the module.

## Problem

- The output projection, llms.txt, and Markdown-twin pipelines are wired for authored pages; they need to recognize and include generated registry entries.
- Without an explicit GEO projection, the long-tail's value is locked inside HTML that generative engines ingest unevenly.
- The thin-content gate (RFC-0194) must apply to the GEO corpus too — feeding generative engines a thin page is as harmful as indexing it.

## Decision

The Programmatic Surface is defined as a **dual surface**: every page the engine marks indexable emits both its SEO HTML (already true) and its **GEO artifacts** — a clean Markdown twin (RFC-0166/0184) and an entry in the site's llms.txt index (RFC-0143). `surface.generate` extends the projection to enumerate generated entries; the Blueprint declares a per-depth **GEO depth** (which levels contribute to llms.txt vs. only carry a twin). Pages suppressed by the substance gate (RFC-0194) are excluded from all GEO output, identically to their sitemap exclusion. No separate authoring exists: the GEO corpus is a projection of the same `dataset × axes`.

## Architectural fit

- **RFC-0192:** GEO twins are produced from the same resolved `PageEntry`; the registry already lists generated pages, so the llms.txt builder includes them by iterating the registry.
- **RFC-0143/0166/0184:** GEO output reuses the existing output-projection, Markdown-twin, and AI-readable-Markdown machinery; no parallel projector.
- **RFC-0194:** the substance gate's indexable/suppressed decision is the single switch for _both_ SEO indexing and GEO inclusion.
- **RFC-0165:** the `rel=alternate` Markdown link and llms.txt advertising follow the same head/feed conventions as authored pages.

## Design

### CLI surface

```sh
# unchanged command, extended to enumerate generated entries
pnpm exec site-kernel run surface.generate --app webgogol-com
```

### TypeScript contracts

```ts
// Blueprint (RFC-0193) gains a per-depth GEO depth declaration
export interface BlueprintLevel {
  // ...existing...
  geo?: "full" | "twin-only" | "off";   // full → llms.txt + twin; twin-only → rel=alternate only
}

// surface projection
export interface GeoArtifact {
  pageId: string;
  markdownPath: string;        // dist/<lang>/<slug>.md twin
  inLlmsIndex: boolean;        // contributes to llms.txt
}

export function projectSurfaceGeo(
  entries: VirtualRouteEntry[],
  lang: string,
): Promise<GeoArtifact[]>;     // excludes suppressed pages
```

### File system responsibilities

| Path                          | Role                                                      |
| ----------------------------- | --------------------------------------------------------- |
| `packages/surface/src/geo.ts` | Markdown-twin + llms.txt projection for generated entries |
| `dist/<lang>/<slug>.md`       | Per-page Markdown twin (RFC-0166/0184)                    |

### Output format

```json
{
  "command": "surface.generate",
  "geo": { "surface": "website-local", "twins": 712, "inLlmsIndex": 220, "excludedThin": 168 }
}
```

### Failure modes

GEO projection never fails the build on its own; it skips any page without a resolvable twin and logs a warning. A page that is `noindex`/suppressed for SEO is unconditionally excluded from GEO output — this invariant is enforced, not advisory, by reading the same indexable flag.

## Rollout

- Default `geo: "full"` for the deepest indexable level of each Blueprint, `twin-only` for pillar levels (avoid llms.txt bloat from broad pages).
- `website-local` ships GEO on at pilot.
- llms.txt size is bounded by the same substance gate and the GEO-depth declaration; the manifest surfaces the realized corpus size.

## Alternatives considered

- **HTML-only, rely on crawlers to parse rendered pages:** rejected — generative engines ingest Markdown/llms.txt far more reliably; HTML-only under-serves the surface.
- **A bespoke GEO export pipeline:** rejected — duplicates RFC-0143/0166/0184; the existing projection already does this for authored pages.
- **Include all generated pages in llms.txt:** rejected — would bloat the index with broad/thin pages; GEO depth + substance gate bound it.

## Risks

- **llms.txt bloat** from broad/pillar pages diluting the corpus. Mitigation: per-depth GEO depth (`twin-only` for pillars) plus the substance gate bound the index.
- **Twin/HTML drift** — the Markdown twin disagreeing with the rendered page. Mitigation: both project from the same resolved `PageEntry`; there is no second content source.
- **Generative engines may ignore llms.txt.** Accepted: the cost is near-zero and additive; the SEO HTML path is unaffected, so there is no downside to emitting it.
- **GEO corpus exposing suppressed pages** if the indexable flag is read inconsistently. Mitigation: a single shared indexable flag gates both SEO and GEO; enforced, not advisory.

## Acceptance criteria

- [x] `surface.generate` emits Markdown twins and `llms.generate` appends full-GEO surface pages to `llms.txt` (evidence: implemented historically)
- [x] Blueprint per-depth `geo` declaration (`full` / `twin-only` / `off`) honored (pillar is `twin-only` → twin emitted, excluded from llms.txt) (evidence: implemented historically)
- [x] Suppressed/`noindex`/redirect-stub pages excluded from all GEO output (via `includeInTwins`/`includeInLlms`) (evidence: implemented historically)
- [x] `rel=alternate` Markdown advertising on generated pages matches authored-page conventions — surface pages now build a real `SemanticPageModel` (synthetic `fallbackFrontmatter` from the baked page → OG + JSON-LD + the twin link) and set `output.llms.depth` from the entry's GEO (`full`→full, `twin-only`→summary, off/noindex→exclude). Verified: OG/Twitter/JSON-LD + `rel=alternate text/markdown` → `/website/.../index.md` present; `page.markdown.validate` green (evidence: implemented historically)
- [x] GEO corpus counts (`twins`, `inLlms`) recorded in `pseo-manifest.json` (evidence: implemented historically)
- [x] llms.txt size stays bounded by GEO depth + substance gate; verified on the pilot (6 of 7 pages in llms.txt; pillar twin-only) (evidence: implemented historically)
- [x] `AGENTS.md` documents the dual SEO/GEO nature of the surface (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## As-built notes (2026-06-17)

- Markdown twins are written to **`public/<route>/index.md`** (copied to `dist/` by Astro), matching the authored-page twin convention — not the `dist/<lang>/<slug>.md` path in the Design sketch. Twins are **per-language**.
- The **`rel=alternate` Markdown link IS emitted** on generated pages. This required giving surface pages a real `SemanticPageModel`: the baked page is passed through the `buildSemanticModel` callback as synthetic `fallbackFrontmatter`, so OG + JSON-LD + the twin link are emitted like any page. The page's `output.llms.depth` mirrors the entry's GEO setting (`full`→full, `twin-only`→summary, off/noindex→exclude).
- llms.txt rows + twins use the per-language baked page title/description.

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- GEO output MUST be a projection of the same resolved `PageEntry`; never author a parallel Markdown corpus.
- The substance/index decision (RFC-0194) is the single source of truth for GEO inclusion; never include a suppressed page.
- Do not add a request-time GEO/RAG endpoint here; artifacts are static and build-time.
- Agents MUST NOT bypass GEO-depth bounds to inflate llms.txt.
