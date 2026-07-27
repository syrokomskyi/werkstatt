/*
<MODULE_CONTRACT>
<purpose>
[RFC-0102] Canonical SectionHeader contract — structured heading (string or
tone-segmented array), optional subheading, independent alignment, optional
section number, optional level override.
</purpose>
<non-goals>
  <item>Do not declare body content (RFC-0103) or CTA shape (RFC-0104).</item>
  <item>Do not couple header alignment to body alignment (each is independent).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { horizontalAlignSchema } from "./horizontal-align.ts";
import { effectStackSchema } from "./effects.ts";

export const headingToneSchema = z.enum(["default", "primary", "accent", "muted", "inverse"]);
export type HeadingTone = z.infer<typeof headingToneSchema>;

export const headingSegmentSchema = z
  .object({
    text: z.string().min(1),
    tone: headingToneSchema.optional(),
  })
  .strict();
export type HeadingSegment = z.infer<typeof headingSegmentSchema>;

/**
 * RFC-0102 — HeadingContent. Either a plain string (entire title renders in
 * tone "default") or an array of tone-segmented runs that the renderer wraps
 * in <span class="section-header__title-segment section-header__title-segment--{tone}">.
 */
export const headingContentSchema = z.union([
  z.string().min(1),
  z.array(headingSegmentSchema).min(1),
]);
export type HeadingContent = z.infer<typeof headingContentSchema>;

export const sectionHeaderLevelSchema = z.union([z.literal(1), z.literal(2)]);
export type SectionHeaderLevel = z.infer<typeof sectionHeaderLevelSchema>;

export const sectionHeaderSchema = z
  .object({
    /** Resolved upstream by blocks-renderer. */
    sectionNumber: z.string().optional(),
    /** Suppress the section number even if blocks-renderer supplied one. */
    hideSectionNumber: z.boolean().optional(),
    heading: headingContentSchema,
    /** One short paragraph under the title. Longer copy belongs in body.kind: paragraphs (RFC-0103). */
    subheading: z.string().optional(),
    /** Independent header alignment; default "left". */
    align: horizontalAlignSchema.optional(),
    /** h1 for hero archetype, h2 otherwise. Default 2. */
    level: sectionHeaderLevelSchema.optional(),
    /** Used as aria-labelledby target by <SectionShell>. */
    id: z.string().optional(),
    /**
     * RFC-0151 — resolved typographic effect stack for the `heading` target.
     * Section composites pass resolveEffectsForTarget(effects, "heading").
     * When absent or empty, the header renders exactly as before.
     */
    headingEffects: effectStackSchema.optional(),
    /**
     * RFC-0151 — resolved typographic effect stack for the `subheading` target.
     */
    subheadingEffects: effectStackSchema.optional(),
  })
  .strict();

export type SectionHeaderProps = z.infer<typeof sectionHeaderSchema>;
