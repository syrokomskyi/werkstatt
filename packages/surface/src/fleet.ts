/*
<MODULE_CONTRACT>
<purpose>Maintains packages/surface/src/fleet.ts as an authored surface authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not replace per-site Bordbuch, autonomy, breaker, or approval state.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0284: initial implementation of fleet Leitstand contracts.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const fleetBreakerStateSchema = z.enum(["armed", "tripped", "frozen"]);

export const fleetSiteStatusSchema = z.object({
  site: z.string().min(1),
  path: z.string().min(1),
  bordbuchHash: z.string().min(1).nullable(),
  autonomy: z.record(z.string(), z.string()),
  openEscalations: z.number().int().nonnegative(),
  breaker: fleetBreakerStateSchema,
  dirtyFlags: z.array(z.string().min(1)),
  lastOutcomeWindow: z.string().datetime().optional(),
  humanMinutesPer1000Pages: z.number().min(0).optional(),
});

export const fleetJobKindSchema = z.enum(["generate", "enrich", "translate", "review", "rollback"]);

export const fleetJobSchema = z.object({
  site: z.string().min(1),
  kind: fleetJobKindSchema,
  scope: z.string().min(1).optional(),
  priority: z.number(),
  safety: z.boolean().default(false),
  estimatedCost: z.object({
    llmTokens: z.number().int().nonnegative().optional(),
    reviewMinutes: z.number().nonnegative().optional(),
    ciSeconds: z.number().nonnegative().optional(),
  }),
});

export const fleetPlanSchema = z.object({
  collectedAt: z.string().datetime().nullable(),
  budgets: z.object({
    llmTokens: z.number().int().nonnegative(),
    reviewMinutes: z.number().nonnegative(),
    ciSeconds: z.number().nonnegative(),
  }),
  jobs: z.array(fleetJobSchema),
  blocked: z.array(z.object({ site: z.string().min(1), reason: z.string().min(1) })),
  humanMinutesPer1000Pages: z.number().min(0),
});

export type FleetBreakerState = z.infer<typeof fleetBreakerStateSchema>;
export type FleetSiteStatus = z.infer<typeof fleetSiteStatusSchema>;
export type FleetJobKind = z.infer<typeof fleetJobKindSchema>;
export type FleetJob = z.infer<typeof fleetJobSchema>;
export type FleetPlan = z.infer<typeof fleetPlanSchema>;
