---
id: RFC-0210
title: "Unified video & living-photo playback contract with build-time HLS/MP4/WebM generation"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-19
updatedAt: 2026-06-19
implementedAt: 2026-06-20
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0202
amendedBy:
  - RFC-0234
  - RFC-0376
  - RFC-0525
  - RFC-0526
  - RFC-0528
  - RFC-0591
  - RFC-0834
related:
  - DNA-04
  - DNA-15
  - RFC-0011
  - RFC-0104
  - RFC-0106
  - RFC-0141
  - RFC-0152
  - RFC-0170
  - RFC-0175
  - RFC-0202
  - RFC-0204
commands:
  proposed:
    - video.media.validate
    - video.variants.generate
    - video.variants.validate
  added:
    - video.media.validate
    - video.variants.generate
    - video.variants.validate
  changed:
    - live.media.validate
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/content-source"
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
successSignals:
  - "An author drops a single `promo.mp4` (or `.webm`) into a thin site's content assets, declares a media config, and the build derives every format the chosen profile needs (HLS ABR ladder + MP4 fallback + optional WebM for feature; WebM+MP4 for ambient/background) — no format written by hand, no clip path in markdown for living photos."
  - "Transcoding is content-addressed: an unchanged source+profile+encoder-settings is never re-encoded. A cold deploy built from a warm cache does zero ffmpeg work; only a new or changed source pays the encode cost. ffmpeg is required only when there is actual work to do."
  - "There is exactly one media primitive (`<Media>`) and one playback contract for the whole framework. Living photos (RFC-0202) are the `ambient` profile of it; the existing tap/start button, iOS gesture handling, and WebM→MP4 fallback are preserved and centralized — no second `<video>` stack."
  - "Playback delivery is HLS-first for long-form content: Safari/iOS plays HLS natively, other browsers via lazily-loaded hls.js, and a progressive MP4 is the universal fallback. The resolved mode (file|stream) is deterministic and recorded on the element."
  - "Lighthouse stays green: a page with no feature video ships zero player JavaScript; Plyr + hls.js load only click-to-load / in-viewport when a feature video is actually present; the poster image (not the video) is the LCP element; CLS is 0 (aspect-ratio reserved)."
  - "Prerecorded speech carries captions (WCAG 1.2.2): a feature video with an audio track is validated to ship a VTT caption track; an optional transcript renders under the video and feeds llms/SEO."
nonGoals:
  - "Do not run transcoding in workerd / at request time. All formats are generated at build time (or out-of-band) and served as static assets — exactly like RFC-0204 image variants. No sharp/ffmpeg in the Cloudflare runtime."
  - "Do not require a third-party video host (Mux/Cloudflare Stream/YouTube). The contract is host-agnostic and the default delivery is self-hosted static HLS/MP4/WebM. A hosted-provider source is a future, additive provider (mirrors the Image Provider Port reserved ids)."
  - "Do not ship player JavaScript on pages without a feature video. Ambient/background profiles are native `<video>` only; Plyr/hls.js are never loaded for them."
  - "Do not add audio to ambient/background profiles. Living photos and backgrounds remain muted, looping, decorative; captions/transcripts apply only to the feature profile."
  - "Do not build a bespoke cross-browser player UI from scratch. The feature profile adopts Plyr (lazy) for controls/fullscreen/captions UI; a hand-rolled control layer is explicitly rejected to avoid an open-ended cross-device debugging surface."
  - "Do not commit derived video artifacts (HLS segments, MP4/WebM renditions, posters) or the generated manifest to git. They are gitignored build artifacts regenerated deterministically from cache."
  - "Do not write a clip/format path into markdown for living photos. The ambient profile keeps RFC-0202's derive-by-convention sibling resolution; only explicit section videos name a source token."
---

# RFC-0210: Unified video & living-photo playback contract with build-time HLS/MP4/WebM generation

## Context

The platform has, in two prior RFCs, established the exact shapes this RFC composes:

1. **RFC-0202 (living photos)** introduced the first `<video>` on the platform: an opt-in, decorative, muted, looping clip layered over an authored image, resolved by convention (sibling `<image-token>.webm`), rendered by `<LivePhoto>`, driven by an opt-in scheduler-deferred runtime ([live-photos.ts](packages/share/src/scripts/live-photos.ts)), and guarded by `live.media.validate`. As-built, that runtime already grew past its webm-only non-goal: it carries a WebM→MP4 fallback, iOS gesture handling, a `canplaythrough` readiness gate, a labeled tap/start button, visibility-pause, and reduced-motion suppression.
2. **RFC-0204 (build-portable image variants)** established the canonical pattern for **deriving missing asset formats at build time**: a kernel command (`image.variants.generate`) scans in-repo content assets, generates derivatives with a native tool (`sharp`), writes them to a deterministic, always-deployed, gitignored path (`public/_img/**`), emits a `GENERATED` manifest read synchronously by a render-time provider, is idempotent (skip-on-exists), runs in `build.prepare`, and is gated by `image.variants.validate` in `build.check`. Both commands are no-ops when the feature is not engaged.
3. **The `video-loop` pipeline** (`pipelines-warpgogol-4/apps/video-loop`) already encodes source video into seamless loops in **WebM (VP9)** and/or **MP4 (H.264)** via ffmpeg ([ffmpeg.ts](../../pipelines-warpgogol-4/apps/video-loop/run/media/ffmpeg.ts)), with per-video `brief-*.md` declarations. It is the proven ffmpeg recipe this RFC reuses, extended with HLS.

