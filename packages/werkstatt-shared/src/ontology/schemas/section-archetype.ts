/*
<MODULE_CONTRACT>
<purpose>
Zod schema for RFC-0072 section archetype catalog entries stored under
packages/werkstatt-site/src/domain/ontology/archetypes/sections/ recursive YAML catalog files.
</purpose>
<non-goals>
  <item>Do not parse YAML here.</item>
  <item>Do not resolve imports or generate files here.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0072: Initial archetype catalog contract.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { cosmicNameSchema } from "../cosmic/index.ts";
import { industrySchema } from "../enums.ts";

const archetypeIdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/,
    "archetype id must be kebab-case segments separated by dots",
  );

const layoutHintSchema = z.enum([
  "single-column",
  "split",
  "card-grid",
  "decision-card",
  "horizontal-row",
  "stacked-bands",
]);

/**
 * RFC-0103: closed enum of canonical body kinds. Each non-composite archetype
 * declares which body component renders authored content (list / split-list /
 * stats / cards / paragraphs / comparison / rich). Composite archetypes (hero,
 * hero-decision-card, founder-trust-card, donation-card, price-card, faq-list,
 * markdown) declare `bodyKind: composite` and own their bespoke layout.
 */
const archetypeBodyKindSchema = z.enum([
  "list",
  "split-list",
  "stats",
  "cards",
  "paragraphs",
  "comparison",
  "rich",
  "composite",
]);

const recommendedItemCountSchema = z
  .object({
    min: z.number().int().nonnegative().optional(),
    max: z.number().int().nonnegative().optional(),
  })
  .strict();

/**
 * RFC-0101 + RFC-0102 + RFC-0103: archetype propsSchema accepts either
 *   (a) a `shape:` string with a Zod / JSON Schema expression (legacy form), or
 *   (b) a `compose: [...]` list of shared-section-props fragment ids that the
 *       runtime resolves through composeManifestPropsSchema().
 * Both forms may be combined when the archetype needs to add section-specific
 * fields on top of the shared fragments — see transparency.yaml.
 */
const propsSchemaFragmentSchema = z
  .object({
    $shape: z.enum(["zod", "json-schema"]).default("zod"),
    shape: z.string().min(1).optional(),
    compose: z
      .array(
        z
          .string()
          .regex(/^[a-z][a-z0-9-]*(@\d+)?$/, "must match `<id>` or `<id>@<version>` (RFC-0119)"),
      )
      .optional(),
  })
  .refine((v) => Boolean(v.shape) || Boolean(v.compose && v.compose.length > 0), {
    message: "propsSchema must declare `shape` or non-empty `compose` (or both)",
  });

export const sectionArchetypeSchema = z.object({
  id: archetypeIdSchema,
  displayName: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i, "version must be valid semver"),
  semanticRole: z.string().min(1),
  description: z.string().min(1),
  expectedIntents: z.array(z.string().min(1)).min(1),
  expectedIndustryFit: z.array(industrySchema).default([]),
  layoutHint: layoutHintSchema,
  /** RFC-0103: required for non-composite archetypes; composite signals bespoke layout. */
  bodyKind: archetypeBodyKindSchema.optional(),
  /** RFC-0072: advisory min/max number of body items the archetype expects. */
  recommendedItemCount: recommendedItemCountSchema.optional(),
  propsSchema: propsSchemaFragmentSchema,
  acceptedCosmicNames: z.array(cosmicNameSchema).min(1),
  constraints: z.record(z.string(), z.unknown()).default({}),
});

export type ArchetypeBodyKind = z.infer<typeof archetypeBodyKindSchema>;
export type RecommendedItemCount = z.infer<typeof recommendedItemCountSchema>;

export type SectionArchetypeContract = z.infer<typeof sectionArchetypeSchema>;
export type SectionArchetypeId = z.infer<typeof archetypeIdSchema>;
export type SectionArchetypeLayoutHint = z.infer<typeof layoutHintSchema>;
