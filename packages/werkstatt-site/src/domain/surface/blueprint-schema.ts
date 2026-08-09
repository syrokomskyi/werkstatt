/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0193] Zod schema for the Blueprint contract (the declarative surface spec). Co-located with
  the Blueprint type in @warpgogol/surface to avoid a package cycle (the engine owns its own contract).
  The Blueprint YAML data files live in packages/ontology/blueprints/*.yaml; this schema validates
  them in blueprint.validate and during surface.generate expansion.
</purpose>
<non-goals>
  <item>Do not read files (callers supply parsed YAML objects).</item>
  <item>Do not cross-check datasets/constellations (blueprint.validate does that).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0193: initial schema.</item>
  <item>RFC-0496: add serviceSchema (BlueprintServiceConfig) to BlueprintLevel; add linkingParentSchema to linking.</item>
  <item>RFC-0497: add intersectionSchema (BlueprintIntersectionConfig) to BlueprintLevel.</item>
  <item>RFC-0500: add hubSchema (BlueprintHubConfig) to BlueprintLevel; add statusGateSchema (BlueprintStatusGate) to policy.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import type { Blueprint } from "./blueprint.ts";

const localizedString = z.record(z.string(), z.string());

const intRecord = z.record(z.string(), z.number().int());

// RFC-0490: pillar-hub configuration for depth-0 hub pages.
const pillarCtaSchema = z.object({
  label: localizedString,
  target: z.string().min(1),
});

const pillarHeroSchema = z.object({
  eyebrow: localizedString,
  heading: localizedString,
  lead: localizedString,
  primaryCta: pillarCtaSchema,
  secondaryCta: pillarCtaSchema,
});

const pillarAdaptationDimensionSchema = z.object({
  heading: localizedString,
  body: localizedString,
});

const pillarAdaptationSchema = z.object({
  heading: localizedString,
  dimensions: z.array(pillarAdaptationDimensionSchema).min(1),
});

const pillarProductPriceSchema = z.object({
  heading: localizedString,
  body: localizedString,
  priceRef: z.string().min(1),
});

const pillarFinalCtaSchema = z.object({
  heading: localizedString,
  body: localizedString,
  primaryCta: pillarCtaSchema,
  secondaryCta: pillarCtaSchema,
});

const pillarSchema = z.object({
  hero: pillarHeroSchema,
  adaptation: pillarAdaptationSchema,
  productPrice: pillarProductPriceSchema,
  finalCta: pillarFinalCtaSchema,
  catalogHeading: localizedString.optional(),
});

// RFC-0492: dossier configuration for depth-1 industry pages.
const industryPublicationGateSchema = z.object({
  minServiceCategories: z.number().int().min(0),
  minCustomerJourneys: z.number().int().min(0),
  minTrustSignals: z.number().int().min(0),
  minArchitectureEntries: z.number().int().min(0),
  minModuleMappings: z.number().int().min(0),
  minUniqueFaq: z.number().int().min(0),
});

const dossierSchema = z.object({
  gate: industryPublicationGateSchema,
  claimRestrictions: z.array(z.string().min(1)),
  doorwayMaxFlaggedShare: z.number().min(0).max(1),
  duplicateMaxSimilarity: z.number().min(0).max(1),
  mode: z.enum(["warn", "fail"]),
});

// RFC-0496: service configuration for depth-1 service dossier pages.
const servicePublicationGateSchema = z.object({
  minServiceVariants: z.number().int().min(0),
  minCustomerQuestions: z.number().int().min(0),
  minPriceModels: z.number().int().min(0),
  minFaq: z.number().int().min(0),
  minPageStructure: z.number().int().min(0),
});

const serviceSchema = z.object({
  gate: servicePublicationGateSchema,
  claimRestrictions: z.array(z.string().min(1)),
  mode: z.enum(["warn", "fail"]),
});

const intersectionGateSchema = z.object({
  minLocalServiceQuestions: z.number().int().min(0),
  minScenarios: z.number().int().min(0),
  minLocalEvidence: z.number().int().min(0),
  minUniqueContentBlocks: z.number().int().min(0),
  minUniqueFaq: z.number().int().min(0),
  minSources: z.number().int().min(0),
});

const intersectionSimilaritySchema = z.object({
  similarityToIndustryPage: z.number().min(0).max(1),
  similarityToCityPage: z.number().min(0).max(1),
  similarityToServicePage: z.number().min(0).max(1),
  similarityToOtherIntersections: z.number().min(0).max(1),
});

const intersectionSchema = z.object({
  gate: intersectionGateSchema,
  similarity: intersectionSimilaritySchema,
  substanceIndependenceThreshold: z.number().min(0).max(1),
  mode: z.enum(["warn", "fail"]),
});

// RFC-0500: hub configuration for depth-0 editorial knowledge hubs (ratgeber).
const hubSchema = z.object({
  cardFields: z.array(z.string().min(1)).min(1),
  reservedSlugs: z.array(z.string().min(1)),
});

// RFC-0500: status gate — only records with allowed statuses are emitted as surface entries.
const statusGateSchema = z.object({
  allowedStatuses: z.array(z.string().min(1)),
  excludedStatuses: z.array(z.string().min(1)),
});

// RFC-0496: cross-surface parent linking.
const linkingParentSchema = z.object({
  surface: z.string().min(1),
  depth: z.number().int().min(0),
  joinField: z.string().min(1),
});

// RFC-0325: static article metadata for a level with no per-record binding (depth-0 hubs).
const blueprintLevelArticleSchema = z.object({
  publishedAt: z.string().min(1),
  updatedAt: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
});

const evidencePolicySchema = z.object({
  approvedNarrative: z.enum(["required", "optional"]).optional(),
  requiredRecordFields: z.array(z.string().min(1)).optional(),
  preferredEvidenceSources: z.array(z.string().min(1)).optional(),
  minTupleSpecificFacts: z.number().int().min(0).optional(),
  minWerkEvidence: z.number().int().min(0).optional(),
  existenceSource: z.enum(["records", "works"]).optional(),
  freshness: z.enum(["valid-and-current", "valid"]).optional(),
  duplicate: z
    .object({
      method: z.enum(["shingle", "simhash"]).optional(),
      maxSimilarityWithinCluster: z.number().min(0).max(1).optional(),
    })
    .optional(),
  leadImage: z.enum(["required", "warning", "optional"]).optional(),
  mode: z.enum(["error", "warning"]).optional(),
});

const demandPolicySchema = z.object({
  minVolume: z.number().min(0).optional(),
  allowIntents: z
    .array(z.enum(["informational", "commercial", "transactional", "navigational"]))
    .optional(),
  missing: z.enum(["noindex", "do-not-emit"]).optional(),
  staleAfterDays: z.number().int().min(0).optional(),
});

const depthRolePolicySchema = z.object({
  indexability: z.enum(["index", "navigation-noindex", "evidence-gated"]),
  canonicalTarget: z.union([z.literal("tradeHub"), z.number().int().min(0)]).optional(),
  follow: z.boolean().optional(),
  includeInSitemap: z.boolean().optional(),
  geo: z.enum(["full", "twin-only", "off"]).optional(),
  localEvidence: z
    .object({
      minVerifiedFacts: z.number().int().min(0).optional(),
      minCitySpecificQa: z.number().int().min(0).optional(),
      minUniqueTokenShare: z.number().min(0).max(1).optional(),
      maxBodySimilarityWithinBranch: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export const blueprintSchema = z.object({
  id: z.string().min(1),
  entitlement: z.string().min(1),
  dataset: z.object({ collection: z.string().min(1), status: z.string().optional() }),
  axes: z
    .array(
      z.object({
        id: z.string().min(1),
        universe: z.union([
          z.object({ collection: z.string().min(1), field: z.string().min(1) }),
          z.object({ provider: z.string().min(1) }),
        ]),
        match: z.object({ recordField: z.string().min(1) }),
      }),
    )
    .min(1),
  levels: z
    .array(
      z.object({
        depth: z.number().int().min(0),
        slug: localizedString,
        redirectToPageId: z.string().min(1).optional(),
        constellation: z.string().min(1),
        geo: z.enum(["full", "twin-only", "off"]).optional(),
        titleTemplate: localizedString.optional(),
        descriptionTemplate: localizedString.optional(),
        intro: localizedString.optional(),
        semanticType: z.string().min(1).optional(),
        article: blueprintLevelArticleSchema.optional(),
        pillar: pillarSchema.optional(),
        dossier: dossierSchema.optional(),
        service: serviceSchema.optional(),
        intersection: intersectionSchema.optional(),
        hub: hubSchema.optional(),
      }),
    )
    .min(1),
  policy: z.object({
    minRecordsPerDepth: intRecord,
    noindexBelowPerDepth: intRecord.optional(),
    redirectPolicy: z.enum(["nearest-ancestor", "root"]).optional(),
    trailingSlash: z.boolean().optional(),
    maxStubDepth: z.number().int().optional(),
    substanceMin: z.number().min(0).max(100).optional(),
    substanceMinPerDepth: intRecord.optional(),
    evidencePerDepth: z.record(z.string(), evidencePolicySchema).optional(),
    demandPerDepth: z.record(z.string(), demandPolicySchema).optional(),
    depthRoles: z.record(z.string(), depthRolePolicySchema).optional(),
    sitemapBudget: z.number().int().min(0).optional(),
    maxThinShare: z.number().min(0).max(1).optional(),
    regionalGateDepths: z.array(z.number().int().min(0)).optional(),
    bake: z.enum(["inline", "lazy"]).optional(),
    statusGate: statusGateSchema.optional(),
  }),
  linking: z
    .object({
      children: z.object({ limit: z.number().int() }).optional(),
      siblings: z.object({ limit: z.number().int() }).optional(),
      teasers: z
        .object({
          relevance: z.array(z.object({ sharedAxis: z.string(), weight: z.number() })).optional(),
        })
        .optional(),
      parent: linkingParentSchema.optional(),
    })
    .optional(),
  rotation: z.object({ variantsByTupleHash: z.boolean() }).optional(),
  projection: z
    .object({
      title: localizedString.optional(),
      description: z.union([localizedString, z.object({ ref: z.string() })]).optional(),
    })
    .optional(),
  freshness: z
    .object({
      slaDaysPerDepth: intRecord,
      field: z.string().min(1),
      mode: z.enum(["any", "all", "median"]).optional(),
    })
    .optional(),
  enrichedFields: z
    .array(
      z.object({
        field: z.string().min(1),
        promptId: z.string().min(1),
        scopeDepth: z.number().int(),
        maxTokens: z.number().int(),
        // RFC-0207: output shape + generation granularity (both default to the original behavior).
        kind: z.enum(["field", "narrative"]).optional(),
        scope: z.enum(["tuple", "record"]).optional(),
        axis: z.string().min(1).optional(),
      }),
    )
    .optional(),
});

export interface ParseBlueprintResult {
  ok: boolean;
  blueprint?: Blueprint;
  errors: string[];
}

/** Validate an unknown value (parsed YAML) into a typed Blueprint. */
export function parseBlueprint(value: unknown): ParseBlueprintResult {
  const result = blueprintSchema.safeParse(value);
  if (result.success) {
    return { ok: true, blueprint: result.data as Blueprint, errors: [] };
  }
  return {
    ok: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    ),
  };
}
