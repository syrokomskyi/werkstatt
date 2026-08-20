---
id: RFC-0891
title: "Website screenshot processing and 16:9 display variant generation for Nachweis"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-20
updatedAt: 2026-08-20
enhancedAt: 2026-08-20
implementedAt: 2026-08-20
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0885
  - RFC-0886
  - RFC-0887
  - RFC-0890
  - DNA-46
  - DNA-59
dependsOn:
  - RFC-0885
  - RFC-0886
  - RFC-0890
batch: nachweis-screenshot-pipeline
satisfies:
  - DNA-46
  - DNA-59
versionBump: minor
commands:
  proposed:
    - nachweis.screenshot.process
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt
successSignals:
  - "nachweis.screenshot.process reads a raw screenshot from cache clone or R2 private storage"
  - "nachweis.screenshot.process crops a 16:9 region from the top of the raw screenshot"
  - "nachweis.screenshot.process resizes the cropped region to 1280x720 and converts to WebP"
  - "nachweis.screenshot.process uploads the display variant to R2 public storage"
  - "nachweis.screenshot.process updates EvidenceSource.websiteScreenshot with display variant sha256, mediaType, url"
  - "nachweis.screenshot.process copies capturedAt from rawArtifact to the display variant"
  - "Display variant R2 path is {systemId}/screenshots/{slug}/website-screenshot.webp"
nonGoals:
  - "Does not ingest raw screenshots — that belongs to RFC-0890"
  - "Does not generate screenshots — use external capture tooling"
  - "Does not validate screenshot content quality or visual correctness"
  - "Does not modify the nachweis publication gate — the gate already checks display↔consent"
  - "Does not change the UI component — nachweis-detail-component.astro already renders at 1280x720"
---

# RFC-0891: Website screenshot processing and 16:9 display variant generation for Nachweis

## Context

RFC-0886 introduced `nachweis.screenshot.upload` for uploading pre-processed screenshots to R2 public storage. RFC-0887 added the `capturedAt` field and the UI renders screenshots at 1280×720 (16:9). RFC-0890 introduced `nachweis.screenshot.ingest` for archiving raw full-page screenshots.

The missing piece is **processing**: transforming a raw full-page screenshot (e.g. 3708×27210px) into a display-ready 16:9 widescreen image (1280×720, WebP). The operator captures full-page screenshots externally, ingests them via RFC-0890, and then needs a command to crop, resize, convert, and upload the display variant.

## Problem

1. **No processing command**: `nachweis.screenshot.upload` (RFC-0886) uploads a file as-is — it does not crop, resize, or convert. The operator must pre-process the screenshot manually before uploading, which is error-prone and labor-intensive.

2. **No raw-to-display pipeline**: There is no command that reads a raw screenshot (archived by RFC-0890) and produces a display variant from it. The operator must use external image editing tools.

3. **Inconsistent output format**: Without a processing command, display screenshots may have varying dimensions, formats, and quality. The UI component expects 1280×720 WebP for optimal display.

4. **No capturedAt propagation**: When the display variant is generated from a raw screenshot, the `capturedAt` from the raw artifact should be copied to the display variant automatically.

## Decision

A new `nachweis.screenshot.process` command reads a raw screenshot (from cache clone local copy or R2 private storage), crops a 16:9 region from the top, resizes to 1280×720, converts to WebP, uploads the display variant to R2 public storage, and updates `EvidenceSource.websiteScreenshot` with the display variant metadata.

The command complements RFC-0886's `nachweis.screenshot.upload` by providing the processing layer that RFC-0886 explicitly excluded from its scope ("Does not generate screenshots").

## Architectural fit

