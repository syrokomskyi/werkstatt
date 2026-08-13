/*
<MODULE_CONTRACT>
<purpose>
  RFC-0827: Contract schema for the maturity-score POST /score boundary.
  The maturity-score service accepts { url } and returns { score }.
</purpose>
<non-goals>
  <item>Does not define the scoring methodology — that is an external artifact.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0827: initial contract schema for maturity-score POST /score boundary.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const MaturityScoreRequestSchema = z.object({
  url: z.string().min(1),
});

export const MaturityScoreResponseSchema = z.object({
  score: z.number().int().min(0).max(100),
});

export type MaturityScoreRequest = z.infer<typeof MaturityScoreRequestSchema>;
export type MaturityScoreResponse = z.infer<typeof MaturityScoreResponseSchema>;

export const contract = {
  id: "maturity-score",
  name: "Maturity Score",
  direction: "site-to-service",
  version: 1,
  request: MaturityScoreRequestSchema,
  response: MaturityScoreResponseSchema,
  description: "Maturity-score service accepts POST /score with { url } and returns { score }.",
} as const;
