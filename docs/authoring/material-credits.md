# Material Credits Authoring Guide

RFC-0220 makes material credits a site-wide publishing requirement. Credits are not decorative metadata: they are the source for the public credits page, inline disclosures such as `Bildnachweis`, and deploy-time validation.

## What Needs Credits

Add a credit sidecar whenever authored content publishes:

- a video declared with `media.source.name`
- a **living-photo clip** (RFC-0202): a record with a `live` block plus a `photo` token (for example a Person profile), or ambient media via `media.source.fromImage`. The animated `<image>.webm` clip is a distinct `kind: video` material and requires its **own** credit sidecar, separate from the still-image credit.
- an image token in `pages`, `business`, or `site` frontmatter, including `backgroundImage`, `image`, `imageName`, `photo`, `portraitImage`, or `src`

The validator uses authored content references, not rendered HTML. Decorative and inline images still need credits when they are referenced through these content fields.

## File Placement

Place the sidecar beside the material in the owning content-local `assets/` folder:

```text
apps/<app>/src/content/pages/de/assets/hero-bg.webp
apps/<app>/src/content/pages/de/assets/hero-bg.credits.yaml
```

Use the bare filename token as `target.id`, with no path and no extension. Match `target.domain` to the content domain that owns the token: `pages`, `business`, or `site`.

## Owner-Provided Client Material

Use this for photos or other materials provided by the site owner or business.

```yaml
id: hero-bg-image
target:
  kind: image
  id: hero-bg
  domain: pages
sourceType: human-made
title: Hero background photo
parties:
  - name: Example Business GmbH
    kind: Organization
    role: rightsHolder
license:
  label: owner-provided-site-material
  copyrightNotice: "Copyright © 2026 Example Business GmbH. All rights reserved unless otherwise stated."
```

## Commissioned Warpgogol Material

Use this for materials commissioned by Warpgogol for a commercial studio project.

```yaml
id: home-illustration-image
target:
  kind: image
  id: home-illustration
  domain: pages
sourceType: composite
title: Home page illustration
parties:
  - name: Warpgogol
    kind: Organization
    role: rightsHolder
license:
  label: commissioned-warpgogol-material
  copyrightNotice: "Copyright © 2026 Warpgogol. All rights reserved unless otherwise stated."
```

## AI Platform Participation

When AI tooling materially contributed to the material, disclose only the tool/platform, role, and prompt author. For the Warpgogol pilot, VEO is recorded as `AIPlatform`.

```yaml
parties:
  - name: VEO
    kind: AIPlatform
    role: aiPlatform
  - name: Example Prompt Author
    kind: Person
    role: promptAuthor
```

Do not present an AI agent as the author of the work. Keep the disclosure transparent and role-based.

## Living-Photo / AI-Animated Portrait (RFC-0202)

A living-photo clip is a `kind: video` material animated from a still portrait. It needs its **own** credit, separate from the still-image credit, because the `.webm` clip is a distinct derived work.

```yaml
id: example-portrait-living-photo
target:
  kind: video
  id: example-portrait
  domain: business
sourceType: ai-generated
title: Example portrait living animation
parties:
  - name: Denys Kopyl
    kind: Person
    role: creator
    note: Created the living-photo animation from the portrait photograph.
  - name: Kling AI
    kind: AIPlatform
    role: aiPlatform
    url: https://kling.ai
    note: AI video model used to animate the still portrait.
  - name: Example portrait
    kind: SourceMaterial
    role: sourceMaterial
    note: Original portrait photograph owned by the rights holder.
  - name: Example Organization e.V.
    kind: Organization
    role: rightsHolder
license:
  label: owner-provided-site-material
  copyrightNotice: "Copyright © 2026 Example Organization e.V. All rights reserved unless otherwise stated."
```

## Validation

Run the focused validator after adding or changing materials:

```sh
pnpm exec site-kernel run material.credits.validate --site <app>
```

For full app readiness, run the app author gate or build check:

```sh
pnpm exec site-kernel run sites-check.author --site <app>
pnpm --filter <app> build:check
```

Missing credits, duplicate targets, invalid sidecars, and unresolved rights placeholders are deploy-blocking.
