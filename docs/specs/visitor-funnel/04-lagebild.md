# 04 — Lagebild (Supabase buffer) setup

> Lagebild is the **canonical state** between UChat and Pipedrive: it records the stage, captured fields, offer snapshot, and consent — and a sync worker drains it to Pipedrive. No vendor owns this state.

## Tables

| Table | Status | Holds |
| --- | --- | --- |
| `buffer_contacts` | ✅ | the Person (orderer); dedup by `uchat_contact_id`/email |
| `buffer_deals` | ✅ + Ph3 cols | one deal per site; `stage` (generic, synced) + `funnel_stage` (canonical) + `offer_snapshot` |
| `buffer_stage_transitions` | ✅ | append-only stage audit |
| `buffer_funnel_events` | ✅ Ph3 | append-only typed funnel-event snapshots (idempotency-keyed) |
| `buffer_consent_events` | ✅ Ph3 | append-only legal-consent evidence (never overwritten) |
| `sync_outbox` | ✅ | pending Pipedrive sync tasks |
| `buffer_organizations` | 🔭 RFC-0190 | the target company; `deal.organization_id` links it |
| `buffer_subscriptions`, `buffer_invoices` | 🔭 RFC-0191 | Stripe subscription/invoice mirror for the lifecycle pipelines |

## Apply the schema

The base tables (contacts/deals/transitions/outbox) are provisioned for the pilot. Apply the RFC-0188 Phase-3 additions:

```sh
# In the Supabase SQL editor (or psql) for the buffer project:
\i services/lagebild-sync-worker/supabase/funnel-phase3.sql
```

This is additive and idempotent: it adds `buffer_deals.funnel_stage` + `offer_snapshot`, creates `buffer_funnel_events` + `buffer_consent_events`, enables tenant RLS via `app.current_tenant`, and revokes update/delete on consent rows (append-only guarantee).

> 🔭 The `buffer_organizations` and `buffer_subscriptions`/`buffer_invoices` migrations ship with RFC-0190 / RFC-0191. Do not hand-create them ahead of those RFCs — the contracts and RLS must come from governed code.

## Tenant registry & secrets

Register `webgogol-com` as a tenant and set its secrets (the sync worker resolves them per tenant — RFC-0186):

```sh
rtk pnpm exec werkstatt run lagebild.tenant.add --site webgogol-com
# → prints the secret names to set, then:
rtk wrangler secret put TENANT_WEBGOGOL_COM_SUPABASE_URL
rtk wrangler secret put TENANT_WEBGOGOL_COM_SUPABASE_SERVICE_KEY
rtk wrangler secret put TENANT_WEBGOGOL_COM_PIPEDRIVE_TOKEN
rtk wrangler secret put TENANT_WEBGOGOL_COM_PIPEDRIVE_DOMAIN
rtk pnpm exec werkstatt run lagebild.tenant.enable --site webgogol-com
```

The **site adapter** (writing into the buffer) needs, in the site's own env:

```
SUPABASE_BUFFER_URL
SUPABASE_BUFFER_SERVICE_KEY
SUPABASE_BUFFER_TENANT_ID     # the tenant UUID for webgogol-com
```

Never put the service key in markdown, the tenant registry rows, or UChat config.

## Sync worker

One **shared** worker (`services/lagebild-sync-worker`) drains every tenant's `sync_outbox` to Pipedrive — there are no per-site workers (`lagebild.validate` enforces this). Generate and check its dev vars, then deploy:

```sh
rtk pnpm exec werkstatt run lagebild.worker.dev.vars.generate
rtk pnpm exec werkstatt run lagebild.worker.dev.vars.validate     # leak guard: values must be empty
rtk pnpm exec werkstatt run lagebild.validate                     # no per-site workers; dev.vars clean
# deploy:
rtk bash -c 'cd services/lagebild-sync-worker && wrangler deploy'
```

The worker maps the generic `stage` → Pipedrive `stage_id` (`STAGE_MAP`). 🔭 RFC-0190/0191 extend it to also sync the Organization, the linked P2/P3 deals, the `funnel_stage` custom field, the Stripe ids, and the change balance. Until then it syncs Person + one Deal + stage, which is enough for the pilot create-site board.

## Data residency & privacy

- Inbound events transit **EU-only** (Upstash QStash EU; RFC-0181). QStash holds events in-flight only — never a datastore (RFC-0177).
- The buffer is the durable PII store; keep the Supabase project in the EU.
- No cookies anywhere; client-side persistence (if any) is `localStorage` only (RFC-0177).
- Consent rows are append-only and update/delete-revoked for `anon`/`authenticated`.
