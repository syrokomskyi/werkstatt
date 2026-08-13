/*
<MODULE_CONTRACT>
<purpose>RFC-0181: the QStash delivery callback /api/integration-route. Delegates to
createDeliveryHandler from @warpgogol/werkstatt-site/share/integration — the deep module that owns QStash
verification, Redis idempotency, channel fan-out, CRM routing, and email notification.
This file is a thin adapter that injects secrets + the Cloudflare email binding.</purpose>
<non-goals>
  <item>Do not implement delivery logic here — it lives in @warpgogol/werkstatt-site/share/integration.</item>
  <item>Do not expose or log secrets.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0181: initial QStash delivery callback.</item>
  <item>RFC-0181: unify channels + CRM (deliverEvent); email via Cloudflare Email Routing.</item>
  <item>Architecture review: delegate to createDeliveryHandler — 202 lines → 30.</item>
  <item>Architecture review: moved from chat-widget section to integration-routes — delivery endpoints
        are integration infrastructure, not UI section logic.</item>
</CHANGE_SUMMARY>
*/

// @ai-invariant: read secrets only from astro:env/server; never return or log them.

import type { APIRoute } from "astro";
import {
  UPSTASH_QSTASH_CURRENT_SIGNING_KEY,
  UPSTASH_QSTASH_NEXT_SIGNING_KEY,
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
  INTEGRATION_TELEGRAM_BOT_TOKEN,
  INTEGRATION_TELEGRAM_CHAT_ID,
  INTEGRATION_WHATSAPP_TOKEN,
  INTEGRATION_WHATSAPP_PHONE_ID,
  INTEGRATION_WHATSAPP_TO,
  INTEGRATION_PIPEDRIVE_API_TOKEN,
  INTEGRATION_PIPEDRIVE_DOMAIN,
  INTEGRATION_EMAIL_TO,
  INTEGRATION_EMAIL_FROM,
  SUPABASE_BUFFER_URL,
  SUPABASE_BUFFER_SERVICE_KEY,
  SUPABASE_BUFFER_TENANT_ID,
} from "astro:env/server";
import {
  createDeliveryHandler,
  type IntegrationSecrets,
} from "@warpgogol/werkstatt-site/integration";
import { supabaseBufferDestinationAdapter } from "@warpgogol/werkstatt-site/integration-adapter-supabase-crm";

/** RFC-0181: channel + CRM secrets bag from astro:env/server (client tokens). */
function buildSecrets(): IntegrationSecrets {
  return {
    INTEGRATION_TELEGRAM_BOT_TOKEN,
    INTEGRATION_TELEGRAM_CHAT_ID,
    INTEGRATION_WHATSAPP_TOKEN,
    INTEGRATION_WHATSAPP_PHONE_ID,
    INTEGRATION_WHATSAPP_TO,
    INTEGRATION_PIPEDRIVE_API_TOKEN,
    INTEGRATION_PIPEDRIVE_DOMAIN,
    // Lagebild MVP: CRM buffer (self-enabling — adapter skips when secrets absent).
    SUPABASE_BUFFER_URL,
    SUPABASE_BUFFER_SERVICE_KEY,
    SUPABASE_BUFFER_TENANT_ID,
  };
}

interface EmailRoutingEnv {
  SEND_EMAIL?: { send(message: unknown): Promise<void> };
}

// cloudflare:workers is only available in the Cloudflare Workers runtime.
// In Astro dev mode (Node.js) the import fails — resolve lazily so the route
// still loads; SEND_EMAIL is undefined in dev (email routing is a production binding).
async function resolveEmailBinding(): Promise<
  { send(message: unknown): Promise<void> } | undefined
> {
  try {
    const { env } = await import("cloudflare:workers");
    return (env as unknown as EmailRoutingEnv).SEND_EMAIL;
  } catch {
    return undefined;
  }
}

const handler = createDeliveryHandler({
  qstashCurrentSigningKey: UPSTASH_QSTASH_CURRENT_SIGNING_KEY,
  qstashNextSigningKey: UPSTASH_QSTASH_NEXT_SIGNING_KEY,
  redisRestUrl: UPSTASH_REDIS_REST_URL,
  redisRestToken: UPSTASH_REDIS_REST_TOKEN,
  secrets: buildSecrets(),
  extraAdapters: [supabaseBufferDestinationAdapter],
  email: {
    to: INTEGRATION_EMAIL_TO,
    from: INTEGRATION_EMAIL_FROM,
    sendBinding: await resolveEmailBinding(),
  },
});

export const POST: APIRoute = async ({ request }) => handler(request);
