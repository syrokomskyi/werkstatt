/*
<MODULE_CONTRACT>
<purpose>RFC-0176 DestinationAdapter implementation for the Supabase CRM buffer (Lagebild MVP).
Receives an IntegrationEvent from the delivery callback, writes/updates the contact and deal
in the buffer, appends a stage transition, and queues an outbox task for the async Pipedrive
sync worker. Does NOT call Pipedrive directly — that is the sync worker's job. Follows the
same pattern as pipedriveDestinationAdapter in adapters.ts.</purpose>
<non-goals>
  <item>Do not call Pipedrive — the sync worker reads the outbox and does that.</item>
  <item>Do not import astro:env — secrets arrive via the IntegrationSecrets bag.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Lagebild MVP: initial buffer DestinationAdapter.</item>
  <item>RFC-0190: resolve-or-create the target Organization and link the deal.</item>
  <item>RFC-0188 Phase 4: persist canonical funnel_stage + offer snapshot + funnel/consent rows;
  extract the injectable persistEventToBuffer core.</item>
</CHANGE_SUMMARY>
*/

import type {
  DestinationAdapter,
  IntegrationEvent,
  IntegrationSecrets,
  LifecycleEventPayload,
  VisitorBuyerType,
  VisitorFunnelEventKind,
  VisitorFunnelEventPayload,
  VisitorFunnelStage,
} from "@warpgogol/werkstatt-site/integration";
import {
  FUNNEL_VERSION,
  VISITOR_FUNNEL_EVENT_KINDS,
  bridgeFunnelStage,
  isFunnelStage,
} from "@warpgogol/werkstatt-site/integration";
import type {
  BufferDealStage,
  BufferUpsertResult,
  CrmBufferWriter,
} from "@warpgogol/werkstatt-site/integration/crm-buffer";
import { BUFFER_DEAL_STAGES } from "@warpgogol/werkstatt-site/integration/crm-buffer";
import { createSupabaseCrmBufferClient } from "./client.ts";

/** Map an IntegrationEvent.source onto the buffer's append-only actor enum. */
function mapActor(source: string): "uchat" | "stripe" | "operator" | "send-message" {
  if (source === "stripe" || source === "operator" || source === "send-message") return source;
  return "uchat";
}

/** True when `value` is a typed funnel event kind (RFC-0188). */
function isFunnelEventKind(value: unknown): value is VisitorFunnelEventKind {
  return (
    typeof value === "string" && (VISITOR_FUNNEL_EVENT_KINDS as readonly string[]).includes(value)
  );
}

/**
 * RFC-0188: extract the typed funnel payload from the normalized event. Returns null when the
 * event is not a funnel event (no recognized `eventKind`) — e.g. a plain contact-form lead —
 * so those keep the back-compatible generic path.
 */
function extractFunnelPayload(event: IntegrationEvent): VisitorFunnelEventPayload | null {
  const p = event.payload;
  if (!isFunnelEventKind(p.eventKind)) return null;
  const stage = typeof p.stage === "string" && isFunnelStage(p.stage) ? p.stage : undefined;
  const previousStage =
    typeof p.previousStage === "string" && isFunnelStage(p.previousStage)
      ? p.previousStage
      : undefined;
  return {
    funnelVersion: typeof p.funnelVersion === "string" ? p.funnelVersion : FUNNEL_VERSION,
    eventKind: p.eventKind,
    stage,
    previousStage,
    intent: p.intent as VisitorFunnelEventPayload["intent"],
    locale: event.locale,
    contact: event.contact,
    organization: p.organization as VisitorFunnelEventPayload["organization"],
    qualification: p.qualification as VisitorFunnelEventPayload["qualification"],
    offer: p.offer as VisitorFunnelEventPayload["offer"],
    legal: p.legal as VisitorFunnelEventPayload["legal"],
    changeRequest: p.changeRequest as VisitorFunnelEventPayload["changeRequest"],
  };
}

