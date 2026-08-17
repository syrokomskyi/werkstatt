/*
<MODULE_CONTRACT>
<purpose>RFC-0191: prove the lifecycle event contracts — the closed kind catalog, the typed
payload schema the Stripe adapter validates against, and the guard. Pure — no I/O, no Stripe.</purpose>
<responsibilities>
  <item>LifecycleEventPayloadSchema accepts a valid Stripe-mapped payload and rejects bad input.</item>
  <item>isLifecycleEventKind guards the closed catalog.</item>
</responsibilities>
<non-goals><item>No network, no Stripe SDK — the schema is pure.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0191: initial lifecycle contract test.</item></CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import {
  LIFECYCLE_EVENT_KINDS,
  LifecycleEventPayloadSchema,
  isLifecycleEventKind,
} from "../lifecycle.ts";

test("the lifecycle catalog covers invoice, subscription, and refund events", () => {
  for (const k of [
    "invoice.paid",
    "invoice.payment_failed",
    "subscription.created",
    "subscription.updated",
    "subscription.canceled",
    "payment.refunded",
  ]) {
    expect((LIFECYCLE_EVENT_KINDS as readonly string[]).includes(k)).toBeTruthy();
  }
});

test("the payload schema accepts a Stripe-mapped invoice.paid event", () => {
  const r = LifecycleEventPayloadSchema.safeParse({
    eventKind: "invoice.paid",
    stripeEventId: "evt_123",
    stripeCustomerId: "cus_123",
    stripeInvoiceId: "in_123",
    invoiceKind: "cycle",
    invoiceStatus: "paid",
    amountCents: 7000,
    currency: "EUR",
  });
  expect(r.success).toBe(true);
});

test("the payload schema rejects an unknown event kind and a negative amount", () => {
  expect(
    LifecycleEventPayloadSchema.safeParse({
      eventKind: "invoice.exploded",
      stripeEventId: "evt_1",
      stripeCustomerId: "cus_1",
    }).success,
  ).toBe(false);
  expect(
    LifecycleEventPayloadSchema.safeParse({
      eventKind: "invoice.paid",
      stripeEventId: "evt_1",
      stripeCustomerId: "cus_1",
      amountCents: -5,
    }).success,
  ).toBe(false);
});

test("isLifecycleEventKind guards the closed catalog", () => {
  expect(isLifecycleEventKind("subscription.updated")).toBe(true);
  expect(isLifecycleEventKind("offer.selected")).toBe(false); // a funnel kind, not lifecycle
});
