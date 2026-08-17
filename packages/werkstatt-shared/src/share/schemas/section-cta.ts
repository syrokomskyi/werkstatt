/*
<MODULE_CONTRACT>
<purpose>
[RFC-0104] Canonical CtaConfig and CtaGroupConfig — one structured shape used
by every section that renders a call-to-action. Replaces the four ad-hoc CTA
shapes that lived on hero / final-cta / hero-decision-card / notausgang-block.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { horizontalAlignSchema } from "./horizontal-align.ts";
import { vendorIconConfigSchema } from "./standard-list-item.ts";

export const ctaVariantSchema = z.enum(["primary", "secondary", "ghost", "danger"]);
export type CtaVariant = z.infer<typeof ctaVariantSchema>;

export const ctaSizeSchema = z.enum(["sm", "md", "lg"]);
export type CtaSize = z.infer<typeof ctaSizeSchema>;

export const ctaIconPositionSchema = z.enum(["leading", "trailing"]);
export type CtaIconPosition = z.infer<typeof ctaIconPositionSchema>;

export const ctaTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("internal"),
      pageId: z.string().min(1),
      anchor: z.string().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("external"),
      href: z.string().min(1),
      rel: z.string().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("anchor"),
      anchor: z.string().min(1),
    })
    .strict(),
]);
export type CtaTarget = z.infer<typeof ctaTargetSchema>;

export const ctaConfigSchema = z
  .object({
    label: z.string().min(1),
    target: ctaTargetSchema,
    ariaLabel: z.string().optional(),
    variant: ctaVariantSchema.optional(),
    icon: vendorIconConfigSchema.optional(),
    iconPosition: ctaIconPositionSchema.optional(),
    size: ctaSizeSchema.optional(),
    fullWidth: z.boolean().optional(),
  })
  .strict();
export type CtaConfig = z.infer<typeof ctaConfigSchema>;

export const ctaGroupConfigSchema = z
  .object({
    align: horizontalAlignSchema.optional(),
    items: z.array(ctaConfigSchema).min(1),
  })
  .strict();
export type CtaGroupConfig = z.infer<typeof ctaGroupConfigSchema>;
