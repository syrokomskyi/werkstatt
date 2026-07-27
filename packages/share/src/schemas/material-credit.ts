/*
<MODULE_CONTRACT>
<purpose>
  RFC-0220 Material Credits contract. Defines the closed, app-agnostic schema for
  credit/provenance sidecars that describe published materials without conflating
  human authorship with AI tooling.
</purpose>
<non-goals>
  <item>Do not discover sidecar files; validators and UI loaders own their input maps.</item>
  <item>Do not own language catalogs, localized copy, or default rights notices.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0220: initial Material Credits schema and formatting helpers.</item>
  <item>RFC-0223: acquireLicensePage, copyrightYear, CreditParty.version/generatedAt.</item>
  <item>RFC-0228: target.intent "editorial"|"decorative" optional marker.</item>
  <item>RFC-0231: optional per-asset `display` visibility override.</item>
  <item>RFC-0488: status, usageBasis, aiUsage fields; new sourceType/role values; label mapping helpers.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const materialKindSchema = z.enum([
  "image",
  "video",
  "audio",
  "document",
  "article",
  "prose",
  "external",
]);
export type MaterialKind = z.infer<typeof materialKindSchema>;

export const materialSourceTypeSchema = z.enum([
  "human-made",
  "ai-assisted",
  "ai-generated",
  "composite",
  "third-party",
  "commissioned",
  "licensed-third-party",
  "customer-supplied",
  "public-domain",
  "screenshot",
]);
export type MaterialSourceType = z.infer<typeof materialSourceTypeSchema>;

export const creditPartyKindSchema = z.enum([
  "Person",
  "Organization",
  "AIAgent",
  "AIModel",
  "AIPlatform",
  "Workflow",
  "SourceMaterial",
]);
export type CreditPartyKind = z.infer<typeof creditPartyKindSchema>;

export const creditRoleSchema = z.enum([
  "creator",
  "coCreator",
  "commissionedBy",
  "producer",
  "promptAuthor",
  "workflowAuthor",
  "aiAgent",
  "aiModel",
  "aiPlatform",
  "sourceMaterial",
  "reviewer",
  "approver",
  "rightsHolder",
  "editor",
  "contributor",
  "photographer",
  "illustrator",
]);
export type CreditRole = z.infer<typeof creditRoleSchema>;

export const materialTargetSchema = z
  .object({
    kind: materialKindSchema,
    id: z.string().min(1),
    domain: z.enum(["pages", "prose", "business", "people", "site", "surface"]).optional(),
    lang: z.string().min(2).optional(),
    locator: z.string().min(1).optional(),
    /** RFC-0228: editorial requires a credit; decorative is excluded from the required-credit gate. */
    intent: z.enum(["editorial", "decorative"]).optional(),
  })
  .strict();
export type MaterialTarget = z.infer<typeof materialTargetSchema>;
export type MaterialTargetDomain = NonNullable<MaterialTarget["domain"]>;

export const creditPartySchema = z
  .object({
    role: creditRoleSchema,
    name: z.string().min(1),
    kind: creditPartyKindSchema,
    url: z.string().url().optional(),
    /** RFC-0223: model/platform/tool version, meaningful for AI and source parties. */
    version: z.string().min(1).optional(),
    /** RFC-0223: ISO date the AI/source material was generated. */
    generatedAt: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
  })
  .strict();
export type CreditParty = z.infer<typeof creditPartySchema>;

export const materialLicenseSchema = z
  .object({
    label: z.string().min(1),
    url: z.string().url().optional(),
    /** RFC-0223: page where a license can be obtained (Google licensable images). */
    acquireLicensePage: z.string().url().optional(),
    copyrightNotice: z.string().min(1).optional(),
    /** RFC-0223: structured copyright year. */
    copyrightYear: z.number().int().optional(),
    rightsStatement: z.string().min(1).optional(),
  })
  .strict();
export type MaterialLicense = z.infer<typeof materialLicenseSchema>;

export const materialCreditStatusSchema = z.enum([
  "active",
  "orphaned",
  "needs-review",
  "blocked",
  "expired",
]);
export type MaterialCreditStatus = z.infer<typeof materialCreditStatusSchema>;

export const usageBasisTypeSchema = z.enum([
  "internal-commissioned",
  "express-permission",
  "license",
  "customer-supplied",
  "public-domain",
  "statutory-exception",
  "quotation-right",
  "unverified",
]);
export type UsageBasisType = z.infer<typeof usageBasisTypeSchema>;

export const usageBasisSchema = z
  .object({
    type: usageBasisTypeSchema,
    /** Internal evidence reference (contract, license receipt, permission email). Opaque string — never shown to visitors, not validated for existence. */
    evidenceRef: z.string().min(1).optional(),
    /** Human-readable note about the basis, shown in the details section. */
    note: z.string().min(1).optional(),
  })
  .strict();
export type UsageBasis = z.infer<typeof usageBasisSchema>;

export const aiUsageSchema = z
  .object({
    /** Whether the output is fully AI-generated or AI-assisted. */
    kind: z.enum(["ai-generated", "ai-assisted"]),
    /** Human creative contribution description. */
    humanContribution: z.string().min(1),
    /** Whether copyright is claimed for the output. */
    copyrightClaimed: z.boolean(),
    /** Internal generation record reference. Opaque string — never shown to visitors, not validated for existence. */
    generationRecordRef: z.string().min(1).optional(),
  })
  .strict();
export type AiUsage = z.infer<typeof aiUsageSchema>;

