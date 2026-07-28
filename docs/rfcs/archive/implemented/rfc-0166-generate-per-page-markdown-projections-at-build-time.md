---
id: RFC-0166
title: "Generate per-page Markdown projections at build time"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-06
updatedAt: 2026-06-06
implementedAt: 2026-06-06
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0208
  - RFC-0306
  - RFC-0320
  - RFC-0372
  - RFC-0377
related:
  - RFC-0141
  - RFC-0142
  - RFC-0143
  - RFC-0049
  - RFC-0159
commands:
  proposed:
    - page.markdown.generate
    - page.markdown.validate
  added:
    - page.markdown.generate
    - page.markdown.validate
  changed:
    - apps-check.run
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/share
  - packages/content-source
  - packages/os/site-kernel-content
  - packages/os/site-kernel-checks
successSignals:
  - "Every indexable page has a same-path .md twin (e.g. /agb/index.md) generated at build time and advertised via rel=alternate type=text/markdown."
  - "No request-time worker fetches the site to convert HTML to Markdown; there is no same-origin recursion and no turndown in the request path."
  - "A future CMS adapter that returns rich-text HTML bridges to Markdown through the content-source richText capability, not through a separate route."
nonGoals:
  - "Do not build a runtime HTML-to-Markdown API route — the prior-project approach is explicitly superseded by build-time projection."
  - "Do not change llms.txt/llms-full.txt generation (RFC-0142/0143 own those)."
---

# RFC-0166: Generate per-page Markdown projections at build time

## Context

LLM browse/citation tools reward a cheap, clean, per-page Markdown document. The site already ships a site-wide `llms.txt`/`llms-full.txt` (RFC-0142/0143) but has no **per-page** Markdown twin that an agent can fetch for a single URL.

A prior project (`warpgogol-4-apps-todo/main`) implemented this at runtime and recorded the lessons: a Cloudflare worker route ([`[...mdroute].md.ts`](../../../warpgogol-4-apps-todo/main/src/pages/%5B...mdroute%5D.md.ts)) fetched the rendered HTML and converted it with `turndown`+`cheerio` ([`simple-html-to-markdown.ts`](../../../warpgogol-4-apps-todo/main/src/utils/simple-html-to-markdown.ts)). The hard-won problems were: (1) a same-origin worker that `fetch`es itself **recurses** unless routed through a `SELF`/`ASSETS` service binding ("CRITICAL: same-domain markdown export requires SELF or ASSETS binding"); (2) fragile URL-variant guessing (trailing slash, `index.html`, `.md` stripping); (3) request-time timeouts and a 2MB fallback path; (4) heavy `turndown`/`cheerio` in the request path; (5) lossy HTML→Markdown when the source was already structured.

This ecosystem is build-time SSG with a Content Source Provider port (RFC-0141) whose fs adapter is **already Markdown-native**. That changes the right answer entirely.

## Problem

- There is no per-page Markdown endpoint for agents.
- Porting the runtime approach would reintroduce every shishka above (recursion, bindings, timeouts, heavy request-path deps) for zero benefit, since the content is Markdown at the source.
- HTML→Markdown is only genuinely needed when a source returns rich-text **HTML** (a future CMS), which is exactly the `richText` capability already declared on `ContentSourceProvider`.

## Decision

A build-time generator `page.markdown.generate` emits a same-path Markdown twin for every indexable page (e.g. `dist/agb/index.md`) projected from the resolved page/semantic model — Markdown-native, with **no** request-time worker, **no** URL guessing, and **no** `turndown` in the request path. The document head gains `<link rel="alternate" type="text/markdown" href="…/index.md">`. HTML→Markdown conversion is relocated to the content-source `richText` bridge: a CMS adapter that returns HTML converts to Markdown **inside the adapter** (reusing a hardened `turndown` port), so sections, routes, and this generator never see HTML. A validator `page.markdown.validate` enforces twin presence and the `rel=alternate` link.

## Architectural fit

- **RFC-0141 Content Source Provider:** `richText` is the named seam for HTML→Markdown. The fs adapter (Markdown-native) does no conversion; a CMS adapter does. This generator consumes already-Markdown content.
- **RFC-0142/0143:** the per-page Markdown reuses the same `SemanticPageModel`/`output` projection that drives `llms-full.txt`; the per-page `llms` depth (`exclude`/`index-only`) also governs whether a `.md` twin is emitted.
- **RFC-0049 build-output invariant:** the generator writes into the project tree / Astro emits to `dist`; nothing writes to `dist` directly and nothing validates against a running server.

## Design

### CLI surface

