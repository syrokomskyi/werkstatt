# @gogol/integration-adapter-supabase-crm

Supabase CRM buffer `DestinationAdapter` — the Lagebild MVP (RFC-0176, RFC-0186).

## Purpose

Receives an `IntegrationEvent` from the delivery callback and writes it into the Supabase CRM buffer. Does NOT call Pipedrive directly — the async sync worker reads the outbox and handles Pipedrive synchronization.

## Architecture

Three layers:

- **Adapter** (`adapter.ts`) — implements `DestinationAdapter`, depends on `CrmBufferWriter`.
- **Buffer client** (`client.ts`) — `SupabaseCrmBufferClient` implements `CrmBufferWriter` + `CrmBufferReader` via Supabase REST.
- **Sync target** (`pipedrive-sync-target.ts`) — `CrmSyncTarget` port + `PipedriveSyncTarget` adapter. Worker routes outbox tasks here by `destination_vendor`.

`CrmBufferClient` is split into `CrmBufferWriter` (adapter-side) and `CrmBufferReader` (worker-side). The combined type is preserved as `CrmBufferClient = CrmBufferWriter & CrmBufferReader`.

## Pipeline

1. Upsert contact (dedup by `uchat_contact_id`)
2. Resolve organization (RFC-0190) from funnel event
3. Upsert deal (with contact_id, optional organization_id, title, stage, value)
4. Append stage transition (full audit trail)
5. Queue outbox tasks for async Pipedrive sync

## Required secrets

- `SUPABASE_BUFFER_URL` — Supabase project URL
- `SUPABASE_BUFFER_SERVICE_KEY` — Service role key (server-only)
- `SUPABASE_BUFFER_TENANT_ID` — Client UUID for RLS isolation

## Related

| Package | Role |
| --- | --- |
| `@gogol/share/integration` | `DestinationAdapter`, `IntegrationEvent`, `CrmBufferWriter`/`CrmBufferReader` contracts |
| `services/lagebild-sync-worker/` | Async Pipedrive sync worker (thin orchestrator → `CrmSyncTarget`) |

## Validation

```sh
pnpm --filter @gogol/integration-adapter-supabase-crm build:check
```
