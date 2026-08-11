-- RFC-0190 — Organizations & the multi-site client graph (Lagebild buffer extension).
--
-- Source of truth for these shapes is @gogol/share/integration/crm-buffer.ts; this file is
-- the DDL mirror. ADDITIVE and idempotent: it adds buffer_organizations and a nullable
-- buffer_deals.organization_id so existing rows and the Pipedrive sync keep working.
-- One Person (buffer_contacts) → many Deals; each Deal → one Organization.
--
-- PREREQUISITE: funnel-base.sql (creates buffer_contacts, buffer_deals, etc.).
--
-- Tenant isolation mirrors the client: every query sets `app.current_tenant`
-- (x-set-config), so RLS compares against current_setting('app.current_tenant').

-- ── buffer_organizations: the target company a site is for ───────────────────────────
create table if not exists public.buffer_organizations (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  name               text not null,            -- display name (target company)
  legal_name         text,                     -- for Impressum / invoicing
  industry           text,
  region             text,
  pipedrive_org_id   bigint,                   -- set after first Pipedrive sync
  stripe_customer_id text,                     -- set by RFC-0191 billing (billed entity)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Dedup: prefer legal_name when present, else name (both tenant-scoped). Partial unique
-- indexes so a null legal_name does not collide.
create unique index if not exists buffer_organizations_legal_uq
  on public.buffer_organizations (tenant_id, legal_name) where legal_name is not null;
create unique index if not exists buffer_organizations_name_uq
  on public.buffer_organizations (tenant_id, name) where legal_name is null;

-- ── buffer_deals.organization_id: additive, nullable link to the target company ──────
alter table if exists public.buffer_deals
  add column if not exists organization_id uuid references public.buffer_organizations (id);

create index if not exists buffer_deals_org_idx
  on public.buffer_deals (tenant_id, organization_id);

-- ── Row Level Security: tenant isolation via app.current_tenant ──────────────────────
alter table public.buffer_organizations enable row level security;

drop policy if exists buffer_organizations_tenant on public.buffer_organizations;
create policy buffer_organizations_tenant on public.buffer_organizations
  using (tenant_id = current_setting('app.current_tenant', true)::uuid)
  with check (tenant_id = current_setting('app.current_tenant', true)::uuid);
