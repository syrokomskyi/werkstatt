/*
<MODULE_CONTRACT>
<purpose>
  RFC-0827: Contract schema for the integration-route callback boundary.
  Reuses the existing IntegrationEventSchema from the integration domain as the
  request schema — there is one schema, not two. The response schema mirrors the
  delivery handler's JSON response shape.
</purpose>
<non-goals>
  <item>Does not redefine IntegrationEventSchema — re-exports it from the integration domain.</item>
  <item>Does not define QStash signature verification — that is a transport concern.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0827: initial contract schema for integration-route callback boundary.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { IntegrationEventSchema } from "@warpgogol/werkstatt-site/integration";

export const IntegrationRouteRequestSchema = IntegrationEventSchema;

export const IntegrationRouteResponseSchema = z.object({
  ok: z.boolean(),
  channels: z
    .array(
      z.object({
        adapter: z.string(),
        delivered: z.boolean().optional(),
      }),
    )
    .optional(),
  destinations: z
    .array(
      z.object({
        vendor: z.string(),
        routed: z.boolean().optional(),
      }),
    )
    .optional(),
  emailed: z.boolean().optional(),
  deduped: z.boolean().optional(),
  error: z.string().optional(),
});

export type IntegrationRouteRequest = z.infer<typeof IntegrationRouteRequestSchema>;
export type IntegrationRouteResponse = z.infer<typeof IntegrationRouteResponseSchema>;

export const contract = {
  id: "integration-route",
  name: "Integration Route",
  direction: "qstash-to-service-callback",
  version: 1,
  request: IntegrationRouteRequestSchema,
  response: IntegrationRouteResponseSchema,
  description:
    "QStash delivers an IntegrationEvent to the service integration-route callback for channel + CRM fan-out.",
} as const;
