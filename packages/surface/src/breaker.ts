/*
<MODULE_CONTRACT>
<purpose>Maintains packages/surface/src/breaker.ts as an authored surface authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not define URL deletion semantics; rollback consumers must obey URL non-destruction policy.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0283: initial implementation of circuit-breaker and reversible surface-state contracts.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const surfaceStateStatusSchema = z.enum([
  "candidate",
  "shipped",
  "lastKnownGood",
  "rolledBack",
]);

export const surfaceStateSchema = z.object({
  id: z.string().min(1),
  site: z.string().min(1),
  createdAt: z.string().datetime().nullable(),
  status: surfaceStateStatusSchema,
  pageCount: z.number().int().nonnegative(),
  indexableCount: z.number().int().nonnegative(),
  artifactHash: z.string().min(1),
  manifestHash: z.string().min(1),
});

export const tripwireActionSchema = z.enum(["freeze", "demote", "escalate", "rollback"]);

export const tripwireSchema = z.object({
  id: z.string().min(1),
  scope: z.string().min(1),
  metric: z.string().min(1),
  threshold: z.number(),
  windowDays: z.number().int().positive(),
  onTrip: z.array(tripwireActionSchema).min(1),
});

export const breakerVerdictSchema = z.object({
  evaluatedAt: z.string().datetime(),
  trippedTripwires: z.array(tripwireSchema),
  affectedScopes: z.array(z.string().min(1)),
  recommendedState: z.string().min(1).optional(),
  blastRadius: z.number().int().nonnegative(),
});

export type SurfaceStateStatus = z.infer<typeof surfaceStateStatusSchema>;
export type SurfaceState = z.infer<typeof surfaceStateSchema>;
export type TripwireAction = z.infer<typeof tripwireActionSchema>;
export type Tripwire = z.infer<typeof tripwireSchema>;
export type BreakerVerdict = z.infer<typeof breakerVerdictSchema>;
