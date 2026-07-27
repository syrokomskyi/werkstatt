/*
<MODULE_CONTRACT>
<purpose>RFC-0179: verify the dynamic-dispatch seam. executeDispatch (tenant-side) runs ready
destinations with local secrets; dispatchToTenant (consumer-side) posts into the tenant, never
carries a destination token, and maps the reply to ack vs retry. fetch/dispatcher are stubbed.</purpose>
<responsibilities>
  <item>executeDispatch skips destinations when the tenant has no secrets (no network).</item>
  <item>dispatchToTenant returns ok on a routed reply and retry on all-failed / non-2xx / throw.</item>
  <item>dispatchToTenant sends the inbound secret header and never the destination token.</item>
</responsibilities>
<non-goals><item>No network — fetch + dispatcher are stubbed.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0179: initial dispatch-seam test.</item></CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import {
  dispatchToTenant,
  executeDispatch,
  type DispatchExecuteResult,
  type DispatchNamespaceBinding,
} from "../dispatch.ts";
import type { IntegrationEvent } from "../port.ts";

const EVENT: IntegrationEvent = {
  eventId: "evt-1",
  kind: "lead",
  source: "uchat",
  locale: "de",
  occurredAt: new Date().toISOString(),
  contact: { name: "A", email: "a@example.org" },
  payload: { message: "hi" },
};

test("executeDispatch skips destinations when the tenant holds no secrets", async () => {
  const result = await executeDispatch({ siteId: "webgogol-com", event: EVENT }, {});
  expect(result.routed.length).toBe(0);
  expect(result.skipped.includes("crm:pipedrive")).toBeTruthy();
});

function stubDispatcher(
  reply: DispatchExecuteResult,
  status = 200,
  capture?: (r: Request) => void,
) {
  const binding: DispatchNamespaceBinding = {
    get() {
      return {
        async fetch(request: Request): Promise<Response> {
          capture?.(request);
          return new Response(JSON.stringify(reply), { status });
        },
      };
    },
  };
  return binding;
}

test("dispatchToTenant acks on a routed reply and forwards only the inbound secret", async () => {
  let seen: Request | undefined;
  const dispatcher = stubDispatcher(
    { routed: ["crm:pipedrive"], failed: [], skipped: [] },
    200,
    (r) => (seen = r),
  );
  const outcome = await dispatchToTenant(
    dispatcher,
    { siteId: "webgogol-com", event: EVENT },
    "inbound-secret",
  );
  expect(outcome.ok).toBe(true);
  expect(seen?.headers.get("x-integration-secret")).toBe("inbound-secret");
  const body = await seen!.text();
  expect(!body.includes("PIPEDRIVE")).toBeTruthy();
});

test("dispatchToTenant retries when nothing routed but something failed", async () => {
  const dispatcher = stubDispatcher({ routed: [], failed: ["crm:pipedrive"], skipped: [] });
  const outcome = await dispatchToTenant(dispatcher, { siteId: "x", event: EVENT }, "s");
  expect(outcome.ok).toBe(false);
});

test("dispatchToTenant retries on a non-2xx tenant response", async () => {
  const dispatcher = stubDispatcher({ routed: [], failed: [], skipped: [] }, 503);
  const outcome = await dispatchToTenant(dispatcher, { siteId: "x", event: EVENT }, "s");
  expect(outcome.ok).toBe(false);
  expect(outcome.transportError ?? "").toMatch(/503/);
});
