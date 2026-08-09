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
import type { Diagnostic } from "@warpgogol/werkstatt/kernel";

// RFC-0203: canonical severity vocabulary. Folds the legacy audit "warn" spelling
// into "warning"; `auditSeveritySchema` is retained as a migration alias.
export const diagnosticSeveritySchema = z.enum(["error", "warning", "info"]);
/** @deprecated RFC-0203 alias — use diagnosticSeveritySchema. */
export const auditSeveritySchema = diagnosticSeveritySchema;
// The aggregate command status is independent of severity and keeps its spelling.
export const auditStatusSchema = z.enum(["ok", "warn", "fail", "pending"]);

export const diagnosticEvidenceSchema = z
  .object({
    kind: z.enum(["rule", "rendered", "source", "config", "cache", "runtime"]),
    ruleFile: z.string().optional(),
    ruleId: z.string().optional(),
    file: z.string().optional(),
    url: z.string().optional(),
    snippet: z.string().optional(),
  })
  .strict();
/** @deprecated RFC-0203 alias — use diagnosticEvidenceSchema. */
export const auditEvidenceSchema = diagnosticEvidenceSchema;

// RFC-0203: the canonical Diagnostic. Superset of the historical audit finding —
// adds fixHint/column/data and makes the locator optional; retains id/blockId/
// suggestion as optional legacy fields while checks migrate off them.
export const diagnosticSchema = z
  .object({
    ruleId: z.string(),
    severity: diagnosticSeveritySchema,
    message: z.string(),
    file: z.string().optional(),
    line: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
    fixHint: z.string().optional(),
    evidence: z.array(diagnosticEvidenceSchema).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    // Legacy audit fields (RFC-0074) retained for back-compat during migration.
    id: z.string().optional(),
    blockId: z.string().optional(),
    suggestion: z.string().optional(),
  })
  .strict() satisfies z.ZodType<Diagnostic>;
/** @deprecated RFC-0203 alias — use diagnosticSchema. */
export const auditFindingSchema = diagnosticSchema;

export const auditSummarySchema = z.record(diagnosticSeveritySchema, z.number());

export const auditResultSchema = z
  .object({
    command: z.string(),
    kind: z.string().optional(),
    app: z.string(),
    status: auditStatusSchema,
    findings: z.array(auditFindingSchema),
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

export type AuditSeverity = z.infer<typeof auditSeveritySchema>;
export type AuditStatus = z.infer<typeof auditStatusSchema>;
export type AuditEvidence = z.infer<typeof auditEvidenceSchema>;
export type AuditFinding = z.infer<typeof auditFindingSchema>;
export type AuditSummary = z.infer<typeof auditSummarySchema>;
export type AuditResult = z.infer<typeof auditResultSchema>;
export type AuditLlmKind = z.infer<typeof auditLlmKindSchema>;
export type AuditLlmCacheEntry = z.infer<typeof auditLlmCacheEntrySchema>;