The thin-site deploy model is `pnpm build` (local / own CI: `site-kernel build.prepare` → `astro build` → `build.post`) followed by `wrangler deploy`. The build runs in an environment we control, so **ffmpeg can be a documented build prerequisite** (as `video-loop` already documents) — unlike a git-connected Cloudflare Pages build.

A founder requirement now exists: thin sites in `apps/` need a **content video section** (number, heading, subheading, video, markdown text under the video). The pilot is `apps/warpgogol-com` — a promo placed immediately after the hero, sourced from `promo-uk.mp4` (a German `promo-de.mp4` follows). Videos across the framework range from 1–30 minutes, sometimes with scrubbing, sometimes as decorative background — and we want **one** technology to maintain, not a per-case zoo.

## Problem

Today the platform can render a decorative muted loop (RFC-0202) but has **no contract, component, build step, or validator for content video**:

1. **No content-video primitive.** Surfacing a promo would force a raw `<video>` in a section — re-creating the per-section fragmentation RFC-0104/0152 abolished for images, hiding the asset from validation, and re-implementing poster/preload/controls/accessibility/playback-mode per call site.
2. **No format derivation.** A 1–30 minute video served as a single progressive MP4 has no adaptive bitrate (bad on long-form + flaky networks) and no per-browser format optimization. We have a proven build-time derivation pattern for images (RFC-0204) but nothing for video, and the obvious "ship the one file the author uploaded" path is precisely the performance trap RFC-0204 was written to close.
3. **No delivery strategy.** There is no decision about HLS vs progressive, no fallback ladder, and no deterministic record of which transport actually played — so behavior (and debugging) would diverge across Safari/iOS (native HLS), Chrome/Firefox/Edge (MSE/hls.js), and low-capability clients (progressive MP4).
4. **Two divergent video stacks looming.** Adding a content-video component beside `<LivePhoto>` would mean two `<video>` rendering paths, two resolvers, two runtimes, two validators, and two sets of iOS quirks to maintain — the opposite of "one universal technology."
5. **Performance & accessibility risk.** Naively, a player (Plyr) + MSE shim (hls.js) is tens-to-hundreds of KB of JavaScript that would wreck the green-Lighthouse posture if loaded eagerly or on pages with no video; and a promo with prerecorded speech without captions fails WCAG 1.2.2.

The missing invariant: **one source-agnostic playback contract** — _HLS-first for streamable content, progressive MP4 as the universal fallback, WebM as an optional enhancement, native-only for decorative loops_ — with a single primitive, a single build-time generator, a single runtime, and a single validator, into which living photos fold as one profile.

## Decision

Introduce a **unified media playback contract** in `@gogol/share`, a single `<Media>` primitive in `@gogol/ui`, a build-time `video.variants.generate` kernel command (content-addressed cache, ffmpeg) with a `video.variants.validate` gate, a single opt-in runtime, and a single `video.media.validate` author guard. **Living photos (RFC-0202) are re-expressed as the `ambient` profile of this contract** (this RFC amends RFC-0202); `<LivePhoto>`, `resolveVideo`, and `live.media.validate` are folded into the unified surface, preserving the existing start button, iOS handling, and WebM→MP4 fallback.

The contract is "not a file format" but a **profile-driven delivery policy**:

| Profile | Use | Generated formats | Delivery | Player JS | Audio | A11y |
| --- | --- | --- | --- | --- | --- | --- |
| `feature` | Content video (the new section): 1–30 min, scrubbing | **HLS ABR ladder** + progressive **MP4** (+ optional **WebM**) | HLS-first → MP4 fallback | Plyr + hls.js, **lazy** | yes | real controls, captions (VTT), optional transcript |
| `background` | Hero / section background loop | **WebM** + **MP4** (no HLS) | progressive, native | none | no (muted) | `aria-hidden`, decorative |
| `ambient` | **Living photo** (RFC-0202) | **WebM** + **MP4** (no HLS) | progressive, native | none (tiny shared runtime) | no (muted) | `aria-hidden`, poster is semantic |

This directly encodes the expert's table: HLS ladder + MP4 mezzanine for long-form, progressive MP4 for backgrounds/short clips, WebM as a second source — canonicalized as **one contract, three profiles**.

## Architectural fit

