/*
<MODULE_CONTRACT>
<purpose>RFC-0191: inbound route /api/stripe-webhook. Stripe POSTs a signed billing
event here; the handler delegates to verifyAndMapStripeEvent (signature verification + JSON parse +
runtime shape validation + Stripe→IntegrationEvent mapping + subscription metadata resolution)
and publishes the result to Upstash QStash (EU) for reliable, EU-resident delivery to this site's
/api/integration-route — the same path as the UChat funnel. No Make.com. No card data. The delivery
callback routes billing events to the Lagebild buffer only (no channel fan-out).</purpose>
<non-goals>
  <item>Do not JSON.parse or verify the signature manually — verifyAndMapStripeEvent handles it.</item>
  <item>Do not persist the event — QStash holds it in-flight only (RFC-0177); the buffer persists.</item>
  <item>Do not run destination adapters here — that happens in the QStash callback (delivery-api).</item>
  <item>Do not expose or log secrets.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0191: initial Stripe webhook source (scaffold — verifiable only against live Stripe).</item>
  <item>Architecture review: moved from chat-widget section to integration-routes — delivery endpoints
        are integration infrastructure, not UI section logic.</item>
  <item>Architecture review: replaced manual verify+parse+map with verifyAndMapStripeEvent deep wrapper.</item>
</CHANGE_SUMMARY>
*/

// @ai-invariant: read secrets only from astro:env/server; never return or log them.

import type { APIRoute } from "astro";
import {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  UPSTASH_QSTASH_URL,
  UPSTASH_QSTASH_TOKEN,
} from "astro:env/server";
import { buildQstashPublish, QSTASH_EU_BASE } from "@warpgogol/integration";
import { verifyAndMapStripeEvent } from "@warpgogol/integration-adapter-stripe";
import { json, INTEGRATION_CALLBACK_PATH as CALLBACK_PATH } from "../section-api-utils.ts";

export const POST: APIRoute = async ({ request }) => {
  // Stripe signs the RAW request bytes — read the body before any JSON.parse.
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  const result = await verifyAndMapStripeEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET, {
    stripeSecretKey: STRIPE_SECRET_KEY,
  });

  if (!result.ok) {
    return json({ ok: false, error: result.error }, 400);
  }

  // Event types outside our closed catalog are acknowledged and ignored (Stripe stops retrying).
  if (!result.event) return json({ ok: true, ignored: true }, 200);

  if (!UPSTASH_QSTASH_TOKEN) {
    return json({ ok: false, error: "delivery-not-configured" }, 503);
  }
  const callbackUrl = new URL(CALLBACK_PATH, request.url).toString();
  const publish = buildQstashPublish(result.event, {
    token: UPSTASH_QSTASH_TOKEN,
    callbackUrl,
    baseUrl: UPSTASH_QSTASH_URL || QSTASH_EU_BASE,
  });
  const response = await fetch(publish);
  if (!response.ok) {
    console.warn(`[stripe-webhook] QStash publish failed: ${response.status}`);
    return json({ ok: false, error: "publish-failed" }, 502);
  }
  return json({ ok: true, queued: true }, 202);
};
