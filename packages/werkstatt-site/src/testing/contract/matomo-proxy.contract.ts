/*
<MODULE_CONTRACT>
<purpose>
  RFC-0827: Contract schema for the matomo-proxy proxy boundary.
  The matomo-proxy service proxies Matomo analytics requests.
</purpose>
<non-goals>
  <item>Does not define Matomo API parameters — only the proxy envelope shape.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0827: initial contract schema for matomo-proxy proxy boundary.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const MatomoProxyRequestSchema = z.object({
  method: z.enum(["GET", "POST"]),
  path: z.string().min(1),
  query: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
});

export const MatomoProxyResponseSchema = z.object({
  ok: z.boolean(),
  status: z.number().int().optional(),
  error: z.string().optional(),
});

export type MatomoProxyRequest = z.infer<typeof MatomoProxyRequestSchema>;
export type MatomoProxyResponse = z.infer<typeof MatomoProxyResponseSchema>;

export const contract = {
  id: "matomo-proxy",
  name: "Matomo Proxy",
  direction: "site-to-service",
  version: 1,
  request: MatomoProxyRequestSchema,
  response: MatomoProxyResponseSchema,
  description: "Matomo-proxy service proxies analytics requests to the upstream Matomo instance.",
} as const;
