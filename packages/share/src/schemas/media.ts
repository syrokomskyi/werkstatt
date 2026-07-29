/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0210] Canonical media playback contract — the single, source-agnostic config that drives
  every <video> on the platform through ONE primitive (<Media>) and ONE delivery policy
  (HLS-first → progressive MP4 → optional WebM; native-only for decorative loops). The contract
  is "not a file format" but a profile-driven policy: `feature` (content video, controls, HLS
  ABR ladder, captions), `background` (muted loop bg), and `ambient` (living photo, RFC-0202,
  folded in). It also defines the GENERATED video manifest shape the build-time generator emits
  and <Media> reads synchronously (the video analogue of RFC-0204's image-variant manifest).
</purpose>
<non-goals>
  <item>Do not resolve files — that is @warpgogol/content-source (resolveMedia) + the generated manifest.</item>
  <item>Do not implement playback or transcoding — that is @warpgogol/ui + the kernel command.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0210: introduced the unified media playback contract + video manifest types.</item>
  <item>RFC-0525: added av1 field to VideoManifestSources for AV1 progressive delivery.</item>
  <item>RFC-0525: added opt-in av1 boolean to mediaSchema (default false) to skip slow AV1 encoding.</item>
  <item>RFC-0591: added maxSizeMb field to mediaSchema for two-pass bitrate-capped MP4 encoding.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import type { LivePhoto } from "./live-photo.ts";

/** The three delivery profiles. Profile drives generated formats, transport, player JS, and a11y. */
export const mediaProfileSchema = z.enum(["feature", "background", "ambient"]);
export type MediaProfile = z.infer<typeof mediaProfileSchema>;

/** When the loop starts (ambient/background) — mirrors RFC-0202 livePhotoTriggerSchema. */
export const mediaTriggerSchema = z.enum(["in-viewport", "tap", "autoplay"]);
export type MediaTrigger = z.infer<typeof mediaTriggerSchema>;

/** Source addressing. Exactly one of `name` (explicit token) or `fromImage` (ambient convention). */
export const mediaSourceSchema = z
  .object({
    /** Bare media token (RFC-0053 style). Resolved like resolveImage: <lang>/assets/<name>.<ext>. */
    name: z.string().min(1).optional(),
    /** Ambient only: derive the clip from a sibling image token (RFC-0202 convention). */
    fromImage: z.string().min(1).optional(),
  })
  .strict();
export type MediaSource = z.infer<typeof mediaSourceSchema>;

/** One caption/subtitle track (WCAG 1.2.2). VTT resolved by convention (<token>.<lang>.vtt) or named. */
export const mediaCaptionSchema = z
  .object({
    lang: z.string().min(2),
    label: z.string().optional(),
    /** Default true: this track is shown by default for its language. */
    default: z.boolean().optional(),
  })
  .strict();
export type MediaCaption = z.infer<typeof mediaCaptionSchema>;

export const mediaSchema = z
  .object({
    profile: mediaProfileSchema.default("feature"),
    source: mediaSourceSchema,

    /** Poster image token. Defaults: sibling <token> raster, else generated first-frame poster. */
    poster: z.string().optional(),
    /**
     * Seconds offset for the auto-generated first-frame poster (ffmpeg `-ss`). Default 1.
     * Use to skip an intro/title card and capture a representative, fully-rendered frame.
     */
    posterTime: z.number().nonnegative().optional(),
    /** Required by the validator for feature; ambient/background <video> stays aria-hidden. */
    alt: z.string().optional(),

    /** feature: ABR ladder depth. "auto" picks renditions by source height; [] = single rendition. */
    ladder: z.union([z.literal("auto"), z.array(z.number().int().positive())]).optional(),

    /**
     * feature: opt-in AV1 progressive delivery via libsvtav1 (RFC-0525). AV1 is the slowest encoder
     * in the pipeline; default false keeps build times fast. Set to true only for high-traffic
     * feature videos where AV1 bandwidth savings justify the encoding cost.
     */
    av1: z.boolean().optional(),

    /**
     * Maximum size of the progressive MP4 file in MiB. When set, MP4 encoding switches
     * to two-pass with a target bitrate calculated from the source duration. Default: 24
     * (1 MiB safety margin under Cloudflare's 25 MiB per-asset limit). Set to 0 to disable
     * two-pass and use CRF 17 (no size guarantee — may exceed the Cloudflare limit).
     */
    maxSizeMb: z.number().nonnegative().optional(),

    /** Playback behavior (profile-clamped at render: ambient/background force muted+loop, never controls). */
    autoplay: z.boolean().optional(),
    loop: z.boolean().optional(),
    muted: z.boolean().optional(),
    controls: z.boolean().optional(),
    preload: z.enum(["none", "metadata", "auto"]).optional(),

    /** ambient/background only (RFC-0202): when the loop starts and what a tap does. */
    trigger: mediaTriggerSchema.optional(),
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
      ctx.addIssue({
        code: "custom",
        message: "media.source needs exactly one of name | fromImage",
      });
    }
    if (m.profile !== "ambient" && hasFromImage) {
      ctx.addIssue({
        code: "custom",
        message: "source.fromImage is only valid for the ambient profile",
      });
    }
    if (m.profile === "feature" && !m.alt) {
      ctx.addIssue({ code: "custom", message: "feature media requires alt text" });
    }
  });
