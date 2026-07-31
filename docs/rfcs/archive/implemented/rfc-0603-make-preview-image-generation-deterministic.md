---
id: RFC-0603
title: "Make preview image generation deterministic"
status: implemented
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
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-30
updatedAt: 2026-07-30
enhancedAt: 2026-07-30
implementedAt: 2026-07-30
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0150
  - RFC-0345
  - RFC-0601
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

The current `preview.images.generate` command (RFC-0150) already uses `sharp` with SVG input for PNG rendering (`packages/os/site-kernel-checks/src/preview-templates.ts:131-139`). The non-determinism comes from `sharp`/libvips encoding options and system font variability, not from a headless browser:

1. **`adaptiveFiltering: true`** (`preview-templates.ts:137`): sharp selects different PNG row filter strategies per-row based on content analysis heuristics. While deterministic for identical input on the same libvips build, this may produce different output across libvips versions or builds.
2. **Redundant `resize` call** (`preview-templates.ts:135-136`): The SVG is rendered at 1200×630 (its native viewBox) and then `.resize(1200, 630, { fit: "fill" })` is called — a no-op in dimensions but a second pass through the image processing pipeline that may introduce rounding differences.
3. **System font stack** (`preview-templates.ts:93`): The SVG uses `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, 'Helvetica Neue', Arial, sans-serif`. These fonts vary by platform, producing different glyph rendering on different machines. Cross-platform determinism would require bundling fonts (e.g., via Fontsource), but this is deferred to a follow-up RFC — same-machine determinism is the primary goal.
4. **`writeFile` instead of `writeFileIfChanged`** (`preview-images.ts:270, 309, 383, 440`): The command always writes the PNG to disk, even when the content is byte-identical to the existing file. This creates git churn and LFS bloat on every `build.prepare` run, regardless of whether the PNG content actually changed.
5. **PNG metadata**: The current code does NOT call `.withMetadata()`, so sharp strips metadata by default. This is already correct — no fix needed for metadata.

## Problem

Preview images are generated binary files (PNG) that should be deterministic — same input content must produce byte-identical output. Currently, they are not. This causes:

1. **Git churn**: Every `build.prepare` rewrites 34 PNG files, creating noise in commits and making it impossible to distinguish real content changes from rendering noise.
2. **Drift detection blindness**: `generated.drift.validate` (RFC-0601) cannot check preview images because they always "drift". This means content drift in preview images (e.g., wrong page title rendered) goes undetected.
3. **CI cache invalidation**: Content-addressable caches (e.g., Cloudflare, CDN) see every build as a new version, invalidating all cached preview images.
4. **LFS storage bloat**: Git LFS stores every version of every binary file. Non-deterministic regeneration creates a new LFS object on every build.

## Decision

The `preview.images.generate` rendering pipeline is made deterministic by fixing `sharp` options (disable `adaptiveFiltering`, remove the redundant `resize` call, set `palette: false`). Fontsource font bundling is deferred to a follow-up RFC — same-machine determinism is the primary goal, and generated files are committed from CI (Linux). If `sharp` still produces non-deterministic output after these fixes, `@resvg/resvg-js` is added as a fallback deterministic renderer. Additionally, `writeFile` is replaced with `writeFileIfChanged` (RFC-0345) so that byte-identical output skips the disk write entirely.

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

**Phase 1 — Fix `sharp` options (preferred):**

1. **Disable `adaptiveFiltering`**: Change `.png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })` to `.png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, effort: 10 })`. This forces a fixed PNG filter strategy instead of per-row adaptive selection.

2. **Remove redundant `resize` call**: The SVG is already at 1200×630 (its native viewBox). The `.resize(OG_WIDTH, OG_HEIGHT, { fit: "fill" })` call is a no-op in dimensions but introduces a second image processing pass. Remove it — render the SVG directly to PNG at the native size.

3. **Fixed color profile**: Ensure the SVG uses explicit hex colors (already the case via biome palette). sharp renders SVG in sRGB by default — no explicit `.toColorspace('srgb')` call is needed unless the SVG contains ICC profile references.

4. **Integer pixel coordinates**: The SVG template already uses integer coordinates for text positions, rectangles, and gradients (`preview-templates.ts:88-124`). No change needed.

5. **PNG metadata**: The current code does NOT call `.withMetadata()`, so sharp strips metadata by default. No change needed. Do NOT add `.withMetadata({ exif: false, icc: false })` — `.withMetadata()` ADDS metadata, it does not strip it.

6. **Replace `writeFile` with `writeFileIfChanged`**: Change all `writeFile` calls in `preview-images.ts` to `writeFileIfChanged` from `@warpgogol/site-kernel` (re-exported from `@warpgogol/forge/utils`, RFC-0345). This skips the disk write when the generated PNG is byte-identical to the existing file, eliminating git churn and LFS bloat.

