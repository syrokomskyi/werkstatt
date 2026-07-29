---
id: RFC-0591
title: "Add two-pass bitrate-capped MP4 encoding to video.variants.generate"
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
createdAt: 2026-07-29
updatedAt: 2026-07-29
enhancedAt: 2026-07-30
implementedAt: 2026-07-29
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0210
  - RFC-0525
amendedBy: []
related:
  - RFC-0210
  - RFC-0525
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
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@warpgogol/share"
  - "@warpgogol/site-kernel-checks"
successSignals: []
nonGoals:
  - "No two-pass for WebM (VP9) or AV1 — they remain CRF-based (more efficient, rarely exceed 25 MiB)"
  - "No size limit on HLS segments — they are individually small (< 2 MB each)"
  - "No runtime transcoding — build-time only (RFC-0149)"
  - "No change to <source> ordering — AV1 → WebM → MP4 remains (RFC-0525); MP4 is already the last-resort fallback"
  - "No change to the ambient/live-photo pipeline (RFC-0234)"
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

# RFC-0591: Add two-pass bitrate-capped MP4 encoding to video.variants.generate

## Context

RFC-0210 established the unified video playback contract: build-time `video.variants.generate` derives HLS, progressive MP4 (H.264/AAC), progressive WebM (VP9/Opus), optional AV1 (SVT-AV1), and a WebP poster from each authored source video. RFC-0525 upgraded the encoding parameters to "maximum quality": CRF 17, preset `slow` for MP4; CRF 28, `cpu-used 0` for VP9; CRF 22, preset 2 for AV1.

The platform deploys to Cloudflare Pages with a **25 MiB per-asset limit**. Source videos live in a non-bundled `media/` folder; derived files are served from `public/_video/`. The `video.dist.prune` command removes bundled source copies from `dist/client/_astro`, but it does not check the size of derived progressive files in `public/_video/`.

RFC-0525 explicitly acknowledged the size risk in its Risks section:

> The progressive MP4 may exceed the 25 MiB limit for longer content (a 5-minute 1080p video at CRF 17 `slow` can reach 60-100 MB). Mitigation: `video.dist.prune` removes oversized progressive files from the deploy output… For content longer than ~3 minutes at 1080p, the progressive MP4 should be considered a build artifact only (not deployed).

Despite this acknowledgment, no automated size guarantee was implemented. The operator is now hitting this exact problem: a feature video MP4 exceeds 25 MiB and cannot be served by Cloudflare Pages.

## Problem

1. **CRF-based encoding cannot guarantee a specific file size.** CRF (Constant Rate Factor) targets a perceptual quality level, not a bitrate. The output size depends on content complexity, duration, and resolution. A 1080p video at CRF 17 can range from 8 MB (simple content, 30 seconds) to 100+ MB (complex content, 5 minutes).

2. **Progressive MP4 files exceeding 25 MiB are silently produced.** `video.variants.generate` encodes without any size check. The file is copied to `public/_video/` and deployed. Cloudflare Pages rejects assets over 25 MiB, so the MP4 is effectively unreachable in production — but the manifest still references it, and the `<video>` element still lists it as a source.

3. **No operator control over the size/quality tradeoff.** The current pipeline offers no way to say "I need this video under 25 MiB." The only options are: accept CRF 17 (may exceed the limit) or manually pre-compress the source before committing it — which defeats the purpose of the build-time encoding pipeline.

4. **RFC-0525 rejected two-pass encoding for the wrong reason.** RFC-0525's alternatives section states: "Two-pass encoding for MP4 instead of CRF. Rejected — CRF at preset slow with CRF 17 achieves near-lossless quality. Two-pass is for targeting a specific bitrate, not for maximum quality. CRF is the correct mode for quality-first encoding." This reasoning is correct for the _quality-first_ goal of RFC-0525, but it does not address the _size-guarantee_ need that this RFC introduces. The two goals are not mutually exclusive — two-pass with a high enough bitrate cap achieves both.

## Decision

