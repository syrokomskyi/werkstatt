-- RFC-0188 / RFC-0190 / RFC-0191 — Lagebild buffer BASE schema.
--
-- This file creates the foundational tables assumed by all additive migrations.
-- Run FIRST in a fresh Supabase project, BEFORE funnel-phase3.sql, organizations.sql,
-- and subscriptions-invoices.sql.
--
-- Source of truth: @gogol/share/integration/crm-buffer.ts
-- Tenant isolation: every query sets app.current_tenant (x-set-config); RLS compares
-- against current_setting('app.current_tenant', true)::uuid.
-- Idempotent: safe to re-run (IF NOT EXISTS / IF EXISTS guards throughout).

-- ── Tenant registry (read by the sync worker to discover enabled tenants) ──────────────
create table if not exists public.sync_tenants (
  tenant_id   uuid primary key,
  site_name   text not null unique,
  enabled     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── buffer_contacts: one row per unique visitor/contact ───────────────────────────────
create table if not exists public.buffer_contacts (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  uchat_contact_id    text,
  name                text,
  email               text,
  phone               text,
  uchat_meta          jsonb,
  pipedrive_person_id bigint,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists buffer_contacts_tenant_uchat_idx
  on public.buffer_contacts (tenant_id, uchat_contact_id);
create index if not exists buffer_contacts_tenant_email_idx
  on public.buffer_contacts (tenant_id, email);

-- ── buffer_deals: one row per qualified conversation / deal (base columns only) ─────────
-- Additive migrations add: funnel_stage, offer_snapshot (funnel-phase3.sql),
-- organization_id (organizations.sql).
create table if not exists public.buffer_deals (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  contact_id          uuid not null references public.buffer_contacts (id) on delete cascade,
  title               text not null,
  stage               text not null,          -- BufferDealStage (bridged from funnel_stage)
  value               numeric,
  currency            text,
  last_actor          text not null,          -- uchat | pipedrive | manual
  pipedrive_deal_id   bigint,
  pipedrive_lead_id   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists buffer_deals_tenant_contact_idx
  on public.buffer_deals (tenant_id, contact_id);
create index if not exists buffer_deals_tenant_stage_idx
  on public.buffer_deals (tenant_id, stage);

-- ── buffer_stage_transitions: immutable audit log of every stage change ───────────────
create table if not exists public.buffer_stage_transitions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  deal_id       uuid not null references public.buffer_deals (id) on delete cascade,
  from_stage    text,                         -- null on deal creation
  to_stage      text not null,
  actor         text not null,                -- uchat | pipedrive | manual
  occurred_at   timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists buffer_stage_transitions_deal_idx
  on public.buffer_stage_transitions (tenant_id, deal_id, occurred_at);

-- ── sync_outbox: pending async tasks for the Pipedrive sync worker ────────────────────
create table if not exists public.sync_outbox (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  op            text not null,                -- upsert_contact | upsert_deal | update_deal_stage | upsert_organization
  payload       jsonb not null,
  status        text not null default 'pending',
  scheduled_at  timestamptz not null,
  processing_at timestamptz,
  resolved_at   timestamptz,
  retry_count   integer not null default 0,
  max_retries   integer not null default 3,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists sync_outbox_pending_idx
  on public.sync_outbox (tenant_id, status, scheduled_at)
  where status = 'pending';

-- ── Row Level Security: tenant isolation via app.current_tenant ───────────────────────
alter table public.sync_tenants            enable row level security;
alter table public.buffer_contacts         enable row level security;
alter table public.buffer_deals            enable row level security;
alter table public.buffer_stage_transitions enable row level security;
alter table public.sync_outbox             enable row level security;

drop policy if exists sync_tenants_tenant on public.sync_tenants;
create policy sync_tenants_tenant on public.sync_tenants
  using (tenant_id = current_setting('app.current_tenant', true)::uuid)
  with check (tenant_id = current_setting('app.current_tenant', true)::uuid);

drop policy if exists buffer_contacts_tenant on public.buffer_contacts;
create policy buffer_contacts_tenant on public.buffer_contacts
  using (tenant_id = current_setting('app.current_tenant', true)::uuid)
  with check (tenant_id = current_setting('app.current_tenant', true)::uuid);

drop policy if exists buffer_deals_tenant on public.buffer_deals;
create policy buffer_deals_tenant on public.buffer_deals
  using (tenant_id = current_setting('app.current_tenant', true)::uuid)
  with check (tenant_id = current_setting('app.current_tenant', true)::uuid);

drop policy if exists buffer_stage_transitions_tenant on public.buffer_stage_transitions;
create policy buffer_stage_transitions_tenant on public.buffer_stage_transitions
  using (tenant_id = current_setting('app.current_tenant', true)::uuid)
  with check (tenant_id = current_setting('app.current_tenant', true)::uuid);

drop policy if exists sync_outbox_tenant on public.sync_outbox;
create policy sync_outbox_tenant on public.sync_outbox
  using (tenant_id = current_setting('app.current_tenant', true)::uuid)
  with check (tenant_id = current_setting('app.current_tenant', true)::uuid);
