/*
<MODULE_CONTRACT>
<purpose>RFC-0181: EU-resident delivery substrate. buildQstashPublish constructs the HTTPS request that
publishes an IntegrationEvent to Upstash QStash in the EU region (eu-central-1, Frankfurt) — with
content dedup and a retry count — for reliable webhook delivery back to the site's own callback. The
IdempotencyLedger (Upstash Redis EU) is the durable first-seen guard the callback consults before
routing. Pure: buildQstashPublish does no I/O; the ledger is an injectable interface. Replaces the
Cloudflare Queues/KV substrate (RFC-0179), which cannot be EU-pinned.</purpose>
<non-goals>
  <item>Do not log or embed secrets (UPSTASH_QSTASH_TOKEN, Redis token) — caller injects them.</item>
  <item>Do not publish lead PII to the US region or a non-EU base URL.</item>
  <item>Do not verify QStash webhook signatures here — the route uses @upstash/qstash Receiver.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0181: initial EU delivery substrate (QStash + Redis, eu-central-1).</item>
</CHANGE_SUMMARY>
*/

import type { IntegrationEvent } from "./port.ts";

/** EU-region QStash base URL — the residency pin (Frankfurt, eu-central-1). RFC-0181. */
export const QSTASH_EU_BASE = "https://qstash-eu-central-1.upstash.io" as const;

/**
 * Canonical server-secret NAMES for the EU delivery substrate (RFC-0181). Single
 * source of truth for the env schema, the .env.example generator, and validators.
 * Values are read via `astro:env/server`; never logged, returned, or committed.
 *  - `UPSTASH_QSTASH_URL`            — the EU QStash base (must be the eu-central-1 endpoint).
 *  - `UPSTASH_QSTASH_TOKEN`          — publish token (Bearer).
 *  - `UPSTASH_QSTASH_CURRENT_SIGNING_KEY` / `…_NEXT_SIGNING_KEY` — webhook signature verification.
 *  - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — the EU Redis idempotency ledger.
 */
export const UPSTASH_QSTASH_SECRETS = [
  "UPSTASH_QSTASH_URL",
  "UPSTASH_QSTASH_TOKEN",
  "UPSTASH_QSTASH_CURRENT_SIGNING_KEY",
  "UPSTASH_QSTASH_NEXT_SIGNING_KEY",
] as const;

export const UPSTASH_REDIS_SECRETS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

/** Every EU-delivery secret name (QStash + Redis). RFC-0181. */
export const UPSTASH_DELIVERY_SECRETS = [
  ...UPSTASH_QSTASH_SECRETS,
  ...UPSTASH_REDIS_SECRETS,
] as const;

export interface QstashPublishConfig {
  /** UPSTASH_QSTASH_TOKEN — server secret. Never logged. */
  token: string;
  /** The site's own absolute callback URL (its /internal/integration-route). */
  callbackUrl: string;
  /** QStash retry count (exponential backoff). Default 3. */
  retries?: number;
  /** Base URL — defaults to the EU region. Overriding to a non-EU base breaks residency. */
  baseUrl?: string;
}

/**
 * Pure (RFC-0181): build the HTTPS request that publishes `event` to QStash EU
 * for reliable webhook delivery to `config.callbackUrl`. QStash dedups on
 * `Upstash-Deduplication-Id` (the eventId) and retries to the callback, then
 * dead-letters. No I/O — the caller performs the fetch with this Request.
 */
export function buildQstashPublish(event: IntegrationEvent, config: QstashPublishConfig): Request {
  const base = config.baseUrl ?? QSTASH_EU_BASE;
  // QStash v2: POST /v2/publish/{destination-url}; the body is forwarded to the destination.
  // Do NOT encode the callback URL — QStash expects the raw URL in the path segment.
  // encodeURIComponent breaks scheme detection because %3A is not decoded back to :.
  const url = `${base}/v2/publish/${config.callbackUrl}`;
  return new Request(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
      "upstash-deduplication-id": event.eventId,
      "upstash-retries": String(config.retries ?? 3),
    },
    body: JSON.stringify(event),
  });
}

/**
 * Durable idempotency ledger (RFC-0181) backed by Upstash Redis in the EU.
 * `firstSeen` returns true exactly once per eventId (SET NX), so a QStash
 * redelivery never double-writes into the client's CRM. Stores only the eventId
 * key with a short TTL — never PII.
 */
export interface IdempotencyLedger {
  firstSeen(eventId: string, ttlSeconds?: number): Promise<boolean>;
}

/** Minimal structural type for the Upstash Redis REST endpoint (no hard dep). */
export interface RestRedisConfig {
  /** UPSTASH_REDIS_REST_URL — must be the eu-central-1 endpoint for EU residency. */
  url: string;
  /** UPSTASH_REDIS_REST_TOKEN — server secret. Never logged. */
  token: string;
  /** Key prefix; defaults to the integration dedup namespace. */
  prefix?: string;
}

/**
 * Adapt an Upstash Redis REST endpoint to the IdempotencyLedger (RFC-0181). Uses
 * `SET key 1 NX EX ttl`; a `{"result":"OK"}` means first-seen, `null` means the
 * key already existed (a redelivery). Fails closed on a transport error by
 * throwing, so the callback retries rather than risk a double-write.
 */
export function restRedisLedger(
  config: RestRedisConfig,
  fetchImpl: typeof fetch = fetch,
): IdempotencyLedger {
  const prefix = config.prefix ?? "gogol-int-dedup";
  return {
    async firstSeen(eventId: string, ttlSeconds = 86400): Promise<boolean> {
      const key = `${prefix}:${eventId}`;
      const command = ["SET", key, "1", "NX", "EX", String(ttlSeconds)];
      const response = await fetchImpl(config.url, {
        method: "POST",
        headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      if (!response.ok) {
        throw new Error(`redis ledger SET failed: ${response.status}`);
      }
      const data = (await response.json()) as { result?: string | null };
      return data.result === "OK";
    },
  };
}
