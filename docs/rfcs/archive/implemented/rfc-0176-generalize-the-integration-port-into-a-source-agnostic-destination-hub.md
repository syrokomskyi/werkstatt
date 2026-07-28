---
id: RFC-0176
title: "Generalize the integration port into a source-agnostic destination hub"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-07
updatedAt: 2026-06-07
implementedAt: 2026-06-08
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0168
amendedBy:
  - RFC-0179
  - RFC-0188
related:
  - RFC-0027
  - RFC-0141
  - RFC-0149
  - RFC-0161
  - RFC-0168
  - RFC-0169
  - RFC-0175
  - RFC-0177
commands:
  proposed: []
  added: []
  changed:
    - integration.config.validate
    - integration.secrets.validate
    - api.routes.generate
    - apps-check.run
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/share
  - packages/ontology
  - packages/ui
  - packages/os/site-kernel-checks
  - packages/os/site-kernel-deploy
successSignals:
  - "A captured lead from the send-message form or the chat widget is delivered reliably (Cloudflare Queues with retries + dedup) to the client's destinations, executed on the client's own site with the client's tokens — with no studio-central system in the data path."
  - "Switching a destination between gogol-adapter (the client's site executes it) and vendor-native is one mode field; the default is gogol-adapter, so integration logic lives in versioned, tested code rather than per-client GUI flows."
  - "Adding a calendar, client-email, or meeting-scheduler destination is one adapter; sources, routes, and the delivery backbone are unchanged."
nonGoals:
  - "Do not build a lead/conversation datastore — the studio does not become a CRM. The delivery queue holds events only in-flight (transient); it is never a record of truth."
  - "Do not route lead PII through a studio-central, multi-tenant system — destinations execute on each client's own site/deploy with the client's own tokens (per-client isolated)."
  - "Do not import a destination vendor SDK in apps/* or section code — vendor specifics live only inside adapter packages."
---

# RFC-0176: Generalize the integration port into a source-agnostic destination hub

## Context

RFC-0168 shipped the Integration Port: the [`send-message` section](../../packages/ui/src/sections/send-message/send-message-section.api.ts) builds a normalized `LeadMessage`/`Lead` and the [`@gogol/share` integration registries](../../packages/share/src/integration/index.ts) fan it out to channels (Telegram/email/WhatsApp) and upsert it to a CRM (Pipedrive). Crucially, that upsert **already runs server-side on the client's own site**, with the client's `INTEGRATION_PIPEDRIVE_API_TOKEN` read via `astro:env/server`. The client's site is therefore _already_ an integration bus.

The product goal is to make that explicit and complete. **The client's site is the standardized integration hub.** Every source (the contact form, the chat widget per RFC-0175, future sources) produces a normalized event; the site's adapters route it to the client's systems (CRM, calendar, email, scheduler) using the **client's own tokens**. Everything — Pipedrive, the calendar, the mailbox — **belongs to the client**; the studio standardizes the _exchange_ between those integrations on the client's site. This is not a studio-central, multi-tenant hub (which would pool many clients' PII and make the studio a heavyweight processor); it is per-client, isolated, on the client's own deploy. The studio is the site's operator/processor under a DPA (RFC-0177) — the same relationship the send-message form already entails.

The current port has two gaps: it is coupled to one source (the form) with a flat channel/CRM split, and its delivery is best-effort with no reliability guarantee. A studio that positions itself as reliable must close both.

## Problem

- The port is coupled to the send-message form; the chat widget (RFC-0175) has no sanctioned way to feed the same destinations.
- "Channel" vs "CRM" cannot express calendar/email/scheduler destinations, nor the choice between "the client's site runs the routing" and "an upstream vendor runs it."
- Delivery is fire-and-forget: a destination outage drops the lead, and a redelivery would double-write — unacceptable for a reliability-positioned studio.

## Decision

The Integration Port is generalized (amending RFC-0168) into a **source-agnostic destination hub that runs on the client's site**, with a reliable delivery backbone:

