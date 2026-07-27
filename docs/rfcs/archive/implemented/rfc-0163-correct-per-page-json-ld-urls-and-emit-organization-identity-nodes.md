---
id: RFC-0163
title: "Correct per-page JSON-LD URLs and emit organization identity nodes"
status: implemented
kind: contract
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
amendedBy: []
related:
  - RFC-0147
  - RFC-0148
  - RFC-0159
  - RFC-0162
commands:
  proposed:
    - jsonld.parity
    - jsonld.url.validate
  added:
    - jsonld.parity
    - jsonld.url.validate
  changed:
    - apps-check.run
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/share
  - packages/business
  - packages/os/site-kernel-checks
successSignals:
  - "Every page's WebPage node carries its own absolute url and a unique @id equal to canonical plus a webpage fragment."
  - "The Organization node emits sameAs, logo, and image so Google and LLMs can ground the entity."
  - "WebPage.url always equals the page canonical URL; a validator fails any divergence."
nonGoals:
  - "Do not add Article schema here — RFC-0167 owns Article/BlogPosting and dates."
  - "Do not change the dedupe-by-@id graph composition strategy in buildJsonLd."
---

# RFC-0163: Correct per-page JSON-LD URLs and emit organization identity nodes

## Context

JSON-LD is the strongest grounding signal both apps emit for Google rich results and for LLM entity resolution. A `dist` audit (2026-06-06) of `apps/nicaragua-projekt/.../agb/index.html` revealed two concrete defects.

1. **WebPage url/@id point at the site root on every page.** The rendered `/agb/` page emits `"@id":"https://nicaragua-projekt.org/#/schema/webpage"` and `"url":"https://nicaragua-projekt.org/"` — the homepage URL, not `/agb/`. Root cause: the route [`[...slug].astro`](../../apps/nicaragua-projekt/src/pages/%5Blang%5D/%5B...slug%5D.astro) passes `siteUrl: Astro.site` (the origin) into `buildSemanticModel`, and [`buildSemanticPageModelWith`](../../packages/share/src/semantic/build-page.ts) stores that origin verbatim as `page.url`. So `<link rel="canonical">` says `/agb/` while the JSON-LD `WebPage.url` says `/`.
2. **Organization node omits `sameAs`/`logo`/`image`.** `SemanticOrganization` already declares `sameAs?` ([`models.ts`](../../packages/share/src/semantic/models.ts)), but [`buildOrganizationNode`](../../packages/share/src/semantic/jsonld/organization.ts) never emits it, and there is no logo or image at all. The organization is "faceless" in the knowledge graph.

## Problem

- **Canonical/schema divergence** confuses Google Rich Results and weakens per-page entity identity; the shared `@id` collapses every page into one WebPage entity when graphs are aggregated.
- **No `sameAs`/`logo`/`image`** denies Google a knowledge-panel logo and denies LLMs the social/Wikidata links they use to disambiguate the entity — a core GEO miss.
- Nothing validates URL coherence, so a future refactor can silently reintroduce the divergence.

## Decision

The semantic pipeline is corrected so that `page.url` is the page's own absolute canonical URL and the WebPage `@id` is `${page.url}#webpage` (unique per page). `buildOrganizationNode` emits `sameAs[]`, `logo` (an `ImageObject`), and `image` from business data, and the WebPage node gains `primaryImageOfPage` plus an optional `speakable` (`SpeakableSpecification`) projected from the page's answer-block headings. Two workspace commands — `jsonld.url.validate` and `jsonld.parity` — enforce these invariants and join `apps-check.run`.

## Architectural fit

- **RFC-0147/0148 business projection:** `sameAs`/`logo` come from the projected business profile (`buildOrganizationProfile`), respecting the `BUSINESS_DOMAIN_VISIBILITY` privacy boundary.
- **RFC-0159 canonical:** `page.url` is derived from the same localized-path logic the canonical link already uses; a single helper produces both.
- **RFC-0162:** `primaryImageOfPage` reuses the `primaryImage` added to `SemanticPageModel` by RFC-0162.
- **GEO/voice:** `speakable` reuses existing `answerBlocks` (no new authoring surface) so AI Overviews and voice assistants can extract answers.

## Design

### CLI surface

