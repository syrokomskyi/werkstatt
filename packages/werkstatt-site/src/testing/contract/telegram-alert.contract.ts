/*
<MODULE_CONTRACT>
<purpose>
  RFC-0827: Contract schema for the telegram-alert-bridge alert boundary.
  The telegram-alert-bridge receives SigNoz webhook payloads and forwards to Telegram.
</purpose>
<non-goals>
  <item>Does not define Telegram Bot API parameters — those are transport concerns.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0827: initial contract schema for telegram-alert-bridge alert boundary.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

export const TelegramAlertRequestSchema = z.object({
  alert_name: z.string().optional(),
  state: z.string().optional(),
  severity: z.string().optional(),
  labels: z.record(z.string(), z.string()).optional(),
  description: z.string().optional(),
});

export const TelegramAlertResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
});

export type TelegramAlertRequest = z.infer<typeof TelegramAlertRequestSchema>;
export type TelegramAlertResponse = z.infer<typeof TelegramAlertResponseSchema>;

export const contract = {
  id: "telegram-alert",
  name: "Telegram Alert",
  direction: "signoz-to-service",
  version: 1,
  request: TelegramAlertRequestSchema,
  response: TelegramAlertResponseSchema,
  description:
    "Telegram-alert-bridge receives SigNoz webhook payloads and forwards alerts to Telegram.",
} as const;
