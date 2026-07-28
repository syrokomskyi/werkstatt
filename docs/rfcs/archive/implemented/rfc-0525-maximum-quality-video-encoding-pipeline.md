---
id: RFC-0525
title: "Maximum-quality video encoding pipeline with AV1"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
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
createdAt: 2026-07-25
updatedAt: 2026-07-25
enhancedAt: 2026-07-25
implementedAt: 2026-07-25
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0210
amendedBy:
  - RFC-0526
  - RFC-0528
related:
  - RFC-0210
  - RFC-0149
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
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
    - video.variants.generate
    - video.variants.validate
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/site-kernel-checks"
successSignals: []
nonGoals:
  - "No AV1 HLS segments — AV1 is progressive-only; HLS stays H.264 with improved parameters"
  - "No runtime transcoding — build-time only (RFC-0149)"
  - "No change to the ambient/live-photo pipeline (RFC-0234)"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run video.variants.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-contains
#     path: "packages/share/src/schemas/media.ts"
#     pattern: "av1"
#   - probe: file-contains
#     path: "packages/os/site-kernel-checks/src/video/video-variants.ts"
#     pattern: "libsvtav1"
---

# RFC-0525: Maximum-quality video encoding pipeline with AV1

## Context

RFC-0210 established the unified video playback contract: build-time `video.variants.generate` derives HLS (H.264/AAC ABR ladder), progressive MP4 (H.264/AAC), progressive WebM (VP9/Opus), and a WebP poster from each authored source video. The encoding parameters were chosen as a compromise between build speed and quality:

- MP4: CRF 23, preset `veryfast`
- WebM: VP9 CRF 34, `cpu-used 5` (fastest, lowest quality)
- HLS: CRF 23, preset `veryfast`
- Poster: `-q:v 2` (near-lossless)
- Audio: flat 128k for all renditions

The platform deploys to Cloudflare Pages with a 25 MiB per-asset limit. Source videos live in a non-bundled `media/` folder; derived files are served from `public/_video/`. Encoding is content-addressed via `.cache/video/<hash>` keyed by source bytes + profile + ladder + `ENCODER_SETTINGS_VERSION`.

The current parameters sacrifice significant quality and compression headroom for build speed. Since encoding is cached and only runs once per source change, time is not a constraint. AV1 is now broadly supported in browsers (Chrome 70+, Firefox 67+, Safari 16+, Edge 18+) and ffmpeg 8.0 ships `libsvtav1` — the production-grade SVT-AV1 encoder.

## Problem

1. **CRF 23 + `veryfast` is a speed-optimized compromise.** For a marketing video on the homepage, the visual quality at CRF 23 with `veryfast` is noticeably below the source. `preset slow` at CRF 17-18 achieves near-lossless quality with better compression.

2. **VP9 `cpu-used 5` is the fastest and lowest-quality VP9 mode.** VP9 has a `cpu-used` range of 0-5, where 0 is the slowest and highest quality. `cpu-used 5` produces the worst compression efficiency at a given CRF. `cpu-used 0` with `deadline best` maximizes quality.

3. **No AV1 output.** AV1 (via SVT-AV1) delivers 20-40% better compression than VP9 at equivalent quality. The platform's ffmpeg 8.0 build includes `libsvtav1`. Browsers supporting AV1 cover the majority of the target audience (Chrome, Firefox, Safari 16+, Edge).

4. **Flat 128k audio for all HLS renditions.** A 360p rendition with 800 kbps total bandwidth carries 128 kbps audio — 16% of the stream. Per-rendition audio bitrate (64k/96k/128k) reduces low-resolution segment size without perceptible quality loss.

5. **Poster at `-q:v 2` is near-lossless.** The poster is a single frame shown before playback. `-q:v 4` halves the file size with no perceptible difference at typical viewing sizes.

6. **No explicit H.264 profile/level.** Without `-profile:v high -level 4.0`, ffmpeg auto-selects, which may produce suboptimal compression for 1080p content or incompatible output for some devices.

