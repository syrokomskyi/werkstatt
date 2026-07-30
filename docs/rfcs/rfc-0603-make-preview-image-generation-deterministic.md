---
id: RFC-0603
title: "Make preview image generation deterministic"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-07-30
updatedAt: 2026-07-30
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0150
  - RFC-0345
  - RFC-0602
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-18
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - preview.images.generate
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-codegen"
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "Running preview.images.generate twice in a row produces byte-identical PNG files for the same input content."
  - "git diff after re-running preview.images.generate shows zero changes to preview PNGs when source content is unchanged."
  - "The rendering pipeline uses deterministic font rendering, fixed color profiles, and stable element positioning."
  - "No timestamp, build ID, or random seed is embedded in the PNG metadata or pixel data."
nonGoals:
  - "Do not change the visual appearance of preview images — the fix is about byte-level determinism, not design."
  - "Do not switch to a different image format (e.g., SVG, WebP) — PNG is the required format for OG preview images."
  - "Do not remove the preview image generation pipeline — it is required for social media sharing."
  - "Do not address icon generation (favicon.ico, icon-192.png, etc.) — those are generated from fixed SVG sources and are already deterministic."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0603: Make preview image generation deterministic

## Context

A public folder regeneration experiment on warpgogol-com (2026-07-30) revealed that 34 preview PNG files in `public/preview/` differ in byte content between consecutive regenerations, even when the source content (page title, description, brand colors) is identical. This makes `generated.drift.validate` (RFC-0601) impractical for preview images — every build would report drift on all 34 files.

The current `preview.images.generate` command (RFC-0150) uses a headless browser or canvas-based rendering pipeline that introduces non-determinism through:

1. **Font rendering**: Subpixel positioning, hinting, and antialiasing vary between runs depending on font cache state and GPU rasterization.
2. **PNG metadata**: The encoder embeds a creation timestamp in the PNG tEXt chunk.
3. **Color profile**: The color space may vary depending on the system's ICC profile.
4. **Element positioning**: Sub-pixel layout differences from floating-point rounding in the rendering engine.

## Problem

Preview images are generated binary files (PNG) that should be deterministic — same input content must produce byte-identical output. Currently, they are not. This causes:

1. **Git churn**: Every `build.prepare` rewrites 34 PNG files, creating noise in commits and making it impossible to distinguish real content changes from rendering noise.
2. **Drift detection blindness**: `generated.drift.validate` (RFC-0601) cannot check preview images because they always "drift". This means content drift in preview images (e.g., wrong page title rendered) goes undetected.
3. **CI cache invalidation**: Content-addressable caches (e.g., Cloudflare, CDN) see every build as a new version, invalidating all cached preview images.
4. **LFS storage bloat**: Git LFS stores every version of every binary file. Non-deterministic regeneration creates a new LFS object on every build.

## Decision

The `preview.images.generate` rendering pipeline is made deterministic by: (1) stripping all non-deterministic PNG metadata (tEXt chunks with timestamps), (2) using a fixed color profile (sRGB), (3) disabling subpixel font positioning in the rendering engine, and (4) using a deterministic PNG encoder (e.g., `sharp` with `png: { compressionLevel: 9, palette: false }` and no metadata chunks).

## Architectural fit

- **DNA-18 (Uni registry is the single UI index)**: Extends the determinism principle to binary generated files — same input must produce byte-identical output.
- **RFC-0150 (content-driven OG preview image generation)**: This RFC fixes the determinism gap in the generator introduced by RFC-0150.
- **RFC-0345 (idempotent file writes)**: `writeFileIfChanged` already prevents redundant writes when content is identical. But if the content is non-deterministic, the write always happens. This RFC makes the content deterministic so `writeFileIfChanged` can skip the write.
- **RFC-0602 (timestamp determinism)**: Related — RFC-0602 addresses text files, this RFC addresses binary files. Both are prerequisites for RFC-0601 (drift validate).

## Design

### CLI surface

No new commands. The fix is internal to `preview.images.generate`:

```sh
pnpm exec site-kernel run preview.images.generate --site warpgogol-com
```

### Determinism strategy

1. **PNG metadata stripping**: After rendering, use `sharp` to strip all metadata chunks: `sharp(imageBuffer).png({ compressionLevel: 9 }).withMetadata({ exif: false, icc: false }).toFile(outputPath)`. This removes tEXt chunks containing creation timestamps.

2. **Fixed color profile**: Convert to sRGB before encoding: `sharp(imageBuffer).toColorspace('srgb')`. This ensures the same color space regardless of the system's ICC profile.

