/*
<MODULE_CONTRACT>
<purpose>
  RFC-0181: the QStash delivery callback factory. Creates a POST handler that verifies the
  QStash signature, runs a durable idempotency check in Upstash Redis (EU), then delivers
  the event to the client's channels (Telegram/WhatsApp) + CRM with the client's own tokens,
  and sends an email notification via Cloudflare Email Routing (send_email binding).
  Holds nothing — Redis stores only the short-TTL eventId (RFC-0177).

  Architecture review: extracted from chat-widget-section.delivery.api.ts so any source
  section (send-message, chat-widget, future sources) can call one factory instead of
  duplicating 202 lines of delivery orchestration.
</purpose>
<non-goals>
  <item>Do not persist the event payload — only the eventId idempotency key (short TTL).</item>
  <item>Do not use Resend or any external email API — email is Cloudflare Email Routing only.</item>
  <item>Do not expose or log secrets.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review: extracted delivery callback logic from chat-widget-section.delivery.api.ts.</item>
  <item>RFC-0827: import IntegrationRouteRequestSchema from testing/contract for event validation.</item>
</CHANGE_SUMMARY>
*/

// @ai-invariant: read secrets only from injected values; never return or log them.

import {
  deliverEvent,
  routeEventToReady,
  restRedisLedger,
  eventToLeadMessage,
  type IntegrationEvent,
  type IntegrationSecrets,
  type DestinationAdapter,
} from "./index.ts";
import { IntegrationRouteRequestSchema } from "@warpgogol/werkstatt-site/testing/contract";

