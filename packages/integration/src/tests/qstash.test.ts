/*
<MODULE_CONTRACT>
<purpose>RFC-0181: verify the EU delivery substrate. buildQstashPublish targets the EU region, pins
dedup to the eventId, and never leaks the token into the body; restRedisLedger gives first-seen-once
semantics and fails closed on transport error. fetch is stubbed — no network.</purpose>
<responsibilities>
  <item>publish Request hits the EU base, carries dedup id + retries, body is the event (no token).</item>
  <item>ledger.firstSeen is true on OK, false on null (redelivery), throws on non-2xx (fail-closed).</item>
</responsibilities>
<non-goals><item>No network — fetch stubbed.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0181: initial EU delivery substrate test.</item></CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { QSTASH_EU_BASE, buildQstashPublish, restRedisLedger } from "../qstash.ts";
import type { IntegrationEvent } from "../port.ts";

const EVENT: IntegrationEvent = {
  eventId: "evt-42",
  kind: "lead",
  source: "send-message",
  locale: "de",
  occurredAt: new Date().toISOString(),
  contact: { name: "A", email: "a@example.de" },
  payload: { message: "hallo" },
};

test("buildQstashPublish targets the EU region and pins dedup to the eventId", async () => {
  const req = buildQstashPublish(EVENT, {
    token: "qstash-secret",
    callbackUrl: "https://webgogol.com/internal/integration-route",
  });
  expect(req.url.startsWith(`${QSTASH_EU_BASE}/v2/publish/`)).toBeTruthy();
  expect(req.url.includes("https://webgogol.com/internal/integration-route")).toBeTruthy();
  expect(req.headers.get("upstash-deduplication-id")).toBe("evt-42");
  expect(req.headers.get("upstash-retries")).toBe("3");
});

test("buildQstashPublish puts the event (not the token) in the body", async () => {
  const req = buildQstashPublish(EVENT, {
    token: "qstash-secret",
    callbackUrl: "https://webgogol.com/internal/integration-route",
  });
  const body = await req.text();
  expect(!body.includes("qstash-secret")).toBeTruthy();
  expect(JSON.parse(body).eventId).toBe("evt-42");
});

test("buildQstashPublish honours an explicit retry count", () => {
  const req = buildQstashPublish(EVENT, {
    token: "t",
    callbackUrl: "https://x/cb",
    retries: 5,
  });
  expect(req.headers.get("upstash-retries")).toBe("5");
});

function stubFetch(status: number, result: string | null) {
  return async () => new Response(JSON.stringify({ result }), { status });
}

test("restRedisLedger.firstSeen is true on OK (first) and false on null (redelivery)", async () => {
  const first = restRedisLedger(
    { url: "https://eu-redis.upstash.io", token: "redis-secret" },
    stubFetch(200, "OK") as unknown as typeof fetch,
  );
  expect(await first.firstSeen("evt-42")).toBe(true);

  const repeat = restRedisLedger(
    { url: "https://eu-redis.upstash.io", token: "redis-secret" },
    stubFetch(200, null) as unknown as typeof fetch,
  );
  expect(await repeat.firstSeen("evt-42")).toBe(false);
});

test("restRedisLedger fails closed (throws) on a transport error", async () => {
  const ledger = restRedisLedger(
    { url: "https://eu-redis.upstash.io", token: "redis-secret" },
    stubFetch(500, null) as unknown as typeof fetch,
  );
  await expect(() => ledger.firstSeen("evt-42")).rejects.toThrow();
});