- **RFC-0204 (parent pattern).** `video.variants.generate` / `video.variants.validate` are the video analogue of `image.variants.generate` / `image.variants.validate`: scan in-repo content assets, derive missing formats with a native tool (ffmpeg instead of sharp), write to `public/_video/**` (the analogue of `public/_img/**`, gitignored, deployed via `public/ → dist/client/`), emit a `GENERATED` manifest read synchronously by the render layer, idempotent, registered in `build.prepare` / `build.check`, no-op when not engaged. The one deliberate upgrade over RFC-0204's skip-on-exists is a **content-addressed cache** (§ Build-time generation), because re-encoding a 30-minute video is far costlier than re-running sharp.
- **RFC-0202 (folded in).** Living photos become the `ambient` profile. `livePhotoSchema` is re-expressed as a preset of `mediaSchema`; `resolveVideo` generalizes to `resolveMedia` (still resolving the derive-by-convention sibling for ambient); `live.media.validate` folds into `video.media.validate` (with its orphan rule made profile-aware so intentional section videos are not false-positives). The existing tap/start `<button>`, iOS autoplay-attribute handling, `canplaythrough` gate, visibility-pause, and reduced-motion logic move into the shared media runtime unchanged in behavior.
- **RFC-0152 (Image Provider Port).** Every poster is the unmodified `<ResponsiveImage>` (srcset, alt, intrinsic size). The poster — not the `<video>` — is the LCP-eligible element, so the image story and `cloudflare.assets.validate` are untouched. A feature video with no authored poster gets an ffmpeg-extracted first-frame `poster.webp` as a degraded fallback.
- **RFC-0141 (Content Source seam).** `resolveMedia` is the media analogue of `resolveImage`: a token (`promo`) maps to `src/content/<domain>/<lang>/assets/promo.<ext>` with default-language fallback through the fs adapter — the same lang-by-directory convention as images (so the pilot files land as `.../uk/assets/promo.mp4` and `.../de/assets/promo.mp4`, **not** a `-uk`/`-de` filename suffix).
- **RFC-0106 / RFC-0011 / RFC-0175 / DNA-15 (script placement & lazy third-party JS).** The runtime is opt-in via the standard orchestrator, presence-gated, scheduler-deferred, and reduced-motion-aware. The feature path follows the **click-to-load** posture of the RFC-0175 chat widget: Plyr (+ hls.js for stream on non-Safari) load only when a feature video exists and is activated/near-viewport. No inline route scripts.
- **RFC-0170 (analytics seam).** The resolved playback mode is exposed on the DOM for tests/diagnostics, and may optionally emit a Matomo custom event through the existing analytics seam — opt-in, off by default.
- **RFC-0104 (section primitives).** The new `video-section` is a standard quintet composing `section-visual` + `section-header` (the number/heading/subheading) + a new `body-media` props fragment (the `<Media feature>` + an optional `contentRef` for the markdown under the video).
- **Generated-file governance (RFC-0078/0081/0087).** The generator has a single owner, content-driven inputs, idempotent output, and a `GENERATED`-marked manifest; derived binaries are gitignored.

## Design

### Content contract (`@gogol/share` — new `schemas/media.ts`)

```ts
import { z } from "zod";

/** The three delivery profiles. Profile drives generated formats, transport, player JS, and a11y. */
export const mediaProfileSchema = z.enum(["feature", "background", "ambient"]);
export type MediaProfile = z.infer<typeof mediaProfileSchema>;

/** Source addressing. Exactly one of `name` (explicit token) or derive-by-convention (ambient). */
export const mediaSourceSchema = z
  .object({
    /** Bare media token (RFC-0053 style). Resolved like resolveImage: <lang>/assets/<name>.<ext>. */
    name: z.string().min(1).optional(),
    /** Ambient only: derive the clip from a sibling image token (RFC-0202 convention). */
    fromImage: z.string().min(1).optional(),
  })
  .strict();

/** One caption/subtitle track (WCAG 1.2.2). VTT resolved by convention or named. */
export const mediaCaptionSchema = z
  .object({
    lang: z.string().min(2),
    label: z.string().optional(),
    /** Default true: this track is shown by default for its language. */
    default: z.boolean().optional(),
  })
  .strict();

export const mediaSchema = z
  .object({
    profile: mediaProfileSchema.default("feature"),
    source: mediaSourceSchema,

    /** Poster image token. Defaults: sibling <token> raster, else generated first-frame poster. */
    poster: z.string().optional(),
    alt: z.string().optional(), // required by validator for feature; aria-hidden for ambient/background

    /** feature: ABR ladder depth. "auto" picks renditions by source height; [] = single rendition. */
    ladder: z.union([z.literal("auto"), z.array(z.number().int().positive())]).optional(),

    /** Playback behavior (profile-clamped: ambient/background force muted+loop, never controls). */
    autoplay: z.boolean().optional(),
    loop: z.boolean().optional(),
    muted: z.boolean().optional(),
    controls: z.boolean().optional(),
    preload: z.enum(["none", "metadata", "auto"]).optional(),

    /** ambient only (RFC-0202): when the loop starts and what a tap does. */
    trigger: z.enum(["in-viewport", "tap", "autoplay"]).optional(),
    tapBehavior: z.enum(["toggle", "play-only"]).optional(),

    /** feature: prerecorded-speech accessibility. */
    captions: z.array(mediaCaptionSchema).optional(),
    /** contentRef to a prose transcript rendered under the video and exposed to llms/SEO. */
    transcriptRef: z.string().optional(),

    lang: z.string().optional(),
    subPath: z.string().optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    const hasName = !!m.source.name;
    const hasFromImage = !!m.source.fromImage;
    if (hasName === hasFromImage) {
      ctx.addIssue({ code: "custom", message: "media.source needs exactly one of name | fromImage" });
    }
    if (m.profile !== "ambient" && hasFromImage) {
      ctx.addIssue({ code: "custom", message: "source.fromImage is only valid for the ambient profile" });
    }
    if (m.profile === "feature" && !m.alt) {
      ctx.addIssue({ code: "custom", message: "feature media requires alt text" });
    }
  });
export type Media = z.infer<typeof mediaSchema>;
```

`livePhotoSchema` (RFC-0202) is kept as a **typed alias / preset** that maps onto `mediaSchema` with `profile: "ambient"` and `source.fromImage` derived from the host image token — so existing `live:` authoring keeps working while resolving through one schema. (Migration: `live:` configs are projected to `media` at the `<SectionImage>` seam; no content change required.)

