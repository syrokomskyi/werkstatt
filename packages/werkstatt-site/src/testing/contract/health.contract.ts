/*
<MODULE_CONTRACT>
<purpose>
  RFC-0827: Contract schema for the shared service health endpoint boundary.
  All services implement GET /health returning { status, service }.
</purpose>
<non-goals>
  <item>Does not define service-specific health details — only the common shape.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0827: initial contract schema for shared health endpoint.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const HealthRequestSchema = z.object({}).optional();

export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "error"]),
  service: z.string().min(1),
  version: z.string().optional(),
  timestamp: z.string().optional(),
});

export type HealthRequest = z.infer<typeof HealthRequestSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const contract = {
  id: "health",
  name: "Health Endpoint",
  direction: "site-to-service",
  version: 1,
  request: HealthRequestSchema,
  response: HealthResponseSchema,
  description: "Shared health endpoint contract for all services (GET /health).",
} as const;
