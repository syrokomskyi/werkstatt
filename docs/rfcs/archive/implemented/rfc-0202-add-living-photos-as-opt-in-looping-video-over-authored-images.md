---
id: RFC-0202
title: "Add living photos — opt-in looping video over any authored image"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-17
updatedAt: 2026-06-17
implementedAt: 2026-06-18
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0210
  - RFC-0234
related:
  - DNA-04
  - DNA-08
  - DNA-15
  - RFC-0104
  - RFC-0106
  - RFC-0134
  - RFC-0151
  - RFC-0152
  - RFC-0141
  - RFC-0011
  - RFC-0200
commands:
  proposed:
    - live.media.validate
  added:
    - live.media.validate
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
  - warpgogol-com
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/content-source"
  - "@gogol/ontology"
  - "@gogol/business"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Any authored image can be made a living photo by adding a `live` config in content — no new image component per call site, no per-site CSS, and no video path written by hand."
  - "A living photo always renders the existing RFC-0152 <ResponsiveImage> (srcset, alt, intrinsic width/height) as its resting state; the looping <video> is a strictly additive overlay. LCP element, accessibility, and CLS are unchanged whether the photo is static or live."
  - "Playback is fully content-configurable: start trigger (in-viewport | tap | autoplay), loop on/off, and whether a tap toggles or only starts the clip — authored once, validated centrally."
  - "The video file is never written in markdown: it is the sibling `<image-name>.webm`, resolved by convention next to the poster image through the same content-source seam as resolveImage."
  - "live.media.validate is in the standard author pipeline and fails the build when a live image has no sibling .webm, or when a .webm has no sibling static poster image."
  - "Sites with zero living photos ship zero additional JavaScript and zero additional bytes — the tap/viewport runtime is opt-in, scheduler-deferred, and gated on the presence of [data-live-photo]."
nonGoals:
  - "Do not build a full media player (custom scrubber, volume, fullscreen, chapters). Living photos are decorative, muted, looping micro-clips. A content video player with controls/analytics is a separate future RFC (the expert's Plyr/Mux tier)."
  - "Do not support audio. Living photos are always `muted`; autoplay/in-viewport policies depend on it and decorative loops carry no meaningful audio. Captions/transcripts are therefore out of scope here and reserved for a future guide-video RFC."
  - "Do not add a second container format. Only `.webm` is supported in this RFC (matches the existing pipeline output). Adding `<source>` fallbacks (mp4/hevc) is a follow-up, behind the same `live` contract."
  - "Do not write the video filename into markdown. There is no `video:` field. The clip is derived from the image token (sibling `.webm`); this is a hard convention, not a per-author choice."
  - "Do not auto-play on `prefers-reduced-motion: reduce` for any non-interactive trigger. Reduced-motion always resolves to the static poster; only a user-initiated tap may start playback."
  - "Do not keep or add per-section video CSS or a parallel `livePhotoX` prop family. Presentation is owned by shared @gogol/ui CSS in @layer components, token-driven."
---

# RFC-0202: Add living photos — opt-in looping video over any authored image

## Context

Sites in `apps/` render authored images through a single, well-factored stack:

1. **`<SectionImage>`** ([section-image.astro](packages/ui/src/components/section-image/section-image.astro)) is the canonical authored-image primitive (RFC-0104): it resolves a bare image token via `resolveImage` and owns fades and the RFC-0106 parallax hook.
2. **`<ResponsiveImage>`** ([responsive-image.astro](packages/ui/src/components/responsive-image/responsive-image.astro)) is the provider-agnostic rendering primitive (RFC-0152): every authored `<img>` goes through it, asking the **Image Provider Port** for `src` + `srcset`.
3. **`resolveImage`** (RFC-0042/0053/0141) maps a bare token (`maria-calderon`) to an on-disk asset under `src/content/**/assets/`, with default-language fallback, through the Content Source Provider seam.

We have an established precedent for "the same authored slot can be plain or enhanced": **RFC-0134 → RFC-0151** turned headings from "just text" into "text with a stackable, schema-validated, registry-driven effect", with the explicit rule that the enhancement is additive, central, validated, and static-by-default. Living photos are the image analogue of that move: _the same image slot becomes "static photo **or** living photo."_

