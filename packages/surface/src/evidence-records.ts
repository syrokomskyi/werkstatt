/*
<MODULE_CONTRACT>
<purpose>
  RFC-0280/RFC-0281 contracts for evidence-backed Programmatic Surface inputs:
  aggregate search-demand signals and consented Werk records.
</purpose>
<non-goals>
  <item>Do not read files or call external demand APIs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0280/RFC-0281: first-class demand and Werk evidence contracts.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const demandIntentSchema = z.enum([
  "informational",
  "commercial",
  "transactional",
  "navigational",
]);

export const demandSignalSourceSchema = z.enum(["gsc", "keyword-planner", "manual", "derived"]);

export const demandAxesSchema = z
  .object({
    industry: z.string().min(1).optional(),
    country: z.string().min(1).optional(),
    region: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    demand: z.string().min(1).optional(),
  })
  .strict();

export const demandSignalSchema = z
  .object({
    id: z.string().min(1),
    query: z.string().min(1),
    intent: demandIntentSchema,
    axes: demandAxesSchema,
    volume: z.number().min(0).optional(),
    competition: z.number().min(0).max(1).optional(),
    source: demandSignalSourceSchema,
    observedAt: z.string().datetime({ offset: true }),
    provenance: z.object({
      importId: z.string().min(1),
      sourceRef: z.string().min(1).optional(),
    }),
  })
  .strict();

export type DemandIntent = z.infer<typeof demandIntentSchema>;
export type DemandSignalSource = z.infer<typeof demandSignalSourceSchema>;
export type DemandAxes = z.infer<typeof demandAxesSchema>;
export type DemandSignal = z.infer<typeof demandSignalSchema>;

export const werkRecordSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    axes: z
      .object({
        industry: z.array(z.string().min(1)).min(1),
        country: z.string().min(1).optional(),
        region: z.string().min(1).optional(),
        city: z.string().min(1),
        demand: z.array(z.string().min(1)).optional(),
      })
      .strict(),
    facts: z
      .object({
        materials: z.array(z.string().min(1)).optional(),
        scope: z.string().min(1).optional(),
        problem: z.string().min(1).optional(),
        outcome: z.string().min(1).optional(),
        completedAt: z.string().datetime({ offset: true }).optional(),
        durationDays: z.number().int().min(0).optional(),
      })
      .strict(),
    media: z.array(z.object({ ref: z.string().min(1), creditRef: z.string().min(1) })).optional(),
    provenance: z.object({
      sourceRef: z.string().min(1),
      anchoredHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    }),
    consent: z
      .object({
        publishable: z.boolean(),
        clientApproved: z.boolean(),
        redactions: z.array(z.string().min(1)).optional(),
      })
      .strict(),
  })
  .strict();

export type WerkRecord = z.infer<typeof werkRecordSchema>;
