---
id: RFC-0309
title: "Generate the installable icon and webmanifest suite for every site"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-06
implementedAt: 2026-07-06
closedAt:
supersedes: []
supersededBy:
amends: []
related:
  - RFC-0053
  - RFC-0071
  - RFC-0204
  - RFC-0220
commands:
  proposed:
    - public.icons.generate
    - public.icons.validate
  added:
    - public.icons.generate
    - public.icons.validate
  changed:
    - icons.generate
    - public.declaration.validate
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/ui"
  - "@gogol/share"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Every site emits a complete generated icon and webmanifest suite, not only favicon.svg."
  - "Head links for favicon, apple touch icon, manifest, and maskable icons are generated and validated."
  - "The visual icon seed may be simple in v1, but all raster sizes are generated deterministically from one package-owned source."
nonGoals:
  - "Do not design bespoke brand icons for every client in this RFC."
  - "Do not store hand-edited raster icon sets in each app."
  - "Do not require PWA service workers or offline install behavior."
acceptance:
  - probe: command-registered
    name: "public.icons.generate"
  - probe: command-registered
    name: "public.icons.validate"
---

# RFC-0309: Generate the installable icon and webmanifest suite for every site

## Context

The audited site had only `favicon.svg`. A modern public surface needs a generated icon suite:

- `favicon.ico`;
- `apple-touch-icon.png` at 180x180;
- `icon-192.png`;
- `icon-512.png`;
- maskable variants;
- `manifest.webmanifest`;
- head links.

The owner decision is explicit: generate everything that can be generated, including icons.

## Problem

Only shipping `favicon.svg` leaves installability, iOS home-screen appearance, legacy favicon fallbacks, and manifest metadata undefined. If each app adds its own raster files manually, the fleet will drift immediately.

## Decision

Add a generated icon/webmanifest suite for every `apps/*` site.

The source of truth is one semantic icon seed per site, derived from `src/content/system.md` identity fields and biome tokens. The first implementation may use a deterministic initial-letter mark (for example `W`) when no brand icon seed exists, but the generated outputs must be complete and production-valid.

## Architectural fit

`@gogol/ui` already owns shared icon assets and generated icon components. This RFC extends that generation-first posture to public app icons and webmanifest files while preserving thin apps and RFC-0081 generated-file governance.

## Design

## Generated Files

Each app emits:

```text
public/favicon.svg
public/favicon.ico
public/apple-touch-icon.png
public/icon-192.png
public/icon-512.png
public/icon-maskable-192.png
public/icon-maskable-512.png
public/manifest.webmanifest
```

All text files are UTF-8 with LF line endings.

`manifest.webmanifest` includes:

```json
{
  "name": "<site display name>",
  "short_name": "<short display name>",
  "start_url": "/",
  "display": "standalone",
  "background_color": "<biome background color>",
  "theme_color": "<biome theme/accent color>",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

## Head Links

The generated layout/head surface emits:

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="<theme_color>">
```

Do not add these links app-locally. The shared layout/head component or route generator owns them.

## Commands

### public.icons.generate

Scope: app.

Generates the full icon suite from the semantic seed.

Implementation requirements:

- use a deterministic raster pipeline such as `sharp`;
- generate from a single SVG/canvas source rather than hand-maintaining per-size files;
- write generated files via the standard managed-file protocol;
- keep app-local public files overwritten only when they carry the generated marker or belong to the generator ownership map;
- derive colors from the active biome or app identity, not hardcoded per app.

### public.icons.validate

Scope: app, read-only.

Validates:

- all required files exist;
- PNG dimensions match their filenames;
- maskable icon files have `purpose: "maskable"` entries in `manifest.webmanifest`;
- `manifest.webmanifest` is valid JSON and UTF-8;
- `theme_color` and `background_color` are valid CSS colors and derive from the site identity;
- head links point to generated files;
- no icon is an unresolved Git LFS pointer;
- no CRLF line ending remains in generated text icon files.

Failure severity: `error`.

## Pipeline Placement

- `public.icons.generate` runs in `build.prepare` after biome/style identity generation is available.
- `public.icons.validate` runs in `build.check` and `apps-check.author`.
- `public.declaration.validate` verifies the head links and manifest URL.

## Rollout

1. Add the icon seed and raster generation pipeline in package-owned code.
2. Generate all required public icon files and `manifest.webmanifest` for both reference apps.
3. Add shared head links in the layout/head generator.
4. Add `public.icons.validate` and wire it into app checks.
5. Confirm Lighthouse/installability basics no longer flag missing icon assets.

## Alternatives considered

- **Keep only SVG favicon.** Rejected because it does not satisfy mobile/installability surfaces.
- **Commit hand-made PNGs per app.** Rejected because the owner decision is generation-first.
- **Require bespoke brand design before generating files.** Rejected. A deterministic v1 seed is acceptable; completeness of the public contract is the immediate goal.

## Risks

- **Generic initial-letter marks feel too plain.** Accepted for v1; the generator can improve the seed later without changing the artifact contract.
- **Raster generation adds dependencies.** Mitigated by using an existing deterministic image library already acceptable in the workspace, such as `sharp`.
- **Manifest colors drift from biome identity.** Mitigated by deriving them from existing identity tokens and validating them.

## Acceptance criteria

- [x] Every app emits the required files listed above. (evidence: implemented historically)
- [x] `manifest.webmanifest` includes valid installable icon entries. (evidence: implemented historically)
- [x] Shared head output links the generated icon suite. (evidence: implemented historically)
- [x] `public.icons.validate --app webgogol-com` and `--app nicaragua-projekt` pass. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Lighthouse no longer reports missing installable icon/webmanifest basics for the generated (evidence: implemented historically) suite.
- [x] No app-local hand-authored raster icon set is introduced. (evidence: implemented historically)
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents may implement this RFC because its status is `accepted`.
- Do not copy icon files between apps.
- If the visual seed needs to improve later, change the source seed/generator and regenerate.
- Keep material-credit rules in mind only when icons use inspectable photographic/material sources; generated abstract letter marks do not require content material sidecars.