- **DNA-46 (Mission lifecycle)**: Screenshot processing is a kernel command that mutates Sternsystem state through the mission lifecycle. It acquires system and bordbuch locks, appends a Bordbuch entry, and commits the evidence-source file.
- **DNA-59 (Evidence preservation)**: The display variant is preserved in R2 public storage (durable, CDN-served). The raw original remains in R2 private storage (RFC-0890). Both are preserved for future reprocessing.
- **RFC-0886**: Complements the screenshot upload workflow — `nachweis.screenshot.upload` remains for pre-processed files, `nachweis.screenshot.process` handles the raw-to-display transformation.
- **RFC-0887**: The UI component already renders at 1280×720 — this command produces exactly that format.
- **RFC-0890**: Depends on RFC-0890 for raw screenshot archival. The processing command reads the raw artifact referenced by `websiteScreenshot.rawArtifact`.

### Compass sync

- `docs/verification-plan.xml` — add `NACHWEIS-SCREENSHOT-DISPLAY-01` documentation-only rule: when `websiteScreenshot.rawArtifact` is present, `websiteScreenshot.url` should also be present (display variant generated). This rule is documentation-only (same pattern as RFC-0890's `NACHWEIS-RAW-SCREENSHOT-01`) — it is NOT enforced through `nachweis.validate`.
- `packages/werkstatt/AGENTS.md` — add rule: `nachweis.screenshot.process` is the standard path from raw screenshot to display variant; `nachweis.screenshot.upload` is for pre-processed files only.

## Design

### CLI surface

```sh
# Process a raw screenshot into a 16:9 display variant
pnpm exec werkstatt run nachweis.screenshot.process \
  --system warpgogol-com \
  --slug client-xyz

# Dry-run mode: compute crop dimensions without uploading
pnpm exec werkstatt run nachweis.screenshot.process \
  --system warpgogol-com \
  --slug client-xyz \
  --dry-run

# JSON output
pnpm exec werkstatt run nachweis.screenshot.process \
  --system warpgogol-com \
  --slug client-xyz \
  --json

# Override crop offset (default: top, offset=0)
pnpm exec werkstatt run nachweis.screenshot.process \
  --system warpgogol-com \
  --slug client-xyz \
  --crop-offset 200
```

### Crop strategy

The raw screenshot is typically very tall (e.g. 3708×27210). The display variant is 16:9 (1280×720).

**Crop algorithm:**

1. Read raw image dimensions via sharp metadata.
2. Compute the 16:9 crop region from the top of the image:
   - `cropWidth = rawWidth`
   - `cropHeight = Math.round(rawWidth * 9 / 16)`
   - If `cropHeight > rawHeight`, the image is narrower than 16:9 — use `cropHeight = rawHeight` and `cropWidth = Math.round(rawHeight * 16 / 9)` (center horizontally).
   - `cropTop = --crop-offset` (default: 0, top of page)
   - `cropLeft = 0` (or centered if narrower than 16:9)
3. Resize the cropped region to 1280×720.
4. Convert to WebP with quality 80.

**Small raw images:** If the raw image is smaller than 1280×720, `resize(1280, 720, { fit: "cover" })` upscales it. This is an accepted trade-off — raw screenshots are typically 3708×27210, so smaller-than-display is an edge case. The operator can inspect the output and re-capture if needed.

**Example:**

- Raw: 3708×27210
- Crop: 3708×2083 (top region, 16:9 aspect)
- Resize: 1280×720
- Output: WebP, ~80–150KB

### TypeScript contracts

#### Command result

```ts
// packages/werkstatt/src/nachweis/nachweis-screenshot-process.ts

interface NachweisScreenshotProcessResult {
  slug: string;
  systemId: string;
  rawSha256: string;          // SHA-256 of the raw screenshot
  rawDimensions: { width: number; height: number };
  cropRegion: { left: number; top: number; width: number; height: number };
  displaySha256: string;      // SHA-256 of the generated display variant
  displayMediaType: string;   // always "image/webp"
  displayWidth: number;       // always 1280
  displayHeight: number;      // always 720
  r2Key: string;              // {systemId}/screenshots/{slug}/website-screenshot.webp
  capturedAt: string | null;  // propagated from rawArtifact
  bordbuchEventId: string;
}
```

#### R2 path for display variant

```ts
// packages/werkstatt/src/nachweis/nachweis-io.ts

// RFC-0891: R2 path for processed display screenshots — always .webp
export function resolveNachweisScreenshotDisplayR2Path(
  systemId: string,
  slug: string,
): string {
  return `${systemId}/screenshots/${slug}/website-screenshot.webp`;
}
```

This is distinct from RFC-0886's `resolveNachweisScreenshotR2Path` which preserves the original extension. The processing command always outputs WebP, so the path uses `.webp` explicitly.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/nachweis/nachweis-screenshot-process.ts` | New file: `nachweis.screenshot.process` command handler |
| `packages/werkstatt/src/nachweis/nachweis-io.ts` | Add `resolveNachweisScreenshotDisplayR2Path`, `downloadFromR2` helpers |
| `packages/werkstatt/src/nachweis/nachweis.module.ts` | Register `nachweis.screenshot.process` command |
| `packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts` | No schema changes — `websiteScreenshot` already has `sha256`, `mediaType`, `storage`, `url`, `capturedAt` |

### Processing pipeline

```
1. Load EvidenceSource → read websiteScreenshot.rawArtifact
2. Resolve raw file location:
   a. Check cache clone local copy: trust/evidence/screenshots/{slug}/raw/{originalFilename}
   b. If not found locally, download from R2 private: {systemId}/screenshots/{slug}/raw/{originalFilename}
   c. If not found in either, fail with NOT_FOUND
3. Read raw image metadata via sharp (width, height, format)
4. Compute 16:9 crop region from top (with --crop-offset support)
5. Crop + resize + WebP convert via sharp pipeline
6. Compute SHA-256 of the output buffer
7. Upload display variant to R2 public at {systemId}/screenshots/{slug}/website-screenshot.webp
8. Update EvidenceSource.websiteScreenshot:
   - sha256 = displaySha256
   - mediaType = "image/webp"
   - storage = "public"
   - url = r2Key
   - capturedAt = rawArtifact.capturedAt (propagated)
   - rawArtifact = unchanged (preserved)
9. Append nachweis-record Bordbuch entry
```

### Output format

```json
{
  "command": "nachweis.screenshot.process",
  "data": {
    "slug": "client-xyz",
    "systemId": "warpgogol-com",
    "rawSha256": "a1b2c3...",
    "rawDimensions": { "width": 3708, "height": 27210 },
    "cropRegion": { "left": 0, "top": 0, "width": 3708, "height": 2083 },
    "displaySha256": "d4e5f6...",
    "displayMediaType": "image/webp",
    "displayWidth": 1280,
    "displayHeight": 720,
    "r2Key": "warpgogol-com/screenshots/client-xyz/website-screenshot.webp",
    "capturedAt": "2026-08-20T13:44:40Z",
    "bordbuchEventId": "event-000006"
  },
  "exitCode": 0
}
```

### Failure modes

- `nachweis.screenshot.process` fails when `--system` or `--slug` is missing.
- `nachweis.screenshot.process` fails when the evidence-source entity does not exist.
- `nachweis.screenshot.process` fails when `websiteScreenshot.rawArtifact` is not present on the entity (no raw screenshot has been ingested).
- `nachweis.screenshot.process` fails when the raw file is not found in cache clone or R2 private storage.
- `nachweis.screenshot.process` fails when sharp cannot read the raw image metadata.
- `nachweis.screenshot.process` fails when R2 credentials are missing (`MissingEnvError`), unless `--dry-run` is set.
- `nachweis.screenshot.process` fails when `--crop-offset` would place the crop region beyond the raw image boundary (`cropOffset + cropHeight > rawHeight`) — error message includes the maximum allowed offset.
- `nachweis.screenshot.process` does NOT fail when `rawArtifact.capturedAt` is unset — `capturedAt` on the display variant is also left unset.
- `nachweis.screenshot.process` does NOT fail when the raw image is smaller than 1280×720 — sharp upscales via `fit: "cover"` (accepted trade-off, see Crop strategy).

### sharp pipeline

```ts
const sharp = (await import("sharp")).default;

// Read raw image
const rawImage = sharp(rawFilePath);

// Read metadata
const metadata = await rawImage.metadata();
const rawWidth = metadata.width;
const rawHeight = metadata.height;

// Compute crop region
const cropHeight = Math.min(Math.round(rawWidth * 9 / 16), rawHeight);
const cropWidth = cropHeight === rawHeight
  ? Math.round(rawHeight * 16 / 9)
  : rawWidth;
const cropLeft = cropWidth < rawWidth
  ? Math.round((rawWidth - cropWidth) / 2)
  : 0;
const cropTop = cropOffset;

// Crop + resize + convert to WebP
const displayBuffer = await sharp(rawFilePath)
  .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
  .resize(1280, 720, { fit: "cover" })
  .webp({ quality: 80 })
  .toBuffer();
```

## Rollout

1. **Schema dependency**: RFC-0885 must be implemented first (the `websiteScreenshot` field exists on `EvidenceSource`).
2. **Raw ingestion dependency**: RFC-0890 must be implemented first (the `rawArtifact` field is populated by `nachweis.screenshot.ingest`).
3. **Command implementation**: Implement `nachweis.screenshot.process` in `packages/werkstatt/src/nachweis/`.
4. **sharp dependency**: Must be added to `packages/werkstatt/package.json` devDependencies by RFC-0890 before this RFC can be implemented. Use dynamic `import("sharp")` at the call site.
5. **R2 download helper**: Add `downloadFromR2` to `nachweis-io.ts` (wraps `client.getObject`).
6. **No migration**: Existing entities without `rawArtifact` are unaffected — the command fails gracefully with a clear error message.
7. **Pipeline integration**: `nachweis.screenshot.process` is NOT part of any build pipeline — it is an operator-initiated command run during missions.
8. **Relationship with `nachweis.screenshot.upload`**: Both commands update `EvidenceSource.websiteScreenshot`. `upload` is for pre-processed files; `process` is for raw-to-display transformation. An evidence-source should use one or the other, not both. `process` preserves `rawArtifact` when updating; `upload` does not touch `rawArtifact`.

## Alternatives considered

- **Extend `nachweis.screenshot.upload` with processing flags**: Rejected — the upload command is simple (read file, hash, upload). Adding crop/resize/convert logic would make it a complex multi-purpose command. Separate commands are clearer.
- **Process at build time (pipeline integration)**: Rejected — screenshot processing is a one-time operator action, not a repeatable build step. The raw screenshot is archived once, the display variant is generated once.
- **Store display variant in cache clone (local)**: Rejected — the display variant is served from R2 public storage (CDN-backed). Storing it locally in the cache clone would require a separate serving mechanism. R2 public is the correct serving path.
- **Use Cloudflare Image Transformations instead of sharp**: Rejected — the platform uses the `build-portable` image provider (no Cloudflare Image Transformations). Processing with sharp at ingestion time is consistent with the existing `image.variants.generate` pattern.
- **Make crop offset interactive (visual crop selector)**: Rejected — the default top-crop is sufficient for most cases. The `--crop-offset` flag provides manual control. A visual selector would require a UI, which is out of scope for a kernel command.
- **Generate multiple crop variants (top, middle, bottom)**: Rejected — the operator wants a single display screenshot. Multiple variants would complicate the schema and UI. The `--crop-offset` flag allows manual selection if needed.

## Risks

- **Crop quality**: The top-crop strategy assumes the most relevant content is at the top of the page (hero section, navigation). This is true for most landing pages but may not be ideal for all sites. The `--crop-offset` flag allows manual adjustment.
- **sharp memory usage**: Processing a 3708×27210 image requires loading the full image into memory. sharp is efficient (uses libvips streaming), but very large images (>50000px tall) may cause memory pressure. This is unlikely for website screenshots but should be monitored.
- **WebP quality**: Quality 80 is a balance between file size and visual quality. For screenshots with text, lower quality may produce artifacts. The quality is not configurable via a flag to keep the command simple — if needed, a future RFC can add `--quality`.
- **R2 download fallback**: If the cache clone local copy is missing, the command downloads from R2 private. This adds network latency. The operator should ensure the cache clone copy exists (which it does after `nachweis.screenshot.ingest`).
- **Command idempotency**: Running `nachweis.screenshot.process` twice with the same raw screenshot produces the same display variant (deterministic crop + resize + WebP). The R2 upload overwrites the previous display variant. The Bordbuch entry is appended each time (append-only). This is acceptable — reprocessing is intentional and produces a new Bordbuch event.
- **Concurrent execution**: Two agents running `nachweis.screenshot.process` on the same evidence-source simultaneously could conflict on the evidence-source file write and R2 upload. System and bordbuch locks (acquired before state mutation, same pattern as `nachweis.screenshot.upload`) serialize the Bordbuch append and file commit. The R2 upload itself is idempotent (last writer wins). This is the same concurrency model as all existing nachweis commands — accepted as the standard pattern.

## Acceptance criteria

- [x] `nachweis.screenshot.process` command registered with `--system`, `--slug`, `--dry-run`, `--json`, `--crop-offset` flags (evidence: packages/werkstatt/src/nachweis/nachweis.module.ts:539-567)
- [x] `nachweis.screenshot.process` reads `websiteScreenshot.rawArtifact` from the evidence-source entity (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-process.ts:96-110)
- [x] `nachweis.screenshot.process` resolves the raw file from cache clone local copy or R2 private storage (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-process.ts:120-135)
- [x] `nachweis.screenshot.process` computes 16:9 crop region from the top of the raw image (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-process.ts:148-155)
- [x] `nachweis.screenshot.process` crops, resizes to 1280×720, and converts to WebP via sharp (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-process.ts:183-187)
- [x] `nachweis.screenshot.process` uploads the display variant to R2 public at `{systemId}/screenshots/{slug}/website-screenshot.webp` (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-process.ts:190)
- [x] `nachweis.screenshot.process` updates `EvidenceSource.websiteScreenshot` with display variant `sha256`, `mediaType: "image/webp"`, `storage: "public"`, `url` (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-process.ts:193-206)
- [x] `nachweis.screenshot.process` propagates `capturedAt` from `rawArtifact.capturedAt` to the display variant (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-process.ts:143)
- [x] `nachweis.screenshot.process` preserves `rawArtifact` on the `websiteScreenshot` field when updating (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-process.ts:195-206)
- [x] `nachweis.screenshot.process` appends a `nachweis-record` Bordbuch entry with processing metadata (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-process.ts:213-240)
- [x] `nachweis.screenshot.process` `--dry-run` mode computes crop dimensions and output metadata without uploading (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-process.ts:157-176)
- [x] `nachweis.screenshot.process` `--crop-offset` flag adjusts the vertical crop position (evidence: packages/werkstatt/src/nachweis/nachweis-screenshot-process.ts:149,156-163)
- [x] `resolveNachweisScreenshotDisplayR2Path` helper added to `nachweis-io.ts` (evidence: packages/werkstatt/src/nachweis/nachweis-io.ts:466-472)
- [x] `downloadFromR2` helper added to `nachweis-io.ts` (evidence: packages/werkstatt/src/nachweis/nachweis-io.ts:458-464)
- [x] `rfc.validate` passes on this file (evidence: docs/rfcs/rfc-0891-website-screenshot-processing-and-display-variant-generation.md:1-347)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST implement RFC-0890 (raw ingestion) before this RFC — the processing command depends on `rawArtifact` being populated.
- Agents MUST use dynamic `import("sharp")` at the call site, same pattern as `image.variants.generate` in `werkstatt-site/src/checks/image-variants.ts`.
- Agents MUST NOT delete or overwrite `rawArtifact` when updating `websiteScreenshot` — the raw artifact reference must be preserved.
- Agents MUST NOT change the UI component (`nachweis-detail-component.astro`) — it already renders at 1280×720.
- Agents MUST NOT add `nachweis.screenshot.process` to any build pipeline — it is an operator-initiated command.
- Agents MUST propagate `capturedAt` from `rawArtifact.capturedAt` to the display variant when present.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it.
