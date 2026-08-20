---
id: ADR-0057
title: "Nachweis evidence display UI design decisions"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: proposed
scope: package
decider: architecture
createdAt: 2026-08-20
updatedAt: 2026-08-20
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0885
  - RFC-0886
  - RFC-0887
  - ADR-0028
  - ADR-0054
reviewers: []
---

# ADR-0057: Nachweis evidence display UI design decisions

## Context

The Nachweis evidence detail page (`nachweis-detail` component and `[lang]/nachweis/[slug]` route) currently renders two profiles: attestation (text, quote, SHA-256 hashes, sichtpass) and technical-assessment (metrics, dimensions, sichtpass). RFC-0885 extends the schema with `display`, `websiteUrl`, and `websiteScreenshot` fields. RFC-0886 extends the kernel with granular consent and screenshot upload. This ADR defines the UI design decisions for rendering these new elements on the evidence detail page.

The components affected are in `packages/werkstatt-site/src/domain/ui/` (nachweis-detail, nachweis-card, nachweis-list, nachweis-verify) and the route templates in `src/pages/[lang]/nachweis/`.

## Decision

The Nachweis evidence detail page renders three new sections — PDF document preview, website screenshot, and website link — each gated by the `display` field on `EvidenceSource`, with visual treatment that signals authority and trust.

- **PDF document section**: When `display.document === "visible"` and a canonical PDF artifact exists in `items[]`, render an embedded PDF viewer (`<object>` element with `application/pdf` media type) with a download link. The SHA-256 hash is displayed alongside the viewer for verification. When `display.document === "hidden"`, the section is omitted entirely — no placeholder, no "redacted" indicator.
- **Website screenshot section**: When `display.screenshot === "visible"` and `websiteScreenshot` exists, render the screenshot as a responsive `<img>` with `loading="lazy"`, `decoding="async"`, and `fetchpriority="low"`. The image is served from the R2 public URL stored in `websiteScreenshot.url`. A caption identifies it as a homepage capture with the capture date (from `websiteScreenshot.sha256` bordbuch entry timestamp). When `display.screenshot === "hidden"`, the section is omitted.
- **Website link section**: When `display.websiteLink === "visible"` and `websiteUrl` exists, render an external link with `rel="noopener noreferrer"`, `target="_blank"`, and an icon indicating external navigation. The link text is the domain name extracted from `websiteUrl`. When `display.websiteLink === "hidden"`, the section is omitted.
- **Section ordering**: PDF document → website screenshot → website link → existing content (quote, metrics, sichtpass). This places the most authoritative evidence (signed document) first.
- **Hidden elements leave no trace**: No "redacted" placeholder, no "hidden by client" notice. The page simply does not render the section. This respects client privacy without drawing attention to what is absent.

## Justification

- **`<object>` for PDF preview**: Chosen over `<iframe>` because `<object>` provides fallback content for browsers without PDF support and is semantically correct for embedded documents. `<embed>` is deprecated.
- **`<img>` for screenshot**: Chosen over `<picture>` because the screenshot is a single source (no responsive variants needed). The R2-stored WebP/PNG is already optimized.
- **`loading="lazy"` on screenshot**: Screenshots are below-the-fold on the detail page. Lazy loading improves LCP by deferring screenshot download.
- **`fetchpriority="low"` on screenshot**: The screenshot is not the LCP element. Low priority prevents it from competing with critical resources.
- **No "redacted" placeholder**: Drawing attention to hidden elements undermines the purpose of hiding them. The client's choice to not publish is respected by seamless omission.
- **Domain name as link text**: Using the domain name (e.g. "example.com") instead of the full URL or a generic "Visit website" text provides context and authority. It signals that the link leads to the client's own site.
- **`rel="noopener noreferrer"`**: Standard security practice for external links — prevents the linked site from accessing `window.opener`.
- **Section ordering (PDF first)**: The signed PDF document is the most authoritative evidence. Placing it first establishes credibility before showing visual evidence (screenshot) and external reference (link).

## Consequences

- **Positive**: The detail page flexibly shows all three evidence elements or none, depending on client consent. Visitors get a rich, authoritative view when all elements are visible. The page degrades gracefully when elements are hidden.
- **Positive**: WCAG 2.2 AA compliance is maintained — `<object>` and `<img>` have accessible names, external links are clearly marked.
- **Negative**: The page layout shifts when sections are omitted (no placeholder). This is acceptable — the page is server-rendered, so there is no CLS from dynamic section insertion.
- **Negative**: PDF embedding depends on browser PDF support. Browsers without PDF viewers show fallback content (download link). This is an acceptable trade-off — all modern browsers support PDF viewing.
- **Technical debt**: The screenshot is a single-resolution image. Future enhancement could use `<picture>` with responsive variants, but this requires R2-stored variants and is deferred.

## Evolution

- If clients request a "redacted" indicator for hidden elements (to signal that evidence exists but is not published), revisit the "no placeholder" decision. This would require a new `display` enum value (e.g. `"redacted"`) and corresponding UI treatment.
- If screenshot responsiveness becomes a performance concern, introduce `<picture>` with responsive variants stored in R2. This would extend `websiteScreenshot` with a `variants` field.
- If PDF preview performance is poor on mobile devices, consider replacing `<object>` with a thumbnail image linking to the full PDF. This would require generating a PDF preview image during `nachweis.ingest`.
