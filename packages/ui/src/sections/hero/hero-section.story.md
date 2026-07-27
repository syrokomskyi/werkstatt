---
title: Hero
archetype: hero
cosmicName: Europa
---

# Hero

Realistic RFC-0072 story for the opening page section with heading, lead copy, primary action, and visual background token.

## Image Fade

Hero lead images are sharp by default. If a site's composition needs the portrait or lead image to dissolve into the section edge, set `leadImageFade` on that page block:

```yaml
leadImage:
  src: "hero-1"
  alt: "Person carrying relief supplies"
leadImageFade:
  bottom: true
  width: 0.2
```

Use this only where the image visually meets an edge or gets cropped. Leave `leadImageFade` unset for a clear image.
