# `@warpgogol/integration-adapter-supabase-crm` — Agent Guide

Supabase CRM buffer `DestinationAdapter` — the Lagebild MVP (RFC-0176, RFC-0186).

## What it does

Receives an `IntegrationEvent` from the delivery callback and writes it into the Supabase CRM buffer:

1. **Upsert contact** — dedup by `uchat_contact_id`
2. **Resolve organization** (RFC-0190) — from funnel event's `organization` payload
3. **Upsert deal** — with `contact_id`, optional `organization_id`, title, stage, value
4. **Append stage transition** — full audit trail
5. **Queue outbox tasks** — for async Pipedrive sync (organization syncs BEFORE deal)
6. **Lifecycle sync** (RFC-0386) — `persistLifecycleEvent` enqueues `upsert_subscription` / `upsert_invoice` outbox tasks alongside buffer writes

## Architecture

The package has three layers:

- **Adapter** (`adapter.ts`) — implements `DestinationAdapter`, depends on `CrmBufferWriter` (write-side port).
- **Buffer client** (`client.ts`) — `SupabaseCrmBufferClient` implements both `CrmBufferWriter` and `CrmBufferReader` via Supabase REST API.
- **Sync target** (`pipedrive-sync-target.ts`) — `CrmSyncTarget` port + `PipedriveSyncTarget` adapter. The sync worker routes outbox tasks here by `destination_vendor`.

### Port split

`CrmBufferClient` is split into:

- `CrmBufferWriter` — adapter-side: upserts, appends, outbox writes.
- `CrmBufferReader` — worker-side: single-row reads (`getContact`, `getDeal`, `getOrganization`, `getSubscription`, `getInvoice`), outbox status, patch-back (`patchContactPipedriveId`, `patchOrganizationPipedriveId`, `patchDealPipedriveIds`, `patchSubscriptionPipedriveDealId`, `adjustChangeBalance`).
- `CrmBufferClient = CrmBufferWriter & CrmBufferReader` — backward-compat combined type.

## Rules for AI agents

- Do NOT call Pipedrive directly from this adapter. The sync worker reads the outbox and does that.
- Do NOT import `astro:env` — secrets arrive via the `IntegrationSecrets` bag.
- Required secrets: `SUPABASE_BUFFER_URL`, `SUPABASE_BUFFER_SERVICE_KEY`, `SUPABASE_BUFFER_TENANT_ID`.
- When BOTH this adapter AND the direct Pipedrive adapter are active, `integration.config.validate` reports `"multiple-active-executors"` for `(kind=crm)`. Choose one, never both.
- `kind = "crm"`, `vendor = "supabase-buffer"`.
- Pipedrive-specific logic (API calls, stage mapping) lives in `pipedrive-sync-target.ts`, NOT in `worker.ts`.
- RFC-0386: `syncSubscription` / `syncInvoice` handle P3/P4 lifecycle sync. P3/P4 stage ids are tenant-specific — injected via `p3StageMap` / `p4StageMap` on `PipedriveCredentials`, resolved from `SyncTenant.p3_stage_map` / `p4_stage_map` registry JSON columns.
- RFC-0386: Change-balance reset on paid cycle invoices uses `adjustChangeBalance` with delta = `perCycle - current`. Decrement is clamped to zero (non-negative invariant, DNA-41).

## Related packages

| Package | Role |
| --- | --- |
| `@warpgogol/share/integration` | `DestinationAdapter`, `IntegrationEvent`, `CrmBufferWriter`/`CrmBufferReader` contracts, `SyncOutboxOp` catalog |
| `services/lagebild-sync-worker/` | The async Pipedrive sync worker (thin orchestrator → `CrmSyncTarget`) |
| `@warpgogol/integration-adapter-stripe` | Stripe webhook → `IntegrationEvent` mapping (delta 6 verification) |

## Validation

```sh
rtk pnpm --filter @warpgogol/integration-adapter-supabase-crm build:check
```
