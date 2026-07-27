/*
<MODULE_CONTRACT>
<purpose>RFC-0191: pure mapping from a verified Stripe webhook event to a normalized
IntegrationEvent (source: "stripe"), plus a deep verify-and-map wrapper that folds signature
verification, JSON parsing, runtime shape validation, and subscription metadata resolution
into one call. checkout.session.completed becomes the funnel `payment.confirmed`;
invoice/subscription/refund events become typed lifecycle payloads. Unmapped event types
return null (ignored). No Stripe SDK.</purpose>
<non-goals>
  <item>stripeEventToIntegrationEvent is pure — it does not verify the signature or do I/O.
  Use verifyAndMapStripeEvent for the full pipeline.</item>
  <item>Do not resolve the Organization — the destination resolves it via stripeCustomerId,
  unless needsSubscriptionLookup is handled by the wrapper.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0191: initial Stripe→IntegrationEvent mapping.</item>
  <item>Architecture review: removed phantom billing client (Candidate 1); added
  StripeEventSchema + verifyAndMapStripeEvent deep wrapper with runtime shape validation
  (Candidate 4) and subscription metadata resolution (Candidate 3).</item>
</CHANGE_SUMMARY>
*/

import type {
  IntegrationEvent,
  InvoiceKind,
  LifecycleEventKind,
  SubscriptionPlan,
} from "@warpgogol/integration";
import { INVOICE_KINDS, SUBSCRIPTION_PLANS } from "@warpgogol/integration";
import { z } from "zod";
import { verifyStripeSignature } from "./signature.ts";

/** Minimal structural shape of a Stripe Event (no SDK dependency). */
export interface StripeEventLike {
  id: string;
  type: string;
  created: number; // unix seconds
  data: { object: Record<string, unknown> };
}

