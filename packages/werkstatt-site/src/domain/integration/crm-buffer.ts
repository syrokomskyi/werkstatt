/*
<MODULE_CONTRACT>
<purpose>CRM Buffer type contracts (Lagebild). Supabase-backed intermediate storage layer between
UChat (IntegrationEvent source) and Pipedrive (CRM sync target). Stores consolidated contacts,
deals, funnel stage transitions, and the outbox used by the async sync worker. This is the
single source of truth for types shared between the buffer DestinationAdapter and the sync worker.
Pure types + constants — no I/O, no astro:env imports.</purpose>
<non-goals>
  <item>Do not import a Supabase SDK — callers inject a CrmBufferClient implementation.</item>
  <item>Do not read astro:env — secrets are injected by the adapter/worker at call time.</item>
  <item>Do not become a CRM replacement — stores only what is needed for Pipedrive sync.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Lagebild MVP: initial CRM buffer type contracts.</item>
  <item>RFC-0188 Phase 3: bridge canonical funnel stage → generic stage; add offer snapshot on the
  deal, append-only funnel-event and legal-consent rows. Generic BUFFER_DEAL_STAGES is BRIDGED
  (not replaced) so existing rows and the Pipedrive sync worker keep working.</item>
</CHANGE_SUMMARY>
*/

