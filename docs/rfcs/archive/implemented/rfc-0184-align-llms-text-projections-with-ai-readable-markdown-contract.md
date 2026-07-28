---
id: RFC-0184
title: "Align llms text projections with AI-readable Markdown contract"
status: implemented
kind: contract
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
  - RFC-0050
  - RFC-0142
amendedBy:
  - RFC-0316
  - RFC-0317
related:
  - RFC-0143
  - RFC-0166
  - RFC-0049
commands:
  proposed: []
  added: []
  changed:
    - llms.generate
    - llms.validate
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/share
  - packages/os/site-kernel-checks
successSignals:
  - "public/llms.txt uses canonical Markdown links with absolute URLs and a blockquoted site summary."
  - "public/llms.txt advertises public/llms-full.txt as the complete single-file projection."
  - "public/llms-full.txt contains no empty page bodies or repeated blank placeholder sections."
  - "llms.validate detects missing blockquotes, relative link targets, absent llms-full references, and malformed Markdown link rows."
nonGoals:
  - "Do not introduce a runtime HTML-to-Markdown route; RFC-0166 keeps per-page Markdown projections build-time only."
  - "Do not claim major LLM-provider support for llms.txt as a proven ranking signal."
  - "Do not replace sitemap.xml, robots.txt, structured data, or per-page Markdown twins."
---

# RFC-0184: Align llms text projections with AI-readable Markdown contract

## Context

The ecosystem already generates `public/llms.txt` and `public/llms-full.txt` through `llms.generate` in `packages/os/site-kernel-checks/src/llms.ts`, using the pure projectors in `packages/share/src/semantic/llms.ts`. Per-page inclusion depth is governed by RFC-0142 (`full`, `summary`, `index-only`, `exclude`), and RFC-0166 already provides build-time per-page Markdown twins for precise page-level retrieval.

The public llms.txt proposal remains an emerging convention rather than a proven search standard. The useful principle, however, is stable: AI retrieval benefits from a small, clean, curated Markdown entrypoint that points to authoritative sources without navigation chrome, cookie banners, client JavaScript, or marketing layout noise.

The current generated `llms.txt` is valuable but is not shaped like the widely used convention described by Answer.AI-style examples and implementations from documentation-heavy sites. It uses relative paths, dash-separated prose rows, repeated source lists, and no explicit pointer to `llms-full.txt`.

## Problem

The current site-wide llms projection has four avoidable weaknesses:

1. `llms.txt` links are not canonical Markdown links (`[Title](URL): description`). This makes the file less useful for parsers that expect link rows rather than prose containing paths.
2. URLs are relative (`/preis`, `/kontakt`). A fetched `llms.txt` copied out of origin context is less self-contained than one with absolute canonical URLs.
3. The site description is plain text instead of a blockquote. The common convention treats the `>` block directly below `# Site Name` as the short summary.
4. `llms-full.txt` can include empty page body gaps when a page has no answer blocks, people, or initiatives. This creates token noise and makes the file look less intentional.

Validation is also too shallow. `llms.validate` currently checks existence, non-emptiness, a leading `# ` header, and an `## Organization facts` marker. It does not protect the conventions that make the file useful to agents.

## Decision

The llms text contract is tightened as a pass 1 improvement to existing RFC-0050/RFC-0142 behavior:

- `llms.txt` MUST begin with `# {siteName}` followed by a blockquoted site description.
- `llms.txt` MUST advertise `llms-full.txt` as the complete single-file projection with an absolute Markdown link.
- Page references in `llms.txt` MUST use canonical Markdown link rows: `- [Title](https://example.com/path): Brief description`.
- Page URLs in `llms.txt` and `llms-full.txt` MUST be absolute canonical URLs derived from the semantic model's site URL.
- `llms.txt` SHOULD avoid duplicated page lists. It keeps one authoritative source list and may include non-page key facts under a separate section.
- `llms-full.txt` MUST filter empty sections and repeated blank placeholder blocks.
- `llms.validate` MUST enforce the new structural contract with fail-hard checks for malformed output and warnings for advisory size or curation issues.

This RFC does not create new commands. It changes the behavior and validation contract of the existing `llms.generate` and `llms.validate` commands.

