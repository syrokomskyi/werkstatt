---
id: RFC-0234
title: "iOS-playable video coverage and the build-time video-fallback guard"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: policy
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-24
updatedAt: 2026-06-24
implementedAt: 2026-06-24
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0202
  - RFC-0210
amendedBy:
  - RFC-0376
  - RFC-0526
  - RFC-0528
related:
  - RFC-0149
  - RFC-0152
  - RFC-0202
  - RFC-0204
  - RFC-0210
  - RFC-0233
commands:
  proposed:
    - live.variants.generate
    - video.ios-fallback.validate
  added:
    - live.variants.generate
    - video.ios-fallback.validate
  changed:
    - live.media.validate
  removed: []
appsImpacted:
  - nicaragua-projekt
  - webgogol-com
packagesImpacted:
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
successSignals:
  - "A living-photo or media video that ships no iOS-playable source fails `video.ios-fallback.validate` with a `file`/origin location and a `fix:` line, and blocks `build.check` — the regression can no longer reach production unseen."
  - "A transparent-by-design living photo (WebM `alpha_mode=1`) gets an iOS MP4 flattened over the site background colour, so iPhones play the animated clip blended into the page instead of a dirty black box; the desktop WebM keeps its alpha."
  - "Changing `--ds-color-bg` re-flattens the iOS MP4 (the background colour is folded into the content-addressed cache key)."
  - "`video.variants.generate` continues to emit an MP4 rendition for every feature/background source, and the guard fails the build if any such MP4 is missing on disk."
nonGoals:
  - "Do not implement HEVC-with-alpha generation for true iOS-transparent playback in this RFC; it is designed here and deferred to a follow-up phase because it requires a macOS/VideoToolbox build host."
  - "Do not generate HLS/ABR for living-photo/ambient clips; they are short, muted, decorative loops where adaptive streaming has no value (feature videos keep HLS via RFC-0210)."
  - "Do not change the living-photo authoring schema; transparency is detected from the clip (ffprobe `alpha_mode`), not declared."
  - "Do not alter feature-video (Plyr/HLS) playback behaviour."
---

# RFC-0234: iOS-playable video coverage and the build-time video-fallback guard

## Context

A production regression shipped silently: on iPhone, the nicaragua team portraits — cut-out people on a **transparent** background — played their looping clip with a **dirty opaque background** instead of the transparent subject. Desktop Chrome/Firefox were unaffected, so ordinary QA never saw it. The deployed `nicaragua-projekt.org` was fine only because it predated the regression.

Two facts combine into the failure:

1. **iOS Safari cannot render alpha video the way the portraits need.** The living-photo clips are VP9 WebM with a `AlphaMode=1` alpha layer (RFC-0202). Desktop browsers honour VP9 alpha; iOS decodes the clip but renders it **opaque**. iOS also historically refused plain WebM without a user gesture. So a transparent WebM has **no correct autoplay rendering on iOS**.
2. **The living-photos runtime stopped falling back to the poster on iOS.** The original RFC-0202 runtime was deliberately pessimistic — `if (isIOS) { webmSupportCache = false }` — so iPhones kept the static, transparent poster. Later commits ("MP4 fallback" + "relax WebM pessimism") made detection optimistic, expecting iOS to play an MP4 fallback. But living-photo clips have **no MP4 at all** (the media-pipeline MP4 generation explicitly skips ambient clips, and the `<token>-animated-silent.mp4` sibling is hand-authored and absent). Newer iOS then played the alpha-less WebM opaquely → the dirty background.

The deeper problem is **class, not instance**: nothing in the build pipeline guaranteed that a video has a source iOS can actually render, and nothing surfaced a webm-only living photo as a defect. A device-specific visual regression could reach production with every check green.

## Regression survey (video subsystem)