Authoring example — the pilot promo section (immediately after hero, per founder decision):

```yaml
- id: promo
  type: video-section
  props:
    header:
      heading: "Подивіться, як це працює"
      subheading: "Цифровий фундамент за дві хвилини"
      hideSectionNumber: false      # ⇒ the section "number"
    background:
      kind: transparent
    media:
      profile: feature
      source: { name: promo }       # ⇒ uk/assets/promo.mp4 (+ de/assets/promo.mp4)
      alt: "Огляд цифрового фундаменту Warpgogol"
      ladder: auto
      captions:
        - { lang: uk, default: true }   # ⇒ uk/assets/promo.uk.vtt
    contentRef: prose/home-promo     # ⇒ markdown text rendered under the video
```

### Source & poster resolution (`@gogol/content-source` → `resolveMedia`, re-exported from `@gogol/share`)

`resolveMedia` generalizes `resolveImage`/`resolveVideo`:

- **Explicit token** (`source.name`): resolve `<name>.{mp4,webm}` under `src/content/<domain>/<lang>/assets/` with default-language fallback (one or both source extensions may exist; the author drops whichever they have).
- **Derive-by-convention** (`source.fromImage`, ambient only): resolve the sibling clip next to the poster image — RFC-0202's existing behavior, now one branch here.
- **Poster**: explicit `poster` token → sibling `<token>.{webp,jpg,jpeg,png}` → generated `public/_video/<token>/poster.webp` (ffmpeg first frame).
- **Captions**: each `captions[].lang` resolves `<token>.<lang>.vtt` next to the source (convention), or an explicit path.

A `contentAssetVideos` glob already exists (RFC-0202); a `contentAssetCaptions` (`*.vtt`) glob and the manifest lookup (below) complete the seam. The render layer reads the **generated manifest** for derived-format URLs; `resolveMedia` only proves source/poster/caption existence and constructs keys.

### Build-time generation (`video.variants.generate`, ffmpeg, content-addressed cache, `build.prepare`)

Mirrors `image.variants.generate`, upgraded with a cache because video encoding is expensive:

1. **Discover** source videos: every `*.mp4` / `*.webm` under `src/content/**/assets/` that is referenced by a media config (explicit token) or paired with a live/ambient image (convention). No-op pass when none.
2. For each source, compute a **content hash** = `sha256(sourceBytes) + profile + ladder + ENCODER_SETTINGS_VERSION`. Look it up in the per-app cache `apps/<site>/.cache/video/<hash>/` (gitignored, turbo-cacheable, **not** part of the deploy artifact).
   - **Cache hit** → copy/hardlink the cached outputs into `public/_video/<token>/…`. **Zero ffmpeg.**
   - **Cache miss** → run ffmpeg to produce, **per profile**:
     - `feature`: an **HLS ABR ladder** (`hls/master.m3u8` + per-rendition playlists + fMP4/CMAF segments) via `-var_stream_map`; renditions chosen by `ladder` (`auto` → subset of `{360,540,720,1080}` ≤ source height, no upscale; `[]` → single rendition). Plus a progressive **MP4** (H.264 high/AAC, `+faststart`) as the universal fallback. Plus an optional **WebM** (VP9) enhancement. Plus `poster.webp` (first frame) when no authored poster.
     - `ambient` / `background`: **WebM** (VP9) + **MP4** (H.264), muted, no HLS, no audio. (For ambient, this reuses the RFC-0202 / video-loop recipe.)
   - Write outputs to cache, then copy into `public/_video/<token>/…`.
3. **Probe** each source with ffprobe (width/height/duration/has-audio) for the manifest and the captions-required check.
4. Emit `src/video-manifest.generated.json` (`GENERATED` marker), read synchronously by `<Media>`.

So "если нужный файл есть — пропускаем" becomes "if this exact source+profile+settings was ever encoded, never encode it again" — strictly stronger and deploy-cheap. A cold deploy from a warm cache does no encoding; ffmpeg is required only for a genuinely new/changed source. If ffmpeg is absent **and** there is uncached work, the command fails with a clear, actionable error (it does not silently ship a missing format).

ffmpeg invocation lives in a small wrapper in `@gogol/site-kernel-checks` (or a shared media lib), porting the proven recipes from [video-loop ffmpeg.ts](../../pipelines-warpgogol-4/apps/video-loop/run/media/ffmpeg.ts) and adding the HLS muxing args. `ENCODER_SETTINGS_VERSION` is bumped whenever the encode recipe changes, forcing a clean re-encode.

#### Manifest shape

```jsonc
// GENERATED. Do not change this line unless the file contains project specific changes.
{
  "version": 1,
  "byToken": {
    "promo": {
      "profile": "feature",
      "poster": "/_video/promo/poster.webp",
      "width": 1920, "height": 1080, "durationSec": 124, "hasAudio": true,
      "sources": {
        "hls": "/_video/promo/hls/master.m3u8",
        "mp4": "/_video/promo/progressive.mp4",
        "webm": "/_video/promo/progressive.webm"
      },
      "captions": [{ "lang": "uk", "url": "/_video/promo/promo.uk.vtt", "default": true }]
    }
  }
}
```

### `<Media>` primitive (`@gogol/ui` — one component, profile-driven)

