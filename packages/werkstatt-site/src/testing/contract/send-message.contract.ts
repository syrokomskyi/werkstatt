/*
<MODULE_CONTRACT>
<purpose>
  RFC-0827: Contract schema for the send-message site-to-service-via-QStash boundary.
  Defines the form submission shape (what the browser sends to the site's API route)
  and the response shape the site returns to the browser.
</purpose>
<non-goals>
  <item>Does not define the IntegrationEvent shape — that is the integration-route contract (reuses IntegrationEventSchema).</item>
  <item>Does not define QStash publish parameters — those are transport concerns, not contract concerns.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0827: initial contract schema for send-message API boundary.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const SendMessageRequestSchema = z.object({
  message: z.string().min(1),
  formId: z.string().optional(),
  referrer: z.string().optional(),
});

export const SendMessageResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
});

export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;

export const contract = {
  id: "send-message",
  name: "Send Message",
  direction: "site-to-service-via-qstash",
  version: 1,
  request: SendMessageRequestSchema,
  response: SendMessageResponseSchema,
  description:
    "Site publishes a message to QStash, which delivers to the service integration-route callback.",
} as const;
