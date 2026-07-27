/*
<MODULE_CONTRACT>
<purpose>RFC-0386: Unit tests for lifecycle sync (syncSubscription, syncInvoice).
Verifies P3 deal creation/linking, stage moves, invoice recording, change-balance
reset on paid cycles, and P4 change-deal opening. All tests use stubbed buffer
and fetch — no network calls.</purpose>
<non-goals>
  <item>No network calls — all Pipedrive API calls are stubbed.</item>
  <item>No real Supabase — buffer reads are stubbed via a fake CrmBufferReader.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0386: Initial lifecycle sync unit tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, vi } from "vitest";
import type {
  CrmBufferReader,
  SyncOutboxRow,
  BufferSubscription,
  BufferInvoice,
  BufferOrganization,
} from "@warpgogol/integration/crm-buffer";
import { PipedriveSyncTarget } from "../pipedrive-sync-target.ts";

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function makeFakeBuffer(
  overrides: {
    subscription?: Partial<BufferSubscription> & { id: string };
    invoice?: Partial<BufferInvoice> & { id: string };
    organization?: Partial<BufferOrganization> & { id: string };
  } = {},
): CrmBufferReader {
  const sub: BufferSubscription = {
    id: overrides.subscription?.id ?? "sub-1",
    tenant_id: "t1",
    organization_id: overrides.subscription?.organization_id ?? "org-1",
    deal_id: overrides.subscription?.deal_id ?? "deal-1",
    stripe_subscription_id: overrides.subscription?.stripe_subscription_id ?? "sub_stripe_123",
    status: overrides.subscription?.status ?? "active",
    plan: overrides.subscription?.plan ?? "base",
    mrr_cents: overrides.subscription?.mrr_cents ?? 7000,
    currency: overrides.subscription?.currency ?? "EUR",
    included_changes_balance: overrides.subscription?.included_changes_balance ?? 3,
    included_changes_per_cycle: overrides.subscription?.included_changes_per_cycle ?? 5,
    pipedrive_deal_id: overrides.subscription?.pipedrive_deal_id,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides.subscription,
  } as BufferSubscription;

  const inv: BufferInvoice = {
    id: overrides.invoice?.id ?? "inv-1",
    tenant_id: "t1",
    organization_id: overrides.invoice?.organization_id ?? "org-1",
    stripe_invoice_id: overrides.invoice?.stripe_invoice_id ?? "in_stripe_456",
    kind: overrides.invoice?.kind ?? "cycle",
    amount_cents: overrides.invoice?.amount_cents ?? 7000,
    currency: overrides.invoice?.currency ?? "EUR",
    status: overrides.invoice?.status ?? "paid",
    paid_at: overrides.invoice?.paid_at ?? "2026-01-01T00:00:00Z",
    subscription_id: overrides.invoice?.subscription_id ?? "sub-1",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides.invoice,
  } as BufferInvoice;

  const org: BufferOrganization = {
    id: overrides.organization?.id ?? "org-1",
    tenant_id: "t1",
    name: "Test Org",
    pipedrive_org_id: overrides.organization?.pipedrive_org_id ?? 999,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides.organization,
  } as BufferOrganization;

  return {
    readPendingOutbox: vi.fn(),
    updateOutboxStatus: vi.fn(),
    getContact: vi.fn(),
    getDeal: vi.fn(),
    getOrganization: vi.fn(async (_t: string, _id: string) => org),
    patchContactPipedriveId: vi.fn(),
    patchOrganizationPipedriveId: vi.fn(),
    patchDealPipedriveIds: vi.fn(),
    getSubscription: vi.fn(async (_t: string, _id: string) => sub),
    getInvoice: vi.fn(async (_t: string, _id: string) => inv),
    patchSubscriptionPipedriveDealId: vi.fn(),
    adjustChangeBalance: vi.fn(async () => 5),
  } as unknown as CrmBufferReader;
}

function makeTask(
  op: "upsert_subscription" | "upsert_invoice",
  payload: Record<string, unknown>,
): SyncOutboxRow {
  return {
    id: "task-1",
    tenant_id: "t1",
    op,
    payload,
    status: "pending",
    scheduled_at: "2026-01-01T00:00:00Z",
    retry_count: 0,
    max_retries: 5,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function makeFetchStub(): typeof fetch & {
  calls: Array<{ url: string; method: string; body?: unknown }>;
} {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const stub = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    const method = init?.method ?? "GET";
    let body: unknown;
    if (init?.body) {
      try {
        body = JSON.parse(init.body as string);
      } catch {
        body = init.body;
      }
    }
    calls.push({ url: urlStr, method, body });
    return new Response(JSON.stringify({ data: { id: 42 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch & { calls: Array<{ url: string; method: string; body?: unknown }> };
  stub.calls = calls;
  return stub;
}

// ---------------------------------------------------------------------------
// syncSubscription
// ---------------------------------------------------------------------------

test("syncSubscription creates P3 deal when no pipedrive_deal_id exists", async () => {
  const buffer = makeFakeBuffer({ subscription: { id: "sub-1", pipedrive_deal_id: undefined } });
  const fetchStub = makeFetchStub();
  const target = new PipedriveSyncTarget(
    { token: "tok", domain: "dom", p3StageMap: { active: 10, past_due: 11, canceled: 12 } },
    fetchStub,
  );

  await target.syncSubscription(
    makeTask("upsert_subscription", { subscription_id: "sub-1" }),
    buffer,
  );

  expect(fetchStub.calls).toHaveLength(1);
  expect(fetchStub.calls[0].method).toBe("POST");
  expect(fetchStub.calls[0].body).toMatchObject({ stage_id: 10 });
  expect(buffer.patchSubscriptionPipedriveDealId).toHaveBeenCalledWith("t1", "sub-1", 42);
});

test("syncSubscription moves P3 deal stage when pipedrive_deal_id exists", async () => {
  const buffer = makeFakeBuffer({
    subscription: { id: "sub-1", status: "past_due", pipedrive_deal_id: 99 },
  });
  const fetchStub = makeFetchStub();
  const target = new PipedriveSyncTarget(
    { token: "tok", domain: "dom", p3StageMap: { active: 10, past_due: 11, canceled: 12 } },
    fetchStub,
  );

  await target.syncSubscription(
    makeTask("upsert_subscription", { subscription_id: "sub-1" }),
    buffer,
  );

  expect(fetchStub.calls).toHaveLength(1);
  expect(fetchStub.calls[0].method).toBe("PUT");
  expect(fetchStub.calls[0].url).toContain("/deals/99");
  expect(fetchStub.calls[0].body).toMatchObject({ stage_id: 11 });
  expect(buffer.patchSubscriptionPipedriveDealId).not.toHaveBeenCalled();
});

test("syncSubscription throws on missing subscription_id", async () => {
  const buffer = makeFakeBuffer();
  const target = new PipedriveSyncTarget({ token: "tok", domain: "dom" }, makeFetchStub());

  await expect(
    target.syncSubscription(makeTask("upsert_subscription", {}), buffer),
  ).rejects.toThrow("missing subscription_id");
});

// ---------------------------------------------------------------------------
// syncInvoice
// ---------------------------------------------------------------------------

test("syncInvoice resets change balance on paid cycle invoice", async () => {
  const buffer = makeFakeBuffer({
    subscription: {
      id: "sub-1",
      included_changes_balance: 2,
      included_changes_per_cycle: 5,
      pipedrive_deal_id: 99,
    },
    invoice: { id: "inv-1", kind: "cycle", status: "paid", subscription_id: "sub-1" },
  });
  const fetchStub = makeFetchStub();
  const target = new PipedriveSyncTarget({ token: "tok", domain: "dom" }, fetchStub);

  await target.syncInvoice(makeTask("upsert_invoice", { invoice_id: "inv-1" }), buffer);

  // delta = 5 - 2 = 3
  expect(buffer.adjustChangeBalance).toHaveBeenCalledWith("t1", "sub-1", 3);
});

test("syncInvoice does not reset balance on non-paid invoice", async () => {
  const buffer = makeFakeBuffer({
    subscription: {
      id: "sub-1",
      included_changes_balance: 2,
      included_changes_per_cycle: 5,
      pipedrive_deal_id: 99,
    },
    invoice: { id: "inv-1", kind: "cycle", status: "open", subscription_id: "sub-1" },
  });
  const fetchStub = makeFetchStub();
  const target = new PipedriveSyncTarget({ token: "tok", domain: "dom" }, fetchStub);

  await target.syncInvoice(makeTask("upsert_invoice", { invoice_id: "inv-1" }), buffer);

  expect(buffer.adjustChangeBalance).not.toHaveBeenCalled();
});

test("syncInvoice does not reset balance on non-cycle invoice", async () => {
  const buffer = makeFakeBuffer({
    subscription: {
      id: "sub-1",
      included_changes_balance: 2,
      included_changes_per_cycle: 5,
      pipedrive_deal_id: 99,
    },
    invoice: { id: "inv-1", kind: "setup", status: "paid", subscription_id: "sub-1" },
  });
  const fetchStub = makeFetchStub();
  const target = new PipedriveSyncTarget({ token: "tok", domain: "dom" }, fetchStub);

  await target.syncInvoice(makeTask("upsert_invoice", { invoice_id: "inv-1" }), buffer);

  expect(buffer.adjustChangeBalance).not.toHaveBeenCalled();
});

test("syncInvoice opens P4 change deal for change invoice", async () => {
  const buffer = makeFakeBuffer({
    subscription: { id: "sub-1", pipedrive_deal_id: 99 },
    invoice: { id: "inv-1", kind: "change", status: "paid", subscription_id: "sub-1" },
  });
  const fetchStub = makeFetchStub();
  const target = new PipedriveSyncTarget(
    { token: "tok", domain: "dom", p4StageMap: { change_requested: 20 } },
    fetchStub,
  );

  await target.syncInvoice(makeTask("upsert_invoice", { invoice_id: "inv-1" }), buffer);

  // First call: note on P3 deal. Second call: P4 deal creation.
  expect(fetchStub.calls.length).toBeGreaterThanOrEqual(2);
  const p4Call = fetchStub.calls.find((c) => {
    const b = c.body as Record<string, unknown> | undefined;
    return (
      c.method === "POST" &&
      c.url.endsWith("/deals") &&
      typeof b?.title === "string" &&
      b.title.startsWith("P4")
    );
  });
  expect(p4Call).toBeDefined();
  expect(p4Call!.body).toMatchObject({ stage_id: 20 });
});

test("syncInvoice throws on missing invoice_id", async () => {
  const buffer = makeFakeBuffer();
  const target = new PipedriveSyncTarget({ token: "tok", domain: "dom" }, makeFetchStub());

  await expect(target.syncInvoice(makeTask("upsert_invoice", {}), buffer)).rejects.toThrow(
    "missing invoice_id",
  );
});
