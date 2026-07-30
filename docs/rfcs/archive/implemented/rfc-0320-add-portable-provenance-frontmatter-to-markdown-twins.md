---
id: RFC-0320
title: "Add portable provenance frontmatter to Markdown twins"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-05
implementedAt: 2026-07-22
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0166
  - RFC-0208
amendedBy:
  - RFC-0377
  - RFC-0613
related:
  - RFC-0306
  - RFC-0316
  - RFC-0317
commands:
  proposed: []
  added: []
  changed:
    - page.markdown.generate
    - page.markdown.validate
    - public.surface.lint
    - behavior.snapshot.validate
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Every Markdown twin is portable: it states canonical URL, language, source-backed lastModified, content hash, license, and generator."
  - "Content hashes are deterministic and verifiable against the twin body."
  - "Relative Source-only footers are retired."
nonGoals:
  - "Do not change the visual HTML page."
  - "Do not use build time as Last-Modified."
  - "Do not make Markdown twins an authored source of truth."
---

# RFC-0320: Add portable provenance frontmatter to Markdown twins

## Context

The audit found that Markdown twins only carried a weak `Source: /path` footer. A twin copied out of origin context loses its canonical URL, language, version, update date, license, and integrity anchor.

RFC-0166 and RFC-0208 make Markdown twins the agent-readable page surface. That surface now needs portable provenance.

## Problem

A Markdown twin is useful precisely because an external agent may fetch it, cache it, quote it, or move it into another context. A relative `Source` line does not let the agent verify where it came from or whether the body changed.

## Decision

Every generated Markdown twin begins with YAML frontmatter carrying portable provenance:

```yaml
---
canonical: "https://warpgogol.com/preis/"
language: "de"
lastModified: "2026-07-05"
contentHash: "sha256:<hex>"
license: "https://warpgogol.com/ai.txt"
generator: "page.markdown.generate"
sourceKind: "page"
---
```

The old relative `Source: /path` footer is removed. A human-readable source/canonical line may still appear in the body, but it must use an absolute canonical URL and must not be the only provenance record.

## Architectural fit

This RFC amends RFC-0166 and RFC-0208 by keeping the build-time Markdown twin model but enriching the generated artifact header. It does not change page eligibility, block extraction, or visual rendering. It consumes the canonical URL and update-stamp contracts introduced by RFC-0317 and is validated by the public text hygiene rules introduced by RFC-0316.

The frontmatter is generated metadata, not authored content. That preserves the thin-app and generated-file governance model while making each twin independently verifiable after download.

## Design

### Frontmatter contract

Required fields:

| Field | Meaning |
| --- | --- |
| `canonical` | Absolute canonical HTML URL, byte-identical to rendered HTML canonical and sitemap loc. |
| `language` | BCP-47 or site language code for the twin content. |
| `lastModified` | Source-backed `YYYY-MM-DD` date from RFC-0317 update-stamp resolver. |
| `contentHash` | `sha256:<hex>` over the normalized Markdown body excluding frontmatter and excluding the hash field. |
| `license` | Absolute URL to the public AI/content use policy or license declared for the site. |
| `generator` | Stable command id, usually `page.markdown.generate` or `surface.generate`. |
| `sourceKind` | `page`, `surface`, `legal`, `credits`, `passport`, or another closed value approved by the generator. |

Optional fields:

| Field | Meaning |
| --- | --- |
| `pageId` | Stable page id when available. |
| `sourceInputs` | Relative authored source paths used to build the twin. Do not include private paths outside the repo. |
| `schema` | Future schema tag if the frontmatter shape changes. Defaults to `gogol.markdown-twin@1`. |

### Hash calculation

The content hash is deterministic:

1. Build the Markdown body without frontmatter.
2. Normalize line endings to LF.
3. Trim exactly one trailing newline policy: final body bytes end with one LF.
4. Hash UTF-8 bytes of the body only.
5. Write `contentHash: sha256:<hex>` into frontmatter.

The hash does not include frontmatter, so changing `lastModified` or `license` does not invalidate the body hash. If a future RFC requires full-document integrity, it must add a separate field.

### Last modified source

`lastModified` uses the RFC-0317 update-stamp resolver.

Rules:

- Do not use build date or generated file mtime.
- If a source-backed date cannot be found for an eligible twin, `page.markdown.generate` fails with a diagnostic that names the page and missing input source.
- Sitemap `<lastmod>` may still omit dates for pages without update stamps during RFC-0317 rollout, but once this RFC is implemented, a twin must not be emitted without `lastModified`.

### License URL

The license field points to the site's machine-readable policy, preferred order:

1. `ai.txt` policy URL when present.
2. A content/license URL declared in `system.md`.
3. The legal route that explicitly governs content reuse.

The generator must not invent a license. If no policy exists, fail with a clear diagnostic or add the missing policy through the owning public artifact RFC first.

### Markdown body shape

After frontmatter, body remains plain Markdown:

```md
# Offener Preis

> ...

## ...
```

No HTML tags are allowed in the body unless inside fenced code blocks. `public.surface.lint` owns that enforcement.

### page.markdown.validate additions

Add fail-hard checks:

| Rule        | Severity | Meaning                                                              |
| ----------- | -------- | -------------------------------------------------------------------- |
| `MDMETA-01` | error    | Missing YAML frontmatter.                                            |
| `MDMETA-02` | error    | Missing required field.                                              |
| `MDMETA-03` | error    | `canonical` is not absolute or differs from rendered HTML canonical. |
| `MDMETA-04` | error    | `lastModified` is missing or not source-backed.                      |
| `MDMETA-05` | error    | `contentHash` mismatch.                                              |
| `MDMETA-06` | error    | `license` URL missing or not generated/declared public policy.       |
| `MDMETA-07` | error    | Old relative `Source: /...` footer remains.                          |

### Behavior snapshot

`behavior.snapshot` should record for each route with a twin:

```ts
interface MarkdownTwinSnapshot {
  href: string;
  canonical: string;
  language: string;
  lastModified: string;
  contentHash: string;
}
```

Snapshot drift in `contentHash`, `lastModified`, or `href` is a public behavior change and must be reviewed like other route-level behavior changes.

## Pipeline placement

- `page.markdown.generate` writes frontmatter during `build.prepare`.
- `page.markdown.validate` verifies frontmatter in `apps-check.postbuild`.
- `public.surface.lint` catches old `Source: /path` and generic body hygiene issues.
- `behavior.snapshot.validate` reports twin metadata drift.

## Rollout

1. Add the frontmatter builder and hash helper in `@gogol/share`.
2. Thread canonical URL, language, license URL, sourceKind, and update stamp into Markdown twin generation.
3. Update validators and behavior snapshot extraction.
4. Regenerate twins for reference apps.
5. Inspect behavior snapshot diff before committing.

## Alternatives considered

- **Keep key-value lines after the heading.** Rejected. YAML frontmatter is easier for tools to parse and is a familiar Markdown convention.
- **Hash the entire document.** Rejected for v1 because self-referential hashes require canonical serialization rules for frontmatter.
- **Make `lastModified` optional.** Rejected for twins. A portable artifact should carry a version date once the update-stamp resolver exists.

## Risks

- **Frontmatter looks like visible content to some LLM readers.** Accepted. YAML frontmatter is common and the fields are useful context.
- **Missing update stamps block twin generation.** Accepted. This pushes the repository toward real content freshness instead of fake dates.
- **Hash drift from whitespace changes.** Mitigated by fixed LF and final-newline normalization.

## Acceptance criteria

- [x] Markdown twin frontmatter builder exists with unit tests for required fields and hash determinism. (evidence: tests pass, vitest run exitCode=0)
- [x] Every generated twin includes `canonical`, `language`, `lastModified`, `contentHash`, `license`, `generator`, and `sourceKind`. (evidence: implemented historically)
- [x] `contentHash` verifies against normalized body bytes. (evidence: implemented historically)
- [x] `page.markdown.validate` implements `MDMETA-01` through `MDMETA-07`. (evidence: implemented historically)
- [x] Old relative `Source: /...` footer is absent from generated twins. (evidence: implemented historically)
- [x] Behavior snapshot records twin metadata and reports drift. (evidence: implemented historically)
- [x] `public.surface.lint` passes for generated twins. (evidence: implemented historically)
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents may implement this RFC because its status is `accepted`.
- Do not hand-edit Markdown twins; update the projector/generator.
- Do not use build date or filesystem mtime for `lastModified`.
- Do not weaken `contentHash` verification to account for generator bugs; fix normalization instead.
- Keep the body Markdown readable for humans after the frontmatter.