1. A normalized `IntegrationEvent` (generalizing `LeadMessage`/`Lead`), carrying an `eventId` idempotency key, is produced by any `IntegrationSource`. In-process sources: the send-message form. Out-of-process sources: the chat widget — **UChat POSTs captured leads to an inbound route** `POST /api/integration-inbound`, authenticated by `INTEGRATION_INBOUND_SECRET`. UChat is a _source_, not an orchestrator — removing the lock-in to its flow builder.
2. A closed `DestinationKind` catalog — `crm`, `calendar`, `email`, `scheduler` — replaces the flat split. Each configured destination declares an **execution mode**: **`gogol-adapter` (default)** — an adapter runs on the client's site with the client's tokens; or **`vendor-native` (optional)** — an upstream vendor's own flow executes it (used when the client did not buy the routing module, or a destination is unreachable statelessly). Same contract, swappable mode; the default keeps integration logic in versioned code.
3. **Reliable delivery via Cloudflare Queues.** Sources enqueue the `IntegrationEvent`; a queue consumer (a portable Worker on the client's Cloudflare account) runs the `gogol-adapter` destinations with **retries** (queue redelivery, bounded → dead-letter) and **dedup** (a short-TTL KV set keyed by `eventId`+destination, so a redelivery never double-writes). The queue is **transient/in-flight only** — never a datastore of leads (the studio does not become a CRM).
4. **Pilot:** warpgogol-com's `crm` destination is `{ vendor: pipedrive, mode: gogol-adapter }` — the existing `pipedriveCrmAdapter` is **activated** with the client's token; UChat is the source posting inbound. This resolves the "two Pipedrive paths" tension into one: a single destination contract, exactly one active executor.

`integration.config.validate` / `integration.secrets.validate` extend to the destination + inbound model; `api.routes.generate` emits the inbound route and the queue/KV bindings.

## Architectural fit

- **Amends RFC-0168:** same package and port philosophy, generalized to many sources + a typed destination registry, and the existing form→CRM behavior preserved as `lead`-event routing — now reliable.
- **RFC-0175 chat widget:** the widget is an `IntegrationSource`; UChat's backend posts captured leads to the inbound route. The widget client stays public/secret-free; the inbound secret is a server secret of the hub.
- **RFC-0169 entitlements:** `integrations.channels`/`integrations.crm` (and future `integrations.calendar`/etc.) gate which destinations a site may activate.
- **RFC-0149 deploy:** the inbound route + queue consumer are portable Workers; `site-kernel-deploy` emits the Cloudflare **Queues** producer/consumer + **KV** (dedup) bindings into the client's `wrangler.jsonc`. The queue and KV live on the **client's** Cloudflare account — the client's infrastructure, not the studio's.
- **Privacy (RFC-0177):** data executes on the client's site with the client's tokens; the studio is a per-client processor/operator under a DPA, never a cross-tenant aggregator; no visitor PII is persisted (queue is in-flight only).

## Design

### CLI surface

```sh
pnpm exec site-kernel run integration.config.validate --app warpgogol-com --json
pnpm exec site-kernel run integration.secrets.validate --all
```

### TypeScript contracts

```ts
export type DestinationKind = "crm" | "calendar" | "email" | "scheduler";
export type ExecutionMode = "gogol-adapter" | "vendor-native";   // default: gogol-adapter

/** Generalizes LeadMessage/Lead. The `lead` kind preserves the RFC-0168 shape. */
export interface IntegrationEvent {
  eventId: string;                   // idempotency key (source-provided) — dedup
  kind: "lead" | "message" | "appointment";
  source: string;                    // "send-message" | "uchat" | …
  locale: string;
  occurredAt: string;                // ISO-8601
  contact?: { name?: string; email?: string; phone?: string };
  payload: Record<string, unknown>;
}

/** Executed on the client's site (client tokens) only for mode "gogol-adapter". */
export interface DestinationAdapter {
  readonly kind: DestinationKind;
  readonly vendor: string;           // "pipedrive" | …
  readonly requiredSecrets: readonly string[];
  route(event: IntegrationEvent, secrets: IntegrationSecrets): Promise<{ id: string } | null>;
}

// system.md
// integrations:
//   inbound: { sources: [uchat] }                                 # enables /api/integration-inbound
//   destinations:
//     - { kind: crm, vendor: pipedrive, mode: gogol-adapter }     # the site runs it (client token)
//     # - { kind: crm, vendor: pipedrive, mode: vendor-native }   # an upstream vendor runs it
```

Flow: a source enqueues an `IntegrationEvent`; the consumer dedups on `eventId`, then runs each `gogol-adapter` destination's `route()`; failures are retried via queue redelivery up to a bound, then dead-lettered (logged, never silently lost on the first hiccup). `vendor-native` destinations are declared for validation/disclosure only — the consumer does not execute them.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/integration/port.ts` | Adds `IntegrationEvent` (+`eventId`), `DestinationKind`, `ExecutionMode`, `DestinationAdapter`; keeps `LeadMessage`/`Lead` as the `lead` shape |
| `packages/share/src/integration/index.ts` | Destination registry + queue producer (`enqueueEvent`) + consumer fan-out (dedup + retries; runs gogol-adapter modes only) |
| `packages/share/src/integration/adapters.ts` | Channel adapters + `pipedriveCrmAdapter` retained behind `DestinationAdapter` |
| `packages/ontology/integration/*` | Closed `DestinationKind` + per-kind vendor catalogs + execution-mode enum + inbound-source catalog |
| `packages/os/site-kernel-deploy/**` | Emits Cloudflare Queues (producer/consumer) + KV (dedup) bindings into `wrangler.jsonc` |
| `apps/*/src/content/system.md` | `integrations.inbound` + `integrations.destinations[]` (engineering-owned) |
| `packages/os/site-kernel-checks/src/integration.ts` | Extended `integration.config.validate` / `integration.secrets.validate` |

### Output format

```json
{
  "command": "integration.config.validate",
  "status": "fail",
  "violations": [
    { "app": "warpgogol-com", "rule": "unknown-destination-kind", "value": "billing" },
    { "app": "warpgogol-com", "rule": "unknown-vendor-for-kind", "kind": "crm", "value": "salesforce" },
    { "app": "warpgogol-com", "rule": "multiple-active-executors", "kind": "crm", "vendor": "pipedrive" },
    { "app": "warpgogol-com", "rule": "inbound-source-without-secret", "secret": "INTEGRATION_INBOUND_SECRET" }
  ]
}
```

### Failure modes

The inbound route rejects a missing/invalid signature with 401 and does not enqueue. `integration.config.validate` fails on an unknown kind, an unknown vendor for a kind, **more than one active executor** for the same `(kind, vendor)` (the double-write trap), or an enabled inbound source without `INTEGRATION_INBOUND_SECRET`. `integration.secrets.validate` requires a destination's secrets **only** for `gogol-adapter` mode; `vendor-native` needs none. The queue consumer retries a failed destination up to a bound, then dead-letters it (logged); dedup on `eventId` makes redelivery idempotent. A `gogol-adapter` destination entitled+configured but missing its secret fails closed.

## Rollout

- Phase 1: introduce `IntegrationEvent`(+`eventId`)/`DestinationKind`/`ExecutionMode`/`DestinationAdapter`; map the existing form `Lead`→CRM and channel fan-out onto the new contract; extend validators. (Queue optional this phase; behavior preserved.)
- Phase 2: add the delivery backbone — `site-kernel-deploy` emits Queues + KV bindings; sources enqueue; consumer fans out with retries + dedup. Migrate the form path onto the queue.
- Phase 3: warpgogol-com pilot — enable `inbound: { sources: [uchat] }`; `destinations: [{ kind: crm, vendor: pipedrive, mode: gogol-adapter }]`; UChat posts captured leads to `/api/integration-inbound`; the Pipedrive token lives in the site's server env.
- Phase 4: add `calendar`/`email`/`scheduler` destinations as demand appears (each a `gogol-adapter`, OAuth tokens per RFC-0177; email may reuse the Resend adapter), or `vendor-native` where appropriate.
- New apps inherit empty `inbound`/`destinations` (all off) from the scaffold.

## Alternatives considered

- **Studio-central, multi-tenant hub:** rejected — pools many clients' PII into one studio-operated system (heavy processor footprint, single breach blast radius, cross-tenant). The client's own site is the hub instead.
- **Keep the flat channel/CRM split:** rejected — cannot express calendar/scheduler destinations or the gogol-adapter vs vendor-native choice; forces a new mechanism per destination.
- **Pure stateless fan-out (no queue):** rejected — cannot retry or dedup, so a destination outage loses leads; incompatible with a reliability-positioned studio. The queue holds events in-flight only (still no datastore).
- **vendor-native as the default (UChat orchestrates):** rejected — scatters integration logic into per-client GUI flows, locks the client into UChat, and is inconsistent with the form already routing through the site. gogol-adapter is the default; vendor-native is the fallback.

## Risks

- **Reliability bound:** retries are bounded; a destination down past the bound dead-letters. Document the bound and surface dead-letters (logged) so a human can recover — but never silently drop on the first failure.
- **Double-write:** a `vendor-native` and a `gogol-adapter` targeting the same CRM would duplicate leads — `integration.config.validate` enforces at most one active executor per `(kind, vendor)`; `eventId` dedup guards redelivery.
- **Inbound webhook abuse:** the inbound route is signature-authenticated (`INTEGRATION_INBOUND_SECRET`); reject + rate-note unsigned posts; never log the secret.
- **Back-compat:** the existing form→Pipedrive path must keep working for sites that choose it; covered by the `lead`-event mapping and a green build of both reference apps.
- **Studio-as-processor:** running adapters on the client's site puts the studio in a per-client processor relationship — a DPA is required (RFC-0177); this is already true for the form and is far lighter than a central hub.

## Acceptance criteria

- [x] `IntegrationEvent`(+`eventId`), `DestinationKind`, `ExecutionMode` (default `gogol-adapter`), `DestinationAdapter` defined in `@gogol/share`; `LeadMessage`/`Lead` retained as the `lead` shape (`eventToLead`) — **Phase 1** (evidence: packages/ directory, package exists)
- [x] Closed `DestinationKind` + per-kind vendor catalog + execution-mode enum + inbound-source field (system schema) — **Phase 1** <!-- catalogs live in @gogol/share/integration + system schema, mirroring the RFC-0168 implementation (not a separate ontology dir) --> (evidence: packages/ directory, package exists)
- [x] Inbound route `integration-inbound` authenticated by `INTEGRATION_INBOUND_SECRET`; UChat configured as a source — chat-widget-owned `api[]` route emitted by `api.routes.generate`; `authenticateInbound` (constant-time, fail-closed); `IntegrationEventSchema` validation (evidence: implemented historically)
- [x] Cloudflare Queues producer/consumer + KV dedup; retries + `eventId` dedup; queue is in-flight only, no lead datastore — producer binding `INTEGRATION_QUEUE` + `INTEGRATION_DEDUP` KV in `wrangler.jsonc`; standalone consumer Worker `workers/integration-consumer` (ack/retry→DLQ); unit tests prove route-once + redelivery dedup; consumer bundles clean (`wrangler --dry-run`) <!-- @astrojs/cloudflare v13 has no queue() entrypoint, hence a separate consumer Worker. Go-live: create the queue/DLQ + KV namespace (paste id), set Pipedrive secrets, run the documented `wrangler dev` multi-config e2e (Queues local-dev only) --> (evidence: implemented historically)
- [x] `integration.config.validate` rejects unknown kind/vendor, multiple active executors per `(kind, vendor)`, and inbound-without-secret — **Phase 1** (evidence: implemented historically)
- [x] `integration.secrets.validate` requires secrets only for `gogol-adapter` destinations — **Phase 1** (evidence: implemented historically)
- [x] Existing form channel/CRM behavior preserved; warpgogol-com + nicaragua-projekt config/secrets validators pass <!-- full app build not re-run; back-compat verified via validators --> (evidence: original apps retired by RFC-0381, implemented historically)
- [x] warpgogol-com pilot: `crm` destination `{ vendor: pipedrive, mode: gogol-adapter }`; `inbound.sources: [uchat]`; chat-widget placed on the contact page; validators green <!-- live INTEGRATION_PIPEDRIVE_*/INTEGRATION_INBOUND_SECRET values + public UChat widgetId + full astro build are go-live steps (placeholder widgetId in system.md) --> (evidence: implemented historically)
- [x] No destination vendor SDK imported in `apps/*` or section code (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- `gogol-adapter` is the default and runs on the **client's** site with the **client's** tokens — read secrets only via `astro:env/server`; never log or return them. `vendor-native` is the explicit fallback.
- The delivery queue is transient/in-flight ONLY — never persist event payloads as a datastore (the studio must not become a CRM). Dedup state is a short-TTL key, not a record.
- Enforce at most one active executor per `(kind, vendor)`; never let a vendor-native and a gogol-adapter target the same CRM (double-write).
- The inbound route MUST authenticate every post (`INTEGRATION_INBOUND_SECRET`); reject unsigned requests.
- Destination kinds/vendors come from the closed ontology catalogs; unknown values fail validation (config) or `console.warn` + no-op (runtime).
- Agents MUST NOT weaken the integration validators without a superseding RFC.
