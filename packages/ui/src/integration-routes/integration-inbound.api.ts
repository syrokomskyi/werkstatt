/*
<MODULE_CONTRACT>
<purpose>RFC-0176/0181: inbound route /api/integration-inbound. An out-of-process source
(UChat) POSTs a normalized IntegrationEvent here; the handler authenticates it against
INTEGRATION_INBOUND_SECRET, validates the shape, and publishes it to Upstash QStash (EU, eu-central-1)
for reliable, EU-resident delivery (retries + DLQ + dedup). QStash then calls back the site's own
/api/integration-route, which runs the client's gogol-adapter destinations. No visitor PII is
persisted; QStash holds the event in-flight only (RFC-0177).</purpose>
<non-goals>
  <item>Do not persist the event — QStash is in-flight only (RFC-0177 clause 4/6).</item>
  <item>Do not run destination adapters here — that happens in the QStash callback (delivery-api).</item>
  <item>Do not use Cloudflare Queues/KV — they cannot be EU-pinned (RFC-0181).</item>
  <item>Do not expose or log secrets.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0176: initial implementation.</item>
  <item>RFC-0181: publish to Upstash QStash (EU) instead of Cloudflare Queues; CF KV/Queue path removed.</item>
  <item>Architecture review: moved from chat-widget section to integration-routes — delivery endpoints
        are integration infrastructure, not UI section logic.</item>
</CHANGE_SUMMARY>
*/

// @ai-invariant: read secrets only from astro:env/server; never return or log them.

import type { APIRoute } from "astro";
import {
  INTEGRATION_INBOUND_SECRET,
  UPSTASH_QSTASH_URL,
  UPSTASH_QSTASH_TOKEN,
} from "astro:env/server";
import {
  IntegrationEventSchema,
  authenticateInbound,
  buildQstashPublish,
  QSTASH_EU_BASE,
} from "@gogol/integration";
import { json, INTEGRATION_CALLBACK_PATH as CALLBACK_PATH } from "../section-api-utils.ts";

export const POST: APIRoute = async ({ request }) => {
  if (!authenticateInbound(request.headers, INTEGRATION_INBOUND_SECRET)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: "invalid-json" }, 400);
  }

  const parsed = IntegrationEventSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid-event" }, 422);
  }
  const event = parsed.data;

  // Reliable, EU-resident delivery: publish to QStash EU, which calls back this
  // site's /api/integration-route with retries + DLQ. Fail closed if unconfigured.
  if (!UPSTASH_QSTASH_TOKEN) {
    return json({ ok: false, error: "delivery-not-configured" }, 503);
  }
  const callbackUrl = new URL(CALLBACK_PATH, request.url).toString();
  const publish = buildQstashPublish(event, {
    token: UPSTASH_QSTASH_TOKEN,
    callbackUrl,
    baseUrl: UPSTASH_QSTASH_URL || QSTASH_EU_BASE,
  });
  const response = await fetch(publish);
  if (!response.ok) {
    console.warn(`[integration] QStash publish failed: ${response.status}`);
    return json({ ok: false, error: "publish-failed" }, 502);
  }
  return json({ ok: true, queued: true }, 202);
};