```sh
pnpm exec site-kernel run jsonld.url.validate --all --json
pnpm exec site-kernel run jsonld.parity --app nicaragua-projekt
```

### TypeScript contracts

```ts
// page.url must be the page's own absolute URL, not the origin.
// route change: pass the resolved page URL into buildSemanticModel.
interface SemanticModelOptions {
  pageId: string;
  semanticType: string;
  lang: string;
  url: URL;        // now the PAGE url (origin + localized path), not Astro.site
}

// Organization node additions:
//   sameAs?: string[];
//   logo?: { "@type": "ImageObject"; url: string; width?: number; height?: number };
//   image?: string;

// WebPage node additions:
//   primaryImageOfPage?: { "@id": string };
//   speakable?: { "@type": "SpeakableSpecification"; cssSelector: string[] };
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/*/src/pages/[lang]/[...slug].astro` | Pass the page URL (not `Astro.site`) into `buildSemanticModel` |
| `packages/share/src/astro/page-handler.ts` | Compute and forward the page's absolute canonical URL |
| `packages/share/src/semantic/jsonld/organization.ts` | Emit `sameAs`, `logo`, `image` |
| `packages/share/src/semantic/jsonld/webpage.ts` | Unique `@id`, correct `url`, `primaryImageOfPage`, `speakable` |
| `packages/business/src/semantic-profile.ts` | Source `sameAs`/`logo` from business data |
| `packages/share/src/semantic/jsonld.ts` | `jsonld.url.validate` + `jsonld.parity` |

### Output format

```json
{
  "command": "jsonld.url.validate",
  "status": "fail",
  "violations": [
    { "page": "/agb/", "rule": "webpage-url-mismatch", "expected": "https://…/agb/", "got": "https://…/" }
  ]
}
```

### Failure modes

`jsonld.url.validate` fails when any `WebPage.url` != canonical or any `@id` is non-unique across the site. `jsonld.parity` fails when business data declares socials/logo but the Organization node omits `sameAs`/`logo` (parity gate, mirrors `semantic.parity`). Both exit non-zero; `--json` lists violations.

## Rollout

- The url fix is a pure correctness change — it ships fail-hard immediately; both reference apps are updated in the same change.
- `jsonld.parity` ships in `warn` mode until business data carries socials/logo for both apps, then flips to fail-hard.
- New apps inherit the corrected pipeline automatically.

## Alternatives considered

- **Keep root `@id`, only fix `url`:** rejected — non-unique `@id` still breaks cross-page entity graphs.
- **Hand-author `sameAs` per app in `system.md`:** rejected — duplicates business data; socials already belong in the business layer (RFC-0148).
- **Emit `speakable` from a new authoring field:** rejected — `answerBlocks` already encode the extractable answers.

## Risks

- **Absolute-URL helper correctness** across `x-default`/unprefixed default-language routing (RFC-0160); covered by `jsonld.url.validate` over every generated page.
- **Logo asset availability:** if a site has no logo, `logo` is omitted (not a hard fail) and `jsonld.parity` only fires when the business data claims one.
- **Privacy:** `sameAs` must never leak `external-services`/`compliance` business domains — reuse the existing visibility boundary.

## Acceptance criteria

- [x] Route + `page-handler` pass the page's own absolute URL into the semantic model (evidence: implemented historically)
- [x] `WebPage.url` == canonical and `@id` unique per page (verified in dist) (evidence: implemented historically)
- [x] Organization node emits `sameAs`, `logo`, `image` from business data (evidence: implemented historically)
- [x] `primaryImageOfPage` + `speakable` emitted where data exists (evidence: implemented historically)
- [x] `jsonld.url.validate` and `jsonld.parity` registered and in `apps-check.run` (evidence: implemented historically)
- [x] `--json` output documented and stable (evidence: implemented historically)
- [x] Both reference apps pass; privacy boundary respected (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- The url fix MUST be validated against built `dist` HTML, not only unit tests — the defect only manifested in the rendered output.
- Never source `sameAs`/`logo` outside the business projection; respect `BUSINESS_DOMAIN_VISIBILITY`.
- Do NOT add Article schema or dates here — that is RFC-0167.
- Agents MUST NOT weaken `jsonld.url.validate` or `jsonld.parity` without a superseding RFC.
