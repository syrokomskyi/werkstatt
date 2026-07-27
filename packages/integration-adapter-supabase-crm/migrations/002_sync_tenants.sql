-- RFC-0186: Lagebild shared sync worker tenant registry
-- Migration: 002_sync_tenants
--
-- The base sync_tenants table is created by funnel-base.sql (RFC-0188/0190/0191)
-- with minimal columns (tenant_id, site_name, enabled, created_at, updated_at).
-- This migration adds the RFC-0186 tenant registry columns: secret references,
-- vendor config, cron group, batch/concurrency settings, and health tracking.
--
-- Idempotent: uses ADD COLUMN IF NOT EXISTS. Safe to re-run.

-- Add RFC-0186 columns to the existing sync_tenants table.
alter table public.sync_tenants
  add column if not exists supabase_project_ref text,
  add column if not exists supabase_url_secret_ref text,
  add column if not exists supabase_service_key_secret_ref text,
  add column if not exists destination_vendor text not null default 'pipedrive',
  add column if not exists destination_token_secret_ref text,
  add column if not exists destination_domain_secret_ref text,
  add column if not exists cron_group text not null default 'default',
  add column if not exists batch_size integer not null default 100 check (batch_size > 0 and batch_size <= 1000),
  add column if not exists max_concurrency integer not null default 1 check (max_concurrency > 0 and max_concurrency <= 10),
  add column if not exists circuit_breaker_threshold integer not null default 5 check (circuit_breaker_threshold > 0),
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_error_at timestamptz,
  add column if not exists last_error text;

-- Backfill NOT NULL columns for any pre-existing rows.
update public.sync_tenants
  set supabase_project_ref = ''
  where supabase_project_ref is null;

update public.sync_tenants
  set supabase_url_secret_ref = ''
  where supabase_url_secret_ref is null;

update public.sync_tenants
  set supabase_service_key_secret_ref = ''
  where supabase_service_key_secret_ref is null;

update public.sync_tenants
  set destination_token_secret_ref = ''
  where destination_token_secret_ref is null;

update public.sync_tenants
  set destination_domain_secret_ref = ''
  where destination_domain_secret_ref is null;

-- Enforce NOT NULL after backfill.
alter table public.sync_tenants
  alter column supabase_project_ref set not null,
  alter column supabase_url_secret_ref set not null,
  alter column supabase_service_key_secret_ref set not null,
  alter column destination_token_secret_ref set not null,
  alter column destination_domain_secret_ref set not null;

-- Drop the tenant-isolation RLS policy from funnel-base.sql; the registry
-- is platform-level metadata read by the shared worker with the service key.
drop policy if exists sync_tenants_tenant on public.sync_tenants;

-- Allow service role full access (Worker uses service key).
create policy "service_role_all" on public.sync_tenants
  for all
  to service_role
  using (true)
  with check (true);

-- Updated_at trigger (reuses existing function if available).
do $outer$
begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
    create or replace function public.set_updated_at()
    returns trigger as $func$
    begin
      new.updated_at = now();
      return new;
    end;
    $func$ language plpgsql;
  end if;
end $outer$;

drop trigger if exists sync_tenants_updated_at on public.sync_tenants;
create trigger sync_tenants_updated_at
  before update on public.sync_tenants
  for each row
  execute function public.set_updated_at();