import type {
  VisitorBuyerType,
  VisitorFunnelEventKind,
  VisitorFunnelEventPayload,
  VisitorFunnelStage,
} from "./funnel.ts";
import { VISITOR_FUNNEL_STAGES } from "./funnel.ts";
import type {
  InvoiceKind,
  InvoiceStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from "./lifecycle.ts";

// ---------------------------------------------------------------------------
// Funnel stage catalog (closed)
// ---------------------------------------------------------------------------

/**
 * Closed catalog of deal funnel stages. Order matters — later stages come after
 * earlier ones. Mirrors the standard Pipedrive pipeline stages.
 * Extend only by updating this array AND the corresponding Pipedrive pipeline config.
 */
export const BUFFER_DEAL_STAGES = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;

export type BufferDealStage = (typeof BUFFER_DEAL_STAGES)[number];

// ---------------------------------------------------------------------------
// RFC-0188 bridge: canonical funnel stage → generic buffer/Pipedrive stage
// ---------------------------------------------------------------------------

/**
 * RFC-0188 keeps the precise, platform-owned VisitorFunnelStage on the deal
 * (`funnel_stage`) while BRIDGING it down to the generic BufferDealStage the
 * Pipedrive sync worker already understands. This preserves existing rows and the
 * outbound sync mapping — the canonical stage is additive, never a replacement.
 * Exhaustive by construction: a missing key is a compile error after a catalog change.
 */
export const FUNNEL_STAGE_TO_BUFFER_STAGE: Record<VisitorFunnelStage, BufferDealStage> = {
  new_session: "new",
  privacy_acknowledged: "new",
  intent_selected: "contacted",
  organization_selected: "contacted",
  qualification_priority: "qualified",
  qualification_company: "qualified",
  qualification_service: "qualified",
  qualification_region: "qualified",
  offer_presented: "proposal",
  payment_pending: "proposal",
  payment_confirmed: "negotiation",
  start_choice_pending: "negotiation",
  start_deferred: "negotiation",
  buyer_type_pending: "negotiation",
  b2b_start_consent_pending: "negotiation",
  b2c_withdrawal_consent_pending: "negotiation",
  start_approved: "negotiation",
  legal_data_requested: "negotiation",
  materials_requested: "negotiation",
  production_ready: "negotiation",
  change_balance_checked: "contacted",
  change_payment_pending: "proposal",
  change_description_requested: "negotiation",
  operator_review: "negotiation",
  won: "won",
  lost: "lost",
};

/** Bridge a canonical funnel stage down to the generic stage the sync worker maps. */
export function bridgeFunnelStage(stage: VisitorFunnelStage): BufferDealStage {
  return FUNNEL_STAGE_TO_BUFFER_STAGE[stage];
}

/** True when `value` is a canonical funnel stage (re-exported guard for buffer callers). */
export function isFunnelStage(value: string): value is VisitorFunnelStage {
  return (VISITOR_FUNNEL_STAGES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Row shapes (mirror the Supabase DDL — see services/lagebild-sync/supabase/)
// ---------------------------------------------------------------------------

/** Normalized contact stored in the buffer. One row per unique contact. */
export interface BufferContact {
  id: string; // UUID
  tenant_id: string; // UUID — for future multi-tenancy
  uchat_contact_id?: string; // UChat's own contact identifier (for dedup)
  name?: string;
  email?: string;
  phone?: string;
  /** Raw metadata from the last UChat event (e.g. tags, custom fields). */
  uchat_meta?: Record<string, unknown>;
  pipedrive_person_id?: number; // set after first successful Pipedrive sync
  created_at: string; // ISO-8601
  updated_at: string; // ISO-8601
}

/**
 * RFC-0190: the target company a site is FOR (may differ from the orderer Person).
 * One Person → many Deals; each Deal → one Organization. Tenant-scoped; mirrored to
 * the tenant's Pipedrive Organization. Dedup by (tenant_id, legal_name) when present,
 * else (tenant_id, name).
 */
export interface BufferOrganization {
  id: string; // UUID
  tenant_id: string;
  name: string; // display name (target company)
  legal_name?: string; // for Impressum / invoicing
  industry?: string;
  region?: string;
  pipedrive_org_id?: number; // set after first Pipedrive sync
  stripe_customer_id?: string; // set by RFC-0191 billing (billed entity)
  created_at: string;
  updated_at: string;
}

/** Deal linked to a contact with a current funnel stage. */
export interface BufferDeal {
  id: string; // UUID
  tenant_id: string;
  contact_id: string; // FK → buffer_contacts.id
  /**
   * RFC-0190: the target Organization this deal's site is for (additive, nullable).
   * Absent on pre-RFC-0190 rows and on org-less events (e.g. a pure free question).
   */
  organization_id?: string; // FK → buffer_organizations.id
  title: string;
  /** Generic stage the Pipedrive sync worker maps (bridged from funnel_stage). */
  stage: BufferDealStage;
  /**
   * RFC-0188: the precise, platform-owned funnel stage (additive). When set, the
   * generic `stage` above is its bridge via FUNNEL_STAGE_TO_BUFFER_STAGE. Absent on
   * pre-RFC-0188 rows, which keep working on the generic stage alone.
   */
  funnel_stage?: VisitorFunnelStage;
  value?: number; // deal value (currency-agnostic, same unit as Pipedrive)
  currency?: string; // ISO 4217
  /**
   * RFC-0188: deal-time offer snapshot captured at offer.selected. Frozen so a later
   * business/offer.md change never re-prices a historical deal. Keyed price strings
   * (e.g. { monthly: "70 €", yearly: "700 €", setup: "200 €" }).
   */
  offer_snapshot?: Record<string, string>;
  /** Actor that last changed the stage. */
  last_actor: "uchat" | "pipedrive" | "manual";
  pipedrive_deal_id?: number; // set after first successful Pipedrive sync
  pipedrive_lead_id?: string; // set when synced as a Pipedrive lead (not deal)
  created_at: string;
  updated_at: string;
}

/** Immutable audit log of every stage transition (append-only). */
export interface BufferStageTransition {
  id: string; // UUID
  tenant_id: string;
  deal_id: string; // FK → buffer_deals.id
  from_stage?: BufferDealStage; // null on first transition (deal creation)
  to_stage: BufferDealStage;
  actor: "uchat" | "pipedrive" | "manual";
  /** ISO-8601 event time (from the source IntegrationEvent.occurredAt). */
  occurred_at: string;
  created_at: string;
}

/**
 * RFC-0188: append-only typed funnel-event snapshot. One row per accepted funnel
 * event (session.started, qualification.answered, offer.selected, …). The full
 * VisitorFunnelEventPayload is frozen here so a deal's history is auditable and
 * never re-derived. Idempotent by (tenant_id, idempotency_key): a UChat webhook
 * retry must not create a second row.
 */
export interface BufferFunnelEvent {
  id: string; // UUID
  tenant_id: string;
  deal_id: string; // FK → buffer_deals.id
  /** Stable idempotency key (the source IntegrationEvent.eventId). */
  idempotency_key: string;
  event_kind: VisitorFunnelEventKind;
  funnel_version: string;
  from_stage?: VisitorFunnelStage;
  to_stage?: VisitorFunnelStage;
  /** Frozen typed payload snapshot (deal-time). */
  payload: VisitorFunnelEventPayload;
  actor: "uchat" | "stripe" | "operator" | "send-message";
  occurred_at: string; // ISO-8601
  created_at: string;
}

/**
 * RFC-0188: append-only legal-consent evidence. NEVER overwritten by a later
 * conversation message. Captures B2C withdrawal-rights acknowledgement and B2B
 * start-before-completion consent as immutable rows for legal auditability.
 */
export interface BufferConsentEvent {
  id: string; // UUID
  tenant_id: string;
  deal_id: string; // FK → buffer_deals.id
  buyer_type: VisitorBuyerType;
  /** Which consent this row records. */
  consent_kind: "b2b_start_before_completion" | "b2c_withdrawal_acknowledged";
  /** B2B: visitor agreed to start before the withdrawal period ends. */
  start_before_withdrawal_period?: boolean;
  /** B2C: visitor acknowledged the withdrawal-right expiry on early start. */
  withdrawal_expiry_acknowledged?: boolean;
  locale: string;
  occurred_at: string; // ISO-8601
  created_at: string;
}

// ---------------------------------------------------------------------------
// RFC-0191 lifecycle state: subscriptions + invoices (Stripe is the authority)
// ---------------------------------------------------------------------------

/**
 * RFC-0191: the recurring subscription anchoring a client's MRR. One per active site
 * subscription, attached to the Organization (RFC-0190) and the deal. Dedup by
 * stripe_subscription_id. The buffer mirrors Stripe — it never recomputes amounts.
 */
export interface BufferSubscription {
  id: string; // UUID
  tenant_id: string;
  organization_id: string; // FK → buffer_organizations.id (the billed company)
  deal_id: string; // FK → buffer_deals.id (the site)
  stripe_subscription_id: string;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  mrr_cents: number; // monthly recurring revenue, smallest currency unit
  currency: string; // ISO 4217
  current_period_end?: string; // ISO-8601 (renewal anchor)
  /** Authoritative remaining included-changes count for the P4 change flow. */
  included_changes_balance: number;
  /** RFC-0191 / spec §08: per-cycle included-change allowance (the reset target each cycle). */
  included_changes_per_cycle: number;
  /** RFC-0386: Pipedrive P3 deal id, set after first lifecycle sync. */
  pipedrive_deal_id?: number;
  created_at: string;
  updated_at: string;
}

/**
 * RFC-0191: append-only invoice mirror. One row per Stripe invoice (setup / cycle /
 * change / ad-hoc). Idempotent by stripe_invoice_id so a webhook redelivery never
 * double-records. Amounts in cents (Stripe is the authority).
 */
export interface BufferInvoice {
  id: string; // UUID
  tenant_id: string;
  organization_id: string; // FK → buffer_organizations.id
  deal_id?: string; // FK → buffer_deals.id (the related site/change deal)
  subscription_id?: string; // FK → buffer_subscriptions.id (for cycle invoices)
  stripe_invoice_id: string;
  kind: InvoiceKind;
  amount_cents: number;
  currency: string;
  status: InvoiceStatus;
  paid_at?: string; // ISO-8601
  created_at: string;
}

// ---------------------------------------------------------------------------
// Sync outbox
// ---------------------------------------------------------------------------

/** Pending states for the async sync outbox worker. */
export const SYNC_OUTBOX_STATUSES = ["pending", "processing", "done", "failed", "dead"] as const;
export type SyncOutboxStatus = (typeof SYNC_OUTBOX_STATUSES)[number];

/** Sync operation kind — what the outbox worker should do. */
export const SYNC_OUTBOX_OPS = [
  "upsert_contact",
  "upsert_deal",
  "update_deal_stage",
  // RFC-0190: sync the target Organization to Pipedrive BEFORE the deal so the deal
  // can reference pipedrive_org_id.
  "upsert_organization",
  // RFC-0386: lifecycle sync — drain subscription/invoice state to Pipedrive P3/P4.
  "upsert_subscription",
  "upsert_invoice",
] as const;
export type SyncOutboxOp = (typeof SYNC_OUTBOX_OPS)[number];

/** One pending task in the sync outbox (read by the supabase-sync worker). */
export interface SyncOutboxRow {
  id: string; // UUID
  tenant_id: string;
  op: SyncOutboxOp;
  /** Serialized payload specific to the op (e.g. BufferContact id, BufferDeal id). */
  payload: Record<string, unknown>;
  status: SyncOutboxStatus;
  /** ISO-8601 time the task was scheduled. */
  scheduled_at: string;
  /** ISO-8601 time the worker started processing (null until picked up). */
  processing_at?: string;
  /** ISO-8601 time the task completed or failed. */
  resolved_at?: string;
  retry_count: number;
  max_retries: number;
  last_error?: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// CrmBufferWriter — adapter-side write port (no SDK import)
// ---------------------------------------------------------------------------

/** Result of upserting a contact or deal into the buffer. */
export interface BufferUpsertResult {
  id: string;
  created: boolean; // true = new row, false = updated existing
}

/** Result of writing one or more outbox tasks. */
export interface OutboxWriteResult {
  ids: string[];
}

/**
 * Injectable write-side port for the CRM buffer (Supabase). Used by the
 * DestinationAdapter to persist contacts, deals, funnel events, consent,
 * subscriptions, invoices, and outbox tasks. Callers never import the Supabase
 * SDK — they receive a CrmBufferWriter implementation from the adapter factory.
 */
export interface CrmBufferWriter {
  upsertContact(
    tenantId: string,
    data: Omit<BufferContact, "id" | "tenant_id" | "created_at" | "updated_at">,
  ): Promise<BufferUpsertResult>;

  upsertOrganization(
    tenantId: string,
    data: Omit<BufferOrganization, "id" | "tenant_id" | "created_at" | "updated_at">,
  ): Promise<BufferUpsertResult>;

  findOrganizationByStripeCustomer(
    tenantId: string,
    stripeCustomerId: string,
  ): Promise<{ id: string } | null>;

  upsertDeal(
    tenantId: string,
    data: Omit<BufferDeal, "id" | "tenant_id" | "created_at" | "updated_at">,
  ): Promise<BufferUpsertResult>;

  appendStageTransition(
    tenantId: string,
    data: Omit<BufferStageTransition, "id" | "tenant_id" | "created_at">,
  ): Promise<string>;

  appendFunnelEvent(
    tenantId: string,
    data: Omit<BufferFunnelEvent, "id" | "tenant_id" | "created_at">,
  ): Promise<string>;

  appendConsentEvent(
    tenantId: string,
    data: Omit<BufferConsentEvent, "id" | "tenant_id" | "created_at">,
  ): Promise<string>;

  upsertSubscription(
    tenantId: string,
    data: Omit<
      BufferSubscription,
      "id" | "tenant_id" | "created_at" | "updated_at" | "included_changes_balance"
    > & { included_changes_balance?: number },
  ): Promise<BufferUpsertResult>;

  findSubscriptionByStripeId(
    tenantId: string,
    stripeSubscriptionId: string,
  ): Promise<{
    id: string;
    included_changes_per_cycle: number;
    included_changes_balance: number;
  } | null>;

  findActiveSubscriptionByOrganization(
    tenantId: string,
    organizationId: string,
  ): Promise<{ id: string; included_changes_balance: number } | null>;

  appendInvoice(
    tenantId: string,
    data: Omit<BufferInvoice, "id" | "tenant_id" | "created_at">,
  ): Promise<string>;

  adjustChangeBalance(tenantId: string, subscriptionId: string, delta: number): Promise<number>;

  writeOutbox(
    tenantId: string,
    tasks: Array<{
      op: SyncOutboxOp;
      payload: Record<string, unknown>;
      maxRetries?: number;
    }>,
  ): Promise<OutboxWriteResult>;
}

// ---------------------------------------------------------------------------
// CrmBufferReader — worker-side read/patch port
// ---------------------------------------------------------------------------

/** Patch payload for writing back Pipedrive IDs on a deal. */
export interface DealPipedriveIdPatch {
  pipedrive_deal_id?: number;
  pipedrive_lead_id?: string;
}

/**
 * Injectable read-side port for the CRM buffer. Used by the sync worker and
 * CrmSyncTarget adapters to read buffer rows and write back destination IDs.
 */
export interface CrmBufferReader {
  readPendingOutbox(tenantId: string, limit?: number): Promise<SyncOutboxRow[]>;

  updateOutboxStatus(
    id: string,
    status: SyncOutboxStatus,
    opts?: { lastError?: string; retryCount?: number },
  ): Promise<void>;

  getContact(tenantId: string, contactId: string): Promise<BufferContact | null>;

  getDeal(tenantId: string, dealId: string): Promise<BufferDeal | null>;

  getOrganization(tenantId: string, organizationId: string): Promise<BufferOrganization | null>;

  patchContactPipedriveId(
    tenantId: string,
    contactId: string,
    pipedrivePersonId: number,
  ): Promise<void>;

  patchOrganizationPipedriveId(
    tenantId: string,
    organizationId: string,
    pipedriveOrgId: number,
  ): Promise<void>;

  patchDealPipedriveIds(
    tenantId: string,
    dealId: string,
    patch: DealPipedriveIdPatch,
  ): Promise<void>;

  // RFC-0386: lifecycle sync read methods.

  getSubscription(tenantId: string, subscriptionId: string): Promise<BufferSubscription | null>;

  getInvoice(tenantId: string, invoiceId: string): Promise<BufferInvoice | null>;

  patchSubscriptionPipedriveDealId(
    tenantId: string,
    subscriptionId: string,
    pipedriveDealId: number,
  ): Promise<void>;

  // RFC-0386: balance reset on paid cycle invoices.
  adjustChangeBalance(tenantId: string, subscriptionId: string, delta: number): Promise<number>;
}

/** Combined interface — the Supabase client implements both writer and reader. */
export type CrmBufferClient = CrmBufferWriter & CrmBufferReader;
