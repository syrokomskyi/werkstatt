/*
<MODULE_CONTRACT>
<purpose>
[RFC-0103 + RFC-0134] Canonical SectionBodyContent discriminated union. One shape covers
every non-composite body kind: list / split-list / stats / cards / paragraphs /
comparison / rich. Body-level visual effects are authored through composable
`effects[]` assignments rather than legacy surface-specific props.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
  <item>RFC-0134 replaces legacy surface config with composable effects assignments on supported body kinds.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { effectsSchema } from "./effects.ts";
import { horizontalAlignSchema } from "./horizontal-align.ts";
import { iconColorSchema } from "./icon-color.ts";
import { standardListItemSchema } from "./standard-list-item.ts";
import { standardCardSchema } from "./section-cards.ts";
import { statItemSchema } from "./section-stats.ts";

export const sectionBodyKindSchema = z.enum([
  "list",
  "split-list",
  "stats",
  "cards",
  "paragraphs",
  "comparison",
  "rich",
  "composite",
]);
export type SectionBodyKind = z.infer<typeof sectionBodyKindSchema>;

const listBodySchema = z
  .object({
    kind: z.literal("list"),
    items: z.array(standardListItemSchema).min(1),
    note: z.string().optional(),
    iconColor: iconColorSchema.optional(),
    align: horizontalAlignSchema.optional(),
    itemAlign: horizontalAlignSchema.optional(),
    hideMarkers: z.boolean().optional(),
    effects: effectsSchema.optional(),
  })
  .strict();

const splitListBodySchema = z
  .object({
    kind: z.literal("split-list"),
    primaryItems: z.array(standardListItemSchema).min(1),
    secondaryItems: z.array(standardListItemSchema).optional(),
    labels: z
      .object({
        primary: z.string().min(1),
        secondary: z.string().min(1),
      })
      .optional(),
    iconColors: z
      .object({
        primary: iconColorSchema.optional(),
        secondary: iconColorSchema.optional(),
      })
      .optional(),
    align: horizontalAlignSchema.optional(),
    effects: effectsSchema.optional(),
  })
  .strict();

const statsBodySchema = z
  .object({
    kind: z.literal("stats"),
    stats: z.array(statItemSchema).min(1),
    animated: z.boolean().optional(),
    align: horizontalAlignSchema.optional(),
  })
  .strict();

const cardsBodySchema = z
  .object({
    kind: z.literal("cards"),
    cards: z.array(standardCardSchema).min(1),
    layout: z.enum(["grid", "list"]).optional(),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
    align: horizontalAlignSchema.optional(),
    effects: effectsSchema.optional(),
  })
  .strict();

const paragraphsBodySchema = z
  .object({
    kind: z.literal("paragraphs"),
    paragraphs: z.array(z.string().min(1)).min(1),
    align: horizontalAlignSchema.optional(),
  })
  .strict();

const comparisonBodySchema = z
  .object({
    kind: z.literal("comparison"),
    rows: z.array(z.object({ left: z.string().min(1), right: z.string().min(1) }).strict()).min(1),
    labels: z.object({ left: z.string().min(1), right: z.string().min(1) }).optional(),
    align: horizontalAlignSchema.optional(),
    effects: effectsSchema.optional(),
  })
  .strict();

const richBodySchema = z
  .object({
    kind: z.literal("rich"),
    contentRef: z.string().min(1),
    animateNumbers: z.boolean().optional(),
    align: horizontalAlignSchema.optional(),
  })
  .strict();

export const sectionBodyContentSchema = z.discriminatedUnion("kind", [
  listBodySchema,
  splitListBodySchema,
  statsBodySchema,
  cardsBodySchema,
  paragraphsBodySchema,
  comparisonBodySchema,
  richBodySchema,
]);

export type SectionListBody = z.infer<typeof listBodySchema>;
export type SectionSplitListBody = z.infer<typeof splitListBodySchema>;
export type SectionStatsBody = z.infer<typeof statsBodySchema>;
export type SectionCardsBody = z.infer<typeof cardsBodySchema>;
export type SectionParagraphsBody = z.infer<typeof paragraphsBodySchema>;
export type SectionComparisonBody = z.infer<typeof comparisonBodySchema>;
export type SectionRichBody = z.infer<typeof richBodySchema>;
export type SectionBodyContent = z.infer<typeof sectionBodyContentSchema>;