The production pipeline already emits per-photo looping clips. For `nicaragua-projekt`, the team portraits in the **People module** (RFC-0200) have matching loops produced by the `video-loop` pipeline (`apps/video-loop/.output/7-mux-audio/nicaragua-projekt/team/*.webm`), one per founder/supporter portrait. There is currently no contract, no component, no resolver, and no validator to surface them on the site.

## Problem

There is no first-class way to animate an authored photo. Doing it today would force one of the outcomes RFC-0134/0151 and RFC-0152 were written to prevent:

1. **Per-section `<video>` markup.** Dropping a raw `<video>` into a section re-creates the fragmentation RFC-0104/0152 abolished, loses the provider `srcset` poster, hides the asset from `asset.reference.validate`, and re-implements accessibility and reduced-motion handling per site.
2. **A parallel prop family.** Adding `videoName` / `posterName` / `videoLoop` props duplicates the `imageName` contract and lets the poster and the clip drift apart (a video with no static fallback, or a "live" flag with no clip).
3. **No coverage guarantee.** Nothing asserts that a clip has a static poster (the placeholder the whole accessibility/LCP story depends on), or that a photo marked "live" actually has a clip to play. Both are silent-failure traps: a broken or missing video, or an un-postered video that flashes empty before load.

The missing invariants:

- **A living photo is a static photo plus a derived, validated looping clip — never a bare video.** The static `<ResponsiveImage>` is always present as the resting state, poster, and fallback.
- **The clip is addressed by convention, not by path.** It is the sibling `<image-name>.webm`; markdown never names it.
- **Playback is content-configured and centrally validated**, and **degrades to the static photo** under reduced-motion, load failure, or "not yet triggered".

## Decision

Introduce **living photos** as an additive capability on the existing image stack, mirroring the RFC-0151 model (additive contract + shared primitive + registry-light runtime + central validator), with **no breaking change** to static images.

1. **`live` content contract.** A new `livePhotoSchema` (`@gogol/share`) is added as an optional `live` field on the authored-image surfaces — first on `SectionImageProps` (the universal seam) and on the canonical `Person` record (`@gogol/business`, the pilot). It configures _whether_ a photo is live and _how_ it plays. It never names a file.

2. **Convention-based clip resolution.** A `resolveVideo` resolver (`@gogol/content-source`, re-exported from `@gogol/share`) resolves the sibling `<image-name>.webm` using the same path construction and language fallback as `resolveImage`. A single `contentAssetVideos` glob (`@gogol/ui`) bundles `*.webm` content assets to hashed URLs, exactly as `contentAssetImages` does for rasters.

3. **`<LivePhoto>` primitive.** A new shared component (`@gogol/ui`) composes the existing `<ResponsiveImage>` (always rendered: poster, srcset, alt, intrinsic size) with an additive, decorative `<video muted loop playsinline>` overlay. `<SectionImage>` renders `<LivePhoto>` when `live.enabled` and a clip resolves; otherwise it renders exactly as today.

4. **Opt-in, scheduler-deferred runtime.** A `livePhotos` option on `runStandardLayoutOrchestration` (RFC-0011/0106 script model) lazy-imports a tiny module that wires the `in-viewport` (IntersectionObserver) and `tap` (button) triggers for `[data-live-photo]` elements, respecting `prefers-reduced-motion`. The `autoplay` trigger needs no JavaScript. Sites without living photos load nothing.

5. **`live.media.validate`.** A new author-time, disk-only validator (modeled on `people.validate`) added to `APPS_CHECK_AUTHOR_PIPELINE` with two rules: every live image has a sibling `.webm` (`missing-video`), and every content `.webm` has a sibling static poster image (`orphan-video`). No-op pass when an app has no living photos and no clips.

This is additive: existing content, schemas, `<SectionImage>` callers, and `<ResponsiveImage>` keep working unchanged; "static photo" remains the default and the fallback.

## Architectural fit