/**
 * Resolve the deal's stage. When the event carries a canonical funnel stage (RFC-0188), the
 * precise `funnel` stage is kept and the generic `stage` is its bridge (RFC-0188 §bridge).
 * Otherwise falls back to the generic heuristic for non-funnel leads.
 */
function resolveStages(
  event: IntegrationEvent,
  funnel: VisitorFunnelEventPayload | null,
): { funnelStage?: VisitorFunnelStage; generic: BufferDealStage } {
  if (funnel?.stage) {
    return { funnelStage: funnel.stage, generic: bridgeFunnelStage(funnel.stage) };
  }
  return { generic: resolveStage(event) };
}

/**
 * Required server secret names for the Supabase buffer adapter.
 * Read via `astro:env/server` in the delivery callback; injected into the secrets bag.
 *
 *  - SUPABASE_BUFFER_URL          — Supabase project URL (e.g. https://xyz.supabase.co)
 *  - SUPABASE_BUFFER_SERVICE_KEY  — Service role key (server-only)
 *  - SUPABASE_BUFFER_TENANT_ID    — Client UUID for RLS isolation (warpgogol-com pilot)
 */
export const SUPABASE_BUFFER_SECRETS = [
  "SUPABASE_BUFFER_URL",
  "SUPABASE_BUFFER_SERVICE_KEY",
  "SUPABASE_BUFFER_TENANT_ID",
] as const;

/** Resolve the deal stage from an IntegrationEvent payload (UChat funnel stage). */
function resolveStage(event: IntegrationEvent): BufferDealStage {
  const raw = event.payload.stage ?? event.payload.deal_stage ?? event.payload.funnel_stage;
  if (typeof raw === "string" && (BUFFER_DEAL_STAGES as readonly string[]).includes(raw)) {
    return raw as BufferDealStage;
  }
  // Default: new contacts start at 'new'; messages keep the existing stage.
  return event.kind === "lead" ? "new" : "contacted";
}

/**
 * RFC-0190: resolve-or-create the target Organization from the funnel event's
 * `organization` payload ({ name, legalName?, industry?, region? }). Returns the buffer
 * row, or undefined when the event carries no organization (e.g. a pure free question) —
 * in which case the deal keeps organization_id null (back-compatible).
 */
async function resolveOrganization(
  client: CrmBufferWriter,
  tenantId: string,
  event: IntegrationEvent,
): Promise<BufferUpsertResult | undefined> {
  const org = event.payload.organization as
    | { name?: string; legalName?: string; legal_name?: string; industry?: string; region?: string }
    | undefined;
  const name = typeof org?.name === "string" ? org.name.trim() : "";
  if (!name) return undefined;
  return client.upsertOrganization(tenantId, {
    name,
    legal_name: org?.legalName ?? org?.legal_name,
    industry: org?.industry,
    region: org?.region,
  });
}

/** Derive a deal title from the event (UChat flow name or fallback). */
function resolveDealTitle(event: IntegrationEvent): string {
  const flowName = event.payload.flow_name ?? event.payload.conversation_name;
  if (typeof flowName === "string" && flowName.trim()) return flowName.trim();
  return `${event.source}: ${event.contact?.name ?? event.contact?.email ?? event.eventId.slice(0, 8)}`;
}

/**
 * RFC-0176 DestinationAdapter: writes the event into the Supabase CRM buffer
 * and queues outbox tasks for async Pipedrive sync.
 *
 * kind = "crm", vendor = "supabase-buffer"
 *
 * Registered alongside pipedriveDestinationAdapter in DESTINATION_ADAPTERS.
 * When BOTH this adapter AND the direct Pipedrive adapter are active for the
 * same site, integration.config.validate reports "multiple-active-executors"
 * for (kind=crm). Choose one: use this adapter (buffered) OR the direct
 * Pipedrive adapter (immediate), never both.
 */
