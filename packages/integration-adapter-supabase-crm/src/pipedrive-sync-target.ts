/*
<MODULE_CONTRACT>
<purpose>RFC-0186: CrmSyncTarget port + PipedriveSyncTarget adapter. The port
abstracts the CRM destination (Pipedrive today, other vendors tomorrow) so the
sync worker is a thin orchestrator: read outbox → route to sync target by vendor.
All Pipedrive-specific logic (API calls, stage mapping, credential handling) lives
here. The adapter reads buffer rows via CrmBufferReader and writes back destination
IDs through the same port — no raw fetch leaks into the worker.</purpose>
<non-goals>
  <item>Do not import astro:env — destination credentials are injected.</item>
  <item>Do not call the buffer directly — use the injected CrmBufferReader.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from worker.ts: Pipedrive sync logic + stage map behind CrmSyncTarget port.</item>
  <item>RFC-0386: Added syncSubscription / syncInvoice for P3/P4 lifecycle sync.</item>
</CHANGE_SUMMARY>
*/

import type {
  CrmBufferReader,
  SyncOutboxRow,
  BufferDealStage,
  BufferSubscription,
} from "@warpgogol/integration/crm-buffer";
import { BUFFER_DEAL_STAGES } from "@warpgogol/integration/crm-buffer";
import type { SubscriptionStatus } from "@warpgogol/integration";

// ---------------------------------------------------------------------------
// CrmSyncTarget — vendor-agnostic sync port
// ---------------------------------------------------------------------------

/** Destination credentials for a CRM sync target. */
export interface SyncTargetCredentials {
  destination_token: string;
  destination_domain: string;
  /** RFC-0386: P3 pipeline stage ids for lifecycle deal moves. */
  p3StageMap?: P3StageMap;
  /** RFC-0386: P4 pipeline stage ids for change-deal moves. */
  p4StageMap?: P4StageMap;
}

/**
 * Vendor-agnostic port for syncing buffer entities to a CRM destination.
 * The sync worker routes each outbox op to the appropriate method.
 * The seam is justified by PipedriveSyncTarget (production) and future
 * test fakes that can be injected without touching the worker.
 */
