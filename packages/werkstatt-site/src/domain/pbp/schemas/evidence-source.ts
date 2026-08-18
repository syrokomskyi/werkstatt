/*
<MODULE_CONTRACT>
<purpose>Zod schema for PbpEvidenceSource entity (RFC-0416, RFC-0466, RFC-0706, RFC-0872, ADR-0028).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — Zod schema for PbpEvidenceSource.</item>
  <item>RFC-0706 — Added 4 Nachweisregister evidence kind values, optional file-based evidence fields in items, made url/retrievedAt optional.</item>
  <item>RFC-0872 — Added technical-assessment kind, artifact role/canonical fields in items, assessment metadata schema.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";
import { nonEmptyString } from "./primitives.js";

const pbpEvidenceKindSchema = z.enum([
  "external-web-sources",
  "verified-record",
  "third-party-registry",
  // RFC-0706: Nachweisregister evidence types
  "client-statement",
  "project-confirmation",
  "certificate",
  "operational-evidence",
  // RFC-0872: technical assessment evidence type
  "technical-assessment",
]);

// RFC-0872: artifact role for technical-assessment evidence items
const pbpEvidenceArtifactRoleSchema = z.enum([
  "raw-result",
  "report",
  "screenshot",
  "summary",
  "methodology",
]);

// RFC-0872: technical assessment nested schemas
const assessmentExecutionModeSchema = z.enum(["operator-run", "provider-run"]);
const assessmentAuthorizationBasisSchema = z.enum([
  "site-owner",
  "service-contract",
  "explicit-operator",
]);
const assessmentDimensionStatusSchema = z.enum(["pass", "fail", "not-checked"]);

const assessmentProviderSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  homepage: nonEmptyString.optional(),
});

const assessmentToolSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  version: nonEmptyString.optional(),
});

const assessmentMethodologySchema = z.object({
  id: nonEmptyString,
  version: nonEmptyString,
  runCount: z.number().int().min(1),
  aggregation: z.enum(["provider", "median", "none"]),
});

const assessmentDimensionSchema = z
  .object({
    id: nonEmptyString,
    providerLabel: nonEmptyString,
    score: z.number().min(0).max(100).optional(),
    numerator: z.number().optional(),
    denominator: z.number().optional(),
    status: assessmentDimensionStatusSchema.optional(),
    level: nonEmptyString.optional(),
    experimental: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    samples: z.array(z.number().min(0).max(100)).optional(),
  })
  .refine(
    (d) => {
      if (d.numerator != null || d.denominator != null) {
        if (d.numerator == null || d.denominator == null) return false;
        if (d.denominator <= 0) return false;
        if (d.numerator < 0 || d.numerator > d.denominator) return false;
      }
      return true;
    },
    {
      message:
        "numerator/denominator must occur as a valid pair: 0 <= numerator <= denominator, denominator > 0",
    },
  )
  .refine(
    (d) => {
      if (d.samples != null && d.samples.length > 0) {
        const sampleMin = Math.min(...d.samples);
        const sampleMax = Math.max(...d.samples);
        if (d.min != null && d.min !== sampleMin) return false;
        if (d.max != null && d.max !== sampleMax) return false;
      }
      return true;
    },
    { message: "min/max must match sample extrema when samples are present" },
  );

const technicalAssessmentSchema = z.object({
  profile: z.literal("technical-assessment"),
  seriesId: nonEmptyString,
  observationId: nonEmptyString,
  subject: z.object({
    url: nonEmptyString,
    canonicalUrl: nonEmptyString.optional(),
  }),
  provider: assessmentProviderSchema,
  tool: assessmentToolSchema,
  executionMode: assessmentExecutionModeSchema,
  authorizationBasis: assessmentAuthorizationBasisSchema,
  observedAt: nonEmptyString.regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
    "observedAt must be valid ISO 8601 with timezone",
  ),
  methodology: assessmentMethodologySchema,
  overall: z
    .object({
      score: z.number().min(0).max(100).optional(),
      level: nonEmptyString.optional(),
    })
    .optional(),
  dimensions: z.array(assessmentDimensionSchema).min(1),
  freshness: z.object({ maxAgeDays: z.number().int().positive() }),
  providerReportUrl: z
    .string()
    .url()
    .regex(/^https:/)
    .optional(),
});

export const evidenceSourceSchema = pbpEntitySchema
  .extend({
    type: z.literal("evidence-source"),
    name: nonEmptyString,
    kind: pbpEvidenceKindSchema,
    authority: z.object({ kind: nonEmptyString }),
    items: z
      .record(
        z.string(),
        z.object({
          // RFC-0706: url and retrievedAt are optional for private file-based evidence
          url: nonEmptyString.optional(),
          retrievedAt: nonEmptyString.optional(),
          // RFC-0706: file-based evidence fields
          sha256: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
          storage: z.enum(["private", "public"]).optional(),
          mediaType: nonEmptyString.optional(),
          qualityStatus: z
            .enum(["unverified", "verified", "verified_with_quality_issue", "changed", "rejected"])
            .optional(),
          // RFC-0872: artifact semantics for technical-assessment evidence
          role: pbpEvidenceArtifactRoleSchema.optional(),
          canonical: z.boolean().optional(),
        }),
      )
      .optional(),
    // RFC-0872: normalized technical assessment metadata
    assessment: technicalAssessmentSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // RFC-0872 section 3: assessment MUST be absent when kind !== "technical-assessment"
    if (data.kind !== "technical-assessment" && data.assessment != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "assessment field is only allowed on kind 'technical-assessment'",
        path: ["assessment"],
      });
    }
    // RFC-0872 section 2: screenshot canonical invariant — if any item has
    // role: screenshot and canonical: true, there MUST also be an item with
    // role: raw-result and canonical: true
    if (data.items) {
      const hasCanonicalScreenshot = Object.values(data.items).some(
        (item) => item.role === "screenshot" && item.canonical === true,
      );
      const hasCanonicalRawResult = Object.values(data.items).some(
        (item) => item.role === "raw-result" && item.canonical === true,
      );
      if (hasCanonicalScreenshot && !hasCanonicalRawResult) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "canonical screenshot artifact requires a canonical raw-result artifact (screenshots cannot be the sole canonical artifact)",
          path: ["items"],
        });
      }
    }
  });