export const supabaseBufferDestinationAdapter: DestinationAdapter = {
  kind: "crm",
  vendor: "supabase-buffer",
  requiredSecrets: SUPABASE_BUFFER_SECRETS,

  async route(
    event: IntegrationEvent,
    secrets: IntegrationSecrets,
  ): Promise<{ id: string } | null> {
    const url = secrets.SUPABASE_BUFFER_URL;
    const serviceKey = secrets.SUPABASE_BUFFER_SERVICE_KEY;
    const tenantId = secrets.SUPABASE_BUFFER_TENANT_ID;

    if (!url || !serviceKey || !tenantId) {
      throw new Error("supabase-buffer: missing credentials");
    }

    const client = createSupabaseCrmBufferClient({ url, serviceKey, tenantId });
    return persistEventToBuffer(client, tenantId, event);
  },
};

/**
 * RFC-0191 / spec §08: persist a Stripe lifecycle event. Resolves the Organization
 * (metadata `lagebild_organization_id` → fallback by Stripe Customer) and mirrors an
 * append-only invoice row for invoice events (idempotent by stripe_invoice_id). Returns null
 * when the Customer maps to no Organization yet (soft no-op) or for lifecycle kinds whose
 * persistence is a later bounded delta (subscription upsert, MRR, change-balance reset).
 */
async function persistLifecycleEvent(
  client: CrmBufferWriter,
  tenantId: string,
  lc: LifecycleEventPayload,
  occurredAt: string,
): Promise<{ id: string } | null> {
  const orgId =
    lc.lagebildOrganizationId ??
    (await client.findOrganizationByStripeCustomer(tenantId, lc.stripeCustomerId))?.id;
  if (!orgId) return null; // unattributable — no Organization for this Stripe Customer yet

  // Subscription lifecycle → mirror the subscription row. `included_changes_balance` is set only
  // on creation (so a mid-cycle update never clobbers a decremented balance); it resets on each
  // paid cycle invoice (below).
  if (
    lc.eventKind === "subscription.created" ||
    lc.eventKind === "subscription.updated" ||
    lc.eventKind === "subscription.canceled"
  ) {
    if (!lc.lagebildDealId || !lc.stripeSubscriptionId || !lc.plan) return null; // need these for the row
    const isCreate = lc.eventKind === "subscription.created";
    const status =
      lc.subscriptionStatus ?? (lc.eventKind === "subscription.canceled" ? "canceled" : "active");
    const perCycle = lc.includedChangesPerCycle ?? 0;
    const res = await client.upsertSubscription(tenantId, {
      organization_id: orgId,
      deal_id: lc.lagebildDealId,
      stripe_subscription_id: lc.stripeSubscriptionId,
      status,
      plan: lc.plan,
      mrr_cents: lc.mrrCents ?? 0,
      currency: lc.currency ?? "EUR",
      current_period_end: lc.currentPeriodEnd,
      included_changes_per_cycle: perCycle,
      ...(isCreate ? { included_changes_balance: perCycle } : {}),
    });
    // RFC-0386: enqueue outbox task so the sync worker drains the subscription to Pipedrive P3.
    await client.writeOutbox(tenantId, [
      { op: "upsert_subscription", payload: { subscription_id: res.id }, maxRetries: 5 },
    ]);
    return { id: res.id };
  }

  if (
    (lc.eventKind === "invoice.paid" || lc.eventKind === "invoice.payment_failed") &&
    lc.stripeInvoiceId
  ) {
    const id = await client.appendInvoice(tenantId, {
      organization_id: orgId,
      deal_id: lc.lagebildDealId,
      stripe_invoice_id: lc.stripeInvoiceId,
      kind: lc.invoiceKind ?? "adhoc",
      amount_cents: lc.amountCents ?? 0,
      currency: lc.currency ?? "EUR",
      status: lc.eventKind === "invoice.paid" ? "paid" : "open",
      paid_at: lc.eventKind === "invoice.paid" ? occurredAt : undefined,
    });

    // A paid cycle invoice resets the included-changes allowance for the new period (spec §08).
    if (lc.eventKind === "invoice.paid" && lc.invoiceKind === "cycle" && lc.stripeSubscriptionId) {
      const sub = await client.findSubscriptionByStripeId(tenantId, lc.stripeSubscriptionId);
      if (sub) {
        const delta = sub.included_changes_per_cycle - sub.included_changes_balance;
        if (delta !== 0) await client.adjustChangeBalance(tenantId, sub.id, delta);
      }
    }
    // RFC-0386: enqueue outbox task so the sync worker drains the invoice to Pipedrive P3/P4.
    await client.writeOutbox(tenantId, [
      { op: "upsert_invoice", payload: { invoice_id: id }, maxRetries: 5 },
    ]);
    return { id };
  }

  // A refund is recorded as a negative ad-hoc ledger entry (idempotent by the Stripe id);
  // operator follow-up (e.g. a Pipedrive note) is the sync worker's concern (spec §08).
  if (lc.eventKind === "payment.refunded" && lc.stripeInvoiceId) {
    const id = await client.appendInvoice(tenantId, {
      organization_id: orgId,
      deal_id: lc.lagebildDealId,
      stripe_invoice_id: lc.stripeInvoiceId,
      kind: "adhoc",
      amount_cents: -(lc.amountCents ?? 0),
      currency: lc.currency ?? "EUR",
      status: "void",
      paid_at: occurredAt,
    });
    return { id };
  }

  return null;
}