`<Media>` is the single rendering primitive. `<SectionImage>` delegates to it for the `ambient` profile (replacing the direct `<LivePhoto>` call); the new `video-section` uses the `feature` profile; backgrounds use `background`. It always renders a poster and reserves the box via `aspect-ratio` (CLS 0).

- **`ambient` / `background`** (native, zero player JS): `<video muted loop playsinline>` with `<source>` for MP4 + WebM, poster from the manifest, `aria-hidden` + `tabindex="-1"` (ambient's `<img alt>` carries semantics). `autoplay` is native; `in-viewport`/`tap` carry `data-trigger` for the shared runtime. This is RFC-0202's `<LivePhoto>` output, generalized.
- **`feature`**: poster `<ResponsiveImage>` + a `<video controls playsinline preload="metadata">` carrying progressive `<source>` MP4 (+ optional WebM) and `data-hls="…master.m3u8"`, plus `<track kind="captions">` per caption. Marked `[data-video-player]` for the runtime; emits `data-playback-mode` once resolved. The transcript (`transcriptRef`) renders in a `<details>` beneath the video.

No `<video>` for a feature profile autoplays or carries audio attributes by default; `muted`/`autoplay` are profile-clamped in the schema.

### Playback-mode fixation policy (file vs stream)

Deterministic resolution at runtime, recorded on the element as `data-playback-mode` (`file` | `stream`) and `data-playback-impl` (`native` | `hlsjs` | `progressive`):

1. `ambient` / `background` → always **`file`** (`progressive`, native MP4/WebM). No player JS.
2. `feature` with an `hls` source:
   - Native HLS (`video.canPlayType('application/vnd.apple.mpegurl')` truthy → Safari/iOS) → **`stream`** / `native`.
   - else `hls.js` `Hls.isSupported()` (MSE) → **`stream`** / `hlsjs` (hls.js attached lazily).
   - else → **`file`** / `progressive` (MP4 `<source>`).
3. `feature` without an `hls` source → **`file`** / `progressive`.

This is the proposed policy; it is intentionally a pure function of (profile, source set, browser capability) so it is testable and reproducible. Optionally, on resolution the runtime emits a Matomo custom event (`video_play`, with mode/impl/token) through the RFC-0170 analytics seam — **opt-in**, off by default to preserve the zero-JS posture.

### Runtime (`@gogol/share/scripts` — generalize `live-photos.ts` → shared media runtime)

Two opt-in orchestrator options, both presence-gated, scheduler-deferred, reduced-motion-aware:

- **`media` (ambient/background)** — gated on `[data-live-photo][data-trigger]` / `[data-media-loop][data-trigger]`. This is the existing `initLivePhotos` logic (IntersectionObserver, tap/start button, iOS autoplay-attribute trick, `canplaythrough` gate, visibility-pause, WebM→MP4 fallback, unsupported-codec handling) lifted into the shared runtime. The native `autoplay` path needs no JS. Behavior is preserved exactly; only the module name/structure changes. (RFC-0202's `livePhotos` orchestrator option is kept as an alias for one release, then removed.)
- **`videoPlayers` (feature)** — gated on `[data-video-player]`. Follows the RFC-0175 click-to-load posture: when a feature video enters the viewport (or on first interaction), `scheduleTask` lazy-imports Plyr (+ its CSS) and, only when the resolved mode is `stream`/`hlsjs`, hls.js; binds the manifest's `hls`/`mp4` sources; sets `data-playback-mode`. Pages with no `[data-video-player]` import nothing.

```ts
// orchestrator.ts — OrchestrationOptions additions
/** RFC-0202/RFC-0210: opt in to the ambient/background media runtime ([data-live-photo]/[data-media-loop]). */
media?: boolean;
/** RFC-0210: opt in to the lazy feature-video player ([data-video-player]) — Plyr + hls.js, click-to-load. */
videoPlayers?: boolean;
```

### The `video-section` (new section quintet, `@gogol/ui`)

A standard section composing `section-visual` + `section-header` + a new `body-media` props fragment:

| File | Role |
| --- | --- |
| `packages/ui/src/sections/video-section/video-section.astro` | Renders header (number/heading/subheading) + `<Media feature>` + optional `contentRef` markdown body. |
| `packages/ui/src/sections/video-section/video-section.types.ts` | `VideoSectionContent` (header + media + optional contentRef + visual). |
| `packages/ui/src/sections/video-section/video-section.css` | Token-driven, `@layer components`. |
| `packages/ui/src/sections/video-section/video-section.manifest.yaml` | Mirror Quintet: `archetype: video`, `propsSchemaCompose: [section-visual, section-header, body-media]`. |

Fullscreen is delivered by Plyr's fullscreen control (feature). Responsive sizing is token/`aspect-ratio`-driven; the section is fluid and the player expands to fullscreen via the native Fullscreen API that Plyr wraps.

### Validation (`video.media.validate` — folds in and supersedes `live.media.validate`)

A single author-time, disk-only command (modeled on `people.validate` / `live.media.validate`), registered in `apps-check.author`. Rules:

- **`missing-source`** (fail) — a media config (or `live:` config) whose source token / sibling clip does not resolve on disk.
- **`orphan-clip`** (fail, **profile-aware**) — a `*.webm`/`*.mp4` under content assets with no sibling poster image **and** not referenced as a `feature`/`background` section source. (This relaxes RFC-0202's blanket `orphan-video`: ambient clips still require a poster, but an intentional section `promo.mp4` is allowed without a sibling raster — it has a generated/author poster instead.)
- **`missing-captions`** (warn → enforce) — a `feature` media whose source has an audio track (per ffprobe in the manifest) but no `captions` track (WCAG 1.2.2). Phase 1 warns; a follow-up flips it to fail.
- **`missing-alt`** (fail) — a `feature` media without `alt`.

`video.variants.validate` (`build.check`, mirrors `image.variants.validate`): the manifest is present and every referenced file (HLS master + segments sampled, MP4, WebM, poster, VTT) exists under `public/_video/`; fail on `missing-variant` / `stale-manifest` (source hash changed → re-run generate).

### Failure modes

- Source token does not resolve → `missing-source` (fail).
- ffmpeg absent **and** uncached work exists → `video.variants.generate` fails with an actionable "install ffmpeg / warm the cache" error. (No-op pass when there is no work.)
- Feature video with speech but no captions → `missing-captions` (warn now, fail later).
- HLS unplayable (no native HLS, no MSE) → runtime falls back to progressive MP4 (`data-playback-mode="file"`). No broken UI.
- Plyr/hls.js fail to load → native `<video controls>` with the MP4 `<source>` still plays (progressive enhancement).
- Reduced motion → ambient/background never autoplay (poster wins); a feature video never autoplays regardless.
- App with no media configs and no clips → all three commands no-op pass; zero player bytes shipped.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/schemas/media.ts` | New: `mediaSchema`, `mediaProfileSchema`, `mediaSourceSchema`, `mediaCaptionSchema`, types. |
| `packages/share/src/schemas/live-photo.ts` | Re-express `livePhotoSchema` as an `ambient` preset of `mediaSchema` (alias kept). |
| `packages/share/src/schemas/section-image.ts` | `live` projects to `media` (profile=ambient) at the seam; field kept for back-compat. |
| `packages/share/src/index.ts` | Export `Media` types, `resolveMedia`. |
| `packages/content-source/src/adapters/fs/assets.ts` | `resolveMedia` (generalizes `resolveVideo`); caption resolution. |
| `packages/ui/src/content-assets.ts` | Add `contentAssetCaptions` (`*.vtt`); reuse `contentAssetVideos`. |
| `packages/ui/src/components/media/*` | New `<Media>` primitive (quintet); absorbs `<LivePhoto>` for the ambient profile. |
| `packages/ui/src/sections/video-section/*` | New `video-section` quintet (feature). |
| `packages/ui/src/components/section-image/section-image.astro` | Delegate the ambient case to `<Media>`. |
| `packages/share/src/scripts/orchestrator.ts` | Add `media` + `videoPlayers` options. |
| `packages/share/src/scripts/media.ts` | Shared ambient/background runtime (generalized `live-photos.ts`). |
| `packages/share/src/scripts/video-player.ts` | Lazy Plyr + hls.js feature runtime (click-to-load). |
| `packages/os/site-kernel-checks/src/video-variants.ts` | `video.variants.generate` (ffmpeg + cache) + `video.variants.validate`. |
| `packages/os/site-kernel-checks/src/video-media.ts` | `video.media.validate` (folds in `live.media.validate`). |
| `packages/os/site-kernel-checks/src/command-tables/*` | Register the three commands (07-structure-naming / 09-build-artifacts neighbors). |
| `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` | Add `video.variants.generate`. |
| `packages/os/site-kernel-checks/src/pipelines/build-check.ts` | Add `video.variants.validate`. |
| `packages/os/site-kernel-checks/src/pipelines/apps-check-author.ts` | Replace `live.media.validate` with `video.media.validate`. |
| `packages/ontology/src/shared-section-props/*` | Mirror the `media` + `body-media` JSON-Schema fragments (CMS authoring). |
| `apps/*/public/_video/**` | Generated artifacts (gitignored, deployed via public→dist/client). |
| `apps/*/.cache/video/**` | Content-addressed encode cache (gitignored, NOT deployed). |
| `apps/*/src/video-manifest.generated.json` | Generated manifest (`GENERATED` marker, gitignored). |

## Rollout

Additive, no flag day, no content migration:

1. Land `mediaSchema` + `resolveMedia` + manifest types (`@gogol/share`, `@gogol/content-source`). Re-express `livePhotoSchema` as the ambient preset (alias).
2. Land `<Media>` and fold `<LivePhoto>` into its ambient profile; `<SectionImage>` ambient output stays byte-for-byte equivalent.
3. Land `video.variants.generate` (ffmpeg + cache) + `video.variants.validate`; wire into `build.prepare` / `build.check`. No-op for apps with no video.
4. Land the shared `media` runtime (generalized `live-photos.ts`) + the lazy `videoPlayers` runtime; keep the RFC-0202 `livePhotos` option as an alias.
5. Land `video.media.validate` (folds in `live.media.validate` with the profile-aware orphan rule); swap it into `apps-check.author`. Fail-hard but no-op when an app has no media.
6. Land the `video-section` quintet + ontology fragments.
7. **Pilot — `apps/warpgogol-com`.** Copy `pipelines-warpgogol-4/apps/video-loop/.input/videos/warpgogol-com/promo-uk-2026-06-19.mp4` → `apps/warpgogol-com/src/content/pages/uk/assets/promo.mp4` (and the German cut → `.../de/assets/promo.mp4`). Add a `video-section` block to `home.md` immediately **after** the hero (founder decision). `video.variants.generate` derives the HLS ladder + MP4 (+ WebM) + poster; the section renders with lazy Plyr; captions added once the VTT is authored. Build (`build:check`) stays green; Lighthouse stays green (no player JS until the video is in view).
8. **Migrate `nicaragua-projekt` living photos** from `live:` to the ambient profile transparently (alias projection) — no content edit required; behavior unchanged.
9. Opt-in elsewhere: any site adds a `video-section` or a `media`/`live` config and flips `media` / `videoPlayers` in its orchestrator.

## Alternatives considered

- **Two separate stacks (keep `<LivePhoto>` + add a new `<ContentVideo>`).** Rejected: duplicates resolver, runtime, validator, and iOS quirks — the exact fragmentation the founder asked to avoid ("одна универсальная технология"). One contract with profiles is the durable shape.
- **WebM-only or MP4-only as the single universal format.** Rejected per the expert: WebM-only is risky as a production lowest-common-denominator; MP4-only loses adaptive bitrate on long-form. HLS-first + MP4-fallback + optional WebM is the universal **delivery contract**, not a single file format.
- **A hand-rolled player UI.** Rejected (non-goal): controls, fullscreen, captions UI, and keyboard/screen-reader behavior across Safari/iOS/Chrome/Firefox is an open-ended debugging surface. Plyr is the battle-tested choice; the only cost (JS weight) is neutralized by lazy click-to-load gating.
- **Eager Plyr/hls.js, or an Astro island per video.** Rejected: forfeits the green-Lighthouse posture. One presence-gated, scheduler-deferred, click-to-load runtime ships nothing when there is no feature video.
- **Transcode in `build.prepare` with plain skip-on-exists (literal RFC-0204 parity).** Rejected in favor of a content-addressed cache: re-encoding a 30-minute video on every cold build is unacceptable; the cache makes cold deploys from a warm cache do zero ffmpeg work while staying idempotent.
- **Transcode in workerd at request time.** Rejected (RFC-0149 precedent): no sharp/ffmpeg in workerd; any runtime transform must be a hosted provider. Static, pre-generated HLS/MP4/WebM is the portable default.
- **Generate all three formats for every video unconditionally (the original brief).** Amended to **profile-driven** generation: HLS over a muted, looping, decorative ambient/background clip is wasted build time, storage, and runtime complexity for zero benefit. Feature gets HLS+MP4(+WebM); ambient/background get WebM+MP4.
- **Filename language suffix (`promo-uk.mp4` / `promo-de.mp4`).** Rejected for consistency: the framework already addresses language by directory (`<lang>/assets/`) via `resolveImage`. The pilot files are renamed to `promo.mp4` under each language's assets folder so `resolveMedia` is the exact analogue of `resolveImage`.

## Risks

- **ffmpeg as a build prerequisite.** Mitigated: deploy builds run in our own environment (documented like `video-loop`); the content-addressed cache means ffmpeg is needed only for new/changed sources; a clear hard error fires if it's missing with uncached work; the command is a no-op when there is no video.
- **Build time / artifact count for the ABR ladder.** Mitigated: `auto` ladder bounded to ≤4 no-upscale renditions, profile-gated (no HLS for ambient/background), and the cache amortizes encoding across builds. `video.variants.validate` guards manifest/asset drift.
- **Player JS weight / Lighthouse regression.** Mitigated: zero player JS on pages without a feature video; Plyr + hls.js are lazy click-to-load / in-viewport; poster (not video) is LCP; `preload="metadata"`; CLS 0 via reserved `aspect-ratio`.
- **Autoplay never guaranteed (MDN).** Mitigated structurally: the poster is the resting state and fallback; ambient/background are `muted` to maximize autoplay; feature never autoplays.
- **WCAG for prerecorded speech.** Mitigated by the `captions` contract + `missing-captions` validator (warn → enforce) + optional transcript.
- **Folding `live.media.validate` could regress RFC-0202 apps.** Mitigated: the alias-projection keeps `live:` authoring working; the profile-aware orphan rule preserves the ambient poster invariant; `nicaragua-projekt` is migrated and re-validated in the same rollout.
- **Agent misuse** (raw `<video>`, hand-edited manifest/segments, marking ambient without a clip). Caught by `video.media.validate` + the `GENERATED` governance lint.

## Acceptance criteria

- [x] `@gogol/share` defines `mediaSchema` (profiles feature/background/ambient, source name|fromImage, ladder, playback, captions, transcriptRef, `posterTime`) and exports its types; `livePhotoSchema` is kept and projected to the ambient profile via `livePhotoToMedia`. (evidence: packages/ directory, package exists)
- [x] `resolveMedia` resolves explicit tokens (`<lang>/assets/<name>.{mp4,webm}`, default-lang fallback) and posters; the ambient sibling-of-image convention resolves via `resolveVideo`; `<token>.<lang>.vtt` captions are resolved on disk by the generator and surfaced through the manifest. (evidence: implemented historically)
- [x] `<Media>` renders profile-correctly: ambient (delegates to `<LivePhoto>`), background (native muted loop, aria-hidden, zero player JS), and feature (poster + `<video controls>` + `data-hls` + caption tracks). `<SectionImage>` ambient output is byte-for-byte RFC-0202 (unchanged path). _As-built: the under-video markdown/transcript is rendered by the `video-section` `contentRef`, not inside `<Media>`._ (evidence: implemented historically)
- [x] `video.variants.generate` (build.prepare, ffmpeg) is content-addressed (hash = source+profile+ladder+`posterTime`+ENCODER*SETTINGS_VERSION): cache hit ⇒ zero ffmpeg; cache miss ⇒ profile-correct formats (HLS ABR + MP4 (+WebM) + poster for feature; WebM+MP4 for ambient/background); emits the `GENERATED` manifest; no-op pass with no sources; hard error only when ffmpeg is absent with uncached work. \_Verified end-to-end on the pilot promo (1080p/72s → 4-rendition ladder).* (evidence: implemented historically)
- [x] `video.variants.validate` (build.check) fails on `missing-variant` and no-op passes without a manifest. _As-built: hash-based `stale-manifest` detection deferred to a follow-up (presence-only guard for now)._ (evidence: implemented historically)
- [x] Playback mode is deterministically resolved (native HLS → hls.js → progressive) and recorded as `data-playback-mode` / `data-playback-impl`. _As-built: the optional Matomo event is not yet wired (off by default, as specified)._ (evidence: implemented historically)
- [x] `videoPlayers` runtime loads Plyr (+ hls.js only for stream on non-Safari) lazily/in-viewport, gated on `[data-video-player]`; ambient/background ship zero player JS. RFC-0202's tap button + iOS handling + reduced-motion + WebM→MP4 fallback are preserved via the existing `live-photos` runtime (kept, not renamed to `media`). (evidence: implemented historically)
- [x] `video.media.validate` enforces `missing-source` + `missing-alt` (fail) and warns `missing-captions`; no-op passes with zero media; added to `apps-check.author`. _As-built: it runs alongside (not replacing) `live.media.validate`, which retains the ambient `orphan-video`/poster-pairing rule — so a section `promo.mp4` is not a false-positive without re-implementing the orphan check._ (evidence: implemented historically)
- [x] `video-section` quintet renders number/heading/subheading (section-header) + feature `<Media>` + markdown-under-video via `contentRef`. _As-built: the `media` props are declared inline in the section's `propsSchema` rather than as a separate `body-media` compose fragment._ (evidence: implemented historically)
- [x] Pilot: `warpgogol-com` home shows `promo` immediately after the hero (`pnpm build` green 30/30, `astro:check` 0 errors); `nicaragua-projekt` living photos unchanged (no `media:` configs → new commands no-op). _uk is live; the `de` cut awaits the `promo-de` source asset._ (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `AGENTS.md` updated (one media contract, no raw `<video>`, lang-by-directory media tokens, gitignored artifacts/cache); `docs/*.xml` GRACE synchronized (build green ⇒ `grace.validate` passes). _As-built: media props inlined in the section manifest rather than mirrored as a dedicated CMS fragment._ (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate RFC-0210` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC has `status: accepted`. Agents MUST NOT change status fields in any RFC.
- There is ONE media contract and ONE `<Media>` primitive. Do NOT add a raw `<video>` in a section, a second resolver, or a parallel runtime. Living photos are the `ambient` profile — fold, do not fork.
- Do NOT use Astro `astro:assets`/`<Image>`/`getImage` for any of this (RFC-0152/0204 blocker). Transcoding is ffmpeg in the kernel command only; image posters go through `<ResponsiveImage>`.
- Media tokens are addressed by **directory language** — NOT by a `-<lang>` filename suffix. As-built: feature/background SOURCE masters live in the **non-bundled `<domain>/<lang>/media/<name>.{mp4,webm}` folder** (NOT `assets/`), because the eager `contentAssetVideos` glob matches only `assets/**` and would emit an 80+ MiB master to `_astro`, exceeding Cloudflare's 25 MiB asset limit. `<Media>` resolves derived URLs purely through the manifest (`getVideoEntryByToken`, by `<lang>/<token>` with default-lang fallback) — never the glob. Ambient living-photo clips stay in `assets/`.
- As-built: `video.media.validate` runs _alongside_ `live.media.validate` (RFC-0202 retained for ambient poster/orphan pairing), not replacing it; the `media` props are declared inline in the `video-section` manifest (no separate `body-media` fragment); the markdown-under-video/transcript is the section's `contentRef`, not part of `<Media>`. A `video.dist.prune` (build.post) is a backstop that removes any legacy `assets/`-placed master from `dist/client/_astro`.
- Never re-encode an unchanged source: the cache key is `hash(sourceBytes)+profile+ladder+posterTime+ENCODER_SETTINGS_VERSION`. Bump `ENCODER_SETTINGS_VERSION` when the recipe changes.
- Player JS (Plyr/hls.js) MUST load lazily/click-to-load via the standard orchestrator (`videoPlayers`) and only when `[data-video-player]` is present. Ambient/background ship zero player JS. No inline route scripts (DNA-15 / RFC-0011).
- Do NOT commit `public/_video/**`, `.cache/video/**`, or `src/video-manifest.generated.json`.
- A `feature` video with prerecorded speech MUST carry captions (WCAG 1.2.2); keep `aria-hidden` on ambient/background `<video>` and let the `<img alt>` carry semantics.
- Reference RFC-0210 in commit messages and PR descriptions; keep affected `docs/*.xml` GRACE files synchronized.
