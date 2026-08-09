/*
<MODULE_CONTRACT>
<purpose>RFC-0191: verify the Stripe adapter's pieces — signature verification
(fail-closed, fresh, tamper-evident), Stripe→IntegrationEvent mapping (funnel join + lifecycle),
the StripeEventSchema runtime shape validation, and the deep verifyAndMapStripeEvent wrapper
(signature + parse + validate + map + subscription metadata resolution). No network, no Stripe SDK.</purpose>
<responsibilities>
  <item>verifyStripeSignature: valid passes; tampered body and stale timestamp fail; unset secret fails.</item>
  <item>mapping: checkout→payment.confirmed; invoice.paid→lifecycle; unknown→null.</item>
  <item>StripeEventSchema: valid event passes; missing id / wrong types fail.</item>
  <item>verifyAndMapStripeEvent: invalid signature → invalid-signature; valid → mapped event;
      cycle invoice with needsSubscriptionLookup → fetches subscription metadata and re-maps.</item>
</responsibilities>
<non-goals><item>No network — fetch + crypto only.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0191: initial Stripe adapter test.</item>
  <item>Architecture review: removed billing tests; added StripeEventSchema + verifyAndMapStripeEvent tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyStripeSignature } from "../signature.ts";
import {
  stripeEventToIntegrationEvent,
  verifyAndMapStripeEvent,
  StripeEventSchema,
} from "../mapping.ts";

const SECRET = "whsec_test_secret";
const API_KEY = "sk_test_123";

function signedHeader(body: string, ts: number, secret = SECRET): string {
  const v1 = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  return `t=${ts},v1=${v1}`;
}

test("verifyStripeSignature: valid + fresh passes", () => {
  const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
  const ts = 1_000_000;
  expect(verifyStripeSignature(body, signedHeader(body, ts), SECRET, { nowSec: ts + 10 })).toBe(
    true,
  );
});

test("verifyStripeSignature is fail-closed and tamper/stale-evident", () => {
  const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
  const ts = 1_000_000;
  const header = signedHeader(body, ts);
  // unset secret → false
  expect(verifyStripeSignature(body, header, undefined, { nowSec: ts })).toBe(false);
  // tampered body → false
  expect(verifyStripeSignature(body + "x", header, SECRET, { nowSec: ts })).toBe(false);
  // stale timestamp (outside tolerance) → false
  expect(verifyStripeSignature(body, header, SECRET, { nowSec: ts + 10_000 })).toBe(false);
});

test("mapping: checkout.session.completed → funnel payment.confirmed", () => {
  const ev = stripeEventToIntegrationEvent({
    id: "evt_cs",
    type: "checkout.session.completed",
    created: 1_700_000_000,
    data: {
      object: {
        customer: "cus_1",
        subscription: "sub_1",
        client_reference_id: "deal_1",
        metadata: { site_key: "s1", organization_id: "org_1", locale: "uk" },
      },
    },
  });
  expect(ev).toBeTruthy();
  expect(ev!.source).toBe("stripe");
  expect(ev!.locale).toBe("uk");
  expect(ev!.payload.eventKind).toBe("payment.confirmed");
  expect(ev!.payload.lagebild_deal_id).toBe("deal_1");
});

test("mapping: invoice.paid → typed lifecycle payload; unknown → null", () => {
  const ev = stripeEventToIntegrationEvent({
    id: "evt_in",
    type: "invoice.paid",
    created: 1_700_000_000,
    data: { object: { id: "in_1", customer: "cus_1", amount_paid: 7000, currency: "eur" } },
  });
  expect(ev).toBeTruthy();
  expect(ev!.lifecycle?.eventKind).toBe("invoice.paid");
  expect(ev!.lifecycle?.amountCents).toBe(7000);
  expect(ev!.lifecycle?.currency).toBe("EUR");
  expect(ev!.lifecycle?.stripeEventId).toBe("evt_in");

  expect(
    stripeEventToIntegrationEvent({
      id: "evt_x",
      type: "customer.discount.created",
      created: 1,
      data: { object: {} },
    }),
  ).toBe(null);
});

test("mapping §08: a one-off change invoice carries lagebild refs, invoice_kind, price ids", () => {
  const ev = stripeEventToIntegrationEvent({
    id: "evt_change",
    type: "invoice.paid",
    created: 1_700_000_000,
    data: {
      object: {
        id: "in_change",
        customer: "cus_1",
        amount_paid: 1500,
        currency: "eur",
        metadata: {
          lagebild_organization_id: "org_9",
          lagebild_deal_id: "deal_change_3",
          site_key: "site_a",
          invoice_kind: "change",
        },
        lines: { data: [{ price: { id: "price_change" } }] },
      },
    },
  });
  expect(ev).toBeTruthy();
  expect(ev!.lifecycle?.lagebildOrganizationId).toBe("org_9");
  expect(ev!.lifecycle?.lagebildDealId).toBe("deal_change_3");
  expect(ev!.lifecycle?.siteKey).toBe("site_a");
  expect(ev!.lifecycle?.invoiceKind).toBe("change");
  expect(ev!.lifecycle?.priceIds).toEqual(["price_change"]);
  expect(ev!.lifecycle?.needsSubscriptionLookup).toBe(undefined); // has its own metadata
});

test("mapping §08: a cycle invoice with no metadata flags needsSubscriptionLookup + kind=cycle", () => {
  const ev = stripeEventToIntegrationEvent({
    id: "evt_cycle",
    type: "invoice.paid",
    created: 1_700_000_000,
    data: {
      object: {
        id: "in_cycle",
        customer: "cus_1",
        subscription: "sub_1",
        amount_paid: 7000,
        currency: "eur",
        lines: { data: [{ price: { id: "price_base_monthly" } }] },
      },
    },
  });
  expect(ev).toBeTruthy();
  expect(ev!.lifecycle?.invoiceKind).toBe("cycle"); // has a subscription
  expect(ev!.lifecycle?.needsSubscriptionLookup).toBe(true); // no lagebild_* metadata
  expect(ev!.lifecycle?.lagebildOrganizationId).toBe(undefined);
  expect(ev!.lifecycle?.priceIds).toEqual(["price_base_monthly"]);
});

test("mapping §08: subscription.updated carries lagebild refs from metadata", () => {
  const ev = stripeEventToIntegrationEvent({
    id: "evt_sub",
    type: "customer.subscription.updated",
    created: 1_700_000_000,
    data: {
      object: {
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        current_period_end: 1_701_000_000,
        metadata: {
          lagebild_organization_id: "org_9",
          lagebild_deal_id: "deal_sub_1",
          site_key: "site_a",
        },
      },
    },
  });
  expect(ev).toBeTruthy();
  expect(ev!.lifecycle?.eventKind).toBe("subscription.updated");
  expect(ev!.lifecycle?.subscriptionStatus).toBe("active");
  expect(ev!.lifecycle?.lagebildOrganizationId).toBe("org_9");
  expect(ev!.lifecycle?.lagebildDealId).toBe("deal_sub_1");
  expect(ev!.lifecycle?.needsSubscriptionLookup).toBe(undefined); // not an invoice
});

test("mapping §08: subscription event computes monthly MRR + plan + includedChangesPerCycle", () => {
  const ev = stripeEventToIntegrationEvent({
    id: "evt_sub_m",
    type: "customer.subscription.created",
    created: 1_700_000_000,
    data: {
      object: {
        id: "sub_x",
        customer: "cus_1",
        status: "active",
        current_period_end: 1_701_000_000,
        metadata: {
          lagebild_organization_id: "org_9",
          lagebild_deal_id: "deal_p3",
          plan: "digital_foundation_monthly",
          included_changes_per_cycle: "1",
        },
        items: {
          data: [
            { quantity: 1, price: { unit_amount: 7000, recurring: { interval: "month" } } },
            { quantity: 1, price: { unit_amount: 2900, recurring: { interval: "month" } } },
          ],
        },
      },
    },
  });
  expect(ev).toBeTruthy();
  expect(ev!.lifecycle?.plan).toBe("digital_foundation_monthly");
  expect(ev!.lifecycle?.mrrCents).toBe(9900); // 7000 + 2900
  expect(ev!.lifecycle?.includedChangesPerCycle).toBe(1);
  expect(ev!.lifecycle?.lagebildDealId).toBe("deal_p3");
});

test("mapping §08: a yearly subscription normalizes MRR to monthly (/12)", () => {
  const ev = stripeEventToIntegrationEvent({
    id: "evt_y",
    type: "customer.subscription.created",
    created: 1,
    data: {
      object: {
        id: "sub_y",
        customer: "cus_1",
        status: "active",
        metadata: { plan: "digital_foundation_yearly" },
        items: {
          data: [{ quantity: 1, price: { unit_amount: 70000, recurring: { interval: "year" } } }],
        },
      },
    },
  });
  expect(ev!.lifecycle?.mrrCents).toBe(5833); // 70000 / 12 ≈ 5833
});

// ---------------------------------------------------------------------------
// StripeEventSchema (Candidate 4)
// ---------------------------------------------------------------------------

test("StripeEventSchema: valid event passes", () => {
  const result = StripeEventSchema.safeParse({
    id: "evt_1",
    type: "invoice.paid",
    created: 1_700_000_000,
    data: { object: { customer: "cus_1" } },
  });
  expect(result.success).toBe(true);
});

test("StripeEventSchema: missing id fails", () => {
  const result = StripeEventSchema.safeParse({
    type: "invoice.paid",
    created: 1,
    data: { object: {} },
  });
  expect(result.success).toBe(false);
});

test("StripeEventSchema: wrong created type fails", () => {
  const result = StripeEventSchema.safeParse({
    id: "evt_1",
    type: "invoice.paid",
    created: "not-a-number",
    data: { object: {} },
  });
  expect(result.success).toBe(false);
});

test("StripeEventSchema: missing data.object fails", () => {
  const result = StripeEventSchema.safeParse({
    id: "evt_1",
    type: "invoice.paid",
    created: 1,
    data: {},
  });
  expect(result.success).toBe(false);
});

// ---------------------------------------------------------------------------
// verifyAndMapStripeEvent (Candidate 3 + 4)
// ---------------------------------------------------------------------------

test("verifyAndMapStripeEvent: invalid signature → invalid-signature", async () => {
  const body = JSON.stringify({
    id: "evt_1",
    type: "invoice.paid",
    created: 1,
    data: { object: {} },
  });
  const result = await verifyAndMapStripeEvent(body, "t=1,v1=bad", SECRET, { nowSec: 1 });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBe("invalid-signature");
});

test("verifyAndMapStripeEvent: invalid JSON → invalid-json", async () => {
  const ts = 1_000_000;
  const body = "not-json{";
  const result = await verifyAndMapStripeEvent(body, signedHeader(body, ts), SECRET, {
    nowSec: ts,
  });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBe("invalid-json");
});

test("verifyAndMapStripeEvent: invalid shape (missing id) → invalid-shape", async () => {
  const ts = 1_000_000;
  const body = JSON.stringify({ type: "invoice.paid", created: 1, data: { object: {} } });
  const result = await verifyAndMapStripeEvent(body, signedHeader(body, ts), SECRET, {
    nowSec: ts,
  });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBe("invalid-shape");
});

test("verifyAndMapStripeEvent: valid checkout event → mapped payment.confirmed", async () => {
  const ts = 1_000_000;
  const body = JSON.stringify({
    id: "evt_cs",
    type: "checkout.session.completed",
    created: ts,
    data: {
      object: {
        customer: "cus_1",
        subscription: "sub_1",
        client_reference_id: "deal_1",
        metadata: { site_key: "s1", organization_id: "org_1", locale: "uk" },
      },
    },
  });
  const result = await verifyAndMapStripeEvent(body, signedHeader(body, ts), SECRET, {
    nowSec: ts,
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.event).toBeTruthy();
    expect(result.event!.source).toBe("stripe");
    expect(result.event!.payload.eventKind).toBe("payment.confirmed");
  }
});

test("verifyAndMapStripeEvent: unknown event type → ok with null event", async () => {
  const ts = 1_000_000;
  const body = JSON.stringify({
    id: "evt_x",
    type: "customer.discount.created",
    created: ts,
    data: { object: {} },
  });
  const result = await verifyAndMapStripeEvent(body, signedHeader(body, ts), SECRET, {
    nowSec: ts,
  });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.event).toBe(null);
});

test("verifyAndMapStripeEvent: cycle invoice with needsSubscriptionLookup → fetches + enriches", async () => {
  const ts = 1_000_000;
  const body = JSON.stringify({
    id: "evt_cycle",
    type: "invoice.paid",
    created: ts,
    data: {
      object: {
        id: "in_cycle",
        customer: "cus_1",
        subscription: "sub_1",
        amount_paid: 7000,
        currency: "eur",
        lines: { data: [{ price: { id: "price_base_monthly" } }] },
      },
    },
  });

  const fakeFetch = (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("/v1/subscriptions/sub_1")) {
      return new Response(
        JSON.stringify({
          metadata: {
            lagebild_organization_id: "org_resolved",
            lagebild_deal_id: "deal_resolved",
            site_key: "site_resolved",
          },
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;

  const result = await verifyAndMapStripeEvent(body, signedHeader(body, ts), SECRET, {
    nowSec: ts,
    stripeSecretKey: API_KEY,
    fetchImpl: fakeFetch,
  });

  expect(result.ok).toBe(true);
  if (result.ok && result.event) {
    // After subscription metadata resolution, the event should be enriched.
    expect(result.event.lifecycle?.lagebildOrganizationId).toBe("org_resolved");
    expect(result.event.lifecycle?.lagebildDealId).toBe("deal_resolved");
    expect(result.event.lifecycle?.siteKey).toBe("site_resolved");
    // needsSubscriptionLookup should be gone after enrichment.
    expect(result.event.lifecycle?.needsSubscriptionLookup).toBe(undefined);
  }
});

test("verifyAndMapStripeEvent: cycle invoice without stripeSecretKey → leaves needsSubscriptionLookup", async () => {
  const ts = 1_000_000;
  const body = JSON.stringify({
    id: "evt_cycle",
    type: "invoice.paid",
    created: ts,
    data: {
      object: {
        id: "in_cycle",
        customer: "cus_1",
        subscription: "sub_1",
        amount_paid: 7000,
        currency: "eur",
        lines: { data: [{ price: { id: "price_base_monthly" } }] },
      },
    },
  });

  const result = await verifyAndMapStripeEvent(body, signedHeader(body, ts), SECRET, {
    nowSec: ts,
    // No stripeSecretKey — the wrapper can't fetch, so needsSubscriptionLookup stays.
  });

  expect(result.ok).toBe(true);
  if (result.ok && result.event) {
    expect(result.event.lifecycle?.needsSubscriptionLookup).toBe(true);
    expect(result.event.lifecycle?.lagebildOrganizationId).toBe(undefined);
  }
});
