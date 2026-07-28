---
id: RFC-0190
title: "Model organizations and the multi-site client graph in Lagebild"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-12
updatedAt: 2026-06-12
implementedAt: 2026-06-12
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0186
  - RFC-0188
amendedBy: []
related:
  - RFC-0168
  - RFC-0176
  - RFC-0191
commands:
  proposed:
    - funnel.org.validate
  added:
    - funnel.org.validate
  changed:
    - funnel.lagebild.validate
    - lagebild.validate
  removed: []
appsImpacted:
  - apps/*
  - apps/warpgogol-com
packagesImpacted:
  - packages/share
  - packages/integration-adapter-supabase-crm
  - packages/os/site-kernel-checks
successSignals:
  - "One Client (Person) can order many sites — for their own companies and for others — and every deal is attributed to the correct target Organization, so a manager opening the Person sees the real, complete picture."
  - "The Organization is a first-class entity in the Lagebild buffer and in Pipedrive, linked from each deal; it is never inferred from a free-text deal title or duplicated per deal."
  - "Stripe billing, subscriptions, and invoices attach to the Organization (the billed company), so a Person ordering for three companies produces clean per-company books."
  - "The funnel event already carries organization identity; the adapter resolves-or-creates the Organization and links the deal with zero extra visitor questions beyond 'for which company is this site?'."
nonGoals:
  - "Do not introduce a studio-central CRM; the Organization lives in the tenant-scoped Lagebild buffer and is mirrored to the tenant's Pipedrive (RFC-0176/0186 posture)."
  - "Do not require an Organization on legacy/pre-existing deals; organization_id is additive and nullable so existing rows keep working."
  - "Do not model org hierarchies, parent/child companies, or per-seat org membership in this RFC — only Person → N Deals → one Organization per deal."
  - "Do not implement before this RFC is accepted."
---

# RFC-0190: Model organizations and the multi-site client graph in Lagebild

## Context

RFC-0188 established a platform-owned visitor sales funnel whose canonical state lives in the Lagebild buffer (RFC-0186): `buffer_contacts` (the Person), `buffer_deals` (one deal per site), append-only transitions, funnel-event snapshots, and consent evidence. The Phase-3 schema already persists a precise `funnel_stage`, an offer snapshot, and consent rows.

The pilot's operational reality — captured in `docs/specs/visitor-funnel/` — is that a single Client orders **multiple sites**: for their own company, and for other companies (a friend's café, a sister business). The legacy implementation expressed this in Pipedrive by linking one Person to multiple Deals, but it had **no first-class Organization**: the target company was an implicit string. Managers asked to see the _real_ picture — which sites, for which companies, driven by which Person.

`VisitorFunnelEventPayload` already carries an `organization` object (`{ id?, name? }`), and the UChat funnel asks "for which company is this site?" (qualification step 2.0). But the buffer has nowhere to put it: `buffer_deals` has no `organization_id`, and there is no `buffer_organizations` table.

## Problem

Without a first-class Organization in the buffer:

- the target company is reduced to free text in the deal title, so reporting and grouping by company are impossible;
- a Person who orders for three companies produces three unlinked deals with no company attribution;
- Stripe billing (RFC-0191) has no stable company entity to attach a Customer/subscription to;
- Pipedrive cannot show the manager-requested "Person → N Deals → Organization" graph because the platform never sends an Organization;
- the `organization` field already present on funnel events is silently dropped, a latent data-loss gap.

This is the **multi-site client graph** gap: the model the studio actually runs (and wants to sell to clients) is not representable in the canonical state.

## Decision

Introduce the **Organization** as a first-class entity in the Lagebild buffer and link every deal to it. The client graph becomes explicit and platform-owned:

1. **`buffer_organizations`** is a new tenant-scoped table: the target company a site is for.
2. **`buffer_deals.organization_id`** is an additive, nullable foreign key to it.
3. The relationship is **Person (orderer) → N Deals → one Organization per deal**. A Person relates to many Organizations _through_ their deals; no separate membership join table is introduced.
4. The supabase-buffer adapter **resolves-or-creates** the Organization from the funnel event's `organization` field and sets `deal.organization_id` — no new visitor question beyond the existing "for which company?".
5. The shared sync worker mirrors the Organization to the tenant's **Pipedrive Organization**, links the Deal to it, and links the orderer Person — reproducing the legacy "one Person, many Deals, attributed to companies" picture as governed code.
6. Stripe billing (RFC-0191) attaches the **Customer/subscription to the Organization** (the billed company), keeping per-company books clean.

The Organization lives in the **tenant-scoped** buffer and the tenant's Pipedrive — never a studio-central CRM (RFC-0176/0186 posture is preserved).

## Architectural fit

- **RFC-0186:** extends the buffer contracts (`@gogol/share/integration/crm-buffer.ts`) and the shared sync worker. No per-site workers; the Organization syncs through the same `sync_outbox` mechanism with a new `upsert_organization` op.
- **RFC-0188:** consumes the `organization` field already declared on `VisitorFunnelEventPayload`; the funnel stage machine is unchanged. `organization.selected` already exists as an event kind.
- **RFC-0176:** the Organization is written by the gogol-adapter destination (`supabase-buffer`) running on the client's site with the client's tokens; it is a destination concern, not a new source.
- **RFC-0191:** the billing layer attaches Stripe Customer/subscription to the Organization defined here; RFC-0190 is a prerequisite for clean per-company billing.
- **RFC-0047:** apps stay thin — no app change beyond the existing "for which company?" question already specified in the funnel content.

## Design

### Buffer contracts (`crm-buffer.ts`)

```ts
export interface BufferOrganization {
  id: string;              // UUID
  tenant_id: string;
  name: string;            // display name (target company)
  legal_name?: string;     // for Impressum / invoicing
  industry?: string;
  region?: string;
  pipedrive_org_id?: number;   // set after first Pipedrive sync
  stripe_customer_id?: string; // set by RFC-0191 billing (billed entity)
  created_at: string;
  updated_at: string;
}
```

`BufferDeal` gains an additive, nullable `organization_id?: string` (FK → `buffer_organizations.id`). `CrmBufferClient` gains:

```ts
upsertOrganization(
  tenantId: string,
  data: Omit<BufferOrganization, "id" | "tenant_id" | "created_at" | "updated_at">,
): Promise<BufferUpsertResult>;   // dedup by (tenant_id, name) or (tenant_id, legal_name)
```

A new `SYNC_OUTBOX_OPS` member `"upsert_organization"` lets the worker sync it before the deal so the deal can reference the Pipedrive org id.

### Adapter behaviour

The supabase-buffer adapter, on any funnel event carrying `payload.organization`:

1. `upsertOrganization` (resolve-or-create by name/legal_name);
2. `upsertDeal` with `organization_id` set;
3. queue `upsert_organization` + `upsert_deal` outbox tasks (org first).

When the event has no organization (e.g. a pure free-question), the deal keeps `organization_id` null — back-compatible.

### Sync worker

A new `upsert_organization` handler upserts the Pipedrive Organization (dedup by name), stores `pipedrive_org_id`, and the `upsert_deal` handler sets the deal's `org_id` and the person↔org link. The Person remains the orderer; the Organization is the target company.

### DDL

`integrations/lagebild-sync-worker/supabase/organizations.sql` (additive, idempotent): `create table buffer_organizations`; `alter table buffer_deals add column organization_id uuid references buffer_organizations(id)`; tenant RLS via `app.current_tenant`; index on `(tenant_id, name)`.

### Validation

- `funnel.org.validate` (new): when the funnel is enabled, assert the buffer schema exposes `buffer_organizations` and `buffer_deals.organization_id` (schema-presence guard), and that the adapter is configured to write the org.
- `funnel.lagebild.validate` (changed): also check the organization linkage is enabled for an enabled funnel.

## Rollout

1. **RFC acceptance only.**
2. **Contract phase:** add `BufferOrganization`, `BufferDeal.organization_id`, `upsertOrganization`, and the `upsert_organization` outbox op to `@gogol/share` + the client; pure, no runtime change.
3. **Schema phase:** ship `organizations.sql`; additive + nullable so existing rows are untouched.
4. **Adapter phase:** resolve-or-create the Organization from the funnel event and link the deal.
5. **Sync phase:** add the worker `upsert_organization` handler + person↔org linkage in Pipedrive.
6. **Validator phase:** add `funnel.org.validate`; extend `funnel.lagebild.validate`.
7. **Pilot phase:** enable for `warpgogol-com`; verify the Person→N Deals→Organization graph in Pipedrive matches the spec (`docs/specs/visitor-funnel/01-pipedrive.md`).

## Alternatives considered

- **Keep the company as a deal field/title (no entity):** rejected. It cannot be grouped, reported, billed against, or linked across a Person's multiple sites — the exact manager pain this RFC fixes.
- **Organization-centric model (Org primary, Person a contact under it):** rejected. It breaks the "orderer orders for others" case where the Person is not a member of the target company.
- **A contact↔organization membership join table:** rejected as premature. The Person→Organization relationship is fully derivable from their deals for the pilot; a membership table can come later if org hierarchies are needed.
- **Studio-central organizations registry:** rejected. RFC-0176/0186 deliberately avoid a studio-central PII store; the Organization stays tenant-scoped.

## Risks

- **Dedup ambiguity:** two visitors may name the same company differently ("Müller GmbH" vs "Bäckerei Müller"). Dedup by name is heuristic; allow operator merge in Pipedrive and keep the buffer id stable. Mitigation: dedup on `legal_name` when present, else `name`, and never auto-merge across tenants.
- **Migration safety:** `organization_id` must be nullable and additive so existing deals keep syncing. Mitigation: nullable FK, back-compat adapter path.
- **Billing coupling:** RFC-0191 attaches Stripe to the Organization; an org dedup error could misattribute billing. Mitigation: the Stripe Customer id is stored on the resolved org row and is the billing source of truth.
- **Pipedrive org duplication:** repeated syncs could create duplicate Pipedrive orgs. Mitigation: store `pipedrive_org_id` after first sync and upsert by it thereafter.

## Acceptance criteria

> Progress: **fully implemented** (branch `lagebild-system`) and verified — contracts, client, DDL, adapter resolution, Pipedrive org sync, and the `funnel.org.validate` governance are all in. Runtime activation arrives with the RFC-0188 Phase-4 UChat adapter.

- [x] RFC accepted before implementation starts. (evidence: implemented historically)
- [x] `BufferOrganization` + `BufferDeal.organization_id` + `upsertOrganization` exist in `@gogol/share` and the Supabase client, with the `upsert_organization` outbox op. (evidence: packages/ directory, package exists)
- [x] `organizations.sql` ships: `buffer_organizations` + nullable `buffer_deals.organization_id`, tenant RLS, additive and idempotent. (evidence: implemented historically)
- [x] The supabase-buffer adapter resolves-or-creates the Organization from the funnel event and links the deal; events without an organization keep `organization_id` null. (evidence: implemented historically)
- [x] The sync worker mirrors the Organization to Pipedrive and links Deal + orderer Person, reproducing the Person → N Deals → Organization graph. (evidence: implemented historically)
- [x] `funnel.org.validate` is registered (it carries the org-linkage governance: an enabled funnel must write the Organization through the crm:supabase-buffer destination). (evidence: implemented historically)
- [x] `rfc.validate RFC-0190` passes before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST NOT implement buffer, adapter, worker, schema, or validator changes for this RFC while its `status` is `draft`.
- Agents MUST keep `organization_id` additive and nullable; never break existing buffer rows or the Pipedrive sync.
- Agents MUST keep the Organization tenant-scoped (RLS via `app.current_tenant`); never introduce a studio-central organizations store.
- Agents MUST resolve-or-create the Organization from the funnel event's existing `organization` field; do not add new visitor questions.
- Agents MUST sync the Organization before the deal in the outbox so the deal can reference `pipedrive_org_id`.
- Agents MUST NOT store secrets (Stripe customer ids are not secret, but service keys/tokens never live in buffer rows, markdown, or chat config).
- Agents MUST update the affected GRACE documents and closest `AGENTS.md` files when this RFC is accepted and implemented.
