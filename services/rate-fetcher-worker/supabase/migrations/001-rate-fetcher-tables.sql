-- RFC-0744 — Rate Fetcher Service Supabase schema.
--
-- Creates tables for rate sources, rate observations, health, and locks.
-- ADDITIVE and idempotent: uses IF NOT EXISTS everywhere.
--
-- Tenant isolation mirrors the Lagebild pattern: every query sets
-- `app.current_tenant` (set_config), so RLS compares against
-- current_setting('app.current_tenant').
--
-- PREREQUISITE: Supabase project with auth.users and public.tenants (or equivalent).

-- ── rate_sources: registered rate source configurations per tenant ──────────────────
create table if not exists public.rate_sources (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  site_name       text not null,
  source_name     text not null,           -- e.g. "ecb-primary"
  adapter         text not null,            -- e.g. "ecb"
  config          jsonb not null default '{}',
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists rate_sources_tenant_name_uq
  on public.rate_sources (tenant_id, source_name);

create index if not exists rate_sources_tenant_enabled_idx
  on public.rate_sources (tenant_id, enabled);

-- ── rate_observations: fetched rate values ──────────────────────────────────────────
create table if not exists public.rate_observations (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  site_name       text not null,
  source_id       uuid not null references public.rate_sources (id),
  source_currency text not null,
  target_currency text not null,
  value           text not null,            -- decimal string (ADR-012)
  observed_at     timestamptz not null,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists rate_obs_tenant_pair_idx
  on public.rate_observations (tenant_id, source_currency, target_currency, observed_at desc);

create index if not exists rate_obs_source_idx
  on public.rate_observations (source_id, observed_at desc);

-- ── rate_fetcher_health: per-tenant health tracking ─────────────────────────────────
create table if not exists public.rate_fetcher_health (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  site_name       text not null,
  last_seen_at    timestamptz,
  last_success_at timestamptz,
  last_error_at   timestamptz,
  last_error      text
);

create unique index if not exists rate_fetcher_health_tenant_uq
  on public.rate_fetcher_health (tenant_id, site_name);

-- ── rate_fetcher_locks: distributed lock for cron deduplication ─────────────────────
create table if not exists public.rate_fetcher_locks (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  lock_key        text not null,            -- e.g. "daily-fetch"
  locked_at       timestamptz not null default now(),
  expires_at      timestamptz not null
);

create unique index if not exists rate_fetcher_locks_tenant_key_uq
  on public.rate_fetcher_locks (tenant_id, lock_key);

-- ── Row Level Security: tenant isolation via app.current_tenant ──────────────────────
alter table public.rate_sources enable row level security;
alter table public.rate_observations enable row level security;
alter table public.rate_fetcher_health enable row level security;
alter table public.rate_fetcher_locks enable row level security;

drop policy if exists rate_sources_tenant on public.rate_sources;
create policy rate_sources_tenant on public.rate_sources
  using (tenant_id = current_setting('app.current_tenant', true)::uuid)
  with check (tenant_id = current_setting('app.current_tenant', true)::uuid);

drop policy if exists rate_observations_tenant on public.rate_observations;
create policy rate_observations_tenant on public.rate_observations
  using (tenant_id = current_setting('app.current_tenant', true)::uuid)
  with check (tenant_id = current_setting('app.current_tenant', true)::uuid);

drop policy if exists rate_fetcher_health_tenant on public.rate_fetcher_health;
create policy rate_fetcher_health_tenant on public.rate_fetcher_health
  using (tenant_id = current_setting('app.current_tenant', true)::uuid)
  with check (tenant_id = current_setting('app.current_tenant', true)::uuid);

drop policy if exists rate_fetcher_locks_tenant on public.rate_fetcher_locks;
create policy rate_fetcher_locks_tenant on public.rate_fetcher_locks
  using (tenant_id = current_setting('app.current_tenant', true)::uuid)
  with check (tenant_id = current_setting('app.current_tenant', true)::uuid);