export interface CrmSyncTarget {
  syncContact(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void>;
  syncOrganization(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void>;
  syncDeal(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void>;
  syncDealStage(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void>;
  // RFC-0386: lifecycle sync (delta 5)
  syncSubscription(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void>;
  syncInvoice(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void>;
}

// ---------------------------------------------------------------------------
// Pipedrive stage mapping
// ---------------------------------------------------------------------------

/**
 * Maps every BufferDealStage to a Pipedrive pipeline stage_id, or null when
 * Pipedrive expects a `status` field instead of a stage_id (won / lost).
 * Typed as Record<BufferDealStage, …> so a BUFFER_DEAL_STAGES catalog change
 * causes a compile error here rather than a silent fallback.
 */
export const STAGE_MAP: Record<BufferDealStage, number | null> = {
  new: 1,
  contacted: 2,
  qualified: 3,
  proposal: 4,
  negotiation: 5,
  won: null,
  lost: null,
};

// Exhaustiveness guard: fails to compile if BUFFER_DEAL_STAGES grows without updating STAGE_MAP.
const _stageMapExhaustive: readonly BufferDealStage[] = BUFFER_DEAL_STAGES;
void _stageMapExhaustive;

/**
 * Returns the Pipedrive deal update payload fragment for the given stage:
 * - Active stages  → `{ stage_id: <number> }`
 * - won / lost     → `{ status: "won" | "lost" }` (Pipedrive closes the deal)
 */
export function resolvePipedriveStageUpdate(
  stage: string,
): { stage_id: number } | { status: "won" | "lost" } {
  if (stage === "won") return { status: "won" };
  if (stage === "lost") return { status: "lost" };
  const id = STAGE_MAP[stage as BufferDealStage];
  if (id === undefined) {
    console.warn(`[pipedrive] unknown stage "${stage}", falling back to stage_id 1 (new)`);
    return { stage_id: 1 };
  }
  if (id === null) {
    // won/lost are handled above; null for any other stage is a STAGE_MAP misconfiguration
    console.warn(`[pipedrive] stage "${stage}" maps to null in STAGE_MAP`);
    return { stage_id: 1 };
  }
  return { stage_id: id };
}

// ---------------------------------------------------------------------------
// PipedriveSyncTarget — production adapter
// ---------------------------------------------------------------------------

type FetchImpl = typeof fetch;

/**
 * RFC-0386: P3 (Subscription & Lifecycle) stage map — maps subscription status to
 * a Pipedrive P3 pipeline stage_id. Tenant-specific; injected via credentials.
 */
export type P3StageMap = Partial<Record<SubscriptionStatus, number>>;

/**
 * RFC-0386: P4 (Change & Support) stage map — maps change-deal states to a
 * Pipedrive P4 pipeline stage_id. Tenant-specific; injected via credentials.
 */
export interface P4StageMap {
  change_requested?: number;
  payment_pending?: number;
  done?: number;
}

/** Pipedrive API credentials. */
export interface PipedriveCredentials {
  token: string;
  domain: string;
  /** RFC-0386: P3 pipeline stage ids for lifecycle deal moves. */
  p3StageMap?: P3StageMap;
  /** RFC-0386: P4 pipeline stage ids for change-deal moves. */
  p4StageMap?: P4StageMap;
}

/**
 * Pipedrive CRM sync target. Reads buffer rows via CrmBufferReader, syncs
 * to Pipedrive via REST API, and writes back Pipedrive IDs through the buffer.
 */
export class PipedriveSyncTarget implements CrmSyncTarget {
  private readonly creds: PipedriveCredentials;
  private readonly fetchImpl: FetchImpl;
  private readonly p3StageMap: P3StageMap;
  private readonly p4StageMap: P4StageMap;

  constructor(creds: PipedriveCredentials, fetchImpl: FetchImpl = fetch) {
    if (!creds.token || !creds.domain) {
      throw new Error("missing Pipedrive credentials");
    }
    this.creds = creds;
    this.fetchImpl = fetchImpl;
    this.p3StageMap = creds.p3StageMap ?? {};
    this.p4StageMap = creds.p4StageMap ?? {};
  }

  async syncContact(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void> {
    const contactId = task.payload.contact_id;
    if (typeof contactId !== "string") throw new Error("upsert_contact: missing contact_id");

    const contact = await buffer.getContact(task.tenant_id, contactId);
    if (!contact) throw new Error(`upsert_contact: contact ${contactId} not found`);

    const body = {
      name: contact.name ?? contact.email ?? "Unknown",
      ...(contact.email ? { email: [{ value: contact.email, primary: true }] } : {}),
      ...(contact.phone ? { phone: [{ value: contact.phone, primary: true }] } : {}),
    };

    if (contact.pipedrive_person_id) {
      await this.request(
        `https://${this.creds.domain}.pipedrive.com/api/v1/persons/${contact.pipedrive_person_id}`,
        "PUT",
        body,
      );
    } else {
      const res = await this.request(
        `https://${this.creds.domain}.pipedrive.com/api/v1/persons`,
        "POST",
        body,
      );
      const personId = (res as { data?: { id?: number } }).data?.id;
      if (personId) {
        await buffer.patchContactPipedriveId(task.tenant_id, contactId, personId);
      }
    }
  }

  async syncOrganization(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void> {
    const orgId = task.payload.organization_id;
    if (typeof orgId !== "string") throw new Error("upsert_organization: missing organization_id");

    const org = await buffer.getOrganization(task.tenant_id, orgId);
    if (!org) throw new Error(`upsert_organization: organization ${orgId} not found`);

    if (org.pipedrive_org_id) {
      await this.request(
        `https://${this.creds.domain}.pipedrive.com/api/v1/organizations/${org.pipedrive_org_id}`,
        "PUT",
        { name: org.name },
      );
    } else {
      const res = await this.request(
        `https://${this.creds.domain}.pipedrive.com/api/v1/organizations`,
        "POST",
        { name: org.name },
      );
      const pdOrgId = (res as { data?: { id?: number } }).data?.id;
      if (pdOrgId) {
        await buffer.patchOrganizationPipedriveId(task.tenant_id, orgId, pdOrgId);
      }
    }
  }

  async syncDeal(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void> {
    const dealId = task.payload.deal_id;
    if (typeof dealId !== "string") throw new Error("upsert_deal: missing deal_id");

    const deal = await buffer.getDeal(task.tenant_id, dealId);
    if (!deal) throw new Error(`upsert_deal: deal ${dealId} not found`);

    const contact = deal.contact_id
      ? await buffer.getContact(task.tenant_id, deal.contact_id)
      : null;
    const personId = contact?.pipedrive_person_id;

    // RFC-0190: resolve the linked Organization's Pipedrive id so the deal attaches to it.
    let orgId: number | undefined;
    if (deal.organization_id) {
      const org = await buffer.getOrganization(task.tenant_id, deal.organization_id);
      orgId = org?.pipedrive_org_id;
    }

    if (deal.pipedrive_deal_id) {
      await this.request(
        `https://${this.creds.domain}.pipedrive.com/api/v1/deals/${deal.pipedrive_deal_id}`,
        "PUT",
        {
          title: deal.title,
          ...(personId ? { person_id: personId } : {}),
          ...(orgId ? { org_id: orgId } : {}),
          ...(deal.value !== undefined ? { value: deal.value } : {}),
          ...resolvePipedriveStageUpdate(deal.stage),
        },
      );
    } else if (personId) {
      const res = await this.request(
        `https://${this.creds.domain}.pipedrive.com/api/v1/deals`,
        "POST",
        {
          title: deal.title,
          person_id: personId,
          ...(orgId ? { org_id: orgId } : {}),
          ...(deal.value !== undefined ? { value: deal.value } : {}),
        },
      );
      const pdDealId = (res as { data?: { id?: number } }).data?.id;
      if (pdDealId) {
        await buffer.patchDealPipedriveIds(task.tenant_id, dealId, {
          pipedrive_deal_id: pdDealId,
        });
      }
    } else {
      const res = await this.request(
        `https://${this.creds.domain}.pipedrive.com/api/v1/leads`,
        "POST",
        { title: deal.title },
      );
      const pdLeadId = (res as { data?: { id?: string } }).data?.id;
      if (pdLeadId) {
        await buffer.patchDealPipedriveIds(task.tenant_id, dealId, {
          pipedrive_lead_id: pdLeadId,
        });
      }
    }
  }

  async syncDealStage(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void> {
    const dealId = task.payload.deal_id;
    const toStage = task.payload.to_stage;
    if (typeof dealId !== "string") throw new Error("update_deal_stage: missing deal_id");
    if (typeof toStage !== "string") throw new Error("update_deal_stage: missing to_stage");

    const deal = await buffer.getDeal(task.tenant_id, dealId);
    if (!deal?.pipedrive_deal_id) return;

    await this.request(
      `https://${this.creds.domain}.pipedrive.com/api/v1/deals/${deal.pipedrive_deal_id}`,
      "PUT",
      resolvePipedriveStageUpdate(toStage) as Record<string, unknown>,
    );
  }

  // --- RFC-0386: Lifecycle sync (delta 5) ---

  /**
   * Map a subscription status to a P3 pipeline stage_id using the tenant's P3 stage map.
   * Returns undefined when no mapping is configured for the status (the deal stays put).
   */
  private resolveP3StageId(status: SubscriptionStatus): number | undefined {
    return this.p3StageMap[status];
  }

  /**
   * Resolve or create the P3 (Subscription & Lifecycle) deal linked to the
   * Organization. The buffer subscription row carries `pipedrive_deal_id` once
   * the P3 deal is created; subsequent syncs move the deal's stage.
   */
  async syncSubscription(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void> {
    const subscriptionId = task.payload.subscription_id;
    if (typeof subscriptionId !== "string") {
      throw new Error("upsert_subscription: missing subscription_id");
    }

    const sub = await buffer.getSubscription(task.tenant_id, subscriptionId);
    if (!sub) throw new Error(`upsert_subscription: subscription ${subscriptionId} not found`);

    const org = sub.organization_id
      ? await buffer.getOrganization(task.tenant_id, sub.organization_id)
      : null;
    const orgId = org?.pipedrive_org_id;

    const title = `P3: ${sub.plan} (${sub.stripe_subscription_id.slice(0, 12)})`;
    const stageId = this.resolveP3StageId(sub.status);

    if (sub.pipedrive_deal_id) {
      // Move the existing P3 deal's stage.
      const body: Record<string, unknown> = { title };
      if (orgId) body.org_id = orgId;
      if (stageId !== undefined) body.stage_id = stageId;
      await this.request(
        `https://${this.creds.domain}.pipedrive.com/api/v1/deals/${sub.pipedrive_deal_id}`,
        "PUT",
        body,
      );
    } else {
      // Create the P3 deal.
      const body: Record<string, unknown> = { title };
      if (orgId) body.org_id = orgId;
      if (stageId !== undefined) body.stage_id = stageId;
      const res = await this.request(
        `https://${this.creds.domain}.pipedrive.com/api/v1/deals`,
        "POST",
        body,
      );
      const pdDealId = (res as { data?: { id?: number } }).data?.id;
      if (pdDealId) {
        await buffer.patchSubscriptionPipedriveDealId(task.tenant_id, subscriptionId, pdDealId);
      }
    }
  }

  /**
   * Record an invoice against the P3/P4 deal. On a paid cycle invoice, reset
   * the subscription's `included_changes_balance` to `included_changes_per_cycle`.
   * A change invoice opens or moves a P4 change deal.
   */
  async syncInvoice(task: SyncOutboxRow, buffer: CrmBufferReader): Promise<void> {
    const invoiceId = task.payload.invoice_id;
    if (typeof invoiceId !== "string") {
      throw new Error("upsert_invoice: missing invoice_id");
    }

    const inv = await buffer.getInvoice(task.tenant_id, invoiceId);
    if (!inv) throw new Error(`upsert_invoice: invoice ${invoiceId} not found`);

    // Resolve the linked subscription and its P3 deal for balance reset.
    let sub: BufferSubscription | null = null;
    if (inv.subscription_id) {
      sub = await buffer.getSubscription(task.tenant_id, inv.subscription_id);
    }

    // On a paid cycle invoice, reset the included-changes balance to the per-cycle allowance.
    if (inv.kind === "cycle" && inv.status === "paid" && sub) {
      const perCycle = sub.included_changes_per_cycle;
      const current = sub.included_changes_balance;
      const delta = perCycle - current;
      if (delta !== 0) {
        await buffer.adjustChangeBalance(task.tenant_id, sub.id, delta);
      }
    }

    // Record the invoice as a note on the P3 deal (if linked).
    if (sub?.pipedrive_deal_id) {
      const noteBody = {
        content: `Invoice ${inv.stripe_invoice_id}: ${inv.kind} ${inv.amount_cents / 100} ${inv.currency} (${inv.status})`,
        deal_id: sub.pipedrive_deal_id,
      };
      await this.request(
        `https://${this.creds.domain}.pipedrive.com/api/v1/notes`,
        "POST",
        noteBody,
      );
    }

    // A change invoice opens or moves a P4 change deal.
    if (inv.kind === "change" && sub?.pipedrive_deal_id) {
      const p4StageId = this.p4StageMap.change_requested;
      const p4Body: Record<string, unknown> = {
        title: `P4: Change (${inv.stripe_invoice_id.slice(0, 12)})`,
        org_id: (await buffer.getOrganization(task.tenant_id, sub.organization_id))
          ?.pipedrive_org_id,
      };
      if (p4StageId !== undefined) p4Body.stage_id = p4StageId;
      await this.request(`https://${this.creds.domain}.pipedrive.com/api/v1/deals`, "POST", p4Body);
    }
  }

  // --- Internal ---

  private async request(
    url: string,
    method: "GET" | "POST" | "PUT",
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 500;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await this.fetchImpl(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.creds.token}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      if (res.ok) return res.json();

      // Retry on 429 (rate limit) and 5xx (server errors) with exponential backoff
      const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
      if (retryable && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[pipedrive] ${res.status} on ${method} ${url}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      const text = await res.text();
      throw new Error(`Pipedrive ${method} ${url}: ${res.status} ${text}`);
    }

    // Unreachable — loop always returns or throws
    throw new Error(`Pipedrive ${method} ${url}: exhausted retries`);
  }
}

// ---------------------------------------------------------------------------
// Factory: create a CrmSyncTarget by vendor name
// ---------------------------------------------------------------------------

/**
 * Create a CrmSyncTarget for the given vendor. Throws for unsupported vendors.
 * The sync worker calls this once per tenant to route outbox tasks.
 *
 * When a second vendor is added, extend this function with an additional
 * branch. A registry pattern is premature while there is only one vendor —
 * a simple function is easier to read, test, and type-check. The switch
 * will naturally emerge when there are 2+ vendors.
 */
export function createSyncTarget(
  vendor: string,
  creds: SyncTargetCredentials,
  fetchImpl: FetchImpl = fetch,
): CrmSyncTarget {
  if (vendor === "pipedrive") {
    return new PipedriveSyncTarget(
      {
        token: creds.destination_token,
        domain: creds.destination_domain,
        p3StageMap: creds.p3StageMap,
        p4StageMap: creds.p4StageMap,
      },
      fetchImpl,
    );
  }
  throw new Error(`unsupported vendor: ${vendor}`);
}
