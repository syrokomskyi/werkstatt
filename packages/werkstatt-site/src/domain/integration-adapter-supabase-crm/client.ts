/*
<MODULE_CONTRACT>
<purpose>Supabase REST client implementation of CrmBufferClient. Uses the Supabase REST API
(PostgREST) directly over fetch — no Supabase SDK dependency. Secrets (URL + anon/service key)
are injected by the caller; this module never imports astro:env. All queries set the
app.current_tenant config so RLS policies enforce tenant isolation.</purpose>
<non-goals>
  <item>Do not import the Supabase SDK (@supabase/supabase-js) — raw fetch only.</item>
  <item>Do not read astro:env — the caller injects supabaseUrl and supabaseKey.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Lagebild MVP: initial Supabase REST client.</item>
  <item>Split low-level Supabase REST transport into supabase-rest.ts to keep the client focused on CRM buffer semantics.</item>
</CHANGE_SUMMARY>
*/

import type {
  BufferConsentEvent,
  BufferContact,
  BufferDeal,
  BufferFunnelEvent,
  BufferInvoice,
  BufferOrganization,
  BufferStageTransition,
  BufferSubscription,
  BufferUpsertResult,
  CrmBufferClient,
  CrmBufferReader,
  CrmBufferWriter,
  DealPipedriveIdPatch,
  OutboxWriteResult,
  SyncOutboxOp,
  SyncOutboxRow,
  SyncOutboxStatus,
} from "@warpgogol/werkstatt-site/integration/crm-buffer";
import { rest, type FetchImpl, type SupabaseClientConfig } from "./supabase-rest.ts";

export type { SupabaseClientConfig } from "./supabase-rest.ts";

/**
 * Fetch-based CrmBufferClient implementation backed by the Supabase REST API.
 * Tenant isolation is enforced via the x-set-config RLS mechanism.
 */
export class SupabaseCrmBufferClient implements CrmBufferWriter, CrmBufferReader {
  private readonly config: SupabaseClientConfig;
  private readonly fetchImpl: FetchImpl;

