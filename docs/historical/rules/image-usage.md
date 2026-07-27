---
description: "Rules for storing and optimizing images across the site."
---

# Image Usage Rules

## Core rule

**All images must be stored in a managed asset pipeline and optimized using a framework-specific image optimization component with the highest quality settings.**

In this reference project, content-local `assets/` folders plus Astro image optimization is the canonical image pipeline. The portable rule is broader: visitor-facing images should flow through a managed asset pipeline instead of ad hoc `public/` file usage.

Do **not** place visitor-facing images in the `public/` directory unless they are:

1. Icons that need to be statically referenced (e.g., `favicon.svg`).
2. Assets that must maintain their exact original URL and format without any processing (e.g., specific Open Graph share images).

## How to use images

1. **Storage:** Place photography, illustrations, and other raster graphics in the `assets/` subdirectory of the owning content domain:
   - `src/content/pages/{lang}/assets/**` for page-owned images
   - `src/content/prose/{lang}/assets/**` for prose-owned images
   - `src/content/site/{lang}/assets/**` for shell-owned images
   - `src/content/business/{lang}/assets/**` for business-owned images

2. **Importing:** Import the image directly into your Astro component script setup.

   ```astro
   ---
   import { Image } from "astro:assets";
   import heroImage from "~/content/pages/de/assets/hero-1.webp"; // Note: use relative paths or your alias if configured.
   ---
   ```

3. **Rendering:** Always use the `<Image />` component. Set `quality="max"` (or appropriate highest quality literal) to ensure the image does not suffer compression artifacts. Include descriptive `alt` text.
   ```astro
   <Image
     src={heroImage}
     alt="A descriptive text for the image"
     quality="max"
     format="webp"
     loading="lazy"
     decoding="async"
   />
   ```
   _Note: For above-the-fold images like heroes, use `loading="eager"`._

If another project adopts this DNA with a different framework/image pipeline, preserve the same responsibilities:

- source images live in a managed asset directory
- optimized rendering is the default path
- `public/` is reserved for exceptional passthrough assets, not normal content imagery

## Forbidden patterns

- ❌ Do **not** use the standard `<img>` tag for local raster graphics.
- ❌ Do **not** place visitor-facing content images in the `public/` folder. All optimizations are bypassed if images are loaded from `public/`.
- ❌ Do **not** use low-quality settings or rely on default compression if it introduces visible artifacts. The project requires the highest quality visual presentation.