/** Stripe event type → lifecycle event kind (the closed subset we mirror). */
const STRIPE_TYPE_TO_LIFECYCLE: Readonly<Record<string, LifecycleEventKind>> = {
  "invoice.paid": "invoice.paid",
  "invoice.payment_failed": "invoice.payment_failed",
  "customer.subscription.created": "subscription.created",
  "customer.subscription.updated": "subscription.updated",
  "customer.subscription.deleted": "subscription.canceled",
  "charge.refunded": "payment.refunded",
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

/** Read the canonical `lagebild_*` ids from a Stripe object's metadata (spec §08). */
function readLagebildMeta(metadata: Record<string, unknown>): {
  organizationId?: string;
  dealId?: string;
  siteKey?: string;
  invoiceKind?: InvoiceKind;
} {
  // `lagebild_organization_id` is canonical; `organization_id` is accepted for back-compat.
  const organizationId = str(metadata.lagebild_organization_id) ?? str(metadata.organization_id);
  const dealId = str(metadata.lagebild_deal_id);
  const siteKey = str(metadata.site_key);
  const rawKind = str(metadata.invoice_kind);
  const invoiceKind =
    rawKind && (INVOICE_KINDS as readonly string[]).includes(rawKind)
      ? (rawKind as InvoiceKind)
      : undefined;
  return { organizationId, dealId, siteKey, invoiceKind };
}

/** Read line-item price ids from an invoice-like object (`obj.lines.data[].price.id`). */
function readPriceIds(obj: Record<string, unknown>): string[] | undefined {
  const lines = (obj.lines as { data?: Array<{ price?: { id?: unknown } }> } | undefined)?.data;
  if (!Array.isArray(lines)) return undefined;
  const ids = lines.map((l) => str(l.price?.id)).filter((x): x is string => Boolean(x));
  return ids.length > 0 ? ids : undefined;
}

function intOrUndef(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function readPlan(metadata: Record<string, unknown>): SubscriptionPlan | undefined {
  const p = str(metadata.plan);
  return p && (SUBSCRIPTION_PLANS as readonly string[]).includes(p)
    ? (p as SubscriptionPlan)
    : undefined;
}

/**
 * Normalized monthly recurring revenue (cents) from a subscription object's items:
 * Σ unit_amount × quantity, with yearly-interval items divided by 12 (spec §08).
 */
function computeMrrCents(obj: Record<string, unknown>): number | undefined {
  const items = (
    obj.items as
      | {
          data?: Array<{
            quantity?: unknown;
            price?: { unit_amount?: unknown; recurring?: { interval?: unknown } };
          }>;
        }
      | undefined
  )?.data;
  if (!Array.isArray(items)) return undefined;
  let total = 0;
  let any = false;
  for (const it of items) {
    const amt = num(it.price?.unit_amount);
    if (amt === undefined) continue;
    any = true;
    const qty = num(it.quantity) ?? 1;
    const factor = str(it.price?.recurring?.interval) === "year" ? 1 / 12 : 1;
    total += amt * qty * factor;
  }
  return any ? Math.round(total) : undefined;
}

/**
 * Map a verified Stripe event to a normalized IntegrationEvent. Returns null for event
 * types outside the closed catalog (the webhook route ignores those). `eventId` is the
 * Stripe event id — the idempotency key for redelivery dedup.
 */
export function stripeEventToIntegrationEvent(event: StripeEventLike): IntegrationEvent | null {
  const obj = event.data.object;
  const occurredAt = new Date((event.created || 0) * 1000).toISOString();
  const metadata = (obj.metadata as Record<string, unknown> | undefined) ?? {};
  const locale = str(metadata.locale) ?? "de";
  const meta = readLagebildMeta(metadata);

  // checkout.session.completed → the funnel join point `payment.confirmed` (not a lifecycle kind).
  if (event.type === "checkout.session.completed") {
    return {
      eventId: event.id,
      kind: "message",
      source: "stripe",
      locale,
      occurredAt,
      payload: {
        funnelVersion: "1.0.0",
        eventKind: "payment.confirmed",
        stage: "payment_confirmed",
        stripeCustomerId: str(obj.customer),
        stripeSubscriptionId: str(obj.subscription),
        clientReferenceId: str(obj.client_reference_id),
        organization: meta.organizationId ? { id: meta.organizationId } : undefined,
        site_key: meta.siteKey,
        lagebild_deal_id: meta.dealId ?? str(obj.client_reference_id),
      },
    };
  }

  const lifecycleKind = STRIPE_TYPE_TO_LIFECYCLE[event.type];
  if (!lifecycleKind) return null;

  const customer = str(obj.customer);
  if (!customer) return null; // every lifecycle event must resolve to an Organization

  const amountCents =
    num(obj.amount_paid) ?? num(obj.amount_due) ?? num(obj.amount) ?? num(obj.amount_refunded);
  const currency = str(obj.currency)?.toUpperCase();
  const periodEndSec = num(obj.current_period_end);
  const subscription = str(obj.subscription);
  const isInvoice = lifecycleKind === "invoice.paid" || lifecycleKind === "invoice.payment_failed";
  const isSubscription = event.type.startsWith("customer.subscription.");
  const priceIds = isInvoice ? readPriceIds(obj) : undefined;
  const plan = isSubscription ? readPlan(metadata) : undefined;
  const mrrCents = isSubscription ? computeMrrCents(obj) : undefined;
  const includedChangesPerCycle = isSubscription
    ? intOrUndef(metadata.included_changes_per_cycle)
    : undefined;

  // invoice_kind precedence (spec §08): explicit metadata → subscription invoice = cycle →
  // (downstream infers from priceIds against the price-role registry).
  const invoiceKind: InvoiceKind | undefined = isInvoice
    ? (meta.invoiceKind ?? (subscription ? "cycle" : undefined))
    : undefined;

  // A cycle invoice with no lagebild_* metadata of its own must be resolved via its
  // Subscription's metadata (the route/worker fetches it).
  const needsSubscriptionLookup =
    isInvoice && Boolean(subscription) && !meta.organizationId && !meta.dealId;

  return {
    eventId: event.id,
    kind: "message",
    source: "stripe",
    locale,
    occurredAt,
    payload: { eventKind: lifecycleKind, stripeCustomerId: customer },
    lifecycle: {
      eventKind: lifecycleKind,
      stripeEventId: event.id,
      stripeCustomerId: customer,
      stripeSubscriptionId: subscription ?? str(obj.id),
      stripeInvoiceId: str(obj.id),
      subscriptionStatus: mapSubscriptionStatus(str(obj.status)),
      amountCents,
      currency,
      currentPeriodEnd: periodEndSec ? new Date(periodEndSec * 1000).toISOString() : undefined,
      lagebildOrganizationId: meta.organizationId,
      lagebildDealId: meta.dealId,
      siteKey: meta.siteKey,
      invoiceKind,
      priceIds,
      needsSubscriptionLookup: needsSubscriptionLookup || undefined,
      plan,
      mrrCents,
      includedChangesPerCycle,
    },
  };
}

/** Condense Stripe's subscription.status onto the buffer's closed enum. */
function mapSubscriptionStatus(
  s: string | undefined,
): "active" | "past_due" | "canceled" | "paused" | undefined {
  switch (s) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "paused":
      return "paused";
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Deep wrapper: verify + parse + validate + map + resolve (Candidate 3/4)
// ---------------------------------------------------------------------------

const STRIPE_API_BASE = "https://api.stripe.com";

/** Zod schema for the minimal Stripe Event shape — runtime validation (Candidate 4). */
export const StripeEventSchema = z.object({
  id: z.string().min(1),
  type: z.string(),
  created: z.number(),
  data: z.object({
    object: z.record(z.string(), z.unknown()),
  }),
});

/** Result of verifyAndMapStripeEvent — either a mapped event or a rejection reason. */
export type VerifyAndMapResult =
  | { ok: true; event: IntegrationEvent | null }
  | { ok: false; error: "invalid-signature" | "invalid-json" | "invalid-shape" };

/**
 * Fetch a Subscription's metadata from the Stripe API (internal helper for
 * Candidate 3 — resolves `needsSubscriptionLookup` before the event leaves the adapter).
 */
async function fetchSubscriptionMetadata(
  subscriptionId: string,
  secretKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchImpl(`${STRIPE_API_BASE}/v1/subscriptions/${subscriptionId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) return null;
    const sub = (await res.json()) as { metadata?: Record<string, unknown> };
    return sub.metadata ?? null;
  } catch {
    return null;
  }
}

/**
 * Deep module: verify the Stripe signature, parse the raw body, validate the event
 * shape at runtime, map to a normalized IntegrationEvent, and — when a cycle invoice
 * has no lagebild_* metadata — fetch the Subscription's metadata and re-map with the
 * enriched data. One call, one seam; the caller never touches the raw event.
 *
 * Returns `{ ok: false, error }` for signature/JSON/shape failures, or
 * `{ ok: true, event: null }` for event types outside the closed catalog (ignored).
 */
export async function verifyAndMapStripeEvent(
  rawBody: string,
  signatureHeader: string | null | undefined,
  webhookSecret: string | undefined,
  opts: {
    toleranceSec?: number;
    nowSec?: number;
    stripeSecretKey?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<VerifyAndMapResult> {
  if (!verifyStripeSignature(rawBody, signatureHeader, webhookSecret, opts)) {
    return { ok: false, error: "invalid-signature" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: "invalid-json" };
  }

  const shapeResult = StripeEventSchema.safeParse(parsed);
  if (!shapeResult.success) {
    return { ok: false, error: "invalid-shape" };
  }

  let event = stripeEventToIntegrationEvent(shapeResult.data);

  // Candidate 3: resolve subscription metadata before the event leaves the adapter.
  if (
    event?.lifecycle?.needsSubscriptionLookup &&
    event.lifecycle.stripeSubscriptionId &&
    opts.stripeSecretKey
  ) {
    const subMetadata = await fetchSubscriptionMetadata(
      event.lifecycle.stripeSubscriptionId,
      opts.stripeSecretKey,
      opts.fetchImpl,
    );
    if (subMetadata) {
      const origObj = shapeResult.data.data.object;
      const origMetadata = (origObj.metadata as Record<string, unknown> | undefined) ?? {};
      const enrichedEvent: StripeEventLike = {
        ...shapeResult.data,
        data: {
          object: {
            ...origObj,
            metadata: { ...origMetadata, ...subMetadata },
          },
        },
      };
      event = stripeEventToIntegrationEvent(enrichedEvent);
    }
  }

  return { ok: true, event };
}
