/*
<MODULE_CONTRACT>
<purpose>RFC-0168/0181: reference Integration Port adapters. Channel adapters (Telegram, WhatsApp
Cloud API) and a CRM adapter (Pipedrive). Each is fetch-based, secret-driven, and self-disables when
its required secrets are absent. Email is NOT a fetch adapter — it is sent via Cloudflare Email
Routing (send_email binding) in the delivery callback (RFC-0181).</purpose>
<non-goals>
  <item>Do not import vendor SDKs or astro:env — fetch + injected secrets only.</item>
  <item>Do not log or echo secrets.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0168: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import type {
  CrmAdapter,
  DestinationAdapter,
  IntegrationChannelAdapter,
  IntegrationEvent,
  IntegrationSecrets,
  Lead,
  LeadMessage,
} from "./port.ts";
import { eventToLead } from "./port.ts";

function formatMessageText(message: LeadMessage): string {
  return [
    "Neue Kontaktanfrage (send-message)",
    `Formular: ${message.formId}`,
    `Sprache: ${message.locale}`,
    `Zeit: ${message.submittedAt}`,
    "",
    message.message,
  ].join("\n");
}

export const telegramChannelAdapter: IntegrationChannelAdapter = {
  id: "telegram",
  requiredSecrets: ["INTEGRATION_TELEGRAM_BOT_TOKEN", "INTEGRATION_TELEGRAM_CHAT_ID"],
  async deliver(message: LeadMessage, secrets: IntegrationSecrets): Promise<void> {
    const token = secrets.INTEGRATION_TELEGRAM_BOT_TOKEN;
    const chatId = secrets.INTEGRATION_TELEGRAM_CHAT_ID;
    if (!token || !chatId) throw new Error("telegram: missing credentials");
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: formatMessageText(message) }),
    });
    if (!res.ok) throw new Error(`telegram: API ${res.status}`);
  },
};

// RFC-0181: the Resend email channel adapter was removed. Email notifications are
// sent via Cloudflare Email Routing (the `send_email` Worker binding), handled in the
// delivery callback route — not as a fetch+secret channel adapter. See the email
// notification step in chat-widget-section.delivery.api.ts and docs/specs/integration-delivery.md.

export const whatsappChannelAdapter: IntegrationChannelAdapter = {
  id: "whatsapp",
  requiredSecrets: [
    "INTEGRATION_WHATSAPP_TOKEN",
    "INTEGRATION_WHATSAPP_PHONE_ID",
    "INTEGRATION_WHATSAPP_TO",
  ],
  async deliver(message: LeadMessage, secrets: IntegrationSecrets): Promise<void> {
    const token = secrets.INTEGRATION_WHATSAPP_TOKEN;
    const phoneId = secrets.INTEGRATION_WHATSAPP_PHONE_ID;
    const to = secrets.INTEGRATION_WHATSAPP_TO;
    if (!token || !phoneId || !to) throw new Error("whatsapp: missing credentials");
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: formatMessageText(message) },
      }),
    });
    if (!res.ok) throw new Error(`whatsapp: Cloud API ${res.status}`);
  },
};

export const pipedriveCrmAdapter: CrmAdapter = {
  id: "pipedrive",
  requiredSecrets: ["INTEGRATION_PIPEDRIVE_API_TOKEN", "INTEGRATION_PIPEDRIVE_DOMAIN"],
  async upsertLead(lead: Lead, secrets: IntegrationSecrets): Promise<{ id: string } | null> {
    const token = secrets.INTEGRATION_PIPEDRIVE_API_TOKEN;
    const domain = secrets.INTEGRATION_PIPEDRIVE_DOMAIN;
    if (!token || !domain) throw new Error("pipedrive: missing credentials");
    // Create a person first (leads require a linked person/organization in Pipedrive).
    const personRes = await fetch(
      `https://${domain}.pipedrive.com/api/v1/persons?api_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: lead.name ?? lead.email ?? lead.phone ?? "Website lead",
          ...(lead.email ? { email: [lead.email] } : {}),
          ...(lead.phone ? { phone: [lead.phone] } : {}),
        }),
      },
    );
    if (!personRes.ok) throw new Error(`pipedrive: persons API ${personRes.status}`);
    const personJson = (await personRes.json()) as { data?: { id?: number } };
    const personId = personJson.data?.id;
    if (!personId) return null;

    const leadRes = await fetch(
      `https://${domain}.pipedrive.com/api/v1/leads?api_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${lead.source}: ${lead.name ?? "lead"}`,
          person_id: personId,
        }),
      },
    );
    if (!leadRes.ok) throw new Error(`pipedrive: leads API ${leadRes.status}`);
    const leadJson = (await leadRes.json()) as { data?: { id?: string } };
    return leadJson.data?.id ? { id: String(leadJson.data.id) } : null;
  },
};

/**
 * RFC-0176: Pipedrive as a destination-hub adapter (kind `crm`, mode `gogol-adapter`).
 * Runs on the client's site with the client's token. Reuses the RFC-0168
 * pipedriveCrmAdapter by mapping the normalized IntegrationEvent → Lead.
 */
export const pipedriveDestinationAdapter: DestinationAdapter = {
  kind: "crm",
  vendor: "pipedrive",
  requiredSecrets: pipedriveCrmAdapter.requiredSecrets,
  async route(
    event: IntegrationEvent,
    secrets: IntegrationSecrets,
  ): Promise<{ id: string } | null> {
    return pipedriveCrmAdapter.upsertLead(eventToLead(event), secrets);
  },
};