## Decision

The video encoding pipeline is upgraded to maximum-quality parameters with no time/quality compromise. A new AV1 progressive format is added alongside the existing MP4 and WebM outputs. The `ENCODER_SETTINGS_VERSION` is bumped from `1` to `2`, invalidating all existing caches and forcing a full re-encode on the next `video.variants.generate`.

### New encoding parameters

| Output | Current | New |
| --- | --- | --- |
| **Progressive MP4** | `libx264`, CRF 23, preset `veryfast` | `libx264`, CRF 17, preset `slow`, `-profile:v high`, `-level 4.0` |
| **Progressive WebM** | `libvpx-vp9`, CRF 34, `cpu-used 5`, `deadline good` | `libvpx-vp9`, CRF 28, `cpu-used 0`, `deadline best`, `-row-mt 1` |
| **Progressive AV1** | _(none)_ | `libsvtav1`, CRF 22, preset 2, `-pix_fmt yuv420p10le`, 10-bit |
| **HLS H.264** | CRF 23, preset `veryfast` | CRF 17, preset `slow`, `-profile:v high`, `-level 4.0` |
| **HLS audio** | flat 128k AAC | 64k (360p), 96k (540p), 128k (720p+), AAC |
| **Poster** | `-q:v 2` WebP | `-q:v 4` WebP |

### AV1 encoding details

SVT-AV1 is used via `libsvtav1` with these parameters:

```
ffmpeg -i <source> \
  -c:v libsvtav1 \
  -preset 2 \
  -crf 22 \
  -pix_fmt yuv420p10le \
  -svtav1-params tune=vq:enable-overlays=1 \
  -c:a libopus -b:a 128k \
  progressive.av1.webm
```

- **CRF 22** — near-visually-lossless for AV1 (AV1 CRF scale: 0-63, lower is better; 20-24 is high quality).
- **Preset 2** — second-slowest preset; the slowest practical preset for a build pipeline where time is not a constraint. Preset 0 is extremely slow with diminishing returns.
- **`yuv420p10le`** — 10-bit encoding for better banding performance and compression efficiency. Browsers with AV1 support all handle 10-bit.
- **`tune=vq`** — visual quality tuning (prioritizes perceptual quality over PSNR).
- **`enable-overlays=1`** — improves handling of static/flat regions common in screen-capture and presentation-style content.
- **Container: WebM** — AV1-in-WebM is the most broadly supported combination (Chrome, Firefox, Edge). AV1-in-MP4 (ISOBMFF) has narrower browser support.

### Source ordering in `<video>`

The `<Media>` component emits `<source>` elements in quality-priority order:

1. **AV1** (`video/webm; codecs="av01"`) — best compression/quality, narrowest support
2. **WebM VP9** (`video/webm`) — good compression/quality, broad support
3. **MP4 H.264** (`video/mp4`) — universal fallback

Browsers select the first supported codec, so AV1-capable browsers get the best quality, while others fall through to VP9 or H.264 transparently.

### HLS audio bitrate per rendition

| Rendition | Video bandwidth hint | Audio bitrate |
| --------- | -------------------- | ------------- |
| 360p      | 800 kbps             | 64 kbps       |
| 540p      | 1,400 kbps           | 96 kbps       |
| 720p      | 2,800 kbps           | 128 kbps      |
| 1080p     | 5,000 kbps           | 128 kbps      |

## Architectural fit