- **RFC-0151 (analogue / parent pattern).** Living photos reuse the 0151 shape: an additive content field, a shared primitive, a capability that is _static-by-default_ and _degrades to the un-enhanced element_, and a single central validator — no per-call-site component and no prop-family drift.
- **RFC-0152 (Image Provider Port).** The poster is the unmodified `<ResponsiveImage>`, so the provider/srcset/`/cdn-cgi/image` story and `cloudflare.assets.validate` are untouched. The video is a separate origin asset (no runtime resize) served from `dist/client` like any hashed asset.
- **RFC-0141 (Content Source Provider seam).** `resolveVideo` is the video analogue of `resolveImage`, implemented in the fs adapter and re-exported from `@gogol/share`; tokens never become `/src` paths.
- **RFC-0106 / RFC-0011 / DNA-15 (motion + script placement).** The runtime is opt-in, presence-gated (`[data-live-photo]`), `prefers-reduced-motion`-aware, and loaded once via the standard orchestrator — identical to how `reveal`/`parallax`/`stagger` are wired. No inline route scripts.
- **RFC-0200 (People module) / DNA-04 / DNA-08.** The pilot adds `live` to the canonical `Person` record; the People section forwards it through `PersonProfile → SectionImage`. Authoring stays in content; shared packages own schema, resolution, rendering, runtime, CSS, and validation.
- **Thin apps.** Apps declare intent in `src/content/` only. No app gains a video component, a glob, or a script.

## Design

### Resting state vs. enhancement: the key distinction

A living photo is **two layers in one box**:

| Layer | Element | Always present? | Role |
| --- | --- | --- | --- |
| Resting state | `<ResponsiveImage>` (`<img>`) | **Yes** | LCP-eligible, carries `alt`, `srcset`, intrinsic `width`/`height`. Visible until the clip plays; the fallback if the clip fails, is gated by reduced-motion, or hasn't been triggered. |
| Enhancement | `<video muted loop playsinline aria-hidden>` | Only if `live.enabled` **and** a sibling `.webm` resolves | The decorative loop. Sits on top of the poster, fades in only while playing. |

This is the rule that keeps Lighthouse/CLS/accessibility numbers flat: the `<img>` is unconditionally rendered and is the semantic, measured element; the `<video>` is a purely additive, `aria-hidden` decoration of the _same content_.

### Content contract (`@gogol/share` — new `schemas/live-photo.ts`)

```ts
import { z } from "zod";

/** How playback starts. */
export const livePhotoTriggerSchema = z.enum(["in-viewport", "tap", "autoplay"]);
export type LivePhotoTrigger = z.infer<typeof livePhotoTriggerSchema>;

export const livePhotoSchema = z
  .object({
    /** Turn the image into a living photo. Default true (presence implies intent). */
    enabled: z.boolean().default(true),

    /**
     * When the loop starts:
     *  - "in-viewport" (default): plays while scrolled into view, pauses when out (IntersectionObserver).
     *  - "tap": stays a static photo until the visitor activates the play control.
     *  - "autoplay": plays immediately on load via native attributes — no JavaScript.
     */
    trigger: livePhotoTriggerSchema.optional(),

    /** Loop the clip continuously. Default true. false = play once, then rest on the last frame. */
    loop: z.boolean().optional(),

    /**
     * What a tap does once the clip is running:
     *  - "toggle" (default): tap pauses a playing clip / resumes a paused one.
     *  - "play-only": tap can start the clip but never pauses it (the control only kick-starts).
     */
    tapBehavior: z.enum(["toggle", "play-only"]).optional(),

    /** Media preload hint. Default "metadata" (spec-recommended baseline). */
    preload: z.enum(["none", "metadata", "auto"]).optional(),
  })
  .strict();
export type LivePhoto = z.infer<typeof livePhotoSchema>;
```

This is a complete map of the requirement: _live or not_ (`enabled`), _play at start vs on tap_ (`trigger`), _cyclic or not_ (`loop`), _tap pauses or only starts_ (`tapBehavior`). There is deliberately **no file field**.

Authoring example (a section image):

```yaml
props:
  imageName: maria-calderon
  alt: "Dulce María Calderón, Projektkoordinatorin in Nicaragua"
  live:
    trigger: in-viewport
    loop: true
    tapBehavior: toggle
```

### Clip resolution by convention (`@gogol/content-source`, re-exported from `@gogol/share`)

`resolveVideo` mirrors `resolveImage`'s path construction (RFC-0042/0053/0141) but resolves a single `.webm` sibling — the image token with the extension swapped:

```ts
// @gogol/content-source — sibling of resolveImage in the fs adapter.
export const VIDEO_EXTENSIONS = [".webm"] as const; // only format supported (RFC-0202 non-goal)

/** Resolve the sibling clip for an image token: <token>.webm next to <token>.<raster>. */
export function resolveVideo(
  videos: Record<string, string>,    // contentAssetVideos: token-key → hashed URL
  imageName: string,
  options?: ImageResolverOptions,     // { lang, subPath } — same as resolveImage
): string | null;
```