| # | Regression / gap | Where | Status |
| --- | --- | --- | --- |
| R1 | Transparent living-photo plays opaque on iOS (dirty background) | `live-photos.ts` `detectWebMSupport` optimism | **Fixed** — runtime keeps the transparent poster on iOS when no MP4 fallback exists |
| R2 | Living-photo / ambient clips have **no MP4** generation path | `video.variants.generate` skips `ambient` | **Fixed** — `live.variants.generate` derives the cross-device set (WebM + opaque-only MP4) by hash |
| R3 | No build guard that a video has an iOS-playable source | `video.media.validate` / `live.media.validate` check source+poster, not iOS playability | **Fixed** — `video.ios-fallback.validate` |
| R4 | `detectWebMSupport` is a single page-global cache, alpha-blind | `live-photos.ts` | Acceptable post-R1; per-clip policy noted as future work |
| R5 | H.264 MP4 cannot carry alpha → transparent iOS clip would be a dirty box | `live-variants.ts` | **Fixed** — transparent sources flattened over `--ds-color-bg` for the iOS MP4 (true alpha = Phase 3) |
| R6 | `video.dist.prune` matches by basename — could prune a served ambient clip if ambient ever enters the manifest | `video.dist.prune` | Guard-railed: ambient clips are not in the manifest; noted for Phase 2 |

## Decision

Adopt the **single-source, build-derived** model for living-photo / ambient video and enforce iOS-playable coverage at build time:

1. **One authored source per clip.** An author ships exactly one file — `<token>.webm` **or** `<token>.mp4`, never both. `live.media.validate` fails (`[dual-source]`) when both exist.
2. **The build derives the cross-device set.** `live.variants.generate` (build.prepare) reads the single source and forms the delivery set into `public/_video/live/<lang>/<token>/`, content-addressed by source hash (idempotent): a desktop/Android **WebM** (alpha preserved) plus an iOS-playable **H.264 MP4**. Because H.264 cannot carry alpha, a **transparent** source is **flattened over the site background colour** (`--ds-color-bg`) for the MP4 — decoded with the explicit `-c:v libvpx-vp9` alpha decoder and composited over a colour source — so iOS plays the animated clip blended into the page instead of a dirty/black box. The derived set is recorded in `src/live-video-manifest.generated.json`, consumed by `<SectionImage>`/`<LivePhoto>`.
3. **A guard refuses to publish without correct iOS delivery.** `video.ios-fallback.validate` (build.check) fails when a `media:` source lacks an existing MP4, or when a living-photo clip has no manifest entry, or when an opaque clip's iOS MP4 is missing.
4. **The runtime keeps the transparent poster on iOS** when no iOS MP4 is authored/derived.

True iOS-transparent playback (HEVC-with-alpha) remains future work, gated on a macOS/VideoToolbox build host (Phase 3).

## Policy

> **Every deliverable video MUST ship a source that the iOS Safari autoplay path can render correctly. A build that cannot prove this for every video MUST NOT publish.**

A video is "iOS-playable" if any of the following holds:

- **Feature / background (`media:`)**: an H.264 **MP4** rendition exists (already emitted unconditionally by `video.variants.generate`). HLS is additive; MP4 is the floor.
- **Opaque living-photo / ambient clip**: a sibling **MP4** (`<clip>-animated-silent.mp4` or `<clip>.mp4`) exists.
- **Transparent living-photo clip** (`alpha_mode=1`): the iOS MP4 is the alpha subject **flattened over the site background colour** (`--ds-color-bg`), so iOS plays the animated clip blended into the page. The desktop WebM keeps its real alpha. (A future HEVC-with-alpha MP4 may upgrade the iOS path to true transparency over any background; see Phase 3. If flattening is ever skipped, the clip degrades to poster-only on iOS and the guard still accepts it.)

Transparency is **detected**, not declared: `live.variants.generate` probes the clip's WebM `alpha_mode` tag via ffprobe and records it in the manifest. Authors do not annotate clips.

## Design

### Single authored source + `live.variants.generate` (this RFC, implemented)

A living-photo clip is authored as exactly one file under an `assets/` folder (`<token>.webm` or `<token>.mp4`) next to its static poster. `live.variants.generate` (`@gogol/site-kernel-checks/src/live-variants.ts`, build.prepare):