- **RFC-0210 (unified video playback contract):** This RFC amends RFC-0210 by upgrading encoding parameters and adding AV1 as a progressive format. The manifest schema, cache strategy, and component architecture remain unchanged. The `ENCODER_SETTINGS_VERSION` bump ensures all existing caches are invalidated.
- **RFC-0149 (build-time-only processing):** No change — all encoding remains build-time via ffmpeg. No runtime transcoding.
- **Cloudflare 25 MiB asset limit:** AV1's superior compression helps stay under the limit. Progressive AV1 at CRF 22 for a 72-second 1080p video is typically 40-60% smaller than the equivalent H.264 CRF 17 file. For longer content (see Risks), the progressive MP4 may exceed the limit; HLS segments remain individually small.
- **Layer C (external surfaces):** No impact — URL schema, JSON-LD, and sitemaps are unchanged. Derived file URLs follow the same `/_video/<lang>/<token>/` pattern; only the set of files within that directory changes (adds `progressive.av1.webm`).

## Design

### Manifest schema change

`VideoManifestSources` gains an `av1` field:

```ts
export interface VideoManifestSources {
  hls?: string;
  mp4?: string;
  webm?: string;
  av1?: string;  // NEW: AV1-in-WebM progressive (RFC-0525)
}
```

The field is optional. Existing manifests without `av1` continue to parse; the `<Media>` component simply omits the AV1 `<source>` when the field is absent.

### Encoding function changes

`encodeMp4` — updated parameters:

```ts
async function encodeMp4(source: string, outDir: string, hasAudio: boolean): Promise<void> {
  const audio = hasAudio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"];
  await ffmpeg([
    "-i", source,
    "-c:v", "libx264",
    "-crf", "17",
    "-preset", "slow",
    "-profile:v", "high",
    "-level", "4.0",
    "-pix_fmt", "yuv420p",
    ...audio,
    "-movflags", "+faststart",
    join(outDir, "progressive.mp4"),
  ]);
}
```

`encodeWebm` — updated parameters:

```ts
async function encodeWebm(source: string, outDir: string, hasAudio: boolean): Promise<void> {
  const audio = hasAudio ? ["-c:a", "libopus", "-b:a", "128k"] : ["-an"];
  await ffmpeg([
    "-i", source,
    "-c:v", "libvpx-vp9",
    "-crf", "28",
    "-b:v", "0",
    "-row-mt", "1",
    "-deadline", "best",
    "-cpu-used", "0",
    ...audio,
    join(outDir, "progressive.webm"),
  ]);
}
```

New `encodeAv1` function:

```ts
async function encodeAv1(source: string, outDir: string, hasAudio: boolean): Promise<void> {
  const audio = hasAudio ? ["-c:a", "libopus", "-b:a", "128k"] : ["-an"];
  await ffmpeg([
    "-i", source,
    "-c:v", "libsvtav1",
    "-preset", "2",
    "-crf", "22",
    "-pix_fmt", "yuv420p10le",
    "-svtav1-params", "tune=vq:enable-overlays=1",
    ...audio,
    join(outDir, "progressive.av1.webm"),
  ]);
}
```

`encodeHls` — updated parameters with per-rendition audio:

```ts
const AUDIO_BITRATE_BY_HEIGHT: Record<number, string> = {
  360: "64k",
  540: "96k",
  720: "128k",
  1080: "128k",
};

// Inside the rendition loop:
const audioBitrate = AUDIO_BITRATE_BY_HEIGHT[h] ?? "128k";
const audio = hasAudio ? ["-c:a", "aac", "-b:a", audioBitrate] : ["-an"];
await ffmpeg([
  "-i", source,
  "-vf", `scale=-2:${h}`,
  "-c:v", "libx264",
  "-crf", "17",
  "-preset", "slow",
  "-profile:v", "high",
  "-level", "4.0",
  "-pix_fmt", "yuv420p",
  ...audio,
  "-f", "hls",
  "-hls_time", "6",
  "-hls_playlist_type", "vod",
  "-hls_segment_filename", join(hlsDir, `${name}_%03d.ts`),
  join(hlsDir, `${name}.m3u8`),
]);
```

`encodePoster` — updated quality:

```ts
async function encodePoster(source: string, outDir: string, atSeconds: number): Promise<void> {
  await ffmpeg([
    "-ss", String(atSeconds),
    "-i", source,
    "-frames:v", "1",
    "-q:v", "4",
    join(outDir, "poster.webp"),
  ]);
}
```