export type Media = z.infer<typeof mediaSchema>;

/**
 * [RFC-0210] Project a legacy RFC-0202 LivePhoto config (paired with its host image token) onto
 * an equivalent ambient Media config. This is the seam that lets existing `live:` authoring keep
 * working while resolving through the single media contract — no content migration required.
 * Returns null when the photo is not live (enabled === false).
 */
export function livePhotoToMedia(live: LivePhoto | undefined, imageName: string): Media | null {
  if (!live || live.enabled === false) return null;
  return {
    profile: "ambient",
    source: { fromImage: imageName },
    trigger: live.trigger,
    loop: live.loop,
    tapBehavior: live.tapBehavior,
    preload: live.preload,
  } as Media;
}

// ─── GENERATED video manifest (RFC-0210 — written by video.variants.generate) ────────────────

/** One playable caption track in the generated manifest. */
export interface VideoCaptionTrack {
  lang: string;
  label?: string;
  default?: boolean;
  url: string;
}

/** Derived-format URLs for one source video, keyed by container/transport. */
export interface VideoManifestSources {
  /** HLS master playlist (feature only). */
  hls?: string;
  /** Progressive H.264/AAC MP4 — the universal fallback. */
  mp4?: string;
  /** Optional VP9 WebM enhancement. */
  webm?: string;
  /** AV1-in-WebM progressive (RFC-0525). Feature only. */
  av1?: string;
}

export interface VideoManifestEntry {
  /** Content-relative source path key, e.g. /src/content/pages/uk/assets/promo.mp4. */
  origin: string;
  profile: MediaProfile;
  /** Poster URL (authored sibling raster or generated first-frame). */
  poster?: string;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  durationSec?: number;
  hasAudio?: boolean;
  sources: VideoManifestSources;
  captions?: VideoCaptionTrack[];
}

export interface VideoManifest {
  version: 1;
  /** Primary lookup: content-relative source path → entry. */
  byOrigin: Record<string, VideoManifestEntry>;
  /** Secondary lookup: `<lang>/<token>` → byOrigin key (render-side token resolution). */
  byToken: Record<string, string>;
}

/**
 * [RFC-0234] Derived delivery set for one living-photo / ambient clip. The author ships exactly one
 * source file (`<token>.webm` OR `<token>.mp4`, never both); the build derives the cross-device set
 * so the clip plays everywhere. `webm` is the desktop/Android source (alpha preserved); `mp4` is the
 * iOS-playable H.264 fallback. Since H.264 cannot carry alpha, a TRANSPARENT source is flattened
 * over the site background colour (`mp4Bg`) so the iOS clip blends into the page instead of showing
 * a dirty box; an opaque source is transcoded/copied as-is. `alpha` records WebM transparency so the
 * desktop render stays transparent.
 */
export interface LiveVideoManifestEntry {
  /** Content-relative source path key, e.g. /src/content/people/de/assets/maria-calderon.webm. */
  origin: string;
  /** Desktop/Android VP9 WebM URL (served from public/_video/live; alpha preserved). */
  webm?: string;
  /** iOS-playable progressive H.264 MP4 URL (transparent sources flattened over `mp4Bg`). */
  mp4?: string;
  /** True when the source WebM carries an alpha channel (transparent subject). */
  alpha: boolean;
  /** ffmpeg `0xRRGGBB` background colour the alpha source was flattened over for the iOS MP4. */
  mp4Bg?: string;
}

export interface LiveVideoManifest {
  version: 1;
  /** Lookup: `<lang>/<token>` → derived entry. */
  byToken: Record<string, LiveVideoManifestEntry>;
}
