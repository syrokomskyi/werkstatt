/*
<MODULE_CONTRACT>
<purpose>
  RFC-0271: typed, schema-validated operating contexts for Programmatic Surface modules.
  A module context declares which Blueprints it owns, which entitlement gates them, and which
  locale is the canonical generation/review source before any derived public translation.
</purpose>
<non-goals>
  <item>Do not read system.md or entitlements; kernel commands own I/O.</item>
  <item>Do not redefine Blueprint axes, levels, or route policy.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0271: add module context contracts for masterLocale, publishedLocales, entitlement, glossary refs, translator-note refs, and generation/approval policy.</item>
  <item>RFC-0277: add stage and urlPolicy fields for PSEO lifecycle governance.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const moduleSiteModeSchema = z.enum(["bodenstation", "sternsystem"]);

export const pseoStageSchema = z.enum(["internalCapability", "managedVisibility", "productModule"]);

export const urlPolicySchema = z.enum(["nonDestruction"]);

export const moduleReviewPolicySchema = z.object({
  firstNPerTemplateField: z.number().int().min(0).optional(),
  sampleAfterStabilization: z.number().min(0).max(1).optional(),
  claims: z.enum(["human", "sample", "machine"]).optional(),
});

export const surfaceModuleContextSchema = z.object({
  id: z.string().min(1).optional(),
  entitlement: z.string().min(1),
  blueprints: z.array(z.string().min(1)).min(1),
  masterLocale: z.string().min(2),
  publishedLocales: z.array(z.string().min(2)).default([]),
  stage: pseoStageSchema.optional(),
  urlPolicy: urlPolicySchema.optional(),
  context: z
    .object({
      siteMode: moduleSiteModeSchema.optional(),
      operatorLanguage: z.string().min(2).optional(),
      audience: z.string().min(1).optional(),
      forbiddenClaims: z.array(z.string().min(1)).optional(),
      sourceBoundaries: z.array(z.string().min(1)).optional(),
      voice: z.record(z.string(), z.unknown()).optional(),
    })
    .default({}),
  indexBudget: z
    .object({
      publicName: z.literal("managedCoverage").optional(),
      maxIndexable: z.number().int().min(0).optional(),
      regionalGateDepths: z.array(z.number().int().min(0)).optional(),
    })
    .optional(),
  generation: z
    .object({
      provider: z.string().min(1).optional(),
      modelPolicy: z.string().min(1).optional(),
      normalBuildCallsLlm: z.literal(false).default(false),
    })
    .default({ normalBuildCallsLlm: false }),
  approval: z
    .object({
      requireHumanApproval: z.boolean().default(true),
      requireReadyForTranslation: z.boolean().default(true),
    })
    .default({ requireHumanApproval: true, requireReadyForTranslation: true }),
  localization: z
    .object({
      glossaryRefs: z.record(z.string(), z.string()).optional(),
      translatorNoteRefs: z.record(z.string(), z.string()).optional(),
      reviewPolicy: z.record(z.string(), moduleReviewPolicySchema).optional(),
    })
    .optional(),
});

export const surfaceModulesSchema = z.record(z.string(), surfaceModuleContextSchema);

export type SurfaceModuleContext = z.infer<typeof surfaceModuleContextSchema> & { id: string };
export type SurfaceModules = Record<string, SurfaceModuleContext>;
export type PseoStage = z.infer<typeof pseoStageSchema>;
export type UrlPolicy = z.infer<typeof urlPolicySchema>;

export interface BlueprintModuleClaim {
  blueprint: string;
  modules: string[];
}

export function normalizeSurfaceModules(value: unknown): SurfaceModules {
  const parsed = surfaceModulesSchema.parse(value ?? {});
  const modules: SurfaceModules = {};
  for (const [id, context] of Object.entries(parsed)) {
    modules[id] = { ...context, id };
  }
  return modules;
}

export function findModuleForBlueprint(
  modules: SurfaceModules,
  blueprintId: string,
): SurfaceModuleContext | undefined {
  return Object.values(modules).find((module) => module.blueprints.includes(blueprintId));
}

export function findDuplicateBlueprintClaims(modules: SurfaceModules): BlueprintModuleClaim[] {
  const claims = new Map<string, string[]>();
  for (const module of Object.values(modules)) {
    for (const blueprint of module.blueprints) {
      const owners = claims.get(blueprint) ?? [];
      owners.push(module.id);
      claims.set(blueprint, owners);
    }
  }
  return [...claims.entries()]
    .filter(([, modulesForBlueprint]) => modulesForBlueprint.length > 1)
    .map(([blueprint, modulesForBlueprint]) => ({ blueprint, modules: modulesForBlueprint }));
}