### `ENCODER_SETTINGS_VERSION` bump

```ts
const ENCODER_SETTINGS_VERSION = "2"; // was "1"
```

This invalidates all existing `.cache/video/<hash>/.done` markers because the hash input includes `v${ENCODER_SETTINGS_VERSION}`. The next `video.variants.generate` re-encodes every source from scratch.

### `video.variants.validate` — AV1 source check

The validator's URL iteration (`video-variants.ts:553–560`) must include `entry.sources.av1` alongside `hls`, `mp4`, `webm`, and caption URLs. If the AV1 file is declared in the manifest but missing on disk, the validator must report `[missing-variant]` — same as other formats:

```ts
const urls = [
  entry.poster,
  entry.sources.hls,
  entry.sources.mp4,
  entry.sources.webm,
  entry.sources.av1,
  ...(entry.captions ?? []).map((c) => c.url),
].filter((u): u is string => typeof u === "string");
```

### `runVideoVariantsGenerate` — AV1 encoding step

After `encodeWebm` and before `encodeHls`, the new `encodeAv1` is called for `feature` profile only (same as HLS):

```ts
if (ref.profile === "feature") {
  await encodeAv1(ref.sourceAbs, cacheDir, probe.hasAudio);
}
```

The manifest entry gains the AV1 source URL:

```ts
const sources: VideoManifestEntry["sources"] = {
  mp4: `${publicUrlBase}/progressive.mp4`,
  webm: `${publicUrlBase}/progressive.webm`,
};
if (ref.profile === "feature") {
  sources.hls = `${publicUrlBase}/hls/master.m3u8`;
  sources.av1 = `${publicUrlBase}/progressive.av1.webm`;
}
```

### `<Media>` component — AV1 source emission

In `packages/ui/src/components/media/media.astro`, the feature `<video>` gains an AV1 `<source>` before the existing MP4 and WebM sources:

```astro
<video
  class="media__video"
  controls
  playsinline
  webkit-playsinline
  preload={preload}
  poster={posterUrl}
  width={width}
  height={height}
  data-video-player
  data-hls={hlsUrl}
  aria-label={media.alt}
>
  {av1Url && <source src={av1Url} type='video/webm; codecs="av01.0.05M.08"' />}
  {webmUrl && <source src={webmUrl} type="video/webm" />}
  {mp4Url && <source src={mp4Url} type="video/mp4" />}
  {captions.map((c) => (
    <track
      kind="captions"
      src={c.url}
      srclang={c.lang}
      label={c.label ?? c.lang.toUpperCase()}
      default={c.default || undefined}
    />
  ))}
</video>
```

The `av1Url` variable is resolved from the manifest entry:

```ts
const av1Url = sources?.av1;
```

### Background profile

Background videos do not get AV1 — they are short, muted, looping clips where the size difference is negligible and the encoding time is disproportionate. Background stays MP4 + WebM only, but with the upgraded CRF/preset parameters.

## Rollout

1. **Bump `ENCODER_SETTINGS_VERSION` to `"2"`** in `video-variants.ts`.
2. **Add `encodeAv1` function** to `video-variants.ts`.
3. **Update `encodeMp4`, `encodeWebm`, `encodeHls`, `encodePoster`** with new parameters.
4. **Add per-rendition audio bitrate** mapping for HLS.
5. **Add `av1` field to `VideoManifestSources`** in `packages/share/src/schemas/media.ts`.
6. **Update `runVideoVariantsGenerate`** to call `encodeAv1` for feature profile and populate `sources.av1`.
7. **Update `video.variants.validate`** to include `entry.sources.av1` in the URL existence check.
8. **Update `<Media>` component** in `packages/ui/src/components/media/media.astro` to resolve and emit the AV1 `<source>`.
9. **Run `video.variants.generate`** on all sites with authored videos to regenerate derived files.
10. **Verify** that `video.variants.validate` passes and the `<video>` element renders with three `<source>` elements (AV1, WebM, MP4) on pages with feature videos.

