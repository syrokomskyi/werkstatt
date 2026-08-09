/*
<MODULE_CONTRACT>
<purpose>RFC-0168/0181: section-owned Astro APIRoute for send-message. Accepts a one-field contact
message, normalizes it into an IntegrationEvent, and publishes it to Upstash QStash (EU) for reliable,
EU-resident delivery — exactly the same exchange the chat widget uses. QStash calls back this site's
/api/integration-route, which fans the event out to channels + CRM with the client's own tokens. The
form no longer delivers synchronously; the exchange is standardized on the queue.</purpose>
<non-goals>
  <item>Do not deliver synchronously or persist messages — QStash is the reliable, in-flight path.</item>
  <item>Do not expose or log secrets.</item>
  <item>Do not use Cloudflare Queues/KV — they cannot be EU-pinned (RFC-0181).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0168: route delivery through the Integration Port (channels + CRM).</item>
  <item>RFC-0181: standardize on QStash — publish an IntegrationEvent instead of delivering synchronously.</item>
  <item>RFC-0514: accept structured email/phone as top-level fields; remove regex extraction.</item>
  <item>RFC-0567: accept and forward referrer field in IntegrationEvent payload.</item>
  <item>RFC-0572: revert to regex extraction from message body; remove top-level email/phone fields.</item>
</CHANGE_SUMMARY>
*/

// @ai-invariant: read secrets only from astro:env/server and never return or log them.

import type { APIRoute } from "astro";
import { UPSTASH_QSTASH_URL, UPSTASH_QSTASH_TOKEN } from "astro:env/server";
import { buildQstashPublish, QSTASH_EU_BASE, type IntegrationEvent } from "@warpgogol/werkstatt-site/integration";
import { json, INTEGRATION_CALLBACK_PATH as CALLBACK_PATH } from "../../section-api-utils.ts";

const EMAIL_EXTRACT_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_EXTRACT_REGEX = /(?:\+?\d[\d\s\-()]{7,}\d)/;
const MAX_MESSAGE_LENGTH = 4000;
const DEFAULT_FORM_ID = "send-message";

type SendMessageBody = {
  message?: unknown;
  formId?: unknown;
  referrer?: unknown;
};

function extractContact(message: string): { email?: string; phone?: string } {
  const emailMatch = message.match(EMAIL_EXTRACT_REGEX);
  const phoneMatch = message.match(PHONE_EXTRACT_REGEX);
  return {
    ...(emailMatch ? { email: emailMatch[0].trim() } : {}),
    ...(phoneMatch ? { phone: phoneMatch[0].trim() } : {}),
  };
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFormId(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : DEFAULT_FORM_ID;
}

export const POST: APIRoute = async ({ request }) => {
  let payload: SendMessageBody;
  try {
    payload = (await request.json()) as SendMessageBody;
  } catch {
    return json({ ok: false, error: "invalid-json" }, 400);
  }

  const message = normalizeString(payload.message);
  const formId = normalizeFormId(payload.formId);
  const referrer = normalizeString(payload.referrer);

  if (message.length < 1) return json({ ok: false, error: "empty-message" }, 400);
  if (message.length > MAX_MESSAGE_LENGTH)
    return json({ ok: false, error: "message-too-long" }, 400);

  const contact = extractContact(message);
  if (!contact.email && !contact.phone)
    return json({ ok: false, error: "no-contact-details" }, 400);

  const event: IntegrationEvent = {
    eventId: crypto.randomUUID(),
    kind: "lead",
    source: formId,
    locale: request.headers.get("accept-language")?.split(",")[0] ?? "",
    occurredAt: new Date().toISOString(),
    contact,
    payload: { message, ...(referrer ? { referrer } : {}) },
  };

  if (!UPSTASH_QSTASH_TOKEN) {
    return json({ ok: false, error: "delivery-not-configured" }, 503);
  }
  const callbackUrl = new URL(CALLBACK_PATH, request.url).toString();
  const response = await fetch(
    buildQstashPublish(event, {
      token: UPSTASH_QSTASH_TOKEN,
      callbackUrl,
      baseUrl: UPSTASH_QSTASH_URL || QSTASH_EU_BASE,
    }),
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.warn(`[integration] QStash publish failed: ${response.status} — ${body}`);
    return json({ ok: false, error: "publish-failed" }, 502);
  }
  return json({ ok: true }, 200);
};