The `video.variants.generate` command switches progressive MP4 encoding from single-pass CRF to **two-pass with a target bitrate calculated from the source duration and a configurable size cap**. A new optional `maxSizeMb` field is added to `mediaSchema` (default: 24 MiB, providing a 1 MiB safety margin under Cloudflare's 25 MiB limit). When `maxSizeMb` is set to `0`, the encoder falls back to the current CRF 17 behavior.

The target video bitrate is calculated as:

```
target_size_bits = maxSizeMb * 1024 * 1024 * 8
audio_bitrate_bps = 128_000  (128k AAC)
video_bitrate_bps = (target_size_bits / duration_sec) - audio_bitrate_bps
```

WebM (VP9) and AV1 (SVT-AV1) progressive encoding remains CRF-based — they are significantly more efficient than H.264 and rarely exceed the 25 MiB limit at their current CRF settings. HLS segments remain unchanged (individually small). The `<source>` ordering in `<Media>` remains AV1 → WebM → MP4 (RFC-0525) — MP4 is already the last-resort fallback.

## Architectural fit

- **RFC-0210 (unified video playback contract):** This RFC amends RFC-0210 by changing the MP4 encoding strategy from CRF to two-pass bitrate-capped. The manifest schema, cache strategy, and component architecture remain unchanged. The `ENCODER_SETTINGS_VERSION` bump ensures all existing caches are invalidated.
- **RFC-0525 (maximum-quality video encoding pipeline):** This RFC amends RFC-0525 by replacing the CRF 17 `slow` MP4 encoding with two-pass bitrate-capped encoding. The quality-first philosophy of RFC-0525 is preserved for WebM and AV1 (which stay CRF-based). The MP4 becomes a size-guaranteed fallback rather than a maximum-quality primary.
- **RFC-0149 (build-time-only processing):** No change — all encoding remains build-time via ffmpeg. No runtime transcoding.
- **Cloudflare 25 MiB asset limit:** This RFC provides a deterministic guarantee that progressive MP4 files never exceed the limit, closing the gap that RFC-0525 identified but did not address.
- **`<Media>` source ordering (RFC-0525):** Unchanged. AV1 → WebM → MP4. Browsers that support AV1 or VP9 get the higher-quality progressive format; MP4 is the last-resort fallback for browsers without WebM/AV1 support (primarily old Safari and iOS). The size cap ensures this fallback is always deployable.

## Design

### CLI surface

No new command. The existing command behavior changes:

```sh
pnpm exec site-kernel run video.variants.generate --site <app>
```

No new flags. The `maxSizeMb` parameter is read from frontmatter `media:` configs.

### Frontmatter schema change

`mediaSchema` in `packages/share/src/schemas/media.ts` gains an optional `maxSizeMb` field:

```ts
export const mediaSchema = z.object({
  // ... existing fields ...
  /**
   * Maximum size of the progressive MP4 file in MiB. When set, MP4 encoding switches
   * to two-pass with a target bitrate calculated from the source duration. Default: 24
   * (1 MiB safety margin under Cloudflare's 25 MiB per-asset limit). Set to 0 to disable
   * two-pass and use CRF 17 (no size guarantee — may exceed the Cloudflare limit).
   */
  maxSizeMb: z.number().nonnegative().optional(),
})
```

### Bitrate calculation

```ts
const AUDIO_BITRATE_BPS = 128_000; // 128k AAC
const DEFAULT_MAX_SIZE_MB = 24;
const MIN_VIDEO_BITRATE_BPS = 200_000; // 200 kbps — below this, warn

function calculateTargetBitrate(
  durationSec: number,
  maxSizeMb: number,
): { videoBitrate: number; audioBitrate: number } | null {
  if (maxSizeMb <= 0 || !durationSec || durationSec <= 0) return null; // → CRF fallback
  const targetSizeBits = maxSizeMb * 1024 * 1024 * 8;
  const videoBitrate = Math.floor(targetSizeBits / durationSec) - AUDIO_BITRATE_BPS;
  return { videoBitrate, audioBitrate: AUDIO_BITRATE_BPS };
}
```

When `videoBitrate < MIN_VIDEO_BITRATE_BPS`, the encoder logs a warning but still encodes at the calculated bitrate. The operator can then shorten the video, increase `maxSizeMb`, or accept the low quality.

### Two-pass MP4 encoding

`encodeMp4` is rewritten to accept `durationSec` and `maxSizeMb`:

```ts
async function encodeMp4(
  source: string,
  outDir: string,
  hasAudio: boolean,
  durationSec: number | undefined,
  maxSizeMb: number,
): Promise<void> {
 const target = calculateTargetBitrate(durationSec ?? 0, maxSizeMb);

  // CRF fallback: maxSizeMb is 0 or duration is unknown
  if (!target) {
    const audio = hasAudio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"];
    await ffmpeg([
      "-i", source,
      "-c:v", "libx264",
      "-crf", "17",
      "-preset", "medium",
      "-profile:v", "high",
      "-level", "4.0",
      "-pix_fmt", "yuv420p",
      ...audio,
      "-movflags", "+faststart",
      join(outDir, "progressive.h264.mp4"),
    ]);
    return;
  }

  if (target.videoBitrate < MIN_VIDEO_BITRATE_BPS) {
    logger.warn(
      `encodeMp4: calculated video bitrate ${target.videoBitrate} bps is below ` +
      `minimum ${MIN_VIDEO_BITRATE_BPS} bps — quality will be low. ` +
      `Consider shortening the video or increasing maxSizeMb.`
    );
  }

  const audio = hasAudio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"];
  const videoBitrateStr = `${Math.round(target.videoBitrate / 1000)}k`;
  const passLog = join(outDir, "ffmpeg2pass.log");

  // Pass 1
  await ffmpeg([
    "-i", source,
    "-c:v", "libx264",
    "-b:v", videoBitrateStr,
    "-preset", "medium",
    "-profile:v", "high",
    "-level", "4.0",
    "-pix_fmt", "yuv420p",
    "-pass", "1",
    "-passlogfile", passLog,
    "-an",
    "-f", "null",
    "/dev/null",
  ]);

  // Pass 2
  await ffmpeg([
    "-i", source,
    "-c:v", "libx264",
    "-b:v", videoBitrateStr,
    "-preset", "medium",
    "-profile:v", "high",
    "-level", "4.0",
    "-pix_fmt", "yuv420p",
    "-pass", "2",
    "-passlogfile", passLog,
    ...audio,
    "-movflags", "+faststart",
    join(outDir, "progressive.h264.mp4"),
  ]);
}
```

### Cache hash change

`hashFileForProfile` includes `maxSizeMb` in the hash input so that changing `maxSizeMb` invalidates the cache for that source:

```ts
async function hashFileForProfile(
  file: string,
  profile: MediaProfile,
  ladder: number[],
  posterTime: number,
  av1: boolean,
  maxSizeMb: number,
): Promise<string> {
  const bytes = await readFile(file);
  return byteHash(
    Buffer.concat([
      bytes,
      Buffer.from(
        `|${profile}|${ladder.join(",")}|p${posterTime}|av1=${av1}|max=${maxSizeMb}|v${ENCODER_SETTINGS_VERSION}`,
      ),
    ]),
  ).slice(("sha" + "256:").length).slice(0, 16);
}
```

### `ENCODER_SETTINGS_VERSION` bump

```ts
const ENCODER_SETTINGS_VERSION = "5"; // was "4"
```

This invalidates all existing `.cache/video/<hash>/.done` markers, forcing a full re-encode on the next `video.variants.generate`.

### `MediaRef` and `RawMediaConfig` changes

```ts
interface RawMediaConfig {
  // ... existing fields ...
  maxSizeMb?: number;
}

interface MediaRef {
  // ... existing fields ...
  maxSizeMb: number; // resolved default: 24
}
```

In `runVideoVariantsGenerate`, `ref.maxSizeMb` is resolved as `cfg.maxSizeMb ?? DEFAULT_MAX_SIZE_MB` and passed to `encodeMp4` alongside `probe.durationSec`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/schemas/media.ts` | Add `maxSizeMb` field to `mediaSchema` |
| `packages/os/site-kernel-checks/src/video/video-variants.ts` | Rewrite `encodeMp4` for two-pass; add bitrate calculation; bump `ENCODER_SETTINGS_VERSION`; update `hashFileForProfile`, `MediaRef`, `RawMediaConfig` |
| `.cache/video/<hash>/` | Cache entries invalidated by version bump |
| `public/_video/<lang>/<token>/progressive.h264.mp4` | Output — size now guaranteed ≤ `maxSizeMb` MiB |

### Failure modes

- **`ffprobe` fails to determine duration:** `durationSec` is `undefined`. The encoder falls back to CRF 17 (no size guarantee) and logs a warning. The build does not fail — a missing duration is not a fatal condition.
- **Calculated bitrate below 200 kbps:** The encoder logs a warning but proceeds. The operator is expected to shorten the video or increase `maxSizeMb`. This is a warning, not a failure — failing would block builds with long content that has no shorter alternative.
- **`maxSizeMb: 0` explicitly set:** Two-pass is disabled, CRF 17 is used. No size guarantee. This is the operator's explicit choice — no warning is emitted.
- **Two-pass encoding fails (ffmpeg error):** The command fails with the existing ffmpeg error handling (exit code 1). The two-pass log file is left in the cache dir for debugging.

## Rollout

1. **Bump `ENCODER_SETTINGS_VERSION` to `"5"`** in `video-variants.ts`.
2. **Add `maxSizeMb` field to `mediaSchema`** in `packages/share/src/schemas/media.ts`.
3. **Rewrite `encodeMp4`** to accept `durationSec` and `maxSizeMb`, implementing two-pass with calculated bitrate.
4. **Update `hashFileForProfile`** to include `maxSizeMb` in the hash input.
5. **Update `MediaRef` and `RawMediaConfig`** to carry `maxSizeMb`.
6. **Update `runVideoVariantsGenerate`** to resolve `maxSizeMb` from frontmatter (default 24) and pass it to `encodeMp4`.
7. **Run `video.variants.generate`** on all sites with authored videos to regenerate derived files with the new two-pass encoding.
8. **Verify** that progressive MP4 files are ≤ 24 MiB for all authored videos.

**Default behavior:** `maxSizeMb` defaults to 24 — two-pass is always on. Existing apps automatically comply without any frontmatter changes. The `ENCODER_SETTINGS_VERSION` bump forces a full re-encode on the next build.

**Opt-out:** An operator who needs maximum quality and is willing to handle the size separately can set `maxSizeMb: 0` to restore CRF 17 behavior.

## Alternatives considered

- **CRF with `-maxrate` and `-bufsize` (constrained CRF).** This caps the peak bitrate but does not guarantee a total file size. For long content with complex scenes, the file can still exceed the target. Rejected — the operator needs a deterministic size guarantee, not a peak-bitrate cap.

- **Post-encode size check with re-encode at higher CRF.** Encode at CRF 17, check the file size, and if it exceeds 25 MiB, re-encode at CRF 20, then CRF 23, etc. Rejected — this is iterative and unpredictable (may require 3+ encode passes), and the final size is still not guaranteed. Two-pass with a calculated bitrate is deterministic in a single iteration.

- **Apply two-pass to all progressive formats (MP4, WebM, AV1).** Rejected — VP9 and AV1 are significantly more efficient than H.264 and rarely exceed 25 MiB at their current CRF settings. Adding two-pass for VP9/AV1 increases complexity (different two-pass syntax) without practical benefit. If a future VP9/AV1 file exceeds the limit, this can be extended.

- **Global `maxSizeMb` in `system.md` instead of per-media frontmatter.** Rejected — different videos may need different size constraints (e.g., a short hero background vs. a long feature video). Per-media-config is more flexible. A global default of 24 MiB is already built into the field default.

- **Keep CRF 17 and rely on `video.dist.prune` to remove oversized MP4s.** Rejected — `video.dist.prune` removes bundled source copies from `dist/client/_astro`, not derived files from `public/_video/`. Removing the progressive MP4 from the deploy would leave the `<video>` element with a broken source reference. The size must be guaranteed at encode time, not patched post-hoc.

## Risks

- **Quality reduction for long content.** Two-pass at a calculated bitrate produces lower quality than CRF 17 for content where CRF 17 would have fit under 25 MiB. For a 72-second 1080p video at 24 MiB, the calculated bitrate is ~2.5 Mbps — which is visually good but below CRF 17 quality. This is the intended tradeoff: size guarantee over maximum quality. The AV1 and WebM progressive sources (which stay CRF-based) provide higher quality for browsers that support them; the MP4 is the size-guaranteed fallback.

- **Two-pass encoding is slower.** Two-pass requires two full encode passes instead of one. For a 72-second 1080p video at preset `medium`, this roughly doubles the MP4 encode time (from ~30 seconds to ~60 seconds). This is acceptable because encoding is cached and only runs once per source change.

- **Very long videos produce very low quality MP4.** A 10-minute video at 24 MiB yields ~300 kbps video bitrate — watchable but noticeably degraded. The warning at < 200 kbps surfaces this, but the operator must act on the warning. Mitigation: the operator can increase `maxSizeMb` for specific videos or shorten the content.

- **`ffprobe` duration missing.** If `ffprobe` fails to report duration, the encoder falls back to CRF 17 without a size guarantee. This is rare (ffprobe reliably reports duration for valid MP4/WebM files) but possible with corrupted sources. The fallback ensures the build does not fail.

- **Duration rounding precision.** The existing `ffprobe` implementation rounds duration to the nearest integer (`Math.round(Number(json.format.duration))`). The bitrate calculation uses this rounded `durationSec`, introducing up to ~0.7% error in the target bitrate. For a 72.5-second video, `durationSec` becomes 73, slightly lowering the bitrate. This is acceptable: the 1 MiB safety margin (24 MiB target vs 25 MiB limit) absorbs this variance, and two-pass libx264 is accurate to 1–2% of the target bitrate, so the actual file size stays within 23.5–24.5 MiB.

- **Stale pass-log on interrupted encode.** If pass 1 succeeds but pass 2 crashes (or the build is interrupted), `ffmpeg2pass.log` remains in the cache dir without a `.done` marker. The next run re-encodes from scratch — pass 1 overwrites the stale log file. This is self-healing: no manual cleanup is needed.

- **Two-pass encoding accuracy.** Two-pass libx264 with `-b:v` targets the average bitrate but the actual file size may deviate by 1–2%. For a 24 MiB target, this means the actual file may be 23.5–24.5 MiB — still under the 25 MiB Cloudflare limit. The 1 MiB safety margin (24 vs 25) accounts for this variance.

- **Cache invalidation.** The `ENCODER_SETTINGS_VERSION` bump from `"4"` to `"5"` invalidates all existing `.cache/video` entries. The first `video.variants.generate` after implementation re-encodes every source. This is expected and correct.

- **Agent misinterpretation.** Agents might think `maxSizeMb` applies to WebM or AV1. The `nonGoals` section and the Design section explicitly state it applies only to progressive MP4. Agents might also think setting `maxSizeMb: 0` is the default — it is not; the default is 24.

## Acceptance criteria

- [x] `mediaSchema` has an optional `maxSizeMb: z.number().nonnegative()` field in `packages/share/src/schemas/media.ts` (evidence: packages/share/src/schemas/media.ts:89, `z.number().nonnegative().optional()`)
- [x] `encodeMp4` in `video-variants.ts` uses two-pass with calculated bitrate when `maxSizeMb > 0` and `durationSec` is known (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:280-330, pass 1 + pass 2 with `-b:v`)
- [x] `encodeMp4` falls back to CRF 17 when `maxSizeMb === 0` or `durationSec` is undefined (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:244-266, CRF fallback path when `calculateTargetBitrate` returns null)
- [x] `calculateTargetBitrate` correctly computes `videoBitrate = (maxSizeMb * 1024 * 1024 * 8 / durationSec) - 128000` (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:222-231, PBT formula-correctness test passes)
- [x] Warning is logged when calculated video bitrate < 200 kbps (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:269-275, `logger?.warn(...)` when `videoBitrate < MIN_VIDEO_BITRATE_BPS`)
- [x] `ENCODER_SETTINGS_VERSION` is bumped to `"5"` (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:56)
- [x] `hashFileForProfile` includes `maxSizeMb` in the hash input (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:483, `|max=${maxSizeMb}|` in hash string)
- [x] `MediaRef` and `RawMediaConfig` carry `maxSizeMb` (default 24) (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:82,117, `maxSizeMb: number` on MediaRef, `maxSizeMb?: number` on RawMediaConfig; default 24 at line 534)
- [x] `runVideoVariantsGenerate` resolves `maxSizeMb` from frontmatter and passes it to `encodeMp4` (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:534,639, `cfg.maxSizeMb ?? DEFAULT_MAX_SIZE_MB` → `encodeMp4(... ref.maxSizeMb, ctx.logger)`)
- [x] The cache→public copy loop skips `ffmpeg2pass.log*` files alongside `.done` (the pass-log file must not be deployed) (evidence: packages/os/site-kernel-checks/src/video/video-variants.ts:658, `if (entry.name.startsWith("ffmpeg2pass.log")) continue;`)
- [x] `calculateTargetBitrate` is covered by property-based tests (`*.pbt.test.ts`) verifying: `videoBitrate = (maxSizeMb * 1024 * 1024 * 8 / durationSec) - 128000`, monotonicity in `maxSizeMb`, inverse proportionality to `durationSec` (DNA-41) (evidence: packages/os/site-kernel-checks/src/video/video-variants.pbt.test.ts, 6 PBT properties all pass)
- [x] `rfc.validate` passes on this RFC file (evidence: `pnpm exec site-kernel run rfc.validate RFC-0591 --json` → status: pass, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- The `ENCODER_SETTINGS_VERSION` bump is mandatory — without it, existing caches will serve stale CRF-17 encodes.
- The `maxSizeMb` field in `mediaSchema` is optional with default 24. Do not make it required — existing frontmatter without `maxSizeMb` must continue to parse and get the default.
- Two-pass encoding applies to progressive MP4 only. Do not change `encodeWebm` or `encodeAv1`.
- The `maxSizeMb: 0` opt-out must be respected — it disables two-pass and uses CRF 17. No warning is emitted in this case (it is the operator's explicit choice).
- The two-pass log file (`ffmpeg2pass.log`) is written to the cache dir and is not copied to `public/_video/` (the copy loop skips `.done` but should also skip `ffmpeg2pass.log*`).
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