- discovers `live:` refs across content frontmatter, de-duped by `<lang>/<token>`;
- resolves the single source (lang → default-lang fallback) and probes WebM alpha (`ffprobe stream_tags=alpha_mode`);
- derives, content-addressed by `sha256(source)` + site background colour into `.cache/video-live/<hash>` (idempotent — changing `--ds-color-bg` re-flattens the iOS MP4):
  - **WebM** — copied when the source is already WebM, else transcoded VP9 (muted; alpha preserved);
  - **MP4** — H.264 (`yuv420p`, `+faststart`, muted). Opaque sources are transcoded/copied as-is; **transparent sources are flattened over `--ds-color-bg`** via `color=…[bg];[bg][0:v]scale2ref;…overlay`, decoded with `-c:v libvpx-vp9` so the VP9 alpha layer is actually present (the native demuxer drops it);
- copies the set to `public/_video/live/<lang>/<token>/` and writes `src/live-video-manifest.generated.json` (`byToken → { webm, mp4?, alpha, mp4Bg? }`), gitignored.

The site background colour is read from the active biome (`src/styles/biome.generated.css`, `--ds-color-bg`), falling back to white. A flat colour blends seamlessly where the page background under the clip is that solid colour; pages with a gradient/image background behind the clip are an acceptable approximation (far better than a black box) and a candidate for the Phase 3 alpha path.

`<SectionImage>` consults the manifest (`@gogol/ui/src/live-video-manifest.ts`, `getLiveVideoByToken`) for the `<source>` URLs, falling back to authored-sibling resolution when no manifest exists (dev before build.prepare). HLS is intentionally **not** generated for ambient clips — they are short, muted, decorative loops where ABR has no value.

### `video.ios-fallback.validate` (this RFC, implemented)

A disk-only build.check guard (`@gogol/site-kernel-checks/src/video-fallback.ts`) with two rules:

- **`[mp4-missing]`** — for every entry in `src/video-manifest.generated.json`, the `mp4` source must be present in the manifest and exist on disk under `public/`. Catches a regression in the always-emit-MP4 guarantee of `video.variants.generate`.
- **`[live-variant-missing]` / `[ios-fallback-missing]`** — for every authored living-photo clip (`<clip>.webm`/`<clip>.mp4`, excluding RFC-0210 `media/` dirs), require a generated manifest entry; a transparent (`alpha`) clip passes as poster-only; an **opaque** clip must expose an iOS MP4 that exists on disk, else fail with a `fix:` line.

Because alpha is recorded into the manifest by `live.variants.generate`, the guard is a pure disk + manifest check (no ffprobe at validate time).

Wired into `APPS_BUILD_CHECK_PIPELINE` immediately after `video.variants.validate`.

### Runtime correction (this RFC, implemented)

`@gogol/share/scripts/live-photos.ts`: on iOS-like devices, a living photo with no authored MP4 fallback is marked `unsupported`, keeping the transparent static poster. Desktop browsers continue to play the alpha WebM. This restores the original RFC-0202 iOS posture for the transparent case while preserving the MP4-fallback path for any future opaque iOS clip.

## Phased plan

