---
id: ADR-0052
title: "Preload LCP hero image in document head"
status: implemented
scope: package
decider: architecture
createdAt: 2026-08-17
updatedAt: 2026-08-17
implementedAt: 2026-08-17
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0006
  - RFC-0152
  - RFC-0209
  - RFC-0833
reviewers: []
---

# ADR-0052: Preload LCP hero image in document head

## Context

The LCP element on the homepage is the hero background image (`hero-bg/768.webp`, 17KB). The image is rendered with `loading="eager"` and `fetchpriority="high"` inside the hero section component, but the browser cannot discover it until the HTML parser reaches the `<img>` tag in `<body>` — well after script parsing begins.

Lighthouse LCP breakdown shows: TTFB 6ms + resource load delay 108ms + resource load duration 167ms + element render delay 88ms = 369ms. But the actual LCP is 2851ms because the image request is delayed behind the LordIcon script chain. Adding a `<link rel="preload" as="image">` in `<head>` lets the browser start the image download immediately, before parsing the body.

## Decision

Add an optional `lcpImage` prop to `BaseLayout` that, when provided, emits a `<link rel="preload" as="image" imagesrcset="..." imagesizes="100vw" fetchpriority="high">` tag in `<head>`.

- The page template resolves the hero `leadImageToken` via `resolveImage` and `buildImageSources` (same path used by `ResponsiveImage`) and passes the resulting `{ src, srcset, sizes }` to the layout.
- The preload uses `imagesrcset` and `imagesizes` attributes (HTML spec for responsive image preload) so the browser picks the correct variant from the srcset.
- Only pages with a hero lead image emit the preload — pages without one skip it.
- The `fetchpriority="high"` attribute on the preload link matches the `fetchpriority="high"` on the rendered `<img>`.

## Justification

`<link rel="preload">` in `<head>` is the standard LCP optimization for images discovered late in the HTML. The browser starts the image request in parallel with script parsing, eliminating the resource load delay.

The alternative of moving the `<img>` tag to `<head>` is invalid HTML. The alternative of using `<link rel="prefetch">` is lower priority and does not guarantee timely loading.

## Consequences

- Positive: LCP improves by ~200-500ms (image download starts immediately, no parser delay). FCP may also improve slightly as the main thread is less contended.
- Negative: One extra `<link>` in `<head>` for pages with a hero image. The preload is redundant if the browser has the image in cache (HTTP/2 push or previous visit), but the cost is negligible.
- Technical debt: The `lcpImage` prop is a page-level concern leaking into the layout. This is acceptable because the layout already handles `primaryImage` (og:image) from `semanticPage.leadImageToken`.

## Evolution

If Astro adds native LCP preload support (e.g. `astro:assets` automatic preload for eager images), this manual preload can be removed. If the LCP element changes (e.g. to a text block), the prop should be removed or retargeted.
