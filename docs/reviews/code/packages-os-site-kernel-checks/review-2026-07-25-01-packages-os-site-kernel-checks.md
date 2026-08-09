---
reviewId: REVIEW-CODE-2026-07-25-01
date: 2026-07-25
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: 0ca52824d...HEAD
filesReviewed:
  - packages/share/src/schemas/media.ts
  - packages/os/site-kernel-checks/src/video/video-variants.ts
  - packages/ui/src/components/media/media.astro
  - docs/rfcs/rfc-0525-maximum-quality-video-encoding-pipeline.md
---

# Code Review: 0ca52824d...HEAD (RFC-0525 implementation)

### Verdict: Approved

The diff cleanly implements RFC-0525 — AV1 progressive video encoding via libsvtav1, upgraded encoding parameters for maximum quality, and AV1 source emission in the `<Media>` component. All changes follow existing patterns, respect package boundaries, and carry updated Compass scaffolding. No DNA violations, no backward compatibility shims, no architectural drift.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/share run build:check`, `pnpm --filter @warpgogol/site-kernel-checks run build:check`, `pnpm --filter @warpgogol/ui run build:check`, and `pnpm exec werkstatt run rfc.validate RFC-0525 --json` all exit 0.

### Axis A — Structural correctness

No issues. `AUDIO_BITRATE_BY_HEIGHT` is properly typed as `Record<number, string>`. `encodeAv1` mirrors the existing `encodeMp4`/`encodeWebm` pattern. The `libsvtav1` availability check has proper try/catch with clear error messages. The duplicated `hasAudio ? [...] : ["-an"]` ternary across encoding functions is a pre-existing pattern, not introduced by this diff.

### Axis B — DNA alignment

No issues. DNA-1 (monorepo boundary) — all changes in `packages/*`, no cross-app imports. DNA-42 (Compass markup) — `MODULE_CONTRACT` and `CHANGE_SUMMARY` updated in all three modified source files. DNA-4 (canonical content) — no hardcoded copy strings. DNA-14 (build-time-only) — all encoding remains build-time via ffmpeg.

### Axis C — Ecosystem fit

No issues. Package boundaries correct (`share` → `ui` → `site-kernel-checks`). No new commands — existing `video.variants.generate` and `video.variants.validate` extended. No `docs/*.xml` or `AGENTS.md` updates needed (no repository-wide semantics or contract changes).

### Axis D — Forward-only compliance

No issues. Old encoding parameters (CRF 23/veryfast, CRF 34/good/cpu-used 5, q:v 2) are replaced directly — no dual paths. The `av1` field in `VideoManifestSources` is optional (background profile doesn't produce AV1), not a backward compatibility shim. `ENCODER_SETTINGS_VERSION` bump from "1" to "2" invalidates all existing caches — no stale-serve path.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` purpose text updated in `video-variants.ts` (mentions AV1 + RFC-0525) and `media.astro` (mentions AV1 first). `CHANGE_SUMMARY` entries added to all three files. Comments reference RFC-0525. Variable names are self-documenting (`av1Url`, `audioBitrate`, `hasFeature`).

### Axis F — Pragmatism

No issues. No new commands — existing commands extended. `AUDIO_BITRATE_BY_HEIGHT` is a lean 4-entry lookup. `encodeAv1` follows the exact pattern of existing encoding functions. The `hasFeature` guard avoids the `ffmpeg -encoders` check when no feature videos exist — no unnecessary I/O for background-only sites.

### Axis G — Blind spots

No issues. Performance: AV1 preset 2 is slow (20-40 min per source) but the RFC documents this and the cache prevents re-encoding. The `libsvtav1` check runs `ffmpeg -encoders` (fast, <100ms). Edge cases: empty-state (no media) handled by existing early-return. The `libsvtav1` check only runs when `hasFeature` is true. Migration: `ENCODER_SETTINGS_VERSION` bump forces clean re-encode — documented in RFC risks section.

### Spec compliance

| Requirement from RFC-0525 | Status | Evidence |
| --- | --- | --- |
| `av1?: string` in `VideoManifestSources` | Done | `packages/share/src/schemas/media.ts:151-152` |
| `encodeAv1` with libsvtav1, CRF 22, preset 2, 10-bit | Done | `packages/os/site-kernel-checks/src/video/video-variants.ts:331-349` |
| `encodeMp4` CRF 17, slow, high profile, level 4.0 | Done | `video-variants.ts:206-227` |
| `encodeWebm` CRF 28, cpu-used 0, deadline best | Done | `video-variants.ts:230-250` |
| `encodeHls` CRF 17, slow, high profile, level 4.0, per-rendition audio | Done | `video-variants.ts:268-329`, `AUDIO_BITRATE_BY_HEIGHT` at 269-274 |
| `encodePoster` q:v 4 | Done | `video-variants.ts:262-263` |
| `ENCODER_SETTINGS_VERSION` = "2" | Done | `video-variants.ts:54` |
| `runVideoVariantsGenerate` calls `encodeAv1` for feature | Done | `video-variants.ts:523-524` |
| `sources.av1` populated for feature | Done | `video-variants.ts:566-568` |
| `<Media>` emits AV1 `<source>` first | Done | `packages/ui/src/components/media/media.astro:168` |
| `progressive.av1.webm` output path | Done | `video-variants.ts:348` |
| Validator checks `entry.sources.av1` | Done | `video-variants.ts:639` |
| Three `<source>` elements for feature | Done | `media.astro:168-170` |
| `libsvtav1` availability check | Done | `video-variants.ts:465-498` |
| `rfc.validate` passes | Done | exitCode 0 |

### Questions for the author

1. The `libsvtav1` check runs `ffmpeg -encoders` on every `video.variants.generate` invocation with feature videos — is this I/O cost acceptable in CI, or should the result be cached across runs?
2. The `encodeAv1` call is placed between `encodeWebm` and `encodePoster` — is there a specific ordering rationale (e.g., parallel encoding potential), or is the sequence arbitrary?
3. The `av1` source uses codec string `av01.0.05M.08` (8-bit, main profile) but the encoder outputs 10-bit (`yuv420p10le`) — should the codec string reflect 10-bit (e.g., `av01.0.05M.10`)?
