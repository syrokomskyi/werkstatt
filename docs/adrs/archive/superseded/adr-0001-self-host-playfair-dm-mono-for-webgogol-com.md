---
id: ADR-0001
title: "Self-host Playfair Display and DM Mono for apps/webgogol-com"
status: superseded
scope: workspace
decider: architecture
createdAt: 2026-07-09
updatedAt: 2026-07-09
implementedAt: 2026-07-09
closedAt: 2026-07-09
supersedes: []
supersededBy: RFC-0371
related:
  - RFC-0164
  - RFC-0025
  - RFC-0071
  - RFC-0371
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0001: Self-host Playfair Display and DM Mono for apps/webgogol-com

## Context

`apps/webgogol-com` currently relies on the `handwerk-material-warm` biome, whose typography tokens resolve to:

- `--ds-font-heading`: "Inter Display", system-ui, sans-serif
- `--ds-font-body`: "Inter", system-ui, sans-serif
- `--ds-font-mono`: "JetBrains Mono", ui-monospace, monospace

The self-hosted `@font-face` registry in `packages/os/site-kernel-checks/src/fonts.ts` only covers `Inter` (400/500/600) and `Lora` (400/500/600/700). `Lora` is not referenced by the webgogol-com biome; it is used by `packages/ontology/biomes/nonprofit-trust.yaml` for `apps/nicaragua-projekt`.

German privacy regulation makes direct Google Fonts CDN usage risky. The repository already self-hosts open-source fonts via `@fontsource` (RFC-0164), so the mechanism exists. The design goal for webgogol-com is a DACH/SMB engineering studio identity: expressive serif accents for headings, a neutral sans-serif for body copy, and a technical mono face for labels, code, and metadata.

## Decision

Adopt self-hosted `Playfair Display` and `DM Mono` for `apps/webgogol-com` through the existing `@fontsource` / `fonts.generate` pipeline, and keep `Inter` as the body font.

| Family           | Weights       | Styles                    | Biome token         |
| ---------------- | ------------- | ------------------------- | ------------------- |
| Playfair Display | 400, 700      | normal, italic (400 only) | `--ds-font-heading` |
| DM Mono          | 300, 400, 500 | normal                    | `--ds-font-mono`    |
| Inter            | 400, 500, 600 | normal                    | `--ds-font-body`    |

- `handwerk-material-warm` biome heading family changes to `"Playfair Display", Georgia, serif`.
- `handwerk-material-warm` biome mono family changes to `"DM Mono", ui-monospace, monospace`.
- `handwerk-material-warm` biome body family remains `"Inter", system-ui, sans-serif`.
- `packages/os/site-kernel-checks/src/fonts.ts` gains the new families and italic-face support. The `SelfHostedFont` contract accepts an optional `styles` array so a single weight can emit both `normal` and `italic` `@font-face` rules.
- `Lora` remains in the self-hosted registry because `packages/ontology/biomes/nonprofit-trust.yaml` still uses it for `apps/nicaragua-projekt`.
- `apps/webgogol-com/src/styles/fonts.generated.css` and `apps/webgogol-com/src/styles/biome.generated.css` are regenerated through `site-kernel` build prepare commands.
- No Google Fonts CDN `<link>` or CSS `@import` is introduced.

## Justification

- **Privacy / compliance**: self-hosting keeps visitor IP addresses away from Google servers, aligning with the LG München precedent and the project's existing RFC-0164 self-host policy.
- **Design fit for DACH/SMB context**: Playfair Display carries editorial expressiveness without becoming the primary reading face; Inter remains a neutral, highly legible body choice; DM Mono provides the technical, protocol-like voice for labels, section numbers, and code.
- **License safety**: both families are published under SIL Open Font License, which permits commercial web use and self-hosting as long as the fonts are not sold standalone. Modified versions may not be redistributed under a reserved font name protected by OFL.
- **Ecosystem fit**: the change reuses `packages/os/site-kernel-checks/src/fonts.ts` and the `biome.css.generate` flow rather than adding app-specific font configuration. The only shared-code change is extending the self-hosted font registry and adding italic support.

### Alternatives considered

- **Google Fonts CDN `<link>`**: rejected due to German privacy risk and repository policy.
- **System-only font stack (no self-hosting)**: rejected because it would leave the visual identity to whatever fonts happen to be installed, breaking the concrete/blueprint identity of the `handwerk-material-warm` biome.
- **Variable font files from `@fontsource`**: rejected to stay consistent with the current static-woff2 pipeline and to avoid expanding the generator's scope.
- **Replace Inter body with another sans (IBM Plex Sans / Source Sans)**: rejected because Inter is already self-hosted and a proven neutral workhorse for the body role.

## Consequences

- **Positive**: webgogol-com gains a distinctive, GDPR-safe typographic palette; the shared font generator becomes capable of italic faces, which benefits future biomes; the design aligns with the Handwerk/SMB positioning.
- **Negative / trade-off**: `public/fonts` for webgogol-com will grow by several woff2 files; Playfair Display is a display face, so it must be limited to headings and accents or it will impair readability.
- **Cross-app impact**: `fonts.ts` is shared. Adding Playfair Display and DM Mono means every app will receive these files during `build.prepare`, even if only webgogol-com consumes them. This is acceptable until font discovery becomes biome-driven.
- **Technical debt**: the `SELF_HOSTED_FONTS` array remains a hand-maintained union of all fonts used by any biome. A future improvement is to derive the required font set from the active biome's typography tokens instead of keeping a global list.

## Evolution

- **Superseded by RFC-0371** (2026-07-09): The biome-driven Fontsource CSS import pipeline replaces the global `SELF_HOSTED_FONTS` registry and copy-to-public approach. Font declarations now live in each biome YAML's `fonts` section, and `fonts.imports.generate` emits `@import "@fontsource/..."` CSS lines that Vite bundles as hashed `_astro/` assets. No font binary files are copied to `public/`. The `SELF_HOSTED_FONTS` array and `fonts.generate` command have been removed.
- When implemented, update this ADR's `implementedAt` date and reference the commit.
