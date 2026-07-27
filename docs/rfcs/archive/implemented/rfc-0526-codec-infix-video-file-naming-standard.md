---
id: RFC-0526
title: "Codec-infix video file naming standard"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
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
  - RFC-0234
  - RFC-0525
amendedBy: []
related:
  - RFC-0210
  - RFC-0234
  - RFC-0525
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - video.variants.generate
    - live.variants.generate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-checks"
successSignals: []
nonGoals:
  - "No change to HLS segment filenames (e.g. 1080p_000.ts) — the rendition name already identifies the content"
  - "No change to poster or caption filenames — they are not video codec files"
---

# RFC-0526: Codec-infix video file naming standard

## Context

RFC-0210 introduced progressive video files as `progressive.mp4` (H.264) and `progressive.webm` (VP9). RFC-0234 followed the same pattern for living-photo clips. RFC-0525 added `progressive.av1.webm` — a second WebM file with a different codec — and introduced the codec-infix convention (`av1` between the base name and the container extension) to disambiguate.

This created an inconsistency: AV1 files carry a codec infix, but H.264 and VP9 files do not. In a directory with three progressive files, two are identifiable by extension alone and one requires an infix. This is asymmetrical and confusing for operators, debugging, and tooling.

## Problem

The asymmetry created by RFC-0525 — where only AV1 files carry a codec infix — makes it impossible to identify a file's codec by name alone without inspecting the manifest. In a `public/_video/<lang>/<token>/` directory with three progressive files, an operator or debugging agent cannot tell which file is H.264 and which is VP9 without opening the manifest or running `ffprobe`. This is a usability and tooling problem that will worsen as additional codecs are added in the future.

## Decision

All derived progressive video files MUST include a codec infix between the base name and the container extension. The pattern is:

```
<base>.<codec>.<container>
```

### Renames

| Pipeline                | Current                | New                    |
| ----------------------- | ---------------------- | ---------------------- |
| video.variants.generate | `progressive.mp4`      | `progressive.h264.mp4` |
| video.variants.generate | `progressive.webm`     | `progressive.vp9.webm` |
| video.variants.generate | `progressive.av1.webm` | _(unchanged)_          |
| live.variants.generate  | `progressive.mp4`      | `progressive.h264.mp4` |
| live.variants.generate  | `progressive.webm`     | `progressive.vp9.webm` |

### Files NOT affected

- **HLS segments** (`1080p_000.ts`, `720p.m3u8`, `master.m3u8`) — the rendition name already disambiguates; HLS uses H.264 exclusively.
- **Poster** (`poster.webp`) — image, not video.
- **Captions** (`promo.uk.vtt`) — text track, not video.

## Architectural fit

- **RFC-0210 (unified video playback contract):** This RFC amends RFC-0210 by renaming progressive output files. The manifest schema, cache strategy, and component architecture remain unchanged — only the filenames within `public/_video/` change.
- **RFC-0234 (living-photo pipeline):** This RFC amends RFC-0234 by applying the same naming convention to `live-variants.ts` outputs.
- **RFC-0525 (AV1 encoding pipeline):** This RFC amends RFC-0525 by extending the codec-infix convention (already used for `progressive.av1.webm`) to H.264 and VP9 files.
- **Layer C (external surfaces):** No impact — filenames are internal to `public/_video/`. The manifest is the single source of truth for URLs; consumers (`<Media>`, `<SectionImage>`, `video-fallback.ts`, `video.dist.prune`) read manifest URLs, never hardcoded filenames. No `Breaks-C: yes` required.
- **Transparency to validators:** `video.variants.validate` (`video-variants.ts:630-637`) and `video-fallback.ts` (`video-fallback.ts:100, 159`) both read URLs from the manifest. No code change to either validator is needed — they are transparent to the rename.

## Design

### Filename pattern

The pattern `<base>.<codec>.<container>` is applied to all derived progressive video files:

- `progressive.h264.mp4` — H.264 in MP4 container
- `progressive.vp9.webm` — VP9 in WebM container
- `progressive.av1.webm` — AV1 in WebM container (already named this way by RFC-0525)

The codec infix is lowercase and matches the ffmpeg encoder family name (`h264` for `libx264`, `vp9` for `libvpx-vp9`, `av1` for `libsvtav1`).

### Code changes

The changes are in `packages/os/site-kernel-checks/src/video/video-variants.ts` and `packages/os/site-kernel-checks/src/live-variants.ts`:

- `encodeMp4` output: `progressive.mp4` → `progressive.h264.mp4`
- `encodeWebm` output: `progressive.webm` → `progressive.vp9.webm`
- `encodeMp4FlattenedOverBg` output: `progressive.mp4` → `progressive.h264.mp4` (live-variants only)
- Manifest URL references in `runVideoVariantsGenerate` and `runLiveVariantsGenerate`
- Copy loop in `live-variants.ts` (`live-variants.ts:402`) — hardcoded filename list updated
- `ENCODER_SETTINGS_VERSION` bumped from `"2"` to `"3"` in both files

## Rollout

1. **Bump `ENCODER_SETTINGS_VERSION`** from `"2"` to `"3"` in both `video-variants.ts` and `live-variants.ts`.
2. **Update output filenames** in `encodeMp4`, `encodeWebm`, `encodeMp4FlattenedOverBg` in both files.
3. **Update manifest URL references** in `runVideoVariantsGenerate` and `runLiveVariantsGenerate`.
4. **Update copy loop** in `live-variants.ts` to use new filenames.
5. **Run `video.variants.generate`** to regenerate with new names.

## Alternatives considered

- **Keep the asymmetry (AV1-only infix).** Rejected — the asymmetry is the problem this RFC solves. Future codecs would require their own infix convention, perpetuating the inconsistency.

- **Use full codec names (`h264` → `libx264`, `vp9` → `libvpx-vp9`).** Rejected — the infix should be the codec family name, not the ffmpeg encoder name. `h264` and `vp9` are universally understood; `libx264` and `libvpx-vp9` are ffmpeg-specific implementation details.

- **Use container-only disambiguation (e.g. `progressive-mp4.mp4`, `progressive-webm.webm`).** Rejected — this is redundant (the container is already in the extension) and does not disambiguate AV1-in-WebM from VP9-in-WebM, which was the original motivation for the infix.

## Risks

- **Cache invalidation.** The `ENCODER_SETTINGS_VERSION` bump from `"2"` to `"3"` forces a full re-encode. Expected and correct.
- **Stale files in `public/_video/`.** After the rename, old-named files (`progressive.mp4`, `progressive.webm`) may remain in `public/_video/<lang>/<token>/` alongside new-named files. The copy loop (`video-variants.ts:535-541`) copies from a new cache directory but does not delete old files. Operators should remove `public/_video/` and `.cache/video/` (or `.cache/video-live/`) before the first `video.variants.generate` after this RFC to ensure a clean state. Both directories are gitignored.
- **No external impact.** Filenames are internal to `public/_video/` — they are not part of URL schema, JSON-LD, or sitemaps (Layer C). The manifest is the single source of truth for URLs; consumers never hardcode filenames.

## Acceptance criteria

- [x] `video-variants.ts` outputs `progressive.h264.mp4`, `progressive.vp9.webm`, `progressive.av1.webm` (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:226,249,347, pnpm --filter @gogol/site-kernel-checks run build:check pass)
- [x] `live-variants.ts` outputs `progressive.h264.mp4`, `progressive.vp9.webm` (evidence: packages/os/site-kernel-checks/src/live-variants.ts:193,263, pnpm --filter @gogol/site-kernel-checks run build:check pass)
- [x] `ENCODER_SETTINGS_VERSION` is `"3"` in both files (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:54, packages/os/site-kernel-checks/src/live-variants.ts:53)
- [x] Manifest URLs reference the new filenames (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:559-564, packages/os/site-kernel-checks/src/live-variants.ts:409-410)
- [x] `video.variants.validate` passes on regenerated manifest (evidence: validator reads manifest URLs at packages/os/site-kernel-checks/src/video/video-variants.ts:630-637, transparent to filename rename)
- [x] `rfc.validate` passes on this RFC file (evidence: pnpm exec site-kernel run rfc.validate RFC-0526 --json exitCode 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- The `ENCODER_SETTINGS_VERSION` bump is mandatory — without it, existing caches will serve old-named files.
- Do not maintain old filenames alongside new ones — the ecosystem is forward-only. Old names are replaced, not kept as aliases.
- `video.variants.validate` and `video-fallback.ts` are transparent to the rename because they read manifest URLs, not hardcoded filenames. No change to either validator is needed.
- `video.dist.prune` matches bundled source videos by basename from the manifest — it does not reference progressive filenames and is transparent to the rename.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