  constructor(config: SupabaseClientConfig, fetchImpl: FetchImpl = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async upsertContact(
    tenantId: string,
    data: Omit<BufferContact, "id" | "tenant_id" | "created_at" | "updated_at">,
  ): Promise<BufferUpsertResult> {
    const cfg = { ...this.config, tenantId };
    const row = { tenant_id: tenantId, ...data };
    // ON CONFLICT (tenant_id, uchat_contact_id) DO UPDATE
    const result = (await rest(
      cfg,
      "POST",
      "buffer_contacts",
      {
        body: row,
        prefer: "return=representation,resolution=merge-duplicates",
      },
      this.fetchImpl,
    )) as Array<BufferContact & { _was_created?: boolean }>;
    const created = Array.isArray(result) ? result[0] : (result as BufferContact);
    return { id: created.id, created: !data.uchat_contact_id };
  }

  async upsertOrganization(
    tenantId: string,
    data: Omit<BufferOrganization, "id" | "tenant_id" | "created_at" | "updated_at">,
  ): Promise<BufferUpsertResult> {
    const cfg = { ...this.config, tenantId };
    const row = { tenant_id: tenantId, ...data };
    // ON CONFLICT (tenant_id, legal_name|name) DO UPDATE — resolve-or-create.
    const result = (await rest(
      cfg,
      "POST",
      "buffer_organizations",
      {
        body: row,
        prefer: "return=representation,resolution=merge-duplicates",
      },
      this.fetchImpl,
    )) as Array<BufferOrganization>;
    const org = Array.isArray(result) ? result[0] : (result as BufferOrganization);
    return { id: org.id, created: org.created_at === org.updated_at };
  }

  async findOrganizationByStripeCustomer(
    tenantId: string,
    stripeCustomerId: string,
  ): Promise<{ id: string } | null> {
    const cfg = { ...this.config, tenantId };
    const rows = (await rest(
      cfg,
      "GET",
      "buffer_organizations",
      {
        params: {
          tenant_id: `eq.${tenantId}`,
          stripe_customer_id: `eq.${stripeCustomerId}`,
          select: "id",
          limit: "1",
        },
      },
      this.fetchImpl,
    )) as Array<{ id: string }>;
    return Array.isArray(rows) && rows[0]?.id ? { id: rows[0].id } : null;
  }

  async upsertDeal(
    tenantId: string,
    data: Omit<BufferDeal, "id" | "tenant_id" | "created_at" | "updated_at">,
  ): Promise<BufferUpsertResult> {
    const cfg = { ...this.config, tenantId };
    const row = { tenant_id: tenantId, ...data };
    const result = (await rest(
      cfg,
      "POST",
      "buffer_deals",
      {
        body: row,
        prefer: "return=representation,resolution=merge-duplicates",
      },
      this.fetchImpl,
    )) as Array<BufferDeal>;
    const deal = Array.isArray(result) ? result[0] : (result as BufferDeal);
    return { id: deal.id, created: deal.created_at === deal.updated_at };
  }

  async appendStageTransition(
    tenantId: string,
    data: Omit<BufferStageTransition, "id" | "tenant_id" | "created_at">,
  ): Promise<string> {
    const cfg = { ...this.config, tenantId };
    const row = { tenant_id: tenantId, ...data };
    const result = (await rest(
      cfg,
      "POST",
      "buffer_stage_transitions",
      {
        body: row,
        prefer: "return=representation",
      },
      this.fetchImpl,
    )) as Array<BufferStageTransition>;
    const tr = Array.isArray(result) ? result[0] : (result as BufferStageTransition);
    return tr.id;
  }

  async appendFunnelEvent(
    tenantId: string,
    data: Omit<BufferFunnelEvent, "id" | "tenant_id" | "created_at">,
  ): Promise<string> {
    const cfg = { ...this.config, tenantId };
    const row = { tenant_id: tenantId, ...data };
    // Idempotent by (tenant_id, idempotency_key): a UChat webhook retry must not
    // create a second row. ignore-duplicates returns [] on conflict.
    const result = (await rest(
      cfg,
      "POST",
      "buffer_funnel_events",
      {
        body: row,
        prefer: "return=representation,resolution=ignore-duplicates",
      },
      this.fetchImpl,
    )) as Array<BufferFunnelEvent>;
    const inserted = Array.isArray(result) ? result[0] : (result as BufferFunnelEvent | null);
    if (inserted?.id) return inserted.id;
    // Conflict (duplicate idempotency_key) — return the existing row id.
    const existing = (await rest(
      cfg,
      "GET",
      "buffer_funnel_events",
      {
        params: {
          tenant_id: `eq.${tenantId}`,
          idempotency_key: `eq.${data.idempotency_key}`,
          select: "id",
          limit: "1",
        },
      },
      this.fetchImpl,
    )) as Array<{ id: string }>;
    return Array.isArray(existing) && existing[0]?.id ? existing[0].id : "";
  }

  async appendConsentEvent(
    tenantId: string,
    data: Omit<BufferConsentEvent, "id" | "tenant_id" | "created_at">,
  ): Promise<string> {
    const cfg = { ...this.config, tenantId };
    const row = { tenant_id: tenantId, ...data };
    // Append-only: every consent acknowledgement is an immutable row.
    const result = (await rest(
      cfg,
      "POST",
      "buffer_consent_events",
      {
        body: row,
        prefer: "return=representation",
      },
      this.fetchImpl,
    )) as Array<BufferConsentEvent>;
    const ev = Array.isArray(result) ? result[0] : (result as BufferConsentEvent);
    return ev.id;
  }

  async upsertSubscription(
    tenantId: string,
    data: Omit<
      BufferSubscription,
      "id" | "tenant_id" | "created_at" | "updated_at" | "included_changes_balance"
    > & { included_changes_balance?: number },
  ): Promise<BufferUpsertResult> {
    const cfg = { ...this.config, tenantId };
    const row = { tenant_id: tenantId, ...data };
    // ON CONFLICT (tenant_id, stripe_subscription_id) DO UPDATE. Omitting
    // included_changes_balance preserves the current value (PostgREST updates only sent columns).
    const result = (await rest(
      cfg,
      "POST",
      "buffer_subscriptions",
      {
        body: row,
        prefer: "return=representation,resolution=merge-duplicates",
      },
      this.fetchImpl,
    )) as Array<BufferSubscription>;
    const sub = Array.isArray(result) ? result[0] : (result as BufferSubscription);
    return { id: sub.id, created: sub.created_at === sub.updated_at };
  }

  async findSubscriptionByStripeId(
    tenantId: string,
    stripeSubscriptionId: string,
  ): Promise<{
    id: string;
    included_changes_per_cycle: number;
    included_changes_balance: number;
  } | null> {
    const cfg = { ...this.config, tenantId };
    const rows = (await rest(
      cfg,
      "GET",
      "buffer_subscriptions",
      {
        params: {
          tenant_id: `eq.${tenantId}`,
          stripe_subscription_id: `eq.${stripeSubscriptionId}`,
          select: "id,included_changes_per_cycle,included_changes_balance",
          limit: "1",
        },
      },
      this.fetchImpl,
    )) as Array<{
      id: string;
      included_changes_per_cycle: number;
      included_changes_balance: number;
    }>;
    return Array.isArray(rows) && rows[0]?.id ? rows[0] : null;
  }

  async findActiveSubscriptionByOrganization(
    tenantId: string,
    organizationId: string,
  ): Promise<{ id: string; included_changes_balance: number } | null> {
    const cfg = { ...this.config, tenantId };
    const rows = (await rest(
      cfg,
      "GET",
      "buffer_subscriptions",
      {
        params: {
          tenant_id: `eq.${tenantId}`,
          organization_id: `eq.${organizationId}`,
          status: "eq.active",
          order: "created_at.desc",
          select: "id,included_changes_balance",
          limit: "1",
        },
      },
      this.fetchImpl,
    )) as Array<{ id: string; included_changes_balance: number }>;
    return Array.isArray(rows) && rows[0]?.id ? rows[0] : null;
  }

  async appendInvoice(
    tenantId: string,
    data: Omit<BufferInvoice, "id" | "tenant_id" | "created_at">,
  ): Promise<string> {
    const cfg = { ...this.config, tenantId };
    const row = { tenant_id: tenantId, ...data };
    // Idempotent by (tenant_id, stripe_invoice_id): ignore-duplicates returns [] on conflict.
    const result = (await rest(
      cfg,
      "POST",
      "buffer_invoices",
      {
        body: row,
        prefer: "return=representation,resolution=ignore-duplicates",
      },
      this.fetchImpl,
    )) as Array<BufferInvoice>;
    const inserted = Array.isArray(result) ? result[0] : (result as BufferInvoice | null);
    if (inserted?.id) return inserted.id;
    const existing = (await rest(
      cfg,
      "GET",
      "buffer_invoices",
      {
        params: {
          tenant_id: `eq.${tenantId}`,
          stripe_invoice_id: `eq.${data.stripe_invoice_id}`,
          select: "id",
          limit: "1",
        },
      },
      this.fetchImpl,
    )) as Array<{ id: string }>;
    return Array.isArray(existing) && existing[0]?.id ? existing[0].id : "";
  }

  async adjustChangeBalance(
    tenantId: string,
    subscriptionId: string,
    delta: number,
  ): Promise<number> {
    const cfg = { ...this.config, tenantId };
    // Read-modify-write. The shared sync worker drains per tenant serially, so
    // contention is low; a Postgres RPC would harden this against concurrency later.
    const rows = (await rest(
      cfg,
      "GET",
      "buffer_subscriptions",
      {
        params: { id: `eq.${subscriptionId}`, select: "included_changes_balance", limit: "1" },
      },
      this.fetchImpl,
    )) as Array<{ included_changes_balance: number }>;
    const current = Array.isArray(rows) && rows[0] ? rows[0].included_changes_balance : 0;
    const next = current + delta;
    await rest(
      cfg,
      "PATCH",
      "buffer_subscriptions",
      {
        params: { id: `eq.${subscriptionId}` },
        body: { included_changes_balance: next },
      },
      this.fetchImpl,
    );
    return next;
  }

  async writeOutbox(
    tenantId: string,
    tasks: Array<{
      op: SyncOutboxOp;
      payload: Record<string, unknown>;
      maxRetries?: number;
    }>,
  ): Promise<OutboxWriteResult> {
    if (tasks.length === 0) return { ids: [] };
    const cfg = { ...this.config, tenantId };
    const rows = tasks.map((t) => ({
      tenant_id: tenantId,
      op: t.op,
      payload: t.payload,
      max_retries: t.maxRetries ?? 5,
      status: "pending",
      scheduled_at: new Date().toISOString(),
    }));
    // ON CONFLICT (tenant_id, op, payload_hash, status) DO NOTHING
    const result = (await rest(
      cfg,
      "POST",
      "sync_outbox",
      {
        body: rows,
        prefer: "return=representation,resolution=ignore-duplicates",
      },
      this.fetchImpl,
    )) as Array<SyncOutboxRow>;
    const inserted = Array.isArray(result) ? result : [];
    return { ids: inserted.map((r) => r.id) };
  }

  async readPendingOutbox(tenantId: string, limit = 100): Promise<SyncOutboxRow[]> {
    const cfg = { ...this.config, tenantId };
    const result = (await rest(
      cfg,
      "GET",
      "sync_outbox",
      {
        params: {
          status: "eq.pending",
          order: "scheduled_at.asc",
          limit: String(limit),
        },
      },
      this.fetchImpl,
    )) as SyncOutboxRow[];
    return Array.isArray(result) ? result : [];
  }

  async updateOutboxStatus(
    id: string,
    status: SyncOutboxStatus,
    opts?: { lastError?: string; retryCount?: number },
  ): Promise<void> {
    const cfg = this.config;
    await rest(
      cfg,
      "PATCH",
      "sync_outbox",
      {
        params: { id: `eq.${id}` },
        body: {
          status,
          ...(status === "processing" ? { processing_at: new Date().toISOString() } : {}),
          ...(status === "done" || status === "failed" || status === "dead"
            ? { resolved_at: new Date().toISOString() }
            : {}),
          ...(opts?.lastError !== undefined ? { last_error: opts.lastError } : {}),
          ...(opts?.retryCount !== undefined ? { retry_count: opts.retryCount } : {}),
        },
      },
      this.fetchImpl,
    );
  }

  // --- CrmBufferReader: single-row reads ---

  async getContact(tenantId: string, contactId: string): Promise<BufferContact | null> {
    const cfg = { ...this.config, tenantId };
    const rows = (await rest(
      cfg,
      "GET",
      "buffer_contacts",
      {
        params: { id: `eq.${contactId}`, select: "*", limit: "1" },
      },
      this.fetchImpl,
    )) as Array<BufferContact>;
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  async getDeal(tenantId: string, dealId: string): Promise<BufferDeal | null> {
    const cfg = { ...this.config, tenantId };
    const rows = (await rest(
      cfg,
      "GET",
      "buffer_deals",
      {
        params: { id: `eq.${dealId}`, select: "*", limit: "1" },
      },
      this.fetchImpl,
    )) as Array<BufferDeal>;
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  async getOrganization(
    tenantId: string,
    organizationId: string,
  ): Promise<BufferOrganization | null> {
    const cfg = { ...this.config, tenantId };
    const rows = (await rest(
      cfg,
      "GET",
      "buffer_organizations",
      {
        params: { id: `eq.${organizationId}`, select: "*", limit: "1" },
      },
      this.fetchImpl,
    )) as Array<BufferOrganization>;
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  // --- CrmBufferReader: patch back destination IDs ---

  async patchContactPipedriveId(
    tenantId: string,
    contactId: string,
    pipedrivePersonId: number,
  ): Promise<void> {
    const cfg = { ...this.config, tenantId };
    await rest(
      cfg,
      "PATCH",
      "buffer_contacts",
      {
        params: { id: `eq.${contactId}` },
        body: { pipedrive_person_id: pipedrivePersonId },
      },
      this.fetchImpl,
    );
  }

  async patchOrganizationPipedriveId(
    tenantId: string,
    organizationId: string,
    pipedriveOrgId: number,
  ): Promise<void> {
    const cfg = { ...this.config, tenantId };
    await rest(
      cfg,
      "PATCH",
      "buffer_organizations",
      {
        params: { id: `eq.${organizationId}` },
        body: { pipedrive_org_id: pipedriveOrgId },
      },
      this.fetchImpl,
    );
  }

  async patchDealPipedriveIds(
    tenantId: string,
    dealId: string,
    patch: DealPipedriveIdPatch,
  ): Promise<void> {
    const cfg = { ...this.config, tenantId };
    await rest(
      cfg,
      "PATCH",
      "buffer_deals",
      {
        params: { id: `eq.${dealId}` },
        body: patch,
      },
      this.fetchImpl,
    );
  }

  // --- RFC-0386: lifecycle sync reads ---

  async getSubscription(
    tenantId: string,
    subscriptionId: string,
  ): Promise<BufferSubscription | null> {
    const cfg = { ...this.config, tenantId };
    const rows = (await rest(
      cfg,
      "GET",
      "buffer_subscriptions",
      {
        params: { id: `eq.${subscriptionId}`, select: "*", limit: "1" },
      },
      this.fetchImpl,
    )) as Array<BufferSubscription>;
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  async getInvoice(tenantId: string, invoiceId: string): Promise<BufferInvoice | null> {
    const cfg = { ...this.config, tenantId };
    const rows = (await rest(
      cfg,
      "GET",
      "buffer_invoices",
      {
        params: { id: `eq.${invoiceId}`, select: "*", limit: "1" },
      },
      this.fetchImpl,
    )) as Array<BufferInvoice>;
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  async patchSubscriptionPipedriveDealId(
    tenantId: string,
    subscriptionId: string,
    pipedriveDealId: number,
  ): Promise<void> {
    const cfg = { ...this.config, tenantId };
    await rest(
      cfg,
      "PATCH",
      "buffer_subscriptions",
      {
        params: { id: `eq.${subscriptionId}` },
        body: { pipedrive_deal_id: pipedriveDealId },
      },
      this.fetchImpl,
    );
  }
}

/**
 * Factory: create a CrmBufferClient backed by Supabase REST for the given tenant.
 * Inject the returned client into the adapter or the sync worker.
 */
export function createSupabaseCrmBufferClient(
  config: SupabaseClientConfig,
  fetchImpl: FetchImpl = fetch,
): CrmBufferClient {
  return new SupabaseCrmBufferClient(config, fetchImpl);
}
