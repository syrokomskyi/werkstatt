/*
<MODULE_CONTRACT>
<purpose>
RFC-0508: canonical Participant schema — a unified entity model for humans, AI agents,
organization units, external specialists, partner organizations, and service accounts.
Extends the People collection (RFC-0200) with type-specific responsibility/authority/evidence
fields, lifecycle statuses, consent records for humans, and public/private visibility.
</purpose>
<non-goals>
  <item>Do not define route generation or page rendering logic — that lives in @warpgogol/werkstatt-site/share/astro.</item>
  <item>Do not define validation rules — that lives in @warpgogol/werkstatt-site/checks/src/participant.ts.</item>
  <item>Do not remove PERSON_AFFILIATIONS from person.ts — it is retained for human governance JSON-LD.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0508: initial creation — Participant schema with six types, statuses, relationships, consent, and type-specific fields.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { PERSON_AFFILIATIONS } from "./person.ts";

export const PARTICIPANT_TYPES = [
  "human",
  "ai-agent",
  "organization-unit",
  "external-specialist",
  "partner-organization",
  "service-account",
] as const;
export type ParticipantType = (typeof PARTICIPANT_TYPES)[number];

export const PARTICIPANT_RELATIONSHIPS = [
  "founder",
  "board",
  "team",
  "patron",
  "author",
  "advisor",
  "contractor",
  "partner",
  "service",
] as const;
export type ParticipantRelationship = (typeof PARTICIPANT_RELATIONSHIPS)[number];

export const PARTICIPANT_STATUSES = [
  "active",
  "temporarily-unavailable",
  "on-leave",
  "former",
  "retired",
  "suspended",
  "draft",
] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export const CONSENT_APPROVED_FIELDS = [
  "lifespan.born",
  "lifespan.died",
  "location",
  "bio",
  "photo",
  "sameAs",
] as const;
export type ConsentApprovedField = (typeof CONSENT_APPROVED_FIELDS)[number];

const consentSchema = z
  .object({
    consentRecordId: z.string().min(1),
    approvedFields: z.array(z.enum(CONSENT_APPROVED_FIELDS)).default([]),
    approvedMedia: z.array(z.string()).default([]),
    consentDate: z.string().min(1),
    withdrawalRoute: z.string().min(1).optional(),
    profileReviewer: z.string().min(1),
  })
  .strict();

const responsibilitySchema = z
  .object({
    summary: z.string(),
    scope: z.string().optional(),
    pbpReferences: z.array(z.string()).default([]),
  })
  .strict();

const authoritySchema = z
  .object({
    canSignFor: z.array(z.string()).default([]),
    canCommitTo: z.array(z.string()).default([]),
    escalationRoute: z.string().optional(),
  })
  .strict();

const evidenceSchema = z
  .object({
    claims: z
      .array(
        z
          .object({
            claimId: z.string(),
            sourceRef: z.string(),
            verifiedAt: z.string(),
          })
          .strict(),
      )
      .default([]),
    disclosures: z
      .array(
        z
          .object({
            type: z.string(),
            text: z.string(),
            url: z.string().optional(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

const contactSchema = z
  .object({
    primaryRoute: z.string().optional(),
    pgpFingerprint: z.string().optional(),
    responseTime: z.string().optional(),
  })
  .strict();

const lifespanSchema = z
  .object({
    born: z.union([z.string(), z.number()]).optional(),
    died: z.union([z.string(), z.number()]).optional(),
  })
  .strict();

const aiAgentFieldsSchema = z
  .object({
    modelId: z.string(),
    provider: z.string(),
    technicalStand: z
      .object({
        agentId: z.string(),
        toolsetVersion: z.string(),
        lastEvaluatedAt: z.string(),
        capabilities: z.array(z.string()).default([]),
      })
      .strict(),
    rightsMatrix: z
      .object({
        canPublish: z.boolean().default(false),
        canEditContent: z.boolean().default(false),
        canManageUsers: z.boolean().default(false),
        canAccessFinancials: z.boolean().default(false),
      })
      .strict(),
    accountableHumanId: z.string().min(1),
  })
  .strict();

const organizationUnitFieldsSchema = z
  .object({
    unitName: z.string(),
    parentUnit: z.string().optional(),
    leadParticipantId: z.string().optional(),
  })
  .strict();

const externalSpecialistFieldsSchema = z
  .object({
    specialty: z.string(),
    organization: z.string().optional(),
    engagementType: z.string().optional(),
    contractRef: z.string().optional(),
  })
  .strict();

const partnerOrganizationFieldsSchema = z
  .object({
    organizationName: z.string(),
    partnershipType: z.string().optional(),
    contactRoute: z.string().optional(),
  })
  .strict();

const serviceAccountFieldsSchema = z
  .object({
    serviceName: z.string(),
    provider: z.string(),
    scopeDescription: z.string(),
    credentialsRef: z.string(),
  })
  .strict();

export const participantSchema = z
  .object({
    participantId: z.string().min(1),
    participantType: z.enum(PARTICIPANT_TYPES),
    publicName: z.string().min(1),
    slug: z.string().min(1),
    status: z.enum(PARTICIPANT_STATUSES),
    relationshipType: z.enum(PARTICIPANT_RELATIONSHIPS),

    responsibility: responsibilitySchema.optional(),
    authority: authoritySchema.optional(),
    evidence: evidenceSchema.optional(),
    contact: contactSchema.optional(),

    visibility: z.enum(["public", "private"]).default("private"),
    profileOwner: z.string().optional(),
    retentionClass: z.enum(["permanent", "standard", "short-term"]).default("standard"),

    name: z.string().optional(),
    role: z.string().optional(),
    photo: z.string().optional(),
    bio: z.string().optional(),
    affiliations: z.array(z.enum(PERSON_AFFILIATIONS)).default([]),
    order: z.number().int().nonnegative().optional(),
    lifespan: lifespanSchema.optional(),
    statement: z.string().optional(),
    stats: z.array(z.object({ label: z.string(), value: z.string() }).strict()).optional(),
    cta: z.object({ label: z.string(), target: z.string() }).strict().optional(),
    sameAs: z.array(z.string().url()).optional(),
    page: z
      .object({ enabled: z.boolean().default(false) })
      .strict()
      .optional(),
    location: z.string().optional(),
    live: z
      .object({
        src: z.string(),
        poster: z.string().optional(),
        alt: z.string().optional(),
      })
      .strict()
      .optional(),

    consent: consentSchema.optional(),

    aiAgent: aiAgentFieldsSchema.optional(),
    organizationUnit: organizationUnitFieldsSchema.optional(),
    externalSpecialist: externalSpecialistFieldsSchema.optional(),
    partnerOrganization: partnerOrganizationFieldsSchema.optional(),
    serviceAccount: serviceAccountFieldsSchema.optional(),
  })
  .strict();

export type ParticipantData = z.infer<typeof participantSchema>;