7. **Font bundling (deferred)**: Fontsource font bundling for cross-platform determinism is deferred to a follow-up RFC. The system font stack is retained. Same-machine determinism is the primary goal — generated files are committed from CI (Linux), not from developer machines.

**Phase 2 — `@resvg/resvg-js` fallback (if sharp is still non-deterministic):**

If after applying Phase 1 fixes, `preview.images.generate` still produces non-deterministic output (verified by running twice and comparing bytes), add `@resvg/resvg-js` as the SVG-to-PNG renderer. `resvg` uses a fixed rendering pipeline without libvips' adaptive filter selection, providing stronger determinism guarantees. The fallback is only activated if Phase 1 is insufficient.

**Interaction with `--force-normalize`:**

The existing `--force-normalize` flag (`preview-images.ts:210`) re-renders existing cards when source text carries normalization signals. The deterministic pipeline preserves this flag — `--force-normalize` still triggers re-rendering, but the output is now deterministic. The flag and the determinism fix are orthogonal.

### TypeScript contracts

```ts
/** Options that affect PNG determinism in the sharp rendering pipeline. */
interface PreviewRenderOptions {
  width: 1200;
  height: 630;
  format: "png";
  /** PNG encoding options — fixed for determinism */
  png: {
    compressionLevel: 9;
    adaptiveFiltering: false;  // Disabled — fixed filter strategy
    palette: false;            // No palette quantization
    effort: 10;
  };
  /** Whether to use @resvg/resvg-js instead of sharp (Phase 2 fallback) */
  useResvg?: boolean;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/preview-images.ts` | Fix target — replace `writeFile` with `writeFileIfChanged` |
| `packages/os/site-kernel-checks/src/preview-templates.ts` | Fix target — sharp encoding options |
| `packages/os/site-kernel-checks/src/generator-ownership.ts` | Add `public/preview/{lang}/{slug}.png` entries to `GENERATOR_OWNERSHIP_MAP` |
| `packages/os/site-kernel-checks/package.json` | Add `@resvg/resvg-js` dependency (Phase 2 only, if needed) |
| `public/og-image.png` | Output — ultimate fallback, must be byte-identical across runs |
| `public/preview/{lang}/{slug}.png` | Output — per-page preview, must be byte-identical across runs |

### Failure modes

- **Cross-platform output differences**: `sharp`/libvips or `resvg` may produce different output on different platforms (Linux vs macOS vs Windows). Mitigation: generated files are committed from CI (Linux), not from developer machines. Developers who run `build.prepare` locally may see preview image changes, but these are not committed.
- **Font availability**: The system font stack depends on fonts installed on the rendering machine. Same-machine determinism is guaranteed; cross-platform determinism is not (deferred to a follow-up RFC). Mitigation: generated files are committed from CI (Linux).
- **`--force-normalize` interaction**: The `--force-normalize` flag re-renders existing cards. The deterministic pipeline preserves this flag — it triggers re-rendering, but the output is deterministic. No conflict.
- **Biome palette missing**: If the biome YAML file is not found, `readBiomePalette` returns `{}` and the SVG uses default colors (`preview-templates.ts:43-45`). This is already deterministic — the same default colors are used every time.

### Output format

The `--json` output shape is unchanged from the current command. The `data.items[]` array still reports per-file status (`generated`, `skipped-existing`, `skipped-optout`, `regenerated-normalized`, `failed`). The `data.summary` object still reports `generated`, `skippedExisting`, `skippedOptout`, `failed` counts. The only behavioral change: `skipped-existing` is now reported when `writeFileIfChanged` returns `"unchanged"` (previously, the file was always overwritten and reported as `skipped-existing` only if it existed on disk).

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
- **Use a headless browser with `--font-render-hinting=none`**: Rejected — headless browsers (Puppeteer, Playwright) have non-deterministic rendering due to GPU rasterization, font cache state, and timing-dependent layout. The current pipeline already uses SVG-to-PNG via `sharp`, which is inherently more deterministic than a headless browser.
- **Switch to `@resvg/resvg-js` immediately**: Deferred — the current `sharp` SVG-to-PNG pipeline may achieve determinism with option fixes (disable `adaptiveFiltering`, remove redundant `resize`). `resvg` is a Phase 2 fallback only if `sharp` remains non-deterministic. This avoids adding an unnecessary dependency.

## Risks

