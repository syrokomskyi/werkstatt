/*
<MODULE_CONTRACT>
<purpose>RFC-0176: verify the inbound/queue runtime — authenticateInbound, IntegrationEventSchema,
routeEventToReady (self-enabling Pipedrive route), and consumeIntegrationBatch dedup via a KV-backed
seen-set. fetch + KV are stubbed so the full producer→consumer flow is exercised without Cloudflare.</purpose>
<responsibilities>
  <item>Assert a valid event routes once to the pipedrive gogol-adapter destination.</item>
  <item>Assert a queue redelivery is deduped (no double-write) via the KV seen-set.</item>
  <item>Assert inbound auth + event-shape validation are fail-closed.</item>
</responsibilities>
<non-goals>
  <item>Do not hit the network — fetch is stubbed.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0176: initial queue/inbound runtime test.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, afterEach, beforeEach } from "vitest";
import {
  IntegrationEventSchema,
  authenticateInbound,
  consumeIntegrationBatch,
  kvDedup,
  routeEventToReady,
  type IntegrationEvent,
  type IntegrationSecrets,
  type KvDedupStore,
} from "../index.ts";

const SECRETS: IntegrationSecrets = {
  INTEGRATION_PIPEDRIVE_API_TOKEN: "tok",
  INTEGRATION_PIPEDRIVE_DOMAIN: "acme",
};

const EVENT: IntegrationEvent = {
  eventId: "evt-1",
  kind: "lead",
  source: "uchat",
  locale: "de",
  occurredAt: "2026-06-08T00:00:00.000Z",
  contact: { name: "Max", email: "max@example.org" },
  payload: { note: "Hello from the chat" },
};

/** In-memory KV implementing the dedup store contract. */
function memoryKv(): KvDedupStore & { size(): number } {
  const map = new Map<string, string>();
  return {
    async get(key) {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    async put(key, value) {
      map.set(key, value);
    },
    size: () => map.size,
  };
}

let fetchCalls: string[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchCalls = [];
  // Stub Pipedrive persons + leads endpoints — both return a usable id.
  globalThis.fetch = (async (url: string | URL | Request) => {
    fetchCalls.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 1 } }),
    } as unknown as Response;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("routeEventToReady routes a lead to the pipedrive gogol-adapter destination", async () => {
  const result = await routeEventToReady(EVENT, SECRETS);
  expect(result.routed).toEqual(["crm:pipedrive"]);
  expect(result.failed.length).toBe(0);
  // pipedrive adapter performs persons + leads calls.
  expect(fetchCalls.length).toBe(2);
});

test("routeEventToReady skips when destination secrets are absent", async () => {
  const result = await routeEventToReady(EVENT, {});
  expect(result.skipped).toEqual(["crm:pipedrive"]);
  expect(result.routed.length).toBe(0);
  expect(fetchCalls.length).toBe(0);
});

test("consumeIntegrationBatch dedups a queue redelivery via KV (no double-write)", async () => {
  const kv = memoryKv();
  const dedup = kvDedup(kv);

  const first = await consumeIntegrationBatch([EVENT], SECRETS, dedup);
  expect(first[0].routed).toEqual(["crm:pipedrive"]);
  const afterFirst = fetchCalls.length;
  expect(afterFirst).toBe(2);

  // Redeliver the SAME eventId — must be skipped by dedup, no new fetches.
  const second = await consumeIntegrationBatch([EVENT], SECRETS, dedup);
  expect(second[0].skipped).toEqual(["crm:pipedrive"]);
  expect(fetchCalls.length).toBe(afterFirst);
  expect(kv.size()).toBe(1);
});

test("authenticateInbound is fail-closed (bearer + header, unset secret rejects)", () => {
  const ok = new Headers({ authorization: "Bearer s3cret" });
  const okHeader = new Headers({ "x-integration-secret": "s3cret" });
  const wrong = new Headers({ authorization: "Bearer nope" });
  expect(authenticateInbound(ok, "s3cret")).toBe(true);
  expect(authenticateInbound(okHeader, "s3cret")).toBe(true);
  expect(authenticateInbound(wrong, "s3cret")).toBe(false);
  expect(authenticateInbound(ok, undefined)).toBe(false);
  expect(authenticateInbound(new Headers(), "s3cret")).toBe(false);
});

test("IntegrationEventSchema rejects malformed payloads", () => {
  expect(IntegrationEventSchema.safeParse(EVENT).success).toBe(true);
  expect(IntegrationEventSchema.safeParse({ ...EVENT, kind: "bogus" }).success).toBe(false);
  expect(IntegrationEventSchema.safeParse({ ...EVENT, eventId: "" }).success).toBe(false);
  expect(IntegrationEventSchema.safeParse({}).success).toBe(false);
});
