/*
<MODULE_CONTRACT>
<purpose>RFC-0191: Client Lifecycle & Stripe Billing event contracts. A sibling catalog to the
RFC-0188 funnel event kinds — the post-sale lifecycle (subscriptions, invoices, dunning, churn)
carried on the same normalized IntegrationEvent. Stripe is the billing authority; these types are
the canonical mirror. Pure types + constants + a zod payload schema — no I/O, no astro:env, no
Stripe SDK.</purpose>
<non-goals>
  <item>Do not import the Stripe SDK or astro:env — the adapter injects secrets and maps events.</item>
  <item>Do not let UChat or Pipedrive own billing state — Stripe is the authority, Lagebild the mirror.</item>
  <item>Do not reference Make.com anywhere in the billing path (RFC-0188/0191).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0191: initial lifecycle event + payload contracts.</item>
  <item>RFC-0219: add SUBSCRIPTION_TRANSITIONS and SUBSCRIPTION_TRANSITION_TRIGGERS — subscription lifecycle graph for the state-chart generator.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

/** Closed catalog of post-sale lifecycle event kinds (RFC-0191). */
export const LIFECYCLE_EVENT_KINDS = [
  "invoice.paid",
  "invoice.payment_failed",
  "subscription.created",
  "subscription.updated",
  "subscription.canceled",
  "payment.refunded",
] as const;
export type LifecycleEventKind = (typeof LIFECYCLE_EVENT_KINDS)[number];

/** Subscription health states (mirror Stripe subscription.status, condensed). */
export const SUBSCRIPTION_STATUSES = ["active", "past_due", "canceled", "paused"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** What an invoice is for — drives the P4/lifecycle Pipedrive routing. */
export const INVOICE_KINDS = ["setup", "cycle", "change", "adhoc"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

/** Invoice payment state (mirror Stripe invoice.status, condensed). */
export const INVOICE_STATUSES = ["open", "paid", "uncollectible", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** The plan a subscription runs on (mirrors the offer in business/offer.md). */
export const SUBSCRIPTION_PLANS = [
  "digital_foundation_monthly",
  "digital_foundation_yearly",
] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

/**
 * Typed lifecycle payload, carried in `IntegrationEvent.payload.lifecycle`. The Stripe
 * adapter (RFC-0191) maps each Stripe webhook event onto this shape; amounts are in the
 * smallest currency unit (cents) — Stripe is the authority, the buffer mirrors cents and
 * never recomputes prices. The Organization is resolved via `stripeCustomerId` (RFC-0190).
 */
export interface LifecycleEventPayload {
  eventKind: LifecycleEventKind;
  /** Stripe's own event id — the idempotency key (dedup on redelivery). */
  stripeEventId: string;
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
  stripeInvoiceId?: string;
  plan?: SubscriptionPlan;
  subscriptionStatus?: SubscriptionStatus;
  invoiceKind?: InvoiceKind;
  invoiceStatus?: InvoiceStatus;
  amountCents?: number;
  currency?: string;
  /** ISO-8601 end of the current billing period (for renewals). */
  currentPeriodEnd?: string;
  // Spec §08 (Stripe metadata contract): Lagebild refs resolved from the Stripe object's
  // metadata so a lifecycle event maps back to the Organization (RFC-0190) and Deal.
  lagebildOrganizationId?: string;
  lagebildDealId?: string;
  siteKey?: string;
  /** Line-item price ids (for invoice_kind inference + module/MRR reasoning). */
  priceIds?: string[];
  /**
   * True when a cycle invoice has no `lagebild_*` metadata of its own and must be resolved
   * via its Subscription's metadata (spec §08).
   */
  needsSubscriptionLookup?: boolean;
  /** Monthly recurring revenue (cents), normalized from the subscription's items (spec §08). */
  mrrCents?: number;
  /** Per-cycle included-change allowance, from Subscription metadata `included_changes_per_cycle`. */
  includedChangesPerCycle?: number;
}

/** Zod schema the Stripe adapter validates its mapping against before emitting. */
export const LifecycleEventPayloadSchema = z.object({
  eventKind: z.enum(LIFECYCLE_EVENT_KINDS),
  stripeEventId: z.string().min(1),
  stripeCustomerId: z.string().min(1),
  stripeSubscriptionId: z.string().optional(),
  stripeInvoiceId: z.string().optional(),
  plan: z.enum(SUBSCRIPTION_PLANS).optional(),
  subscriptionStatus: z.enum(SUBSCRIPTION_STATUSES).optional(),
  invoiceKind: z.enum(INVOICE_KINDS).optional(),
  invoiceStatus: z.enum(INVOICE_STATUSES).optional(),
  amountCents: z.number().int().nonnegative().optional(),
  currency: z.string().optional(),
  currentPeriodEnd: z.string().optional(),
  lagebildOrganizationId: z.string().optional(),
  lagebildDealId: z.string().optional(),
  siteKey: z.string().optional(),
  priceIds: z.array(z.string()).optional(),
  needsSubscriptionLookup: z.boolean().optional(),
  mrrCents: z.number().int().nonnegative().optional(),
  includedChangesPerCycle: z.number().int().nonnegative().optional(),
});

/** True when `value` is a known lifecycle event kind. */
export function isLifecycleEventKind(value: string): value is LifecycleEventKind {
  return (LIFECYCLE_EVENT_KINDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Subscription lifecycle graph (RFC-0219)
// ---------------------------------------------------------------------------

/**
 * Valid subscription status transitions (RFC-0219). Symmetric with `FUNNEL_TRANSITIONS`:
 * the platform owns the allowed moves; Stripe is the billing authority that fires the
 * events, but the transition graph itself is declared here.
 */
export const SUBSCRIPTION_TRANSITIONS: Readonly<
  Record<SubscriptionStatus, readonly SubscriptionStatus[]>
> = {
  active: ["past_due", "paused", "canceled"],
  past_due: ["active", "canceled"],
  paused: ["active", "canceled"],
  canceled: [],
};

/**
 * One entry per directed edge in `SUBSCRIPTION_TRANSITIONS` (RFC-0219). Labels each
 * `(from, to)` pair with exactly one `LifecycleEventKind` trigger. The bijection
 * invariant — checked by `funnel.statechart.validate` — keeps this overlay and the
 * transition map in exact lock-step.
 */
export const SUBSCRIPTION_TRANSITION_TRIGGERS: ReadonlyArray<{
  from: SubscriptionStatus;
  to: SubscriptionStatus;
  on: LifecycleEventKind;
}> = [
  { from: "active", to: "past_due", on: "invoice.payment_failed" },
  { from: "active", to: "paused", on: "subscription.updated" },
  { from: "active", to: "canceled", on: "subscription.canceled" },
  { from: "past_due", to: "active", on: "invoice.paid" },
  { from: "past_due", to: "canceled", on: "subscription.canceled" },
  { from: "paused", to: "active", on: "subscription.updated" },
  { from: "paused", to: "canceled", on: "subscription.canceled" },
];