/** Secrets + email config injected by the caller (from astro:env/server). */
export interface DeliveryHandlerConfig {
  /** QStash signing keys for webhook signature verification. */
  qstashCurrentSigningKey: string | undefined;
  qstashNextSigningKey: string | undefined;
  /** Upstash Redis EU credentials for idempotency ledger. */
  redisRestUrl: string | undefined;
  redisRestToken: string | undefined;
  /** Channel + CRM secrets bag (client tokens). */
  secrets: IntegrationSecrets;
  /** Extra destination adapters (e.g. supabaseBufferDestinationAdapter). */
  extraAdapters?: readonly DestinationAdapter[];
  /** Email routing config (optional — email skipped when absent). */
  email?: {
    to: string | undefined;
    from: string | undefined;
    /** Cloudflare Email Routing send binding. */
    sendBinding?: { send(message: unknown): Promise<void> };
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * RFC-0181: send a lead-notification email via Cloudflare Email Routing (send_email
 * binding). FROM must be on a verified zone domain; TO a verified destination address.
 * Best-effort — a failure is logged, never throwing into the delivery result.
 */
async function sendEmailNotification(
  event: IntegrationEvent,
  email: NonNullable<DeliveryHandlerConfig["email"]>,
): Promise<boolean> {
  const binding = email.sendBinding;
  if (!binding || !email.to || !email.from) return false;
  const msg = eventToLeadMessage(event);
  const subject = `Neue Anfrage: ${msg.formId}`;
  const text = [
    `Quelle: ${msg.formId}`,
    `Sprache: ${msg.locale}`,
    `Zeit: ${msg.submittedAt}`,
    "",
    msg.message,
  ].join("\n");
  // Minimal RFC-822 message. EmailMessage(from, to, rawMime) is provided by cloudflare:email.
  const raw =
    `From: ${email.from}\r\n` +
    `To: ${email.to}\r\n` +
    `Subject: ${subject}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
    `${text}\r\n`;
  try {
    // cloudflare:email is a Cloudflare runtime module — no type declarations available.
    // Use a string variable to bypass TypeScript module resolution.
    const moduleName = "cloudflare:email";
    const mod = (await import(/* @vite-ignore */ moduleName)) as {
      EmailMessage: new (from: string, to: string, raw: string) => unknown;
    };
    await binding.send(new mod.EmailMessage(email.from, email.to, raw));
    return true;
  } catch (err) {
    console.warn("[integration]/email-send-failure", (err as Error).message);
    return false;
  }
}

/**
 * RFC-0181: verify the QStash webhook signature. Returns true if valid.
 * Uses @upstash/qstash Receiver — imported lazily so the dependency is optional
 * for consumers that don't use the delivery callback.
 */
async function verifyQstashSignature(
  signature: string,
  body: string,
  url: string,
  currentKey: string,
  nextKey: string,
): Promise<boolean> {
  const { Receiver } = await import("@upstash/qstash");
  const receiver = new Receiver({
    currentSigningKey: currentKey,
    nextSigningKey: nextKey,
  });
  try {
    return await receiver.verify({ signature, body, url });
  } catch {
    return false;
  }
}

/**
 * RFC-0181: create the QStash delivery callback POST handler.
 *
 * The handler:
 *   1. Verifies the QStash signature.
 *   2. Parses + validates the IntegrationEvent.
 *   3. Runs a durable idempotency check in Upstash Redis (EU).
 *   4. Delivers the event to channels + CRM (or buffer-only for billing events).
 *   5. Sends a lead-notification email (non-billing events only).
 *   6. Returns 200 (ack) or 502 (retry) so QStash retries on failure.
 *
 * @param config — secrets + email config injected by the caller.
 * @returns a POST handler function suitable for Astro's `export const POST`.
 */
export function createDeliveryHandler(
  config: DeliveryHandlerConfig,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (!config.qstashCurrentSigningKey) {
      return json({ ok: false, error: "delivery-not-configured" }, 503);
    }

    const signature = request.headers.get("upstash-signature") ?? "";
    const body = await request.text();

    const verifyUrl = import.meta.env.PUBLIC_SITE_URL
      ? new URL(new URL(request.url).pathname, import.meta.env.PUBLIC_SITE_URL).toString()
      : request.url;
    const valid = await verifyQstashSignature(
      signature,
      body,
      verifyUrl,
      config.qstashCurrentSigningKey,
      config.qstashNextSigningKey ?? "",
    );
    if (!valid) return json({ ok: false, error: "bad-signature" }, 401);

    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      return json({ ok: false, error: "invalid-json" }, 400);
    }
    const parsed = IntegrationRouteRequestSchema.safeParse(raw);
    if (!parsed.success) return json({ ok: false, error: "invalid-event" }, 422);
    const event = parsed.data;

    // Durable idempotency (Upstash Redis EU). Fail closed → QStash retries.
    if (config.redisRestUrl && config.redisRestToken) {
      const ledger = restRedisLedger({
        url: config.redisRestUrl,
        token: config.redisRestToken,
      });
      let first: boolean;
      try {
        first = await ledger.firstSeen(event.eventId);
      } catch (err) {
        console.warn("[integration]/ledger-unavailable/retry", (err as Error).message);
        return json({ ok: false, error: "ledger-unavailable" }, 503);
      }
      if (!first) return json({ ok: true, deduped: true }, 200);
    }

    // Lagebild: supabaseBufferDestinationAdapter is self-enabling — skipped when secrets absent.
    // RFC-0191: a Stripe billing/lifecycle event goes ONLY to the buffer — no channel fan-out
    // (Telegram/WhatsApp) and no lead-notification email; it is not a visitor lead.
    const isBillingEvent = event.source === "stripe" || Boolean(event.lifecycle);
    let result: Awaited<ReturnType<typeof deliverEvent>>;
    let emailed = false;
    if (isBillingEvent) {
      const destinations = await routeEventToReady(event, config.secrets, undefined, [
        ...(config.extraAdapters ?? []),
      ]);
      result = { channels: { delivered: [], failed: [], skipped: [] }, destinations };
    } else {
      result = await deliverEvent(event, config.secrets, undefined, [
        ...(config.extraAdapters ?? []),
      ]);
      if (config.email) {
        emailed = await sendEmailNotification(event, config.email);
      }
    }

    const sinks =
      result.channels.delivered.length + result.destinations.routed.length + (emailed ? 1 : 0);
    const failures = result.channels.failed.length + result.destinations.failed.length;
    // A configured sink that failed → retry (bounded → DLQ). Everything skipped (nothing
    // configured) → ack so QStash does not retry a misconfiguration forever.
    if (sinks === 0 && failures > 0) {
      return json({ ok: false, error: "delivery-failed" }, 502);
    }
    return json(
      {
        ok: true,
        channels: result.channels.delivered,
        destinations: result.destinations.routed,
        emailed,
      },
      200,
    );
  };
}
