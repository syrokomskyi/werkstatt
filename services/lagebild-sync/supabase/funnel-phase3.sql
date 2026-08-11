-- RFC-0188 Phase 3 — Lagebild buffer schema extension (canonical funnel persistence).
--
-- Source of truth for these shapes is @gogol/share/integration/crm-buffer.ts; this
-- file is the DDL mirror.
--
-- PREREQUISITE: funnel-base.sql must be applied FIRST in a fresh project.
-- It creates buffer_contacts, buffer_deals, buffer_stage_transitions, sync_outbox.
-- This migration is ADDITIVE: it bridges, never replaces — existing deals keep working
-- on the generic `stage`, and the Pipedrive sync worker (STAGE_MAP in worker.ts)
-- is unaffected.
--
-- Tenant isolation mirrors the client: every query sets `app.current_tenant`
-- (x-set-config), so RLS policies compare against current_setting('app.current_tenant').
-- Idempotent: safe to re-run (IF NOT EXISTS / IF EXISTS guards throughout).

-- ── buffer_deals: additive canonical funnel stage + deal-time offer snapshot ─────────
alter table if exists public.buffer_deals
  add column if not exists funnel_stage  text,           -- VisitorFunnelStage (canonical; bridged to `stage`)
  add column if not exists offer_snapshot jsonb;          -- frozen at offer.selected (never re-priced)

-- ── buffer_funnel_events: append-only typed funnel-event snapshots ───────────────────
create table if not exists public.buffer_funnel_events (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  deal_id         uuid not null references public.buffer_deals (id) on delete cascade,
  idempotency_key text not null,                          -- source IntegrationEvent.eventId
  event_kind      text not null,                          -- VisitorFunnelEventKind
  funnel_version  text not null,
  from_stage      text,                                   -- VisitorFunnelStage
  to_stage        text,                                   -- VisitorFunnelStage
  payload         jsonb not null,                         -- frozen VisitorFunnelEventPayload
  actor           text not null,                          -- uchat | stripe | operator | send-message
  occurred_at     timestamptz not null,
  created_at      timestamptz not null default now(),
  -- Idempotency: a UChat webhook retry must not create a second row.
  constraint buffer_funnel_events_idem unique (tenant_id, idempotency_key)
);

create index if not exists buffer_funnel_events_deal_idx
  on public.buffer_funnel_events (tenant_id, deal_id, occurred_at);

-- ── buffer_consent_events: append-only legal-consent evidence (never overwritten) ────
create table if not exists public.buffer_consent_events (
  id                              uuid primary key default gen_random_uuid(),
  tenant_id                       uuid not null,
  deal_id                         uuid not null references public.buffer_deals (id) on delete cascade,
  buyer_type                      text not null,          -- business | consumer
  consent_kind                    text not null,          -- b2b_start_before_completion | b2c_withdrawal_acknowledged
  start_before_withdrawal_period  boolean,
  withdrawal_expiry_acknowledged  boolean,
  locale                          text not null,
  occurred_at                     timestamptz not null,
  created_at                      timestamptz not null default now()
);

create index if not exists buffer_consent_events_deal_idx
  on public.buffer_consent_events (tenant_id, deal_id, occurred_at);

-- ── Row Level Security: tenant isolation via app.current_tenant ──────────────────────
alter table public.buffer_funnel_events  enable row level security;
alter table public.buffer_consent_events enable row level security;

drop policy if exists buffer_funnel_events_tenant on public.buffer_funnel_events;
create policy buffer_funnel_events_tenant on public.buffer_funnel_events
  using (tenant_id = current_setting('app.current_tenant', true)::uuid)
  with check (tenant_id = current_setting('app.current_tenant', true)::uuid);

drop policy if exists buffer_consent_events_tenant on public.buffer_consent_events;
create policy buffer_consent_events_tenant on public.buffer_consent_events
  using (tenant_id = current_setting('app.current_tenant', true)::uuid)
  with check (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Append-only guarantee: consent rows must never be updated or deleted.
revoke update, delete on public.buffer_consent_events from anon, authenticated;