- **Cross-platform determinism**: `sharp`/libvips or `resvg` may produce different output on different platforms (Linux vs macOS vs Windows). Mitigation: generated files are committed from CI (Linux), not from developer machines. Font bundling for cross-platform font determinism is deferred to a follow-up RFC.
- **Visual regression from `adaptiveFiltering` change**: Disabling `adaptiveFiltering` may slightly change PNG file size (larger files due to fixed filter strategy). This does not affect visual appearance — the pixel data is identical, only the PNG encoding differs.
- **Performance**: Removing the redundant `resize` call slightly improves performance. No performance concern.

## Acceptance criteria

- [x] `adaptiveFiltering` is set to `false` in `preview-templates.ts` PNG encoding options (evidence: `packages/os/site-kernel-checks/src/preview-templates.ts:140` — `.png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, effort: 10 })`)
- [x] Redundant `.resize()` call removed from `preview-templates.ts` (SVG rendered directly at native 1200×630) (evidence: `packages/os/site-kernel-checks/src/preview-templates.ts:137-141` — no `.resize()` call, sharp renders SVG directly to PNG)
- [x] PNG metadata is not added (`.withMetadata()` is NOT called — sharp strips metadata by default) (evidence: `packages/os/site-kernel-checks/src/preview-templates.ts:137-141` — no `.withMetadata()` call)
- [x] `writeFile` replaced with `writeFileIfChanged` in `preview-images.ts` for all output paths (evidence: `packages/os/site-kernel-checks/src/preview-images.ts:18` — `import { writeFileIfChanged } from "@warpgogol/site-kernel"`, all 4 write sites at lines 272, 311, 385, 442 use `writeFileIfChanged`)
- [x] `public/preview/{lang}/{slug}.png` entries added to `GENERATOR_OWNERSHIP_MAP` in `generator-ownership.ts` (evidence: `packages/os/site-kernel-checks/src/generator-ownership.ts:513-519` — entry with `path: "public/preview/{lang}/{slug}.png"`, `command: "preview.images.generate"`)
- [x] Running `preview.images.generate` twice in a row produces byte-identical PNG files (verified by comparing file hashes) (evidence: E2E test on warpgogol-com mission workpiece — deleted all 37 PNGs, regenerated twice, `diff` of sha256sums showed zero differences)
- [x] `git diff` after re-running `preview.images.generate` shows zero changes to `public/preview/` and `public/og-image.png` when source content is unchanged (evidence: third consecutive run reported `generated 0, skipped-existing 37` — `writeFileIfChanged` skipped all writes, no git diff)
- [x] `writeFileIfChanged` returns `"unchanged"` for byte-identical preview images (no disk write, no LFS bloat) (evidence: `packages/forge/src/utils/fs-idempotent.ts:29-33` — Buffer.compare for binary content, returns `"unchanged"` when bytes match; third run reported `skipped-existing 37`)
- [x] Unit test in `src/tests/preview-determinism.test.ts` renders a sample preview image twice and asserts `Buffer.equals()` on the two PNG buffers (evidence: `packages/os/site-kernel-checks/src/tests/preview-determinism.test.ts` — 5 tests, all passing, including byte-identical assertion across 5 consecutive calls)
- [x] If Phase 1 is insufficient, `@resvg/resvg-js` is added and the same determinism test passes with `resvg` rendering (evidence: Phase 1 is sufficient — E2E determinism verified with sharp, no Phase 2 needed)
- [x] `--force-normalize` flag still works (re-renders existing cards with deterministic output) (evidence: `packages/os/site-kernel-checks/src/preview-images.ts:210` — `forceNormalize` flag preserved, re-render path at lines 298-318 and 360-395 uses `writeFileIfChanged` with deterministic `generateBrandCardPng`)
- [x] `rfc.validate` passes on this file (evidence: `pnpm exec site-kernel run rfc.validate --root .` — no RFC-0603-specific errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The implementation MUST start with Phase 1 (fix `sharp` options). Only proceed to Phase 2 (`@resvg/resvg-js`) if Phase 1 is proven insufficient by a failed determinism test.
- The SVG template MUST use integer pixel coordinates for all elements (text positions, rectangles, gradients). This is already the case — no change needed.
- `writeFileIfChanged` MUST be imported from `@warpgogol/site-kernel` (re-exported from `@warpgogol/forge/utils`, RFC-0345). Do NOT use raw `writeFile` from `node:fs/promises` for generated preview images.
- If `@resvg/resvg-js` is needed (Phase 2), add it to `packages/os/site-kernel-checks/package.json` (NOT `site-kernel-codegen` — the preview image code lives in `site-kernel-checks`).
- The `--force-normalize` flag MUST continue to work. The determinism fix is orthogonal to the normalization re-render trigger.
- Unit test files MUST live under `src/tests/` in `packages/os/site-kernel-checks` (the vitest config only discovers tests under `src/tests/`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