## Architectural fit

- **RFC-0050:** keeps `llms.generate` / `llms.validate` as the owning command surface.
- **RFC-0142:** keeps per-page inclusion depth unchanged. The formatter must continue to honor `full`, `summary`, `index-only`, and `exclude`.
- **RFC-0143:** continues to derive output policy from the normalized semantic page projection instead of ad-hoc app rules.
- **RFC-0166:** per-page `.md` twins remain the correct page-level retrieval target. `llms.txt` should point to canonical URLs and the site-wide full projection, not introduce runtime Markdown endpoints.
- **Generated-file governance:** app-level `public/llms.txt` and `public/llms-full.txt` remain generated outputs. Agents must modify package generators/projectors, then regenerate app files.

## Design

### CLI surface

No new command names are introduced.

```sh
pnpm exec site-kernel run llms.generate --app warpgogol-com
pnpm exec site-kernel run llms.validate --app warpgogol-com --json
```

`llms.generate` continues to write:

| Path                               | Role                                 |
| ---------------------------------- | ------------------------------------ |
| `apps/<site>/public/llms.txt`      | Curated site index for AI retrieval  |
| `apps/<site>/public/llms-full.txt` | Single-file expanded site projection |

### TypeScript contracts

The existing pure projectors remain the public surface:

```ts
export function buildLlmsIndex(site: SemanticSiteModel): string;
export function buildLlmsFull(site: SemanticSiteModel): string;
```

Implementation requirements:

- `buildLlmsIndex` formats page rows as Markdown links with absolute URLs.
- `buildLlmsIndex` includes a blockquote description and a Markdown link to `{origin}/llms-full.txt`.
- `buildLlmsIndex` keeps organization facts compact and avoids duplicating every page under multiple headings.
- `buildLlmsFull` formats each included page with an absolute `URL:` line and joins only non-empty body sections.
- URL normalization should prefer the canonical URL already present on `SemanticPageModel` / `SemanticSiteModel`; do not re-read Astro config inside the pure formatter.

### Output format

A generated `llms.txt` should have this shape:

```markdown
# Warpgogol
> Warpgogol baut Digitales Fundament: tragfähige digitale Basis für kleines Gewerbe und Handwerk in Deutschland.
> For complete documentation in a single file, see [llms-full.txt](https://warpgogol.com/llms-full.txt).

## Primary sources
- [Digitales Fundament](https://warpgogol.com/digitales-fundament): Die getragene digitale Basis. Eigentum beim Kunden, offener Preis, Notausgang.
- [Offener Preis](https://warpgogol.com/preis): 70 € / Monat oder 700 € / Jahr plus 200 € Einrichtung.

## Organization
- Name: Warpgogol
- Representative: Andrii Syrokomskyi
```

`llms-full.txt` should remain a Markdown document with the generated marker, site H1, organization facts, optional offer/location/team sections, and page sections. It must not emit empty placeholder body regions.

### Validation rules

`llms.validate` gains these fail-hard checks for `llms.txt`:

| Rule | Severity | Meaning |
| --- | --- | --- |
| `missing-h1` | error | File does not start with `# {name}` after the generated marker. |
| `missing-summary-blockquote` | error | No non-empty `>` summary appears directly after the H1 block. |
| `missing-full-link` | error | No Markdown link to an absolute `llms-full.txt` URL. |
| `missing-markdown-links` | error | No canonical Markdown link rows are present. |
| `relative-link-target` | error | A Markdown link target in page rows is relative or non-HTTP(S). |
| `malformed-link-row` | error | A primary source row does not match `- [Title](https://...): description`. |

`llms.validate` gains these checks for `llms-full.txt`:

| Rule                         | Severity | Meaning                                             |
| ---------------------------- | -------- | --------------------------------------------------- |
| `missing-organization-facts` | error    | Existing organization section is absent.            |
| `relative-url-line`          | error    | A `URL:` line is relative instead of absolute.      |
| `excessive-blank-runs`       | warning  | The file contains avoidable blank placeholder gaps. |
| `full-file-size`             | warning  | Existing advisory ceiling remains in force.         |

The JSON result should include stable rule IDs:

```json
{
  "command": "llms.validate",
  "status": "fail",
  "violations": [
    {
      "file": "public/llms.txt",
      "rule": "relative-link-target",
      "severity": "error",
      "message": "Primary source link uses a relative URL: /preis"
    }
  ],
  "warnings": []
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/semantic/llms.ts` | Pure formatting contract for `llms.txt` and `llms-full.txt` |
| `packages/share/src/semantic/llms-policy.ts` | Existing depth policy; unchanged except documentation if needed |
| `packages/os/site-kernel-checks/src/llms.ts` | Generation orchestration and validation rules |
| `apps/*/public/llms.txt` | Generated output; do not hand-edit when marker is present |
| `apps/*/public/llms-full.txt` | Generated output; do not hand-edit when marker is present |

## Rollout

- Introduce formatter changes in `@gogol/share` first.
- Update `llms.validate` in `@gogol/site-kernel-checks` with stable rule IDs and JSON output.
- Regenerate `public/llms.txt` and `public/llms-full.txt` for affected apps through `llms.generate`.
- Run `llms.validate` for every app and the relevant package build checks.
- Keep advisory size warnings non-fatal in pass 1; malformed structure is fail-hard.

## Alternatives considered

- **Leave existing format unchanged:** rejected because the ecosystem already owns generation and can cheaply align with the de facto Markdown convention without increasing runtime complexity.
- **Create a new `llms-v2.txt`:** rejected because the convention expects `/llms.txt`; versioning would reduce discoverability.
- **Move all content into `llms-full.txt` and keep `llms.txt` tiny:** rejected for pass 1. `llms.txt` should remain a curated index with enough descriptions to guide fetch decisions.
- **Add runtime Markdown export now:** rejected because RFC-0166 already chose build-time per-page Markdown projections and explicitly forbids request-time HTML conversion.

## Risks

- **Overfitting to an emerging convention:** mitigated by limiting this RFC to plain Markdown quality improvements that are useful even if major LLM providers never officially honor `llms.txt`.
- **Validator false positives:** mitigated with simple, documented structural rules and advisory warnings for style/size issues.
- **Localized routing nuance:** absolute URLs must derive from the already-resolved semantic model, not from hand-built locale assumptions.
- **Generated output churn:** expected once per app after implementation; app files remain generator-owned.

## Acceptance criteria

- [x] `buildLlmsIndex` emits blockquoted summary text. (evidence: implemented historically)
- [x] `buildLlmsIndex` emits an absolute Markdown link to `llms-full.txt`. (evidence: implemented historically)
- [x] `buildLlmsIndex` emits page rows as `- [Title](https://...): description`. (evidence: implemented historically)
- [x] `buildLlmsIndex` avoids duplicate page-list sections. (evidence: implemented historically)
- [x] `buildLlmsFull` emits absolute `URL:` lines and filters empty page body fragments. (evidence: implemented historically)
- [x] `llms.validate` enforces stable rule IDs for blockquote, full-link, Markdown-link, absolute-link, and blank-gap checks. (evidence: implemented historically)
- [x] Generated `public/llms.txt` and `public/llms-full.txt` are regenerated for affected apps through `llms.generate`, not hand-edited. (evidence: implemented historically)
- [x] `pnpm --filter @gogol/share build:check` passes. (evidence: build:check passes, exitCode=0)
- [x] `pnpm --filter @gogol/site-kernel-checks build:check` passes. (evidence: build:check passes, exitCode=0)
- [x] `pnpm exec site-kernel run llms.validate --app <site>` passes for affected apps. (evidence: implemented historically)
- [x] `rfc.validate RFC-0184` passes before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC is `accepted`.
- Agents MUST NOT edit generated `apps/*/public/llms.txt` or `apps/*/public/llms-full.txt` directly when the generated marker is present.
- Agents MUST update the package-level projector/validator and then regenerate app outputs.
- Agents MUST preserve RFC-0142 depth semantics exactly; this RFC changes formatting and validation, not inclusion policy.
- Agents MUST NOT add runtime fetches, HTML scraping, `turndown`, `cheerio`, or worker routes for this pass.
- Agents SHOULD keep the tone factual: `llms.txt` is an AI-readable convenience projection, not a guaranteed SEO or LLM ranking mechanism.