```sh
pnpm exec site-kernel run page.markdown.generate --app nicaragua-projekt
pnpm exec site-kernel run page.markdown.validate --all --json
```

### TypeScript contracts

```ts
// Pure projector in @gogol/share — model in, Markdown out. No DOM, no fetch.
export function buildPageMarkdown(page: SemanticPageModel): string;
// Composes: "# {heading}", lead, answerBlocks (### heading + summary + facts),
// people/initiatives sections, and a source-URL + signature footer.

// Content-source richText bridge (CMS adapters only):
interface ContentSourceProvider {
  // existing: capabilities.richText: boolean
  // when richText is true, body is already Markdown — converted by the adapter
  // via a hardened turndown port, NOT by consumers.
}
```

The projector reuses the prior project's normalization wins (single guaranteed H1, whitespace/soft-wrap normalization, source-URL prepend, footer signature) but **drops** everything tied to runtime HTML scraping (cheerio content-root selection, URL-variant probing, service-binding logic, size-threshold fallback).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/semantic/page-markdown.ts` | Pure `buildPageMarkdown` projector |
| `packages/content-source/src/adapters/**` | `richText` Markdown bridge for HTML sources (CMS) |
| `packages/os/site-kernel-content/**` | `page.markdown.generate` — iterate routes, write `<route>/index.md` |
| `apps/*/dist/**/index.md` | Emitted twins (via project-tree staging per RFC-0049) |
| `packages/ui/src/components/layout/layout-component.astro` | Emits `rel=alternate type=text/markdown` |
| `packages/os/site-kernel-checks/src/page-markdown.ts` | `page.markdown.validate` |

### Output format

```json
{
  "command": "page.markdown.validate",
  "status": "fail",
  "violations": [
    { "page": "/en/about", "rule": "missing-md-twin", "expected": "/en/about/index.md" },
    { "page": "/agb/", "rule": "missing-alternate-link" }
  ]
}
```

### Failure modes

`page.markdown.validate` fails when an indexable page (not `llms` depth `exclude`/`index-only`) lacks a `.md` twin or its `rel=alternate` link. It exits non-zero; `--json` lists violations. The generator never makes network calls, so there is no timeout or recursion failure mode.

## Rollout

- `page.markdown.generate` registers in `APPS_BUILD_PREPARE_PIPELINE` / the build-output staging path.
- Twins are emitted for `full`/`summary` llms depths; `index-only`/`exclude` pages get none (consistent with RFC-0142).
- The `turndown` port is added but only loaded by CMS adapters (RFC-0171); fs-only apps never bundle it.
- New apps inherit twins from the scaffold.

## Alternatives considered

- **Port the runtime worker route as-is:** rejected — reintroduces same-origin recursion, service-binding complexity, request-path `turndown`/`cheerio`, and timeouts, for content that is already Markdown.
- **Derive Markdown by scraping built HTML at build time:** rejected — lossy and pointless when the structured model exists; HTML scraping is reserved for the CMS `richText` case where HTML is the only input.
- **Single combined `llms-full.txt` only:** rejected — agents increasingly fetch the specific page URL; a per-URL twin maximizes citation precision.

## Risks

- **Twin/HTML drift:** both derive from the same `SemanticPageModel`, so they cannot diverge; `page.markdown.validate` covers presence.
- **Static `.md` content-type on Cloudflare:** ensure `.md` is served as `text/markdown`; set via `_headers` if needed.
- **Bundle creep:** the `turndown` port must be import-isolated to CMS adapters; an fs-only build must not pull it in (guard with a capability check / dynamic import).

## Acceptance criteria

- [x] `buildPageMarkdown` pure projector implemented in `@gogol/share` (evidence: packages/ directory, package exists)
- [x] `page.markdown.generate` emits same-path `.md` twins for eligible pages (evidence: implemented historically)
- [x] `rel=alternate type=text/markdown` emitted in the shared layout (evidence: implemented historically)
- [x] HTML→Markdown lives only in the content-source `richText` bridge (no request-path conversion) (evidence: implemented historically)
- [x] `page.markdown.validate` registered and in `apps-check.run` (evidence: implemented historically)
- [x] `.md` served as `text/markdown`; no runtime worker/recursion (evidence: implemented historically)
- [x] Both reference apps build green; twins present and valid (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- Do NOT create a runtime `/*.md` API route or any worker that fetches the same origin — that path is explicitly rejected here.
- `turndown`/`cheerio` may appear ONLY inside content-source `richText` adapters, never in sections, routes, or this generator.
- Reuse the prior project's Markdown normalization, but drop all runtime HTML-scraping machinery.
- Agents MUST NOT weaken `page.markdown.validate` without a superseding RFC.
