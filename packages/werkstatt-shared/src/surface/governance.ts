/*
<MODULE_CONTRACT>
<purpose>
  RFC-0278/RFC-0279/RFC-0285 shared governance contracts for PSEO autonomy,
  auditable AI review, and human escalation budgets.
</purpose>
<non-goals>
  <item>Do not run reviewers, mutate logs, or decide promotions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0278/RFC-0279/RFC-0285: governance contract types.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const approverSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("human"), handle: z.string().min(1) }).strict(),
  z
    .object({
      kind: z.literal("agent"),
      modelId: z.string().min(1),
      promptId: z.string().min(1),
      version: z.string().min(1),
    })
    .strict(),
]);

export const fieldClassSchema = z.enum(["structural", "narrative", "claims", "product"]);
export const autonomyLevelSchema = z.enum(["L0", "L1", "L2", "L3", "L4"]);

export const autonomyScopeSchema = z
  .object({
    module: z.string().min(1),
    fieldClass: fieldClassSchema,
    locale: z.string().min(1),
  })
  .strict();

export const autonomyStateSchema = z
  .object({
    scope: autonomyScopeSchema,
    level: autonomyLevelSchema,
    ceiling: autonomyLevelSchema,
    sinceAt: z.string().datetime({ offset: true }),
    evidenceRef: z.string().min(1),
    lastReviewedBy: approverSchema.optional(),
  })
  .strict();

export const approvalRecordSchema = z
  .object({
    approver: approverSchema,
    atLevel: autonomyLevelSchema,
    approvedAt: z.string().datetime({ offset: true }),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export const reviewInputSchema = z
  .object({
    artifactRef: z.string().min(1),
    fieldClass: fieldClassSchema,
    grounding: z
      .object({
        record: z.unknown().optional(),
        approvedClaims: z.array(z.unknown()).optional(),
        moduleContext: z.unknown(),
        glossaryId: z.string().min(1).optional(),
        sourceArtifactRef: z.string().min(1).optional(),
        translatorNoteId: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export const reviewVerdictSchema = z
  .object({
    artifactRef: z.string().min(1),
    reviewer: z.object({ modelId: z.string(), promptId: z.string(), version: z.string() }).strict(),
    decision: z.enum(["approve", "reject", "escalate"]),
    confidence: z.number().min(0).max(1),
    checks: z.array(
      z.object({ id: z.string().min(1), pass: z.boolean(), note: z.string().optional() }).strict(),
    ),
    groundingViolations: z.array(z.string()),
    samples: z.number().int().min(1),
    reviewedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const escalationReasonSchema = z.enum([
  "low-reviewer-confidence",
  "novel-template",
  "claims-class",
  "anomaly",
  "demotion-review",
  "product-language",
]);

export const escalationSchema = z
  .object({
    id: z.string().min(1),
    scope: z.string().min(1),
    reason: escalationReasonSchema,
    artifactRef: z.string().min(1).optional(),
    openedAt: z.string().datetime({ offset: true }),
    resolvedAt: z.string().datetime({ offset: true }).optional(),
    resolvedBy: z
      .object({ kind: z.literal("human"), handle: z.string().min(1) })
      .strict()
      .optional(),
    verdict: z.enum(["approve", "reject", "fix-record"]).optional(),
    minutesSpent: z.number().min(0).optional(),
    feedback: z
      .object({
        toGolden: z.boolean().optional(),
        toCalibration: z.boolean().optional(),
        toRecord: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export const escalationBudgetSchema = z
  .object({
    scope: z.string().min(1),
    windowDays: z.number().int().min(1),
    humanMinutesAvailable: z.number().min(0),
    humanMinutesUsed: z.number().min(0),
    minutesPer1000Pages: z.number().min(0),
  })
  .strict();

export type Approver = z.infer<typeof approverSchema>;
export type FieldClass = z.infer<typeof fieldClassSchema>;
export type AutonomyLevel = z.infer<typeof autonomyLevelSchema>;
export type AutonomyScope = z.infer<typeof autonomyScopeSchema>;
export type AutonomyState = z.infer<typeof autonomyStateSchema>;
export type ApprovalRecord = z.infer<typeof approvalRecordSchema>;
export type ReviewInput = z.infer<typeof reviewInputSchema>;
export type ReviewVerdict = z.infer<typeof reviewVerdictSchema>;
export type EscalationReason = z.infer<typeof escalationReasonSchema>;
export type Escalation = z.infer<typeof escalationSchema>;
export type EscalationBudget = z.infer<typeof escalationBudgetSchema>;