The video glob in `@gogol/ui` is the exact analogue of `contentAssetImages`:

```ts
// packages/ui/src/content-assets.ts
export const contentAssetVideos = import.meta.glob<string>(
  "/src/content/**/assets/**/*.webm",
  { eager: true, query: "?url", import: "default" },
);
```

Because the clip is `<image-name>.webm` next to `<image-name>.<raster>`, the poster/clip pair can never drift, and the validator below can prove the pairing on disk without rendering.

### `<LivePhoto>` primitive (`@gogol/ui`)

```astro
---
// packages/ui/src/components/live-photo/live-photo.astro
import type { ImageDescriptor, LivePhoto as LivePhotoConfig } from "@gogol/share";
import { buildImageSources } from "@gogol/share";
import ResponsiveImage from "../responsive-image/responsive-image.astro";
import "./live-photo.css";

interface Props {
  image: ImageDescriptor;     // resolved poster (RFC-0152 descriptor)
  videoSrc: string;           // resolved sibling .webm URL (already validated to exist)
  alt: string;
  config: LivePhotoConfig;
  class?: string;
  loading?: "lazy" | "eager";
  quality?: number | string;
}

const { image, videoSrc, alt, config, class: className, loading, quality } = Astro.props as Props;

const trigger = config.trigger ?? "in-viewport";
const loop = config.loop ?? true;
const tapBehavior = config.tapBehavior ?? "toggle";
const preload = config.preload ?? "metadata";
const native = trigger === "autoplay";           // CSS-only path: no orchestrator runtime needed
const interactive = trigger === "tap" || tapBehavior === "toggle";
// Poster src for the <video poster> attribute (single-image fallback frame).
const posterSrc = buildImageSources(image, { quality }).src;
---

<div
  class:list={["live-photo", className]}
  style={`aspect-ratio:${image.width}/${image.height}`}
  data-live-photo
  data-trigger={native ? undefined : trigger}
  data-loop={loop ? "" : undefined}
  data-tap-behavior={tapBehavior}
>
  <!-- Resting state: always rendered. LCP, alt, srcset, intrinsic size. -->
  <ResponsiveImage image={image} alt={alt} class="live-photo__poster" loading={loading} quality={quality} />

  <!-- Enhancement: decorative duplicate of the poster. -->
  <video
    class="live-photo__video"
    poster={posterSrc}
    muted
    playsinline
    loop={loop || undefined}
    autoplay={native || undefined}
    preload={preload}
    aria-hidden="true"
    tabindex="-1"
    width={image.width}
    height={image.height}
  >
    <source src={videoSrc} type="video/webm" />
  </video>

  {
    interactive && (
      <button type="button" class="live-photo__toggle" aria-pressed="false" aria-label={`Play animation: ${alt}`}>
        <span class="live-photo__toggle-icon" aria-hidden="true" />
      </button>
    )
  }
</div>
```

Notes:

