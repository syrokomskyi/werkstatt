/*
<MODULE_CONTRACT>
<purpose>
Shared Zod schemas for the content-declared feature graph (RFC-0018).
App-agnostic — every app that adopts RFC-0018 imports from here instead of
copy-pasting. Canonical home per RFC-0033.
</purpose>
<non-goals>
  <item>Do not import from astro:content or apps/*.</item>
  <item>Do not handle runtime resolution or navigation logic.</item>
  <item>Do not manage state or side effects.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0033: Moved from app content schemas/features to @gogol/share. Import switched from "astro/zod" to "zod" for framework neutrality.</item>
  <item>RFC-0183: Added Feature Policy schema for policy embedded in existing RFC-0047 content domains.</item>
</CHANGE_SUMMARY>
*/

// [RFC-0018] Feature graph schemas — canonical implementation in packages/share.
// Import z from "zod" — not "astro/zod" — so this package stays framework-neutral.
import { z } from "zod";

const featureVisibilitySchema = z.enum(["enabled", "disabled"]);

export const featurePolicyVisibilitySchema = z.enum(["enabled", "disabled", "hidden", "draft"]);

export const featurePolicyBehaviorValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const featurePolicySchema = z.object({
  visibility: featurePolicyVisibilitySchema.optional(),
  behavior: z.record(z.string(), featurePolicyBehaviorValueSchema).optional(),
  reason: z.string().optional(),
  expiresAt: z.string().optional(),
  audience: z.string().optional(),
});

export const featurePolicyTargetKindSchema = z.enum(["page", "section", "component", "item"]);

export const featurePolicyTargetRefSchema = z.object({
  kind: featurePolicyTargetKindSchema,
  pageId: z.string().optional(),
  blockId: z.string().optional(),
  componentId: z.string().optional(),
  itemId: z.string().optional(),
  lang: z.string().optional(),
});

export const resolvedFeaturePolicySchema = z.object({
  target: featurePolicyTargetRefSchema,
  visibility: featurePolicyVisibilitySchema,
  behavior: z.record(z.string(), featurePolicyBehaviorValueSchema),
  sourcePath: z.string(),
  inheritedFrom: featurePolicyTargetRefSchema.optional(),
});

const behaviorOverrideSchema = z.record(z.string(), z.any());

export const featureItemSchema = z.object({
  id: z.string(),
  visibility: featureVisibilitySchema,
  behavior: behaviorOverrideSchema.optional(),
});

export const featureComponentSchema = z.object({
  id: z.string(),
  componentPath: z.string(),
  anchor: z.string(),
  visibility: featureVisibilitySchema,
  items: z.array(featureItemSchema).optional(),
});

/**
 * Broad feature-graph category for a section node (RFC-0018).
 *
 * This is a FEATURE-GRAPH concept — it determines how the visibility engine
 * classifies and processes a section. It is NOT the per-section SemanticRole
 * from @gogol/ontology (DNA-17, RFC-0023), which identifies each section
 * individually (hero, dna, final-cta, …) and lives in manifest.yaml.
 *
 * SectionKind values:
 *   navigation — anchored nav / in-page links
 *   hero       — primary above-the-fold section
 *   content    — main informational section
 *   supporting — supplementary / secondary section
 *   cta        — conversion / call-to-action section
 *   custom     — does not fit the above categories
 */
export const sectionKindSchema = z.enum([
  "navigation",
  "hero",
  "content",
  "supporting",
  "cta",
  "custom",
]);

export const featureSectionSchema = z.object({
  id: z.string(),
  role: sectionKindSchema,
  anchor: z.string(),
  visibility: featureVisibilitySchema,
  components: z.array(featureComponentSchema),
});

export const featurePageSchema = z.object({
  id: z.string(),
  routeSlug: z.string(),
  visibility: featureVisibilitySchema,
  sections: z.array(featureSectionSchema),
});

export const sharedComponentFeatureSchema = z.object({
  id: z.string(),
  componentPath: z.string(),
  anchor: z.string(),
  visibility: featureVisibilitySchema,
  items: z.array(featureItemSchema).optional(),
});

export const siteFeaturesSchema = z
  .object({
    kind: z.enum(["page", "sharedComponent"]),
  })
  .loose();

export type FeatureVisibility = z.infer<typeof featureVisibilitySchema>;
export type FeaturePolicyVisibility = z.infer<typeof featurePolicyVisibilitySchema>;
export type FeaturePolicyBehaviorValue = z.infer<typeof featurePolicyBehaviorValueSchema>;
export type FeaturePolicy = z.infer<typeof featurePolicySchema>;
export type FeaturePolicyTargetKind = z.infer<typeof featurePolicyTargetKindSchema>;
export type FeaturePolicyTargetRef = z.infer<typeof featurePolicyTargetRefSchema>;
export type ResolvedFeaturePolicy = z.infer<typeof resolvedFeaturePolicySchema>;
export type BehaviorOverride = z.infer<typeof behaviorOverrideSchema>;
/** @see sectionKindSchema for the distinction between SectionKind and SemanticRole */
export type SectionKind = z.infer<typeof sectionKindSchema>;
export type FeatureItem = z.infer<typeof featureItemSchema>;
export type FeatureComponent = z.infer<typeof featureComponentSchema>;
export type FeatureSection = z.infer<typeof featureSectionSchema>;
export type FeaturePage = z.infer<typeof featurePageSchema>;
export type SharedComponentFeature = z.infer<typeof sharedComponentFeatureSchema>;
export type SiteFeature = z.infer<typeof siteFeaturesSchema>;
