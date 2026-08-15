/*
<MODULE_CONTRACT>
<purpose>Shared RFC-0074 audit contracts for deterministic validators, LLM audit caching, and QA aggregation.</purpose>
<non-goals>
  <item>Do not execute validators or network calls.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0074: Introduce shared audit contracts.</item>
  <item>RFC-0074 hardening: Extend cache entries with rulesHash, promptHash, modelVersion, and archetypeId.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import {
  diagnosticSchema,
  diagnosticSeveritySchema,
  diagnosticEvidenceSchema,
} from "@warpgogol/werkstatt/schemas";
import type {
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticEvidence,
} from "@warpgogol/werkstatt/schemas";

// RFC-0852: Diagnostic schemas are now engine-owned. Re-export from
// @warpgogol/werkstatt/schemas so existing site-internal consumers see no
// breakage. The canonical types (Diagnostic, DiagnosticSeverity,
// DiagnosticEvidence) are also re-exported.
export { diagnosticSeveritySchema, diagnosticEvidenceSchema, diagnosticSchema };
export type { Diagnostic, DiagnosticSeverity, DiagnosticEvidence };

// The aggregate command status is independent of severity and keeps its spelling.
export const auditStatusSchema = z.enum(["ok", "warn", "fail", "pending"]);

export const auditSummarySchema = z.record(diagnosticSeveritySchema, z.number());

export const auditResultSchema = z
  .object({
    command: z.string(),
    kind: z.string().optional(),
    app: z.string(),
    status: auditStatusSchema,
    findings: z.array(diagnosticSchema),
    summary: auditSummarySchema,
    cacheStats: z
      .object({ hits: z.number().int().nonnegative(), misses: z.number().int().nonnegative() })
      .optional(),
    runtimeMs: z.number().nonnegative(),
  })
  .strict();

export const auditLlmKindSchema = z.enum([
  "cultural",
  "linguistic",
  "emotional",
  "brand-alignment",
  "archetype-lens",
]);

export const auditLlmCacheEntrySchema = z
  .object({
    key: z.string(),
    kind: auditLlmKindSchema,
    biomeId: z.string(),
    familyId: z.string(),
    atomsHash: z.string(),
    rulesHash: z.string().optional(),
    promptHash: z.string().optional(),
    modelVersion: z.string().optional(),
    promptVersion: z.string(),
    archetypeId: z.string().optional(),
    result: auditResultSchema,
    createdAt: z.string(),
  })
  .strict();

export type AuditStatus = z.infer<typeof auditStatusSchema>;
export type AuditSummary = z.infer<typeof auditSummarySchema>;
export type AuditResult = z.infer<typeof auditResultSchema>;
export type AuditLlmKind = z.infer<typeof auditLlmKindSchema>;
export type AuditLlmCacheEntry = z.infer<typeof auditLlmCacheEntrySchema>;