3. **Deterministic font rendering**: Use `@resvg/resvg-js` (or `sharp` with SVG input) instead of a headless browser. SVG-to-PNG rendering with `resvg` is deterministic because it uses a fixed rendering pipeline without GPU rasterization, subpixel positioning, or font cache variability.

4. **Stable element positioning**: Use integer pixel coordinates in the SVG template. Avoid floating-point transforms that can produce different rounding on different platforms.

### TypeScript contracts

```ts
interface PreviewRenderOptions {
  width: 1200;
  height: 630;
  format: "png";
  deterministic: true;  // Always true after this RFC
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-codegen/src/preview-images.ts` | Fix target — rendering pipeline |
| `packages/os/site-kernel-codegen/src/templates/preview/` | SVG templates for preview images |
| `public/preview/{lang}/{slug}.png` | Output — must be byte-identical across runs |

### Failure modes

- If the rendering library (`resvg` or `sharp`) produces different output on different platforms (e.g., Linux vs macOS), the preview images will differ across developer machines. Mitigation: CI runs on Linux, and the generated files are committed from CI, not from developer machines.
- If a font is not available on the rendering system, the fallback font may produce different output. Mitigation: bundle fonts as package dependencies (Fontsource).

## Rollout

- **Default behavior**: The deterministic rendering pipeline is active immediately upon implementation. No flags, no opt-in.
- **Existing apps**: Must re-generate all preview images once after implementation to produce deterministic versions. After that, consecutive builds produce zero changes.
- **New apps**: Automatically benefit.
- **Pipeline integration**: No change — `preview.images.generate` remains in `build.prepare`.
- **Verification**: After implementation, run `preview.images.generate` twice and verify `git diff` shows zero changes to `public/preview/`.

## Alternatives considered

- **Gitignore preview images (don't commit them)**: Rejected by operator. Preview images must be committed to git for LFS storage and CDN caching. Non-deterministic generation would still cause LFS bloat.
- **Perceptual hashing for drift detection**: Rejected by operator. Perceptual hashing hides real content drift (e.g., wrong page title) and adds complexity. The fix should be at the root — make rendering deterministic.
- **Use a different image format (SVG)**: Rejected — OG preview images must be PNG (or JPEG) for social media compatibility. SVG is not supported by Open Graph.
- **Use a headless browser with `--font-render-hinting=none`**: Rejected — headless browsers (Puppeteer, Playwright) still have non-deterministic rendering due to GPU rasterization, font cache state, and timing-dependent layout. SVG-to-PNG via `resvg` is inherently more deterministic.

## Risks

- **Cross-platform determinism**: `resvg` may produce different output on different platforms (Linux vs macOS vs Windows). Mitigation: generated files are committed from CI (Linux), not from developer machines. Developers who run `build.prepare` locally may see preview image changes, but these are not committed.
- **Font availability**: If a font is not installed on the rendering system, the fallback font produces different output. Mitigation: bundle fonts via Fontsource as package dependencies.
- **Visual regression**: Changing the rendering engine from headless browser to SVG-to-PNG may subtly change the visual appearance of preview images. Mitigation: compare before/after visually before merging. The visual appearance should be close but not pixel-identical to the previous output.
- **Performance**: SVG-to-PNG via `resvg` is faster than headless browser rendering. No performance concern.

## Acceptance criteria

- [ ] `preview.images.generate` uses SVG-to-PNG rendering via `resvg` or equivalent deterministic renderer
- [ ] PNG metadata (tEXt chunks with timestamps) is stripped from output
- [ ] Fixed sRGB color profile is applied to all output
- [ ] Integer pixel coordinates used in SVG templates (no sub-pixel positioning)
- [ ] Running `preview.images.generate` twice in a row produces byte-identical PNG files
- [ ] `git diff` after re-running `preview.images.generate` shows zero changes to `public/preview/` when source content is unchanged
- [ ] `writeFileIfChanged` skips writes for unchanged preview images (no LFS bloat)
- [ ] Unit test verifies byte-level determinism for a sample preview image
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The implementation MUST preserve the visual appearance of preview images as closely as possible. Compare before/after screenshots before merging.
- If `resvg` is not already a dependency, add it to `packages/os/site-kernel-codegen/package.json`.
- The SVG template MUST use integer pixel coordinates for all elements (text positions, rectangles, gradients).
- Fonts MUST be loaded via Fontsource (already a project dependency) to ensure cross-platform availability.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
