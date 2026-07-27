/*
<MODULE_CONTRACT>
<purpose>RFC-0188 Phase 4: prove the supabase-buffer adapter writes the rich canonical funnel
state — funnel_stage (bridged to the generic stage), the deal-time offer snapshot, the typed
append-only funnel-event row, and append-only consent evidence — and that plain leads keep the
back-compatible generic path. The CrmBufferClient is faked; no network.</purpose>
<responsibilities>
  <item>offer.selected → deal.funnel_stage + bridged stage + offer_snapshot + funnel-event row; no consent.</item>
  <item>legal.consent.recorded → append-only consent row with the right consent_kind.</item>
  <item>plain lead → no funnel-event, generic stage, no funnel_stage.</item>
</responsibilities>
<non-goals><item>No network — the buffer client is a capturing fake.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0188 Phase 4: initial adapter funnel-persistence test.</item></CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import type { IntegrationEvent } from "@warpgogol/integration/port";
import type { CrmBufferWriter } from "@warpgogol/integration/crm-buffer";
import { persistEventToBuffer } from "../adapter.ts";

function makeFakeClient() {
  const calls = {
    deals: [] as any[],
    funnelEvents: [] as any[],
    consents: [] as any[],
    orgs: [] as any[],
    transitions: [] as any[],
    outbox: [] as any[],
    invoices: [] as any[],
    subs: [] as any[],
    balanceAdjusts: [] as any[],
  };
  const stubs: {
    org: { id: string } | null;
    sub: {
      id: string;
      included_changes_per_cycle: number;
      included_changes_balance: number;
    } | null;
    activeSub: { id: string; included_changes_balance: number } | null;
  } = { org: null, sub: null, activeSub: null };
  const client: CrmBufferWriter = {
    upsertContact: async () => ({ id: "contact_1", created: true }),
    upsertOrganization: async (_t, d) => {
      calls.orgs.push(d);
      return { id: "org_1", created: true };
    },
    findOrganizationByStripeCustomer: async () => stubs.org,
    upsertDeal: async (_t, d) => {
      calls.deals.push(d);
      return { id: "deal_1", created: true };
    },
    appendStageTransition: async (_t, d) => {
      calls.transitions.push(d);
      return "tr_1";
    },
    appendFunnelEvent: async (_t, d) => {
      calls.funnelEvents.push(d);
      return "fe_1";
    },
    appendConsentEvent: async (_t, d) => {
      calls.consents.push(d);
      return "ce_1";
    },
    upsertSubscription: async (_t, d) => {
      calls.subs.push(d);
      return { id: "sub_1", created: true };
    },
    findSubscriptionByStripeId: async () => stubs.sub,
    findActiveSubscriptionByOrganization: async () => stubs.activeSub,
    appendInvoice: async (_t, d) => {
      calls.invoices.push(d);
      return "inv_1";
    },
    adjustChangeBalance: async (_t, subscriptionId, delta) => {
      calls.balanceAdjusts.push({ subscriptionId, delta });
      return delta;
    },
    writeOutbox: async (_t, tasks) => {
      calls.outbox.push(...tasks);
      return { ids: [] };
    },
  };
  return { client, calls, stubs };
}

test("offer.selected: writes funnel_stage, bridged stage, offer snapshot, and a funnel-event row", async () => {
  const { client, calls } = makeFakeClient();
  const event: IntegrationEvent = {
    eventId: "uchat:offer.selected:1",
    kind: "message",
    source: "uchat",
    locale: "de",
    occurredAt: "2026-06-12T10:00:00Z",
    contact: { name: "Anna" },
    payload: {
      funnelVersion: "1.0.0",
      eventKind: "offer.selected",
      stage: "offer_presented",
      previousStage: "qualification_region",
      organization: { name: "Bäckerei Müller" },
      offer: { plan: "digital_foundation_monthly", priceSnapshot: { monthly: "70 € / Monat" } },
    },
  };

  await persistEventToBuffer(client, "t1", event);

  expect(calls.deals[0].funnel_stage).toBe("offer_presented");
  expect(calls.deals[0].stage).toBe("proposal"); // bridge offer_presented → proposal
  expect(calls.deals[0].offer_snapshot.monthly).toBe("70 € / Monat");
  expect(calls.deals[0].organization_id).toBe("org_1");
  expect(calls.orgs[0].name).toBe("Bäckerei Müller");
  expect(calls.funnelEvents.length).toBe(1);
  expect(calls.funnelEvents[0].event_kind).toBe("offer.selected");
  expect(calls.funnelEvents[0].idempotency_key).toBe("uchat:offer.selected:1");
  expect(calls.funnelEvents[0].to_stage).toBe("offer_presented");
  expect(calls.funnelEvents[0].actor).toBe("uchat");
  expect(calls.consents.length).toBe(0);
});

test("legal.consent.recorded (business): appends a B2B consent row", async () => {
  const { client, calls } = makeFakeClient();
  const event: IntegrationEvent = {
    eventId: "uchat:legal.consent.recorded:1",
    kind: "message",
    source: "uchat",
    locale: "de",
    occurredAt: "2026-06-12T10:05:00Z",
    payload: {
      funnelVersion: "1.0.0",
      eventKind: "legal.consent.recorded",
      stage: "start_approved",
      previousStage: "b2b_start_consent_pending",
      legal: { buyerType: "business", startBeforeWithdrawalPeriod: true },
    },
  };

  await persistEventToBuffer(client, "t1", event);

  expect(calls.consents.length).toBe(1);
  expect(calls.consents[0].buyer_type).toBe("business");
  expect(calls.consents[0].consent_kind).toBe("b2b_start_before_completion");
  expect(calls.consents[0].start_before_withdrawal_period).toBe(true);
  expect(calls.deals[0].funnel_stage).toBe("start_approved");
  expect(calls.deals[0].stage).toBe("negotiation"); // bridge
});

test("lifecycle invoice.paid: appends an invoice against the resolved Organization (no funnel deal)", async () => {
  const { client, calls } = makeFakeClient();
  const event: IntegrationEvent = {
    eventId: "evt_in_1",
    kind: "message",
    source: "stripe",
    locale: "de",
    occurredAt: "2026-06-12T11:00:00Z",
    payload: { eventKind: "invoice.paid", stripeCustomerId: "cus_1" },
    lifecycle: {
      eventKind: "invoice.paid",
      stripeEventId: "evt_in_1",
      stripeCustomerId: "cus_1",
      stripeInvoiceId: "in_1",
      invoiceKind: "cycle",
      amountCents: 7000,
      currency: "EUR",
      lagebildOrganizationId: "org_9",
      lagebildDealId: "deal_1",
    },
  };

  const res = await persistEventToBuffer(client, "t1", event);

  expect(res).toBeTruthy();
  expect(calls.invoices.length).toBe(1);
  expect(calls.invoices[0].organization_id).toBe("org_9");
  expect(calls.invoices[0].stripe_invoice_id).toBe("in_1");
  expect(calls.invoices[0].kind).toBe("cycle");
  expect(calls.invoices[0].amount_cents).toBe(7000);
  expect(calls.invoices[0].status).toBe("paid");
  expect(calls.invoices[0].paid_at).toBe("2026-06-12T11:00:00Z");
  // The funnel deal flow is NOT taken for a lifecycle event.
  expect(calls.deals.length).toBe(0);
  expect(calls.funnelEvents.length).toBe(0);
});

test("lifecycle subscription.created: upserts the subscription with balance = per-cycle allowance", async () => {
  const { client, calls } = makeFakeClient();
  const event: IntegrationEvent = {
    eventId: "evt_sub_c",
    kind: "message",
    source: "stripe",
    locale: "de",
    occurredAt: "2026-06-12T11:00:00Z",
    payload: { eventKind: "subscription.created", stripeCustomerId: "cus_1" },
    lifecycle: {
      eventKind: "subscription.created",
      stripeEventId: "evt_sub_c",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_x",
      subscriptionStatus: "active",
      plan: "digital_foundation_monthly",
      mrrCents: 7000,
      currency: "EUR",
      lagebildOrganizationId: "org_9",
      lagebildDealId: "deal_p3",
      includedChangesPerCycle: 1,
    },
  };

  await persistEventToBuffer(client, "t1", event);

  expect(calls.subs.length).toBe(1);
  expect(calls.subs[0].stripe_subscription_id).toBe("sub_x");
  expect(calls.subs[0].plan).toBe("digital_foundation_monthly");
  expect(calls.subs[0].mrr_cents).toBe(7000);
  expect(calls.subs[0].included_changes_per_cycle).toBe(1);
  expect(calls.subs[0].included_changes_balance).toBe(1); // set on create
  expect(calls.invoices.length).toBe(0);
});

test("lifecycle subscription.updated: omits included_changes_balance (preserves mid-cycle decrements)", async () => {
  const { client, calls } = makeFakeClient();
  const event: IntegrationEvent = {
    eventId: "evt_sub_u",
    kind: "message",
    source: "stripe",
    locale: "de",
    occurredAt: "2026-06-12T11:00:00Z",
    payload: { eventKind: "subscription.updated", stripeCustomerId: "cus_1" },
    lifecycle: {
      eventKind: "subscription.updated",
      stripeEventId: "evt_sub_u",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_x",
      subscriptionStatus: "active",
      plan: "digital_foundation_monthly",
      mrrCents: 9900,
      lagebildOrganizationId: "org_9",
      lagebildDealId: "deal_p3",
      includedChangesPerCycle: 1,
    },
  };

  await persistEventToBuffer(client, "t1", event);

  expect(calls.subs.length).toBe(1);
  expect(calls.subs[0].mrr_cents).toBe(9900);
  expect("included_changes_balance" in calls.subs[0]).toBe(false); // omitted on update
});

test("lifecycle paid cycle invoice resets the included-changes balance to per-cycle", async () => {
  const { client, calls, stubs } = makeFakeClient();
  stubs.sub = { id: "sub_buf_1", included_changes_per_cycle: 1, included_changes_balance: 0 };
  const event: IntegrationEvent = {
    eventId: "evt_cycle",
    kind: "message",
    source: "stripe",
    locale: "de",
    occurredAt: "2026-06-12T11:00:00Z",
    payload: { eventKind: "invoice.paid", stripeCustomerId: "cus_1" },
    lifecycle: {
      eventKind: "invoice.paid",
      stripeEventId: "evt_cycle",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_x",
      stripeInvoiceId: "in_cycle",
      invoiceKind: "cycle",
      amountCents: 7000,
      lagebildOrganizationId: "org_9",
    },
  };

  await persistEventToBuffer(client, "t1", event);

  expect(calls.invoices.length).toBe(1);
  expect(calls.balanceAdjusts.length).toBe(1);
  expect(calls.balanceAdjusts[0].subscriptionId).toBe("sub_buf_1");
  expect(calls.balanceAdjusts[0].delta).toBe(1); // reset 0 → 1
});

test("lifecycle with an unknown Stripe Customer → soft no-op (null), no invoice", async () => {
  const { client, calls } = makeFakeClient(); // findOrganizationByStripeCustomer returns null
  const event: IntegrationEvent = {
    eventId: "evt_in_2",
    kind: "message",
    source: "stripe",
    locale: "de",
    occurredAt: "2026-06-12T11:05:00Z",
    payload: { eventKind: "invoice.paid", stripeCustomerId: "cus_unknown" },
    lifecycle: {
      eventKind: "invoice.paid",
      stripeEventId: "evt_in_2",
      stripeCustomerId: "cus_unknown",
      stripeInvoiceId: "in_2",
      amountCents: 1500,
    },
  };

  const res = await persistEventToBuffer(client, "t1", event);

  expect(res).toBe(null);
  expect(calls.invoices.length).toBe(0);
});

test("funnel change.requested (described, included): decrements the subscription balance", async () => {
  const { client, calls, stubs } = makeFakeClient();
  stubs.activeSub = { id: "sub_buf_1", included_changes_balance: 1 };
  const event: IntegrationEvent = {
    eventId: "uchat:change.requested:1",
    kind: "message",
    source: "uchat",
    locale: "de",
    occurredAt: "2026-06-12T12:00:00Z",
    payload: {
      funnelVersion: "1.0.0",
      eventKind: "change.requested",
      stage: "change_description_requested",
      organization: { name: "Bäckerei Müller" },
      changeRequest: { description: "Neue Öffnungszeiten" },
    },
  };

  await persistEventToBuffer(client, "t1", event);

  expect(calls.balanceAdjusts.length).toBe(1);
  expect(calls.balanceAdjusts[0].subscriptionId).toBe("sub_buf_1");
  expect(calls.balanceAdjusts[0].delta).toBe(-1);
});

test("funnel change.requested with no included balance (or at balance-check): no decrement", async () => {
  const { client, calls, stubs } = makeFakeClient();
  stubs.activeSub = { id: "sub_buf_1", included_changes_balance: 0 }; // exhausted → paid path
  const described: IntegrationEvent = {
    eventId: "uchat:change.requested:2",
    kind: "message",
    source: "uchat",
    locale: "de",
    occurredAt: "2026-06-12T12:00:00Z",
    payload: {
      eventKind: "change.requested",
      stage: "change_description_requested",
      organization: { name: "Org" },
    },
  };
  await persistEventToBuffer(client, "t1", described);
  expect(calls.balanceAdjusts.length).toBe(0); // balance 0 → no decrement

  // and at the balance-check stage there is no decrement even with balance > 0
  stubs.activeSub = { id: "sub_buf_1", included_changes_balance: 1 };
  const checked: IntegrationEvent = {
    ...described,
    eventId: "uchat:change.requested:3",
    payload: {
      eventKind: "change.requested",
      stage: "change_balance_checked",
      organization: { name: "Org" },
    },
  };
  await persistEventToBuffer(client, "t1", checked);
  expect(calls.balanceAdjusts.length).toBe(0);
});

test("lifecycle payment.refunded: records a negative void ad-hoc ledger entry", async () => {
  const { client, calls } = makeFakeClient();
  const event: IntegrationEvent = {
    eventId: "evt_refund",
    kind: "message",
    source: "stripe",
    locale: "de",
    occurredAt: "2026-06-12T12:30:00Z",
    payload: { eventKind: "payment.refunded", stripeCustomerId: "cus_1" },
    lifecycle: {
      eventKind: "payment.refunded",
      stripeEventId: "evt_refund",
      stripeCustomerId: "cus_1",
      stripeInvoiceId: "ch_1",
      amountCents: 1500,
      currency: "EUR",
      lagebildOrganizationId: "org_9",
    },
  };

  await persistEventToBuffer(client, "t1", event);

  expect(calls.invoices.length).toBe(1);
  expect(calls.invoices[0].amount_cents).toBe(-1500);
  expect(calls.invoices[0].status).toBe("void");
  expect(calls.invoices[0].kind).toBe("adhoc");
});

test("plain lead (no eventKind): generic path, no funnel-event, no funnel_stage", async () => {
  const { client, calls } = makeFakeClient();
  const event: IntegrationEvent = {
    eventId: "lead_1",
    kind: "lead",
    source: "send-message",
    locale: "de",
    occurredAt: "2026-06-12T10:10:00Z",
    payload: { message: "Hi, I want a website" },
  };

  await persistEventToBuffer(client, "t1", event);

  expect(calls.funnelEvents.length).toBe(0);
  expect(calls.consents.length).toBe(0);
  expect(calls.deals[0].funnel_stage).toBe(undefined);
  expect(calls.deals[0].stage).toBe("new"); // lead default
  expect(calls.orgs.length).toBe(0); // no organization in the payload
});
