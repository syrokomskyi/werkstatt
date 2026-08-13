/*
<MODULE_CONTRACT>
<purpose>
  RFC-0827: Contract schema for the rate-fetcher cron boundary.
  The rate-fetcher is a scheduled Cloudflare Worker — no inbound request shape.
  The response shape covers the cron execution result.
</purpose>
<non-goals>
  <item>Does not define rate observation storage — that is a Supabase concern.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0827: initial contract schema for rate-fetcher cron boundary.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const RateFetchRequestSchema = z.object({
  cronGroup: z.string().optional(),
});

export const RateFetchResponseSchema = z.object({
  ok: z.boolean(),
  fetched: z.number().int().nonnegative().optional(),
  failed: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
});

export type RateFetchRequest = z.infer<typeof RateFetchRequestSchema>;
export type RateFetchResponse = z.infer<typeof RateFetchResponseSchema>;

export const contract = {
  id: "rate-fetch",
  name: "Rate Fetch",
  direction: "cron-to-service",
  version: 1,
  request: RateFetchRequestSchema,
  response: RateFetchResponseSchema,
  description: "Rate-fetcher scheduled cron fetches exchange rates from external sources.",
} as const;