- The `<video>` is `aria-hidden` and `tabindex="-1"`: it is a decorative animation of the _same_ content the `<img alt>` already describes, so it must not be announced twice (DNA / WCAG: do not duplicate semantics).
- The control is a real `<button>` with `aria-pressed` and a text label (the expert's accessibility point), not an invisible click handler on the media — keyboard- and screen-reader-operable.
- `autoplay` emits native `autoplay muted loop playsinline` and **no** `data-trigger` and **no** button → it works with zero JavaScript.
- `aspect-ratio` from the descriptor pins the box → CLS 0 even before the clip loads.

`<SectionImage>` gains the seam (additive):

```astro
// section-image.astro — after resolving imageMeta
import { resolveVideo } from "@gogol/share";
import { contentAssetVideos } from "../../content-assets.ts";
const videoSrc = live?.enabled !== false && live ? resolveVideo(contentAssetVideos, imageName, { lang, subPath }) : null;
---
{ imageMeta && (videoSrc && live)
  ? <LivePhoto image={imageMeta} videoSrc={videoSrc} alt={alt} config={live} ... />
  : <ResponsiveImage image={imageMeta} alt={alt} ... /> /* unchanged */ }
```

When `live` is absent, or `enabled: false`, or no clip resolves, `<SectionImage>` renders today's `<ResponsiveImage>` exactly. (A `live`-without-clip case is also surfaced as a build failure by the validator below, so it never silently degrades in production.)

### Runtime (`@gogol/share/scripts` — new `live-photos.ts`, opt-in via the orchestrator)

A new orchestration option follows the exact RFC-0106 pattern (presence-gated, scheduler-deferred, reduced-motion-aware):

```ts
// orchestrator.ts — add to OrchestrationOptions
/** RFC-0202: opt in to the living-photos runtime for [data-live-photo] elements. Default false. */
livePhotos?: boolean;

// …inside runStandardLayoutOrchestration, after the existing motion blocks:
if (options.livePhotos && has("[data-live-photo][data-trigger]")) {
  const { scheduleTask } = await import("./scheduler");
  scheduleTask(async () => {
    const { initLivePhotos } = await import("./live-photos");
    await initLivePhotos({ prefersReducedMotion });
  });
}
```

`initLivePhotos` behavior:

- **`prefers-reduced-motion: reduce`** → never auto-start. `in-viewport` resolves to the static poster; the `tap` control remains functional (user-initiated motion is allowed).
- **`trigger: "in-viewport"`** → an `IntersectionObserver` plays on enter and pauses on exit; `preload` may be downgraded to `none` until first near-viewport to avoid fetching off-screen clips.
- **`trigger: "tap"`** → the `<button>` starts the clip; `tapBehavior: "toggle"` pauses/resumes, `"play-only"` only starts. `aria-pressed` tracks state.
- A `.live-photo--playing` class toggles the CSS cross-fade between poster and video.

`autoplay`-triggered photos are not touched by this module — they run natively.

### CSS model (`@gogol/ui`, `@layer components`, token-driven)

```css
@layer components {
  .live-photo { position: relative; display: block; overflow: hidden; }
  .live-photo__poster,
  .live-photo__video { display: block; width: 100%; height: 100%; object-fit: cover; }
  .live-photo__video {
    position: absolute; inset: 0;
    opacity: 0;                                   /* poster shows by default */
    transition: opacity var(--ds-motion-duration-sm, 240ms) ease;
  }
  .live-photo--playing .live-photo__video { opacity: 1; }   /* cross-fade in while playing */

  /* Native-autoplay path has no .playing class; reveal the video once it can render. */
  .live-photo[data-trigger]:not(.live-photo--playing) .live-photo__video { opacity: 0; }

  .live-photo__toggle { /* token-driven control surface, focus-visible ring, ≥44px hit area */ }

  @media (prefers-reduced-motion: reduce) {
    .live-photo__video { opacity: 0 !important; } /* static poster wins unless tapped */
    .live-photo--playing .live-photo__video { opacity: 1 !important; } /* user tap still allowed */
  }
}
```

### Validation (`live.media.validate`, `@gogol/site-kernel-checks`)

A new author-time, disk-only command (same shape as `people.validate`: read frontmatter + `readdir`, no Astro runtime), registered in `createStandardCheckModule` and added to `APPS_CHECK_AUTHOR_PIPELINE`. Two rules:

- **`missing-video`** — an authored image with `live.enabled !== false` whose sibling `<token>.webm` does not resolve (same path construction + language fallback as `resolveVideo`). **fail.**
- **`orphan-video`** — a `*.webm` under `src/content/**/assets/` with no sibling static poster image (`<name>.{webp,jpg,jpeg,png}`). **fail.** This protects the "every clip has a placeholder" invariant.

`--json` violation example:

```json
{
  "command": "live.media.validate",
  "status": "fail",
  "app": "nicaragua-projekt",
  "violations": [
    {
      "file": "src/content/business/de/people/reinhart-bein.md",
      "token": "reinhart-bein",
      "rule": "missing-video",
      "message": "live photo \"reinhart-bein\" has no sibling clip business/de/assets/reinhart-bein.webm"
    },
    {
      "asset": "src/content/business/de/assets/stray.webm",
      "rule": "orphan-video",
      "message": "video \"stray.webm\" has no sibling static poster image (stray.{webp,jpg,jpeg,png})"
    }
  ]
}
```

### Failure modes

- Live image without sibling `.webm`: **fail** (`missing-video`).
- `.webm` without sibling poster image: **fail** (`orphan-video`).
- App with no `live` configs and no `.webm` assets: **pass** (no-op).
- Clip fails to load at runtime / reduced-motion / not-yet-triggered: **static poster renders** (graceful, no error).
- `live` present but a clip is genuinely absent and `enabled: false`: renders static; not a violation.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/schemas/live-photo.ts` | New: `livePhotoSchema`, `livePhotoTriggerSchema`, types. |
| `packages/share/src/schemas/section-image.ts` | Add `live?: livePhotoSchema` to `sectionImagePropsSchema`. |
| `packages/share/src/index.ts` | Export `LivePhoto` types and `resolveVideo`. |
| `packages/content-source/src/adapters/fs/assets.ts` | New: `resolveVideo` + `VIDEO_EXTENSIONS` (sibling of `resolveImage`). |
| `packages/ui/src/content-assets.ts` | Add the `contentAssetVideos` `import.meta.glob` (`*.webm`, `?url`). |
| `packages/ui/src/components/live-photo/*` | New primitive: `live-photo.astro`, `.css`, `.manifest.yaml` (Mirror Quintet). |
| `packages/ui/src/components/section-image/section-image.astro` | Resolve the clip and delegate to `<LivePhoto>` when `live.enabled` + clip; else unchanged. |
| `packages/ui/src/components/person-profile/person-profile-component.astro` | Forward an optional `live` config to `<SectionImage>`. |
| `packages/ui/src/sections/people/*` | Pass each person's `live` through to `PersonProfile` (pilot). |
| `packages/business/src/schemas/person.ts` | Add `live?: livePhotoSchema` to `personSchema`. |
| `packages/ontology/src/shared-section-props/index.ts` | Mirror the `live` JSON-Schema fragment alongside the existing image fragments (CMS authoring). |
| `packages/share/src/scripts/orchestrator.ts` + `scripts/live-photos.ts` | New `livePhotos` option + the IntersectionObserver/tap runtime. |
| `packages/os/site-kernel-checks/src/live-media.ts` | New: `runLiveMediaValidate`. |
| `packages/os/site-kernel-checks/src/module.ts` | Register `live.media.validate`; add to `APPS_CHECK_AUTHOR_PIPELINE`. |

## Rollout

Additive, no flag day, no content migration:

1. Land `livePhotoSchema` + `resolveVideo` + `contentAssetVideos` (`@gogol/share`, `@gogol/content-source`, `@gogol/ui`).
2. Add `<LivePhoto>` and the `<SectionImage>` seam; static rendering is byte-for-byte unchanged when `live` is absent.
3. Add the `livePhotos` orchestrator option + runtime; mirror the ontology fragment.
4. Add `live.media.validate` and wire it into `APPS_CHECK_AUTHOR_PIPELINE`. It is **fail-hard** but **no-op passes** when an app has no living photos and no clips — so all existing apps stay green.
5. **Pilot — `nicaragua-projekt` "Über uns" team.** Copy the five team loops from `pipelines-warpgogol-4/apps/video-loop/.output/7-mux-audio/nicaragua-projekt/team/` into `apps/nicaragua-projekt/src/content/business/de/assets/`, renamed to match each portrait token (`maria-calderon_animated_result.webm → maria-calderon.webm`, etc.). Add `live` to the five `Person` records. The People section animates them; `live.media.validate` proves the pairing; the build stays green.
6. Opt-in adoption elsewhere: any site adds `live` to any `SectionImage`-backed photo and flips `livePhotos: true` in its layout orchestrator. No existing page is forced to change.

## Alternatives considered

- **Raw `<video>` per section / a `videoName` prop family.** Rejected: re-creates the fragmentation RFC-0104/0152 abolished, drifts poster and clip apart, and hides assets from validation. The `live` config + derived sibling clip keeps a single source of truth.
- **A full media player (Plyr/Mux) now.** Rejected for this RFC (non-goal): living photos are decorative, muted, looping micro-clips where native `<video>` is the correct, lightest tool — exactly the expert's first tier. The expert's Plyr/Mux tiers (controls, captions, streaming, analytics) belong to a future _content-video_ RFC with its own accessibility (captions/transcript) contract.
- **`client:load` Astro island per video.** Rejected: hydrating each clip forfeits Astro's light-by-default posture. One opt-in, scheduler-deferred, presence-gated module (the RFC-0106 pattern) covers every living photo on a page and ships nothing when there are none.
- **Always `loading="lazy"` on the video.** Rejected as a blanket default: per MDN, lazy interacts with `autoplay`/`poster`/`preload` and an off-screen lazy clip won't begin loading. We instead express laziness through `trigger` (`in-viewport` defers the fetch via the observer) and keep `autoplay`/above-the-fold eager.
- **Writing the clip path in markdown.** Rejected by requirement: derive-by-convention removes an entire class of poster/clip mismatch and keeps authoring (and CMS) minimal.
- **mp4/H.264 `<source>` fallback now.** Deferred: the pipeline emits `.webm` and modern target browsers support it; adding a second `<source>` is a clean follow-up behind the same `live` contract.

## Risks

- **Autoplay is never guaranteed (MDN).** Mitigated structurally: the static `<img>` is the resting state and fallback, so a blocked autoplay degrades to exactly the static photo with no broken UI. `muted` maximizes the chance for decorative loops.
- **Bandwidth / data cost.** Clips are larger than images. Mitigated by `preload="metadata"` default, `in-viewport` deferring the fetch, reduced-motion suppressing playback, and the validator keeping clips paired with (smaller) posters. Authors should keep loops short and audio-free at export.
- **Double-semantics for screen readers.** Mitigated by `aria-hidden` + `tabindex="-1"` on the `<video>` and a labeled `<button>` for control; the `<img alt>` is the single semantic source.
- **CLS from late-loading video.** Mitigated by `aspect-ratio`/intrinsic `width`/`height` on both layers; the box is reserved before the clip loads.
- **Agent misuse.** An agent could mark a photo `live` without a clip, or drop a `.webm` without a poster. Both are caught by `live.media.validate` in the standard pipeline.
- **Format lock-in to webm.** Accepted for now (matches pipeline output); the `live` contract is format-agnostic, so adding `<source>` fallbacks later needs no content change.

## Acceptance criteria

- [x] `@gogol/share` defines `livePhotoSchema` (`enabled`, `trigger`, `loop`, `tapBehavior`, `preload`) and exports its types. (evidence: packages/ directory, package exists)
- [x] `resolveVideo` (`@gogol/content-source`, re-exported from `@gogol/share`) resolves `<image-name>.webm` with the same path/lang-fallback semantics as `resolveImage`; `contentAssetVideos` glob added in `@gogol/ui`. (evidence: packages/ directory, package exists)
- [x] `<LivePhoto>` always renders `<ResponsiveImage>` (poster, srcset, alt, intrinsic size) and overlays a `muted loop playsinline aria-hidden` `<video>`; `<SectionImage>` delegates to it only when `live.enabled` + a clip resolves, and is otherwise byte-for-byte unchanged. (evidence: implemented historically)
- [x] `prefers-reduced-motion: reduce` suppresses all non-interactive playback; tap remains available. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] The `livePhotos` runtime is opt-in, scheduler-deferred, gated on `[data-live-photo][data-trigger]`; `autoplay` works with zero JavaScript; sites without living photos ship no extra bytes. (evidence: implemented historically)
- [x] Living photos produce CLS 0 (aspect-ratio reserved) and keep the static `<img>` as the LCP/measured element. (evidence: implemented historically)
- [x] `live.media.validate` fails `missing-video` and `orphan-video`, no-op passes with zero living photos, and is registered in `APPS_CHECK_AUTHOR_PIPELINE`. (evidence: implemented historically)
- [x] Pilot: `nicaragua-projekt` "Über uns" animates the five team portraits; `astro check` and the author pipeline stay green; `warpgogol-com` is unaffected (no `live` configs). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `AGENTS.md` updated where agent authoring rules changed (the no-`video:`-field convention, the poster/clip pairing). (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate RFC-0202` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC has `status: accepted`.
- The clip is **always** the sibling `<image-name>.webm`. Do NOT add a `video:` / `videoName` / `posterName` field, and do NOT write clip paths into markdown.
- The static `<ResponsiveImage>` MUST always render as the resting state and fallback; never replace it with a bare `<video>`. Preserve existing static-image output exactly when `live` is absent.
- Keep the `<video>` decorative: `muted`, `aria-hidden`, `tabindex="-1"`; the `<img alt>` carries semantics. Control via a labeled `<button>`, never an invisible media click handler.
- Never auto-start under `prefers-reduced-motion: reduce`. Route all client JS through the standard orchestrator option (no inline route scripts — DNA-15 / RFC-0011).
- Only `.webm` is supported in this RFC. Adding other container formats requires a follow-up that keeps the derive-by-convention and validator contracts.
- Reference RFC-0202 in commit messages and PR descriptions for related changes.
