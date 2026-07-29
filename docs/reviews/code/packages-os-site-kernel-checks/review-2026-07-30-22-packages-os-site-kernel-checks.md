---
reviewId: REVIEW-CODE-2026-07-30-01
date: 2026-07-30
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 458a5cb...HEAD
filesReviewed:
  - packages/share/src/schemas/media.ts
  - packages/os/site-kernel-checks/src/video/video-variants.ts
  - packages/os/site-kernel-checks/src/video/video-variants.pbt.test.ts
---

# Code Review: 458a5cb...HEAD (RFC-0591 implementation)

### Verdict: Needs revision

The implementation is architecturally sound and DNA-compliant. Two minor findings: a duplicated ffmpeg argument list between pass 1 and pass 2 that invites drift, and a pass-log cleanup path that tries only two specific filenames while ffmpeg may produce additional suffixes.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/share run build:check` and `pnpm --filter @warpgogol/site-kernel-checks run build:check` both pass. PBT tests pass (6 properties, 579 passed). Pre-existing `workspace-write-boundary.test.ts` failure in `compass-audit.ts` is unrelated to this diff.

### Axis A — Structural correctness

1. **Duplicated Code (Fowler).** The ffmpeg argument list for pass 1 and pass 2 in `encodeMp4` (`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-checks/src/video/video-variants.ts:281-304` and `:307-330`) shares the same encoder settings (`-c:v libx264 -b:v <bitrate> -preset medium -profile:v high -level 4.0 -pix_fmt yuv420p -passlogfile <prefix>`) but duplicates them inline. If a setting changes (e.g. preset, profile), one pass could drift from the other. Extract the shared args into a local array and spread it into both pass invocations.

2. **Pass-log cleanup incomplete.** The cleanup at line 333 tries `ffmpeg2pass-0.log` and `ffmpeg2pass.log`, but ffmpeg with `-passlogfile` may produce `ffmpeg2pass-0.log.mbtree` or other auxiliary files depending on the encoder. The copy loop at line 658 correctly uses `startsWith("ffmpeg2pass.log")` which catches all variants, but the explicit `unlink` cleanup at line 333 does not. This is minor since the copy loop is the real safety net, but the cleanup should either use `readdir` + filter or be removed (the copy loop already handles it).

### Axis B — DNA alignment

No issues. No DNA invariants are touched by this diff. `ENCODER_SETTINGS_VERSION` bump is a cache invalidation mechanism, not a DNA change. The `calculateTargetBitrate` export follows DNA-41 (PBT coverage) — the test file at `video-variants.pbt.test.ts` covers formula correctness, monotonicity, inverse proportionality, null cases, and constant audio bitrate.

### Axis C — Ecosystem fit

No issues. Package boundaries are correct: schema in `@warpgogol/share`, encoding logic in `@warpgogol/site-kernel-checks`. No new commands — `video.variants.generate` is an existing command with a changed implementation. No AGENTS.md updates needed (the module is not listed in the package's module table).

### Axis D — Forward-only compliance

No issues. The old CRF-17-only `encodeMp4` is fully replaced. No dual-path or flag-gated legacy behavior. The CRF fallback is a legitimate behavior (when `maxSizeMb === 0` or duration is unknown), not a compatibility shim. `ENCODER_SETTINGS_VERSION` bump from `"4"` to `"5"` invalidates all existing caches — no cache migration path is maintained.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding updated in both modified source files. New PBT test file carries full Compass scaffolding. `calculateTargetBitrate` is exported and documented with its formula. Variable names are clear (`videoBitrateStr`, `passLogPrefix`, `target`). The `logger?.warn` call carries enough context for debugging.

### Axis F — Pragmatism

No issues. The change is minimal: one optional schema field, one function rewrite, one pure function extraction, one hash input extension, one version bump. No new commands, no new packages. The `calculateTargetBitrate` export is justified by the PBT testing requirement (DNA-41) — it needs to be importable from the test file.

### Axis G — Blind spots

No issues. Performance impact is documented in the RFC (two-pass roughly doubles MP4 encode time). Edge cases are handled: `maxSizeMb === 0` (opt-out), `durationSec` undefined (ffprobe failure), `videoBitrate < 200 kbps` (warning), interrupted encode (self-healing via stale log overwrite). The copy loop safety net prevents pass-log files from being deployed.

### Spec compliance

| Requirement from RFC-0591 | Status | Evidence |
| --- | --- | --- |
| `maxSizeMb` optional field in `mediaSchema` | Done | `media.ts:89` |
| Two-pass with calculated bitrate when `maxSizeMb > 0` | Done | `video-variants.ts:280-330` |
| CRF 17 fallback when `maxSizeMb === 0` or no duration | Done | `video-variants.ts:244-266` |
| `calculateTargetBitrate` formula | Done | `video-variants.ts:222-231`, PBT verified |
| Warning at < 200 kbps | Done | `video-variants.ts:269-275` |
| `ENCODER_SETTINGS_VERSION` bumped to `"5"` | Done | `video-variants.ts:56` |
| `hashFileForProfile` includes `maxSizeMb` | Done | `video-variants.ts:483` |
| `MediaRef`/`RawMediaConfig` carry `maxSizeMb` | Done | `video-variants.ts:82,117` |
| `runVideoVariantsGenerate` resolves and passes `maxSizeMb` | Done | `video-variants.ts:534,639` |
| Copy loop skips `ffmpeg2pass.log*` | Done | `video-variants.ts:658` |
| PBT coverage for `calculateTargetBitrate` | Done | `video-variants.pbt.test.ts`, 6 properties |

### Questions for the author

1. The pass-log cleanup at line 333 tries only `ffmpeg2pass-0.log` and `ffmpeg2pass.log`. Should it use `readdir` + `startsWith("ffmpeg2pass.log")` filter instead, to catch all auxiliary files (e.g. `.mbtree`)?
2. The shared ffmpeg args between pass 1 and pass 2 are duplicated. Should they be extracted into a local array to prevent drift if encoder settings change in the future?