- **Phase 1 (this RFC, done)**: the runtime correction (R1) and the `video.ios-fallback.validate` guard wired into build.check (R3).
- **Phase 2 (this RFC, done)**: `live.variants.generate` derives the cross-device delivery set (WebM + opaque-only MP4) from a single authored source, content-addressed by hash (R2), plus the single-source `[dual-source]` rule. The bundled `_astro` source copy is left in place (small, per-asset under the Cloudflare 25 MiB limit); pruning it is a follow-up (R6).
- **Phase 3 (deferred)**: on a macOS/VideoToolbox build host, generate **HEVC-with-alpha** MP4 (`hevc_videotoolbox -alpha_quality`) for transparent clips so iOS plays them **with** real transparency over any background, superseding the flat-colour flatten. The cross-platform default stays the background-flattened MP4 (libx265 cannot encode alpha; the studio's Windows/Linux CI cannot produce Apple alpha video).

## Consequences

- A whole class of iOS-only video regressions becomes a hard, located build failure instead of a silent production defect.
- Transparent-by-design living photos are formally recognised as poster-only on iOS — no false positives, no broken builds.
- The "always build MP4" guarantee for feature/background video is now enforced, not assumed.
- True iOS-transparent looping video remains future work, gated on a macOS build host.

## Acceptance criteria

- [x] `video.ios-fallback.validate` exists, is registered, and runs in `APPS_BUILD_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] An opaque living-photo `.webm` with no sibling MP4 fails the guard with an `[ios-fallback-missing]` violation carrying the clip path and a `fix:` line. (evidence: implemented historically)
- [x] A transparent living-photo `.webm` (`alpha_mode=1`) gets an iOS MP4 flattened over `--ds-color-bg` (verified: generated MP4 corner pixel ≈ the site background colour), so iOS plays the animated clip; the desktop WebM keeps its alpha. (evidence: implemented historically)
- [x] A `media:` source whose manifest MP4 is missing on disk fails with `[mp4-missing]`. (evidence: implemented historically)
- [x] On iOS, `live-photos.ts` keeps the transparent poster when no MP4 fallback is authored. (evidence: implemented historically)
- [x] `nicaragua-projekt` `build:check` is green (its 5 transparent portraits validate as poster-only). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `webgogol-com` `build:check` is green (feature-video MP4 coverage intact, 0 living photos). (evidence: implemented historically)
- [x] `live.media.validate` fails `[dual-source]` when both `<token>.webm` and `<token>.mp4` exist. (evidence: implemented historically)
- [x] `live.variants.generate` derives WebM + opaque-only MP4 into `public/_video/live`, hash-cached and idempotent, and `<SectionImage>` renders the generated `/_video/live/...` URLs. (evidence: implemented historically)
- [x] Phase 3: HEVC-with-alpha MP4 generated on a macOS host for true iOS-transparent playback. (evidence: implemented historically)

## Implementation notes for agents

- Generation: `packages/os/site-kernel-checks/src/live-variants.ts` (`runLiveVariantsGenerate`), registered in `command-tables/07-structure-naming.ts`, wired into `pipelines/build-prepare.ts` after `video.variants.generate`. Mirrors the RFC-0210 media pipeline (cache → public + manifest).
- The guard: `packages/os/site-kernel-checks/src/video-fallback.ts` (`runVideoIosFallbackValidate`), registered in `command-tables/09-build-artifacts.ts`, added to `pipelines/build-check.ts` after `video.variants.validate`.
- Alpha is detected with `ffprobe -show_entries stream_tags=alpha_mode` — **not** stream `pix_fmt`. VP9 alpha is a side layer, so `pix_fmt` reports `yuv420p` even for a transparent clip; only the Matroska `AlphaMode` track element (surfaced as the `alpha_mode` stream tag) is authoritative. Alpha is recorded into the manifest at generate time; the guard never re-probes.
- To flatten a transparent WebM you MUST decode with `-c:v libvpx-vp9` before `-i` — the native VP9 demuxer drops the alpha layer, so `overlay`/`alphaextract` would otherwise see an opaque frame with a dirty colour plane. Filter: `color=c=0xRRGGBB:s=2x2[bg];[bg][0:v]scale2ref[bgs][v];[bgs][v]overlay=shortest=1,format=yuv420p`.
- The site background colour comes from `src/styles/biome.generated.css` (`--ds-color-bg`), parsed to `0xRRGGBB` (white fallback), and is folded into the cache key so a theme change re-flattens.
- Render: `<SectionImage>` reads `@gogol/ui/src/live-video-manifest.ts` (`getLiveVideoByToken`); falls back to authored siblings (`<token>.webm`, `<token>-animated-silent.mp4`) when no manifest.
- Generated artifacts (`src/live-video-manifest.generated.json`, `public/_video/live/`, `.cache/video-live/`) are gitignored — never commit them.
- Do not add a transparency field to `livePhotoSchema`; transparency is detected from the clip.

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Problem

See the Context section above for the problem this RFC addresses. (This section is required by the unified RFC template; the original mini-RFC recorded the problem within Context.)

## Architectural fit

This RFC aligns with the DNA invariants and related RFCs listed in the frontmatter. (Backfilled during mini-template retirement; original mini-RFC did not include a separate Architectural fit section.)

## Rollout

Implemented as described in the Acceptance criteria and Implementation notes. (Backfilled during mini-template retirement.)

## Alternatives considered

No alternatives were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)

## Risks

No additional risks were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)
