/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0202] Canonical LivePhoto config — the content contract that turns a static authored
  image into a "living photo": a looping, muted, decorative <video> overlaid on the existing
  <ResponsiveImage> (RFC-0152), which always remains the resting state / poster / fallback.
  This schema configures WHETHER a photo is live and HOW it plays. It deliberately names NO
  file: the clip is the sibling `<image-name>.webm`, resolved by convention (resolveVideo).
</purpose>
<non-goals>
  <item>Do not carry a video/poster path — the clip is derived from the image token.</item>
  <item>Do not implement playback or resolution — that is @warpgogol/werkstatt-site/ui + resolveVideo.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0202: introduced the LivePhoto content contract.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

/** How the loop starts. */
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