/**
 * RFC-0176/0188: write a normalized event into the Lagebild buffer. For a typed funnel event it
 * persists the canonical funnel_stage (bridged to the generic stage), the deal-time offer
 * snapshot, the append-only funnel-event row, and append-only consent evidence; for a plain lead
 * it keeps the back-compatible generic path. The client is injected (testable without network).
 */
export async function persistEventToBuffer(
  client: CrmBufferWriter,
  tenantId: string,
  event: IntegrationEvent,
): Promise<{ id: string } | null> {
  // RFC-0191: Stripe lifecycle events (invoices/subscriptions) take the billing path —
  // they mirror billing facts against the Organization, not the funnel deal flow.
  if (event.lifecycle) {
    return persistLifecycleEvent(client, tenantId, event.lifecycle, event.occurredAt);
  }

  // RFC-0188: the typed funnel payload (null for plain non-funnel leads).
  const funnel = extractFunnelPayload(event);
  const actor = mapActor(event.source);

  // 1. Upsert the contact (dedup by uchat_contact_id when present).
  const uchatContactId =
    typeof event.payload.contact_id === "string" ? event.payload.contact_id : undefined;

  const contactResult = await client.upsertContact(tenantId, {
    uchat_contact_id: uchatContactId,
    name: event.contact?.name,
    email: event.contact?.email,
    phone: event.contact?.phone,
    uchat_meta:
      Object.keys(event.payload).length > 0
        ? (event.payload as Record<string, unknown>)
        : undefined,
  });

  // 2. RFC-0190: resolve-or-create the target Organization from the funnel event
  // (no new visitor question — the funnel already asks "for which company?").
  const orgResult = await resolveOrganization(client, tenantId, event);

  // 3. Upsert the deal. RFC-0188: keep the precise funnel_stage; the generic `stage` is its
  // bridge. RFC-0188: freeze the deal-time offer snapshot on offer.selected.
  const { funnelStage, generic: stage } = resolveStages(event, funnel);
  const offerSnapshot = funnel?.offer?.priceSnapshot;
  // Buffer deal/transition actor enum is uchat | pipedrive | manual.
  const dealActor: "uchat" | "manual" = actor === "operator" ? "manual" : "uchat";
  const dealResult = await client.upsertDeal(tenantId, {
    contact_id: contactResult.id,
    organization_id: orgResult?.id,
    title: resolveDealTitle(event),
    stage,
    funnel_stage: funnelStage,
    offer_snapshot:
      offerSnapshot && Object.keys(offerSnapshot).length > 0 ? offerSnapshot : undefined,
    value: typeof event.payload.deal_value === "number" ? event.payload.deal_value : undefined,
    currency: typeof event.payload.currency === "string" ? event.payload.currency : undefined,
    last_actor: dealActor,
  });

  // 4. Append a stage transition (always, to preserve the full audit trail). The transition is
  // recorded in GENERIC terms; a canonical previousStage is bridged down.
  const fromStage: BufferDealStage | undefined = funnel?.previousStage
    ? bridgeFunnelStage(funnel.previousStage)
    : typeof event.payload.previous_stage === "string" &&
        (BUFFER_DEAL_STAGES as readonly string[]).includes(event.payload.previous_stage)
      ? (event.payload.previous_stage as BufferDealStage)
      : undefined;

  await client.appendStageTransition(tenantId, {
    deal_id: dealResult.id,
    from_stage: fromStage,
    to_stage: stage,
    actor: dealActor,
    occurred_at: event.occurredAt,
  });

  // 4b. RFC-0188: append the typed funnel-event snapshot (idempotent by eventId) so the deal's
  // history is auditable and never re-derived.
  if (funnel) {
    await client.appendFunnelEvent(tenantId, {
      deal_id: dealResult.id,
      idempotency_key: event.eventId,
      event_kind: funnel.eventKind,
      funnel_version: funnel.funnelVersion,
      from_stage: funnel.previousStage,
      to_stage: funnel.stage,
      payload: funnel,
      actor,
      occurred_at: event.occurredAt,
    });
  }

  // 4c. RFC-0188: legal consent is append-only evidence — never overwritten.
  if (funnel?.eventKind === "legal.consent.recorded" && funnel.legal?.buyerType) {
    const buyerType: VisitorBuyerType = funnel.legal.buyerType;
    await client.appendConsentEvent(tenantId, {
      deal_id: dealResult.id,
      buyer_type: buyerType,
      consent_kind:
        buyerType === "business" ? "b2b_start_before_completion" : "b2c_withdrawal_acknowledged",
      start_before_withdrawal_period: funnel.legal.startBeforeWithdrawalPeriod,
      withdrawal_expiry_acknowledged: funnel.legal.withdrawalExpiryAcknowledged,
      locale: event.locale,
      occurred_at: event.occurredAt,
    });
  }

  // 4d. RFC-0191 / spec §08: a submitted included change consumes one from the subscription's
  // allowance. Only when the change is actually described (not at the balance check) and the
  // Organization has an active subscription with a positive balance (else it is a paid change,
  // handled by Stripe). Redelivery is deduped upstream (RFC-0181), so this fires once.
  if (
    funnel?.eventKind === "change.requested" &&
    funnel.stage === "change_description_requested" &&
    orgResult
  ) {
    const sub = await client.findActiveSubscriptionByOrganization(tenantId, orgResult.id);
    if (sub && sub.included_changes_balance > 0) {
      await client.adjustChangeBalance(tenantId, sub.id, -1);
    }
  }

  // 5. Queue outbox tasks for async Pipedrive sync. The Organization syncs BEFORE the
  // deal (RFC-0190) so the deal can reference pipedrive_org_id.
  await client.writeOutbox(tenantId, [
    ...(orgResult
      ? [
          {
            op: "upsert_organization" as const,
            payload: { organization_id: orgResult.id },
            maxRetries: 5,
          },
        ]
      : []),
    {
      op: "upsert_contact",
      payload: { contact_id: contactResult.id },
      maxRetries: 5,
    },
    {
      op: "upsert_deal",
      payload: { deal_id: dealResult.id },
      maxRetries: 5,
    },
  ]);

  return { id: dealResult.id };
}
