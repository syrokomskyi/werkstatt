---
id: RFC-0892
title: "Website meta fields for Nachweis attestation cards"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-20
updatedAt: 2026-08-20
implementedAt: 2026-08-20
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0885
  - RFC-0887
  - RFC-0891
dependsOn:
  - RFC-0885
batch: nachweis-screenshot-pipeline
satisfies:
  - DNA-46
  - DNA-59
versionBump: minor
commands:
  proposed: []
  added: []
---

## 1. Problem

Nachweis attestation cards on the `/nachweise` list page display only the
evidence-source `name` and (since RFC-0891) a screenshot thumbnail. The `name`
field is often verbose (e.g. "Nicaragua-Projekt — Projektbestätigung") because
it doubles as a human-readable description.

The card lacks contextual text that would help a visitor understand what the
client's website is about at a glance — text that is already visible on the
client's website itself:

1. **Header tagline**: the subtitle shown under the site name in the header
   (or, if absent, the tagline under the logo-name in the footer).
2. **Footer tagline**: the text in the bottom-right corner of the client site.

These are stable, publicly visible strings that the studio author manually
transcribes from the client's website. They are not scraped automatically.

## 2. Decision

Add two optional string fields to the `pbp/evidence-source@1` schema:

| Field                  | Type   | Required | Description                                                        |
| ---------------------- | ------ | -------- | ------------------------------------------------------------------ |
| `websiteTagline`       | string | optional | Header subtitle from the client site (or footer logo tagline).    |
| `websiteFooterTagline` | string | optional | Bottom-right footer text from the client site.                     |

Both fields are **optional** on all evidence-source kinds. They are only
displayed by the attestation card variant; the technical-assessment variant
ignores them.

### 2.1 Naming convention for `name`

The `name` field should be short — just the client or project name, without
a descriptive suffix after an em-dash. Examples:

- "Nicaragua Projekt" (not "Nicaragua-Projekt — Projektbestätigung")
- "Style Expert" (not "Style Expert — Kundenaussage")

The descriptive suffix is redundant when the card already shows the kind
implicitly via its position in the "Projektnachweise und Kundenbestätigungen"
section.

### 2.2 Card layout

The attestation card renders the new fields in these positions:

```
┌──────────────────────────────────┐
│ {name}                           │  ← title (existing)
│ {websiteTagline}                 │  ← new: under title, muted
│                                  │
│ [screenshot image]               │  ← existing (RFC-0891)
│              {websiteFooterTagline} │  ← new: under screenshot, right-aligned
│                                  │
│ ✓Veröffentlicht    ↗ domain.tld │  ← footer row (existing)
└──────────────────────────────────┘
```

### 2.3 Schema changes

`pbpWebsiteScreenshotSchema` is not affected. The new fields are added to
`evidenceSourceSchema` directly, alongside `websiteUrl` and `websiteScreenshot`:

```typescript
websiteTagline: nonEmptyString.optional(),
websiteFooterTagline: nonEmptyString.optional(),
```

No `superRefine` rules are added — the fields are purely informational and
optional for all kinds.

### 2.4 Display gating

The `display` field (RFC-0885) does not gain new aspects for these fields.
`websiteTagline` and `websiteFooterTagline` follow the same visibility as the
card itself — if the evidence-source is `status: published`, they are shown.
If a field is absent, the corresponding card section is simply not rendered.

## 3. Affected files

### Schema

- `packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts` — add
  `websiteTagline` and `websiteFooterTagline` optional fields.

### UI components

- `packages/werkstatt-site/src/domain/ui/components/nachweis-card/nachweis-card-component.astro` —
  add `websiteTagline` and `websiteFooterTagline` props to
  `NachweisAttestationCardProps`; render tagline under title and footer tagline
  under screenshot.
- `packages/werkstatt-site/src/domain/ui/components/nachweis-card/nachweis-card-component.css` —
  add `.nachweis-card__tagline` and `.nachweis-card__footer-tagline` styles.
- `packages/werkstatt-site/src/domain/ui/components/nachweis-list/nachweis-list-component.astro` —
  pass `websiteTagline` and `websiteFooterTagline` from evidence-source data
  to attestation card records.

### Content

- Evidence-source Markdown files — update `name` to short form, add
  `websiteTagline` and `websiteFooterTagline` fields.

## 4. Alternatives considered

### 4.1 Automatic scraping

Rejected. The header tagline and footer tagline are not always in predictable
DOM positions. Manual transcription by the studio author is more reliable and
takes seconds.

### 4.2 Nested `websiteMeta` object

Rejected. Two flat fields are simpler, match the existing `websiteUrl` /
`websiteScreenshot` pattern, and avoid a schema migration for a nested object.

### 4.3 New `display` aspects

Rejected. The taglines are not sensitive — they are publicly visible marketing
copy. Adding `display.tagline` / `display.footerTagline` would add gating
complexity without benefit.

## 5. Risks

- **Stale taglines**: if the client updates their website tagline, the
  evidence-source file may still hold the old value. This is the same risk as
  `websiteUrl` and `websiteScreenshot` — manual maintenance.
- **i18n**: taglines are in the language of the client's website. The
  evidence-source file is already language-scoped (e.g. `de/trust/evidence/`),
  so no additional i18n handling is needed.

## 6. Testing

- `pbp.content.validate` must accept the new fields.
- The attestation card must render taglines when present and omit them when
  absent.
- The technical-assessment card must not render taglines even if the fields
  are present (it does not use them).