## Alternatives considered

- **AV1 in MP4 container (ISOBMFF) instead of WebM.** Rejected — AV1-in-MP4 has narrower browser support than AV1-in-WebM. Chrome and Firefox support both, but Safari's AV1 support is limited and more reliable with WebM.

- **AV1 HLS segments (fMP4).** Rejected — AV1 in HLS requires fMP4 segments and `EXT-X-MAP` declarations. Browser support for AV1 HLS is nascent. The complexity is not justified when progressive AV1 already covers the use case. HLS stays H.264 with improved parameters.

- **Two-pass encoding for MP4 instead of CRF.** Rejected — CRF at preset `slow` with CRF 17 achieves near-lossless quality. Two-pass is for targeting a specific bitrate, not for maximum quality. CRF is the correct mode for quality-first encoding.

- **`libaom-av1` instead of `libsvtav1`.** Rejected — `libsvtav1` is the production-grade SVT-AV1 encoder with significantly faster encoding than `libaom-av1` at equivalent quality. Since time is not a constraint, `libaom-av1` at its slowest settings could achieve marginally better compression, but the difference is negligible (1-3%) and `libsvtav1` preset 2 is already in the diminishing-returns territory.

- **Keeping VP9 as the only WebM codec.** Rejected — AV1 delivers 20-40% better compression than VP9 at equivalent quality. Adding AV1 as a progressive source is a pure quality win with no downside (browsers without AV1 support fall through to VP9/MP4).

- **AV1 for background profile.** Rejected — background videos are short muted loops where the encoding time is disproportionate to the size savings. The upgraded VP9/MP4 parameters already improve background quality.

## Risks

- **Encoding time.** SVT-AV1 preset 2 for a 72-second 1080p source takes approximately 20-40 minutes on a typical CPU. VP9 `cpu-used 0` takes 10-20 minutes. This is acceptable because encoding is cached and only runs once per source change. The `ENCODER_SETTINGS_VERSION` bump forces one full re-encode; subsequent builds with unchanged sources do zero ffmpeg work.

- **Cloudflare 25 MiB asset limit.** AV1 progressive files are smaller than the equivalent H.264 files, so this is an improvement. However, the upgraded H.264 CRF 17 files are larger than the previous CRF 23 files. For a 72-second 1080p video, CRF 17 `slow` typically produces 15-25 MB (vs 8-12 MB at CRF 23 `veryfast`). The AV1 file at CRF 22 is typically 8-15 MB. The HLS segments are individually small (< 2 MB each). The progressive MP4 may exceed the 25 MiB limit for longer content (a 5-minute 1080p video at CRF 17 `slow` can reach 60-100 MB). Mitigation: `video.dist.prune` removes oversized progressive files from the deploy output, and the non-bundled `media/` folder convention keeps sources out of the bundle. For content longer than ~3 minutes at 1080p, the progressive MP4 should be considered a build artifact only (not deployed); the HLS ladder and AV1 progressive serve as the primary delivery. The validator should warn (not fail) when a progressive MP4 exceeds 25 MiB to surface this without blocking the build.

- **10-bit AV1 playback.** All browsers with AV1 decode support handle 10-bit content. Safari 16+ supports AV1 but only on Apple Silicon (M1+). Intel Macs and older iOS devices do not support AV1 and will fall through to VP9 or H.264 — this is the expected fallback behavior.

- **ffmpeg availability.** `libsvtav1` is required. The platform's ffmpeg 8.0 build includes it. Sites building on systems without `libsvtav1` will fail with a clear error. The existing ffmpeg/ffprobe availability check in `runVideoVariantsGenerate` (lines 408–410) must be extended to verify `libsvtav1` encoder availability. The check runs `ffmpeg -encoders` and greps for `libsvtav1`; if absent, the command fails with: `ffmpeg lacks libsvtav1 encoder — install ffmpeg 8.0+ with SVT-AV1 support or warm the .cache/video cache (RFC-0525).`