export const materialCreditSchema = z
  .object({
    id: z.string().min(1),
    target: materialTargetSchema,
    sourceType: materialSourceTypeSchema,
    /** RFC-0231: per-asset visibility override (level 1). Absent ⇒ policy decides. */
    display: z.enum(["shown", "hidden"]).optional(),
    /** RFC-0488: lifecycle status of the credit record. */
    status: materialCreditStatusSchema.optional(),
    /** RFC-0488: legal basis for using the material, distinct from the license label. */
    usageBasis: usageBasisSchema.optional(),
    /** RFC-0488: AI-specific provenance, required when sourceType is ai-generated or ai-assisted. */
    aiUsage: aiUsageSchema.optional(),
    title: z.string().min(1).optional(),
    creditLine: z.string().min(1).optional(),
    parties: z.array(creditPartySchema).min(1),
    license: materialLicenseSchema,
    createdAt: z.string().min(1).optional(),
    reviewedAt: z.string().min(1).optional(),
    reviewNote: z.string().min(1).optional(),
    c2paManifestUrl: z.string().url().optional(),
    iptcMetadataStatus: z.enum(["preserved", "stripped", "not-applicable", "unknown"]).optional(),
  })
  .strict();
export type MaterialCredit = z.infer<typeof materialCreditSchema>;

export const materialCreditLabelsSchema = z
  .object({
    summaryLabel: z.string().min(1),
    pageTitle: z.string().min(1),
    pageDescription: z.string().min(1),
    emptyMessage: z.string().min(1),
    detailsLabel: z.string().min(1),
    createdBy: z.string().min(1),
    createdWith: z.string().min(1),
    promptBy: z.string().min(1),
    reviewedBy: z.string().min(1),
    license: z.string().min(1),
    copyrightLabel: z.string().min(1),
    rightsHolder: z.string().min(1),
    sourceType: z.string().min(1),
    /** RFC-0488: per-sourceType localized labels. */
    sourceTypeLabels: z.record(materialSourceTypeSchema, z.string().min(1)),
    /** RFC-0488: per-status localized labels. */
    statusLabels: z.record(materialCreditStatusSchema, z.string().min(1)),
    /** RFC-0488: per-usageBasis.type localized labels. */
    usageBasisLabels: z.record(usageBasisTypeSchema, z.string().min(1)),
    /** RFC-0488: AI-specific localized labels. */
    aiUsageLabels: z.object({
      aiGenerated: z.string().min(1),
      aiAssisted: z.string().min(1),
      humanContribution: z.string().min(1),
      copyrightClaimed: z.string().min(1),
      copyrightNotClaimed: z.string().min(1),
    }),
    /** RFC-0488: "Used on" label for usage locations list. */
    usedOnLabel: z.string().min(1),
    /** RFC-0488: "Verified at" label. */
    verifiedAtLabel: z.string().min(1),
    /** RFC-0488: placeholder text when no preview is available. */
    noPreviewLabel: z.string().min(1),
    /** RFC-0488: explanatory text rendered once at the bottom of the credits page. */
    copyrightExplanation: z.string().min(1),
  })
  .strict();
export type MaterialCreditLabels = z.infer<typeof materialCreditLabelsSchema>;

function namesFor(credit: MaterialCredit, roles: CreditRole[]): string[] {
  return credit.parties.filter((party) => roles.includes(party.role)).map((party) => party.name);
}

export function labelForMaterialCreditRole(role: CreditRole, labels: MaterialCreditLabels): string {
  if (role === "creator" || role === "coCreator") return labels.createdBy;
  if (role === "aiAgent" || role === "aiModel" || role === "aiPlatform") return labels.createdWith;
  if (role === "promptAuthor" || role === "workflowAuthor") return labels.promptBy;
  if (role === "reviewer" || role === "approver") return labels.reviewedBy;
  if (role === "rightsHolder") return labels.rightsHolder;
  return role;
}

/** RFC-0488: map a sourceType enum value to a localized human-readable label. */
export function labelForSourceType(
  sourceType: MaterialSourceType,
  labels: MaterialCreditLabels,
): string {
  return labels.sourceTypeLabels[sourceType] ?? sourceType;
}

/** RFC-0488: map a status enum value to a localized human-readable label. */
export function labelForStatus(status: MaterialCreditStatus, labels: MaterialCreditLabels): string {
  return labels.statusLabels[status] ?? status;
}

/** RFC-0488: map a usageBasis.type enum value to a localized human-readable label. */
export function labelForUsageBasis(type: UsageBasisType, labels: MaterialCreditLabels): string {
  return labels.usageBasisLabels[type] ?? type;
}

export function formatMaterialCreditLine(
  credit: MaterialCredit,
  labels: MaterialCreditLabels,
): string {
  if (credit.creditLine) return credit.creditLine;

  const parts: string[] = [];
  const creators = namesFor(credit, ["creator", "coCreator"]);
  const aiTools = namesFor(credit, ["aiAgent", "aiModel", "aiPlatform"]);
  const promptAuthors = namesFor(credit, ["promptAuthor", "workflowAuthor"]);
  const reviewers = namesFor(credit, ["reviewer", "approver"]);

  if (creators.length > 0) parts.push(`${labels.createdBy}: ${creators.join(", ")}`);
  if (aiTools.length > 0) parts.push(`${labels.createdWith}: ${aiTools.join(", ")}`);
  if (promptAuthors.length > 0) parts.push(`${labels.promptBy}: ${promptAuthors.join(", ")}`);
  if (reviewers.length > 0) parts.push(`${labels.reviewedBy}: ${reviewers.join(", ")}`);
  parts.push(`${labels.license}: ${credit.license.label}`);
  parts.push(`${labels.sourceType}: ${labelForSourceType(credit.sourceType, labels)}`);

  return parts.join(" · ");
}

export function materialTargetKey(target: MaterialTarget, lang?: string): string {
  return [target.kind, target.domain ?? "", lang ?? target.lang ?? "", target.id].join(":");
}
