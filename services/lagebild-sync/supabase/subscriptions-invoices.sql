-- RFC-0191 — Client lifecycle & billing buffer (subscriptions + invoices).
--
-- Source of truth for these shapes is @gogol/share/integration/crm-buffer.ts; this file is
-- the DDL mirror. Stripe is the billing authority; these tables mirror it (amounts in
-- cents, never recomputed). Attaches to buffer_organizations (RFC-0190) and buffer_deals.
-- Tenant isolation via app.current_tenant (x-set-config). Idempotent.
--
-- Prerequisite: funnel-base.sql → organizations.sql (RFC-0190) — buffer_organizations must exist.

-- ── buffer_subscriptions: the recurring MRR anchor ───────────────────────────────────
create table if not exists public.buffer_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null,
  organization_id          uuid not null references public.buffer_organizations (id),
  deal_id                  uuid not null references public.buffer_deals (id),
  stripe_subscription_id   text not null,
  status                   text not null,   -- active | past_due | canceled | paused
  plan                     text not null,   -- digital_foundation_monthly | _yearly
  mrr_cents                bigint not null default 0,
  currency                 text not null default 'EUR',
  current_period_end       timestamptz,
  included_changes_balance integer not null default 0,
  included_changes_per_cycle integer not null default 0,  -- reset target each cycle (spec §08)
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint buffer_subscriptions_stripe_uq unique (tenant_id, stripe_subscription_id)
);

create index if not exists buffer_subscriptions_org_idx
  on public.buffer_subscriptions (tenant_id, organization_id);

-- ── buffer_invoices: append-only invoice mirror ──────────────────────────────────────
create table if not exists public.buffer_invoices (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  organization_id   uuid not null references public.buffer_organizations (id),
  deal_id           uuid references public.buffer_deals (id),
  subscription_id   uuid references public.buffer_subscriptions (id),
  stripe_invoice_id text not null,
  kind              text not null,   -- setup | cycle | change | adhoc
  amount_cents      bigint not null,
  currency          text not null default 'EUR',
  status            text not null,   -- open | paid | uncollectible | void
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  -- Idempotency: a Stripe webhook redelivery must not double-record.
  constraint buffer_invoices_stripe_uq unique (tenant_id, stripe_invoice_id)
);

create index if not exists buffer_invoices_org_idx
  on public.buffer_invoices (tenant_id, organization_id, created_at);

-- ── Row Level Security: tenant isolation via app.current_tenant ──────────────────────
alter table public.buffer_subscriptions enable row level security;
alter table public.buffer_invoices      enable row level security;

drop policy if exists buffer_subscriptions_tenant on public.buffer_subscriptions;
create policy buffer_subscriptions_tenant on public.buffer_subscriptions
  using (tenant_id = current_setting('app.current_tenant', true)::uuid)
  with check (tenant_id = current_setting('app.current_tenant', true)::uuid);

drop policy if exists buffer_invoices_tenant on public.buffer_invoices;
create policy buffer_invoices_tenant on public.buffer_invoices
  using (tenant_id = current_setting('app.current_tenant', true)::uuid)
  with check (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Append-only guarantee: invoices must never be updated or deleted by app roles.
revoke update, delete on public.buffer_invoices from anon, authenticated;