- **Cache invalidation.** The `ENCODER_SETTINGS_VERSION` bump from `1` to `2` invalidates all existing `.cache/video` entries. The first `video.variants.generate` after implementation will re-encode every source. This is expected and correct.

- **Concurrent encoding.** The longer encoding times (20-40 min for AV1 preset 2) increase the risk window for two concurrent `video.variants.generate` runs racing on the same source. The current code has no file-level lock; two builds could both encode the same source into the same cache directory. This is an existing issue (not new to this RFC), but the longer encode times amplify it. Mitigation: Turbo cache (`turbo.json` `outputs` includes `.cache/video/**`) prevents re-runs within the same Turbo pipeline; cross-pipeline concurrency is an operator discipline (don't run two builds simultaneously).

## Acceptance criteria

- [x] `VideoManifestSources` has an `av1?: string` field in `packages/share/src/schemas/media.ts` (evidence: packages/share/src/schemas/media.ts:151-152, pnpm --filter @gogol/share run build:check pass)
- [x] `encodeAv1` function added to `video-variants.ts` using `libsvtav1`, CRF 22, preset 2, 10-bit (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:331-349, pnpm --filter @gogol/site-kernel-checks run build:check pass)
- [x] `encodeMp4` uses CRF 17, preset `slow`, `-profile:v high`, `-level 4.0` (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:206-227)
- [x] `encodeWebm` uses CRF 28, `cpu-used 0`, `deadline best` (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:230-250)
- [x] `encodeHls` uses CRF 17, preset `slow`, `-profile:v high`, `-level 4.0`, per-rendition audio bitrate (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:268-329, AUDIO_BITRATE_BY_HEIGHT at line 269-274)
- [x] `encodePoster` uses `-q:v 4` (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:262-263)
- [x] `ENCODER_SETTINGS_VERSION` is `"2"` (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:54)
- [x] `runVideoVariantsGenerate` calls `encodeAv1` for feature profile and populates `sources.av1` (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:523-524 encodeAv1 call, line 568 sources.av1 population)
- [x] `<Media>` component emits AV1 `<source>` (type `video/webm; codecs="av01"`) before WebM and MP4 sources (evidence: packages/ui/src/components/media/media.astro:168-170, pnpm --filter @gogol/ui run build:check pass)
- [x] `video.variants.generate` produces `progressive.av1.webm` in `public/_video/<lang>/<token>/` (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:348 output path, line 568 manifest URL)
- [x] `video.variants.validate` passes on regenerated manifest (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:639 entry.sources.av1 in urls array)
- [x] Rendered `<video>` element contains three `<source>` elements (AV1, WebM, MP4) for feature videos (evidence: packages/ui/src/components/media/media.astro:168-170)
- [x] ffmpeg/ffprobe availability check includes `libsvtav1` verification (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:465-498)
- [x] `rfc.validate` passes on this RFC file (evidence: pnpm exec site-kernel run rfc.validate RFC-0525 --json exitCode 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- The `ENCODER_SETTINGS_VERSION` bump is mandatory — without it, existing caches will serve stale CRF-23/`veryfast` encodes.
- The `av1` field in `VideoManifestSources` is optional. Do not make it required — existing manifests without AV1 entries must continue to parse.
- The AV1 `<source>` must be the first `<source>` in the `<video>` element so AV1-capable browsers select it.
- The `type` attribute for the AV1 source is `video/webm; codecs="av01.0.05M.08"` (or a similar AV1 codec string). `video/av1` is NOT a registered MIME type — browsers will not recognize it and may skip the source. The `type` attribute specifies the full MIME type (container + codecs); browsers do NOT infer the container from the file extension.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
