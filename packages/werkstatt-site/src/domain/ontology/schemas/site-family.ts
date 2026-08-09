/*
<MODULE_CONTRACT>
<purpose>
Zod schema for site-family definition files under packages/ontology/site-families/<id>/family.yaml.
A Site Family captures reusable onboarding recipes: detection signals, candidate biomes,
candidate constellations, required section archetypes, audit thresholds, and readiness baselines.
</purpose>
<non-goals>
  <item>Do not read files from disk.</item>
  <item>Do not validate referenced biome/constellation/archetype files here; runtime validators do that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0071: Add site-family contract to @warpgogol/werkstatt-site/ontology.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

const kebabId = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "id must be kebab-case (lowercase letters, digits, hyphens)");
const semver = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i, "version must be valid semver");

const eventNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*(?:-[a-z0-9-]+)*$/, "eventName must be kebab-case");

const detectionSignalsSchema = z
  .object({
    archetypePrimary: kebabId.optional(),
    audienceAny: z.array(z.string().min(1)).default([]),
    conversionPrimary: kebabId.optional(),
    materialMentionsAny: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const siteFamilyDetectionSchema = z
  .object({
    signals: detectionSignalsSchema,
    threshold: z.number().min(0).max(1),
  })
  .strict();

const conversionGoalSchema = z
  .object({
    id: kebabId,
    eventName: eventNameSchema,
  })
  .strict();

const auditThresholdValueSchema = z.enum([
  "info",
  "warn",
  "warning",
  "required",
  "error",
  "forbidden",
]);

export const siteFamilyRecipeSchema = z
  .object({
    candidateBiomes: z.array(kebabId).min(1),
    candidateConstellations: z.array(kebabId).min(1),
    requiredSectionArchetypes: z.array(kebabId).min(1),
    conversionGoals: z
      .object({
        primary: conversionGoalSchema,
        secondary: z.array(conversionGoalSchema).default([]),
      })
      .strict(),
    auditThresholds: z.record(z.string().min(1), auditThresholdValueSchema),
    agentReadinessBaseline: z
      .object({
        maxBytesToCta: z.number().int().positive(),
        requireStructuredData: z.array(z.string().min(1)).default([]),
      })
      .strict(),
  })
  .strict();

export const siteFamilySchema = z
  .object({
    id: kebabId,
    displayName: z.string().min(1),
    version: semver,
    description: z.string().min(1),
    detection: siteFamilyDetectionSchema,
    recipe: siteFamilyRecipeSchema,
  })
  .strict();

export type SiteFamilyDetection = z.infer<typeof siteFamilyDetectionSchema>;
export type SiteFamilyRecipe = z.infer<typeof siteFamilyRecipeSchema>;
export type SiteFamily = z.infer<typeof siteFamilySchema>;
export const SiteFamilyContract = siteFamilySchema;
