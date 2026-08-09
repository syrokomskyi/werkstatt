/*
<MODULE_CONTRACT>
<purpose>Maintains packages/surface/src/visibility.ts as an authored surface authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not model per-user analytics rows or external API clients.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0282: initial implementation of visibility feedback-loop contracts.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const visibilitySourceSchema = z.enum(["gsc", "manual"]);

export const clusterActionSchema = z.enum(["expand", "hold", "prune", "enrich", "escalate"]);

export const visibilitySnapshotSchema = z.object({
  clusterId: z.string().min(1),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  indexedPages: z.number().int().nonnegative(),
  eligiblePages: z.number().int().nonnegative(),
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  uniqueQueries: z.number().int().nonnegative(),
  avgPosition: z.number().positive().optional(),
  source: visibilitySourceSchema,
  importedAt: z.string().datetime(),
  cannibalizingQueries: z.array(z.string().min(1)).optional(),
  coreClicksBaseline: z.number().int().nonnegative().optional(),
  coreClicksCurrent: z.number().int().nonnegative().optional(),
});

export const clusterOutcomeSchema = z.object({
  clusterId: z.string().min(1),
  surfaceId: z.string().min(1).optional(),
  depth: z.number().int().nonnegative().optional(),
  eligiblePages: z.number().int().nonnegative(),
  indexedPages: z.number().int().nonnegative(),
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  uniqueQueries: z.number().int().nonnegative(),
  indexationRate: z.number().min(0),
  medianImpressionsPerPage: z.number().min(0),
  queryDiversityShare: z.number().min(0),
  positiveDemand: z.boolean(),
  anomalies: z.array(z.string().min(1)),
  proposedAction: clusterActionSchema,
  rationale: z.string().min(1),
});

export type VisibilitySource = z.infer<typeof visibilitySourceSchema>;
export type ClusterAction = z.infer<typeof clusterActionSchema>;
export type VisibilitySnapshot = z.infer<typeof visibilitySnapshotSchema>;
export type ClusterOutcome = z.infer<typeof clusterOutcomeSchema>;
