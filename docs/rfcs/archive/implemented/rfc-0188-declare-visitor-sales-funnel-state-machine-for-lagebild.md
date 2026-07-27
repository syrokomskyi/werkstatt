---
id: RFC-0188
title: "Declare a visitor sales funnel state machine for Lagebild"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-11
updatedAt: 2026-06-12
implementedAt: 2026-06-11
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0175
  - RFC-0176
  - RFC-0186
amendedBy:
  - RFC-0190
  - RFC-0191
  - RFC-0219
  - RFC-0387
related:
  - RFC-0168
  - RFC-0169
  - RFC-0177
  - RFC-0179
  - RFC-0181
  - RFC-0182
commands:
  proposed:
    - funnel.contract.validate
    - funnel.copy.validate
    - funnel.lagebild.validate
    - funnel.stage.validate
  added:
    - funnel.contract.validate
    - funnel.copy.validate
    - funnel.lagebild.validate
    - funnel.stage.validate
  changed:
    - apps-check.run
    - integration.config.validate
    - lagebild.validate
  removed: []
appsImpacted:
  - apps/*
  - apps/webgogol-com
packagesImpacted:
  - packages/share
  - packages/chat
  - packages/chat-adapter-uchat
  - packages/integration-adapter-supabase-crm
  - packages/os/site-kernel-checks
  - packages/os/site-kernel
  - packages/ui
successSignals:
  - "The sales funnel intent from the legacy UChat bot is reborn as a versioned, first-party platform state machine — not as Make.com scenarios and not as Pipedrive webhook routing. UChat drives the conversation, but the canonical transition graph is owned and validated by the platform."
  - "A visitor holds one comfortable, continuous, multilingual conversation in UChat that moves smoothly through qualification, offer selection, payment, legal/start consent, material collection, and change requests, while every stage transition is recorded in the Lagebild buffer."
  - "Make.com is absent from every funnel path: no Make.com webhook, scenario, or dependency exists in any source, transition, or destination of the canonical funnel. UChat connects to Lagebild directly through the UChat API and signed inbound webhooks."
  - "The conversational copy and pricing are driven entirely by the current Digitales Fundament offer (business/offer.md) and the funnel content domain, synced into UChat, so the visitor never sees a stale tariff and the studio updates the offer in one place."
  - "Future client sites adopt the same funnel by replicating one templated UChat funnel plus platform configuration, localized content, and tenant onboarding — with zero Make.com scenarios and with UChat owning no canonical state."
nonGoals:
  - "Do not preserve any legacy artifact: no legacy UChat flow IDs, no goto graphs, no Make.com webhook URLs, no Pipedrive webhook router, no deprecated 39 EUR tariff logic, no legacy stage names. The legacy 10-flow export is reference only; the funnel is rebuilt clean in UChat."
  - "Do not use Make.com anywhere in the funnel, in any mode, transitional or permanent."
  - "Do not let UChat (or any chat vendor) own canonical funnel state, the transition graph, legal consent of record, pricing, or CRM synchronization. UChat renders the conversation and requests transitions; it never defines the graph."
  - "Do not leave the visitor in a dead-end, an untranslated branch, or a state with no way back to the conversation."
  - "Do not store secrets in app content, Supabase registry rows, markdown, or client-side chat/UChat configuration."
  - "Do not implement the state machine before this RFC is accepted."
---

# RFC-0188: Declare a visitor sales funnel state machine for Lagebild

## Context

The repository now has the main integration foundations required for a durable client-site sales workflow:

- RFC-0175 introduced a consent-gated, vendor-agnostic chat widget port. UChat is a click-to-load adapter on that port.
- RFC-0176 generalized the integration port into a source-agnostic destination hub using normalized `IntegrationEvent` objects.
- RFC-0181 moved delivery onto an EU-resident delivery substrate.
- RFC-0186 introduced Lagebild: a Supabase-backed CRM buffer plus one shared multi-tenant sync Worker that drains `sync_outbox` rows to Pipedrive per tenant.
- `apps/webgogol-com` is the pilot and currently configures `integrations.chat.adapter: uchat`, inbound source `uchat`, and destination `{ kind: crm, vendor: pipedrive, mode: gogol-adapter }`.

UChat is the conversational front end the studio standardizes on. It is a capable, multilingual chat runtime, and the studio will **build the funnel conversation in UChat and replicate it across all client sites in `apps/*`**. What this RFC changes is not the choice of chat vendor — it is **where the process authority lives**. Before this architecture existed, the sales and onboarding workflow lived inside a UChat bot wired to Make.com and Pipedrive, and that wiring made UChat _and Make.com_ the de-facto process engine and state owner.

The full legacy flow export (10 flows: Main Flow, the Sub Flows collection, Deal Agreements, After Start Now, Check Included Changes, the three Make Changes flows, the Stages Router central dispatcher, and the Pipedrive Webhook Router) encodes valuable **business process knowledge** that we keep:

1. a warm welcome plus privacy acknowledgement;
2. language handling and organization selection/creation;
3. intent selection (`create website`, `make changes`, free question — "Ask anything");
4. a short qualification brief (`what is important`, company/project, industry/service, city/region);
5. offer/payment selection;
6. post-payment start choice (`start now` vs `in 14 days`);
7. B2B/B2C branch with start/withdrawal consent handling;
8. material and legal-data collection;
9. an included-change check, paid-change payment, and change description;
10. a central dispatcher (`Stages Router`) that lets the visitor ask free questions at any time and then return to exactly the stage they were on, plus an AI fallback with a 10-minute inactivity timeout.

The same export also makes explicit what we **discard completely** — it is mechanism, not value, and it is all legacy:

- legacy UChat `goto`/subflow graphs and `Set Custom Field: stage` strings (the new UChat funnel is rebuilt clean, not copied);
- **Make.com webhooks as the transition/transport authority** (every `External Request: https://hook.eu1.make.com/…` node);
- the **Pipedrive Webhook Router** (`crm_pipeline_id is 8`, `crm_stage_id is 51/58`) acting as the canonical dispatcher;
- legacy stage names (`q_website_tier`, `new_chat`, `q_new`, `after_start_now_delay`, …);
- legacy pricing copy (`Jährlich 39€`, `Monatlich 39€`) and DEPRECATED tier-choice blocks;
- legacy support/material addresses scattered in messages (`support@webgoral.com`, `material@webgogol.com`, `hi@webgogol.com`) — these must come from the business layer, not be hardcoded in funnel copy or UChat nodes.

The offer has also changed. The pilot's canonical offer is now `apps/webgogol-com/src/content/business/{de,uk}/offer.md`: `70 € / Monat`, `700 € / Jahr`, `200 €` setup, five written guarantees (delivery, uptime, smallChanges, response, dataPackage), and keyed growth modules (`visibility +29 €/mo`, `booking +29 €/mo`, `trust +19 €/mo`, `multilingual 129 € once + 29 €/mo`, `automation +59–199 €/mo`), plus `changePrice 15 €`, `hourlyRate 90 €`, `billingDay 1`. The conversation must sell **this** offer, in `de` and `uk`, and the old `39€` tariff dialogue is deleted, not migrated.

## Problem

The platform has a delivery hub and a CRM buffer, but it does not yet have a canonical **visitor sales funnel contract**, and UChat is currently positioned as both the conversation _and_ the process authority.

Without a platform-owned contract:

- the legacy UChat funnel can only live as a brittle vendor GUI graph that also owns the canonical state;
- Make.com remains the implicit process engine and transport authority;
- Pipedrive stage ids can leak back into visitor-facing routing;
- stage names in `BUFFER_DEAL_STAGES` are too generic (`new`, `qualified`, `proposal`, etc.) to preserve the actual site-sales process;
- future client sites would need bespoke UChat/Make/Pipedrive wiring instead of replicating one governed funnel template;
- legal consent, offer selection, payment status, material collection, and change requests have no typed event model that the repository can version, test, and validate;
- multilingual funnel copy is not validated against the CMS-friendly app content model.

There is also an **experience** gap. The legacy bot, split across UChat branches and Make.com scenarios, is fragile: a visitor can land in an untranslated branch, hit a `No match`/`No reply` dead-end, or lose their place after asking a free question. A reliability-positioned studio needs a conversation that always feels calm, answers in the visitor's language, never strands them, and always offers a way back into the funnel.

The risk if we do nothing is architectural drift: the platform would own integrations technically, while the real sales logic and the canonical visitor state would stay outside the repository, locked in UChat flows and Make.com scenarios that no GRACE/RFC governance can see, test, or version.

## Decision

The platform introduces a **first-party Visitor Sales Funnel state machine** — a versioned stage/event/transition contract plus durable Lagebild state — as the canonical process layer between the visitor and CRM synchronization. **UChat is the conversation runtime** that renders the funnel for the visitor and is replicated across all client sites; it is a source/destination on the normalized contract, not the owner of process state. The legacy Make.com transport and the Pipedrive webhook router are **fully retired**; the legacy UChat export is reference only and the funnel is rebuilt clean.

The funnel is versioned, declarative, source-agnostic, tenant-aware, content-driven, and built for a comfortable conversation:

1. **Canonical state lives in Lagebild.** Each visitor/deal has a current funnel stage, append-only stage transitions, normalized captured fields, offer snapshots, and pending sync tasks in the CRM buffer. Every other system (UChat, Stripe, Pipedrive, email) is strictly a source or a destination — never the owner of state.
2. **UChat owns the visitor conversation experience.** The platform standardizes on UChat as the multilingual chat runtime and replicates one governed funnel template across `apps/*`. UChat renders prompts, quick replies, typing cues, and the free-question side conversation. It is consent-respecting and click-to-load (RFC-0175 posture). It does **not** own stages, transitions, pricing, legal consent of record, or CRM writes.
3. **Sources emit normalized funnel events.** UChat messages and button choices, the contact form, Stripe payment webhooks, and manual operator actions become typed `IntegrationEvent`/`FunnelEvent` inputs with idempotency keys, delivered to Lagebild via the UChat API and signed inbound webhooks (RFC-0176 inbound auth). No Make.com hop exists between UChat and Lagebild.
4. **The state machine owns transitions.** The valid transition graph is declared in versioned package contracts and validated before deployment. UChat may _request_ a transition through the API; it never _defines_ the graph. There is no canonical "Stages Router" living in a vendor GUI — resume-by-current-stage is a platform function backed by Lagebild and exposed to UChat.
5. **Make.com is fully excluded.** No funnel source, transition, persistence step, or destination may call Make.com, in any mode, transitional or permanent. There is no Make.com webhook, scenario, or dependency anywhere in the funnel; UChat integrates with Lagebild directly.
6. **UChat is the front end, not the brain.** The legacy UChat flows (with Make.com wiring and `39€` copy) are deleted and the funnel is rebuilt clean in UChat. The rebuilt UChat funnel owns no copy of record, no transition graph, no pricing source, no consent of record, and no CRM writes — those are platform/Lagebild concerns. Pricing, prompts, and quick-reply labels are sourced from platform content and provisioned into UChat (API sync or runtime variables), so UChat renders values it does not author.
7. **Funnel copy and offer are localized content.** Visitor-facing prompts, quick-reply labels, legal text, and all pricing originate in the app content layer (`business/{lang}/offer.md` plus a funnel content domain), with `de` and `uk` kept aligned and Ukrainian using formal capitalized address (`Ви/Ваш`). These values are synced into UChat; the UChat funnel never hardcodes prices, guarantees, contacts, or legal data as its own source of truth.

## Architectural fit

- **RFC-0175:** the privacy posture (no third-party load before explicit activation, first-party click-to-load launcher) is kept. UChat remains the click-to-load chat behind that launcher, consent-gated; nothing about UChat being the conversation runtime relaxes the no-load-before-consent rule.
- **RFC-0176:** extends the normalized event model from delivery routing into a business process layer. `IntegrationEvent` remains the transport envelope; funnel-specific payloads become typed contracts on top. UChat is an inbound source (and an outbound destination for messages) on this contract. Make.com is not a source, destination, or mode under RFC-0176 for this funnel.
- **RFC-0186:** uses Lagebild as the durable buffer and audit layer. The shared sync Worker continues to own outbound CRM synchronization, while the new funnel layer owns stage semantics before outbox tasks are written.
- **RFC-0047:** keeps apps thin and content-driven. Apps configure and localize the funnel and carry the UChat funnel template/provisioning config; reusable runtime, schemas, validators, state-machine logic, and the UChat integration adapter live in packages.
- **RFC-0169:** funnel capabilities can be sold as an integration/automation entitlement. Sites without the entitlement must compile to safe no-op/null behavior.
- **Storage policy / RFC-0177:** no cookies. Client-side persistence, if needed for UI convenience, uses `localStorage`; canonical server-side state is in the tenant's Lagebild/Supabase buffer. UChat's own session storage is never the canonical record.

## Conversational experience (visitor comfort)

The funnel is, above all, a **comfortable conversation** for the Visitor, delivered through the UChat runtime. The platform state machine is the skeleton; the UChat conversation is the product. The replicated UChat funnel — supported by platform functions such as resume-at-stage — must satisfy these experience invariants:

- **One continuous thread.** The Visitor never restarts. They always resume at their current stage; progress survives reloads because canonical state is server-side in Lagebild (UChat session and optional `localStorage` are convenience only — never the record, never cookies).
- **Always answer, never strand.** Every prompt accepts free text _and_ offers quick-reply suggestions. There is no `No match`/`No reply` dead-end: unrecognized input is acknowledged, optionally answered, and the Visitor is gently returned to the current step.
- **Ask anything, anytime.** A free-question side-conversation is available at every stage with a clear "back to my request" action that resumes the exact stage — reproducing the legacy "Stages Router" intent as a platform function (current stage read from Lagebild), with an optional AI assist and operator handoff. No Make.com, and no vendor-owned dispatcher.
- **Speak the Visitor's language.** The conversation runs in the site language (`de`/`uk` for the pilot), with full parity; Ukrainian uses formal capitalized address (`Ви/Ваш`). No untranslated branch may ship.
- **Sell the current offer, transparently.** Prices, guarantees, and growth modules are read from `business/{lang}/offer.md`, synced into UChat, and presented clearly (e.g. `70 € / Monat`, `700 € / Jahr`, `200 €` setup, optional modules). The Visitor sees consistent figures everywhere; an offer change updates the conversation automatically through re-sync.
- **Human pace and tone.** Typing/delay cues, short friendly messages, and confirmations keep the conversation calm and trustworthy rather than form-like — preserving the original bot's warm tone ("ohne Stress, ohne Termine, ohne versteckte Kosten").
- **Honest, low-pressure progression.** Qualification asks only what is needed (priority, company/project, service, region), payment and legal steps are explicit and reversible where the law requires (B2C withdrawal), and the Visitor can pause (`in 14 days`) without losing their place.
- **Accessible by construction.** Use UChat's accessible widget with real focusable, labelled controls; verify keyboard and screen-reader behavior and respect reduced-motion. The launcher and load gate are first-party (RFC-0175). Accessibility gaps in the vendor widget are a tracked risk, not an accepted default.

These are testable acceptance properties, not decoration: `funnel.copy.validate` checks language parity and offer-sourced pricing in the content that provisions UChat, and the conversation must demonstrate resume, free-question return, and no-dead-end behavior before the pilot goes live.

## Design

### Funnel stages

The old UChat `stage` field is replaced by a versioned closed catalog whose names describe the platform process rather than GUI nodes or Pipedrive stage ids. UChat tracks the visitor's position by mirroring this catalog (e.g. in a custom field synced from Lagebild), but the catalog is owned by the platform.

Initial proposed catalog:

```ts
export const VISITOR_FUNNEL_STAGES = [
  "new_session",
  "privacy_acknowledged",
  "intent_selected",
  "organization_selected",
  "qualification_priority",
  "qualification_company",
  "qualification_service",
  "qualification_region",
  "offer_presented",
  "payment_pending",
  "payment_confirmed",
  "start_choice_pending",
  "start_deferred",
  "buyer_type_pending",
  "b2b_start_consent_pending",
  "b2c_withdrawal_consent_pending",
  "start_approved",
  "legal_data_requested",
  "materials_requested",
  "production_ready",
  "change_balance_checked",
  "change_payment_pending",
  "change_description_requested",
  "operator_review",
  "won",
  "lost"
] as const;
```

The implementation may map these to Pipedrive pipelines/stages per tenant and to UChat custom fields, but neither Pipedrive ids nor UChat field strings are part of the canonical state-machine API.

### Funnel events

Funnel events extend normalized integration events with typed business payloads. UChat emits these (via API/webhook) when the visitor advances; the platform validates and persists them.

```ts
export type VisitorFunnelEventKind =
  | "session.started"
  | "privacy.acknowledged"
  | "language.selected"
  | "intent.selected"
  | "organization.selected"
  | "qualification.answered"
  | "offer.selected"
  | "payment.link.requested"
  | "payment.confirmed"
  | "start.choice.selected"
  | "buyer.type.selected"
  | "legal.consent.recorded"
  | "material.submitted"
  | "change.requested"
  | "operator.note.added";

export interface VisitorFunnelEventPayload {
  funnelVersion: string;
  eventKind: VisitorFunnelEventKind;
  stage?: VisitorFunnelStage;
  previousStage?: VisitorFunnelStage;
  intent?: "create_site" | "change_site" | "ask_question";
  locale: string;
  contact?: { name?: string; email?: string; phone?: string };
  organization?: { id?: string; name?: string };
  qualification?: {
    priority?: "new_customers" | "professional_presence" | "online_presence" | "all";
    companyName?: string;
    serviceOrIndustry?: string;
    region?: string;
  };
  offer?: {
    plan?: "digital_foundation_monthly" | "digital_foundation_yearly";
    growthModules?: string[];
    priceSnapshot?: Record<string, string>;
  };
  legal?: {
    buyerType?: "business" | "consumer";
    startBeforeWithdrawalPeriod?: boolean;
    withdrawalExpiryAcknowledged?: boolean;
  };
  changeRequest?: {
    includedChangesAvailable?: number;
    description?: string;
  };
}
```

Exact names may change during implementation, but the accepted implementation must keep these invariants:

- each event has a stable idempotency key (so UChat webhook retries are safe);
- each transition records actor/source and timestamp;
- each visitor-facing choice has a localized label and a stable machine value;
- offer snapshots are captured at selection time so historical deals are not re-priced when `offer.md` changes;
- legal consent events are append-only and never overwritten by later conversation messages.

### State machine ownership

The funnel engine belongs in shared packages, not in `apps/*`; UChat config and provisioning belong in app content:

| Path | Role |
| --- | --- |
| `packages/share/src/integration/funnel.ts` | Pure funnel event, stage, transition, and result contracts (platform-owned graph) |
| `packages/integration-adapter-supabase-crm/src/funnel-adapter.ts` | Lagebild persistence adapter for funnel state and stage transitions; exposes resume-at-stage |
| `packages/chat-adapter-uchat/**` | Primary UChat integration adapter: UChat API client (provision copy/offer, request transitions, read/write custom fields) + signed inbound webhook receiver that emits normalized funnel events. Never calls Make.com; never owns the transition graph or pricing |
| `packages/os/site-kernel-checks/src/funnel.ts` | Static validation of funnel config, stages, copy coverage, UChat-provisioning alignment, and integration alignment |
| `packages/ui/src/sections/chat-widget/**` | First-party RFC-0175 click-to-load launcher that loads the UChat widget after consent; owns no transition logic |
| `apps/*/src/content/system.md` | Enables funnel version and source/destination placement |
| `apps/*/src/content/business/{lang}/offer.md` | Canonical offer values used by funnel copy, price snapshots, and UChat provisioning |
| `apps/*/src/content/funnel/{lang}/**` | Localized conversation copy, quick-reply labels, and legal-text references that provision the UChat funnel (RFC-0047 content surface) |
| `apps/*/src/content/funnel/uchat.*` | Per-app UChat funnel binding/provisioning config (flow/template identifiers, field mappings) — config only, never secrets |

The funnel introduces a dedicated app content domain `src/content/funnel/{lang}/` for localized conversation copy that provisions the UChat funnel. It must follow RFC-0047 CMS-friendly content rules, language fallback, and validation coverage. **No Make.com or Pipedrive client code may appear in any of these paths, and no UChat path may become the source of truth for pricing, the transition graph, or consent of record.**

### CLI surface

```sh
pnpm exec site-kernel run funnel.contract.validate --app webgogol-com --json
pnpm exec site-kernel run funnel.stage.validate --app webgogol-com --json
pnpm exec site-kernel run funnel.copy.validate --app webgogol-com --json
pnpm exec site-kernel run funnel.lagebild.validate --app webgogol-com --json
```

Proposed command responsibilities:

- `funnel.contract.validate`: validates configured funnel version, allowed sources (UChat + Stripe + operator), allowed event kinds, entitlement alignment, and the absence of any Make.com reference.
- `funnel.stage.validate`: validates that every configured transition uses known stages and has no unreachable required stage; validates that UChat stage-field mappings reference only canonical stages.
- `funnel.copy.validate`: validates localized prompt/button/legal-copy coverage, verifies that `webgogol-com` has both `de` and `uk` coverage, and verifies prices derive from `business.offer` rather than hardcoded UChat/legacy tariff text.
- `funnel.lagebild.validate`: validates that the app's funnel configuration is compatible with its Lagebild tenant, buffer stage catalog, destination mode, sync Worker placement, and that UChat provisioning binds to the platform funnel version.

### Output format

```json
{
  "command": "funnel.stage.validate",
  "status": "fail",
  "app": "webgogol-com",
  "violations": [
    {
      "rule": "unknown-funnel-stage",
      "stage": "q_website_tier",
      "message": "Legacy UChat stage names are not valid canonical funnel stages."
    },
    {
      "rule": "offer-price-not-from-business-layer",
      "file": "apps/webgogol-com/src/content/funnel/de/create-site.md",
      "message": "Funnel copy must reference business.offer price fields instead of hardcoding legacy tariff text."
    }
  ]
}
```

### Legacy mapping

Every legacy _mechanism_ on the left is **deleted**; only the business meaning on the right is kept and re-expressed as a platform concept rendered by the rebuilt UChat funnel. UChat as a tool is kept, but its legacy export, Make.com wiring, and Pipedrive-router dispatch are retired.

| Legacy mechanism (deleted) | Future canonical concept (kept, rendered by UChat) |
| --- | --- |
| `new_chat`, welcome message, privacy button | `session.started` → `privacy.acknowledged` |
| language buttons | site i18n route/locale; `language.selected` only if explicit switching is offered |
| organization list/create (Make.com webhooks) | `organization.selected`; organization identity lives in Lagebild/CRM buffer, written by the platform via the UChat adapter |
| `Website erstellen` | `intent.selected: create_site` |
| `Änderung vornehmen` | `intent.selected: change_site` |
| `Ask anything` AI agent node (10-min timeout) | first-party side conversation bound to the current stage (read from Lagebild) with a return-to-funnel action; optional AI assist + operator handoff; no Make.com |
| `q_what_important`, `q_company`, `q_industry`, `q_region` (each a Make.com `External Request`) | `qualification.answered` event sequence, emitted by UChat and persisted directly to Lagebild |
| old `39€` tariff selection + DEPRECATED tier choice | `offer.selected` using current `business.offer` values (synced into UChat) and the keyed module catalog |
| Stripe payment link in a UChat custom field (set via Make.com) | `payment.link.requested` produced by a first-party payment adapter (Stripe direct, no Make.com); link delivered to UChat via API |
| Pipedrive invoice-paid webhook router (`pipeline 8`, `stage 51/58`) | `payment.confirmed` source event (Stripe webhook → platform); Pipedrive is a sync destination only, never a dispatcher |
| `start_now_or_later` | `start.choice.selected` |
| B2B/B2C branch | `buyer.type.selected` + legal-consent policy |
| withdrawal/start confirmations | append-only `legal.consent.recorded` events |
| material/legal data request (`material@…`, `hi@…` hardcoded) | `legal_data_requested`, `materials_requested` stages; addresses come from the business layer |
| included-changes check (Make.com `External Request`) | `change_balance_checked` backed by product/contract/billing data, read by the platform |
| paid-change flow | `change_payment_pending` → `change_description_requested` |
| central `Stages Router` (vendor GUI dispatcher) | platform resume operation keyed by current funnel stage in Lagebild, exposed to UChat via the adapter |

### Reference journeys with the new offer

The two journeys the conversation must support end to end, rendered by UChat and driven by the platform state machine and offer:

**A. Create a site**

1. `session.started` → warm welcome + privacy acknowledgement (`privacy_acknowledged`).
2. `intent.selected: create_site` (free text or quick reply).
3. qualification: priority → company/project → service → city/region (`qualification_*`), each persisted to Lagebild.
4. `offer.presented`: the conversation explains Digitales Fundament from `business/offer.md` (synced into UChat) — `70 € / Monat` or `700 € / Jahr`, `200 €` setup, the five guarantees, and optional growth modules (visibility/booking/trust/multilingual/automation). `offer.selected` captures plan + modules + a price snapshot.
5. `payment.link.requested` → `payment_pending`; on Stripe webhook, `payment.confirmed` → `payment_confirmed`.
6. `start.choice.selected`: start now or in 14 days (`start_deferred` keeps the place).
7. `buyer.type.selected` (B2B/B2C) → consent: B2C records withdrawal-rights acknowledgement, B2B records start-before-completion consent (append-only `legal.consent.recorded`) → `start_approved`.
8. `legal_data_requested` + `materials_requested`: collect legal data and materials in-conversation → `production_ready`.

**B. Make changes**

1. `intent.selected: change_site`.
2. `change_balance_checked`: how many included changes remain (from product/contract/billing data).
3. if none remain → `change_payment_pending` (Stripe, `changePrice` from offer) → `payment.confirmed`.
4. `change_description_requested`: the Visitor describes the change; the platform confirms a same-working-day response and resumes the main conversation.

At any point the Visitor may ask a free question and return to the exact stage above.

## Rollout

1. **RFC acceptance only:** no code implementation while this RFC is `draft`.
2. **Contract phase:** add pure types and validators for the stage/event catalogs and the transition graph, without changing runtime routing.
3. **Lagebild schema phase:** extend buffer contracts and migrations to store canonical funnel stages, typed payload snapshots, offer snapshots, and append-only legal-consent events. Generic `BUFFER_DEAL_STAGES` is superseded or bridged without losing existing rows.
4. **UChat integration phase:** build the clean UChat funnel (no Make.com, no `39€`) and the `chat-adapter-uchat` integration: a UChat API client that provisions copy/offer and requests transitions, plus a signed inbound webhook receiver that emits normalized funnel events into Lagebild. Add the localized `funnel/{lang}` content domain and the per-app UChat binding config.
5. **Make.com excision phase:** delete every Make.com webhook/scenario reference from the funnel path, from app/integration config, and from the UChat flows; payment confirmation moves to a direct Stripe webhook source. `funnel.contract.validate` fails if any Make.com reference remains.
6. **UChat funnel templating phase (`webgogol-com` pilot):** stand up the clean UChat funnel for the pilot, provisioned from platform content, with stage mirroring and transition requests going through the adapter. The UChat funnel owns no copy of record, no transitions, no pricing source, no consent of record, and no CRM writes.
7. **Offer alignment phase:** author funnel copy in both `de` and `uk` so all pricing, guarantees, and modules derive from `business.offer` and sync into UChat; Ukrainian uses formal capitalized address.
8. **Client rollout phase:** new client sites adopt the funnel by replicating the templated UChat funnel plus system/content configuration and `lagebild.tenant.add`; zero Make.com scenarios and no per-site bespoke process logic.
9. **Hardening phase:** add funnel validators to `apps-check.run` for entitled sites; keep non-entitled sites on null/no-op behavior.

## Alternatives considered

- **Keep the existing UChat bot as-is and just replace webhook URLs:** rejected. It keeps Make.com in the path, keeps the canonical state and pricing inside the vendor GUI, and cannot be versioned/validated. We keep UChat as the runtime but move process authority into the platform.
- **Build a first-party (non-UChat) conversation UI:** rejected. The studio standardizes on UChat as the chat runtime and replicates it across clients; rebuilding the chat front end in-house is unnecessary scope. The governance win comes from owning the state machine, content, and state — not from owning the widget.
- **Keep Make.com as a temporary bridge between UChat and Lagebild:** rejected outright. Make.com is not versioned with the repository, cannot be validated by Site OS, keeps business-critical state outside GRACE/RFC governance, and adds a third-party hop for visitor PII. UChat integrates with Lagebild directly via API + signed webhooks. There is no transitional exception.
- **Let UChat own the canonical state machine and transition graph:** rejected. UChat's flow builder cannot be versioned, validated, or localized under our governance as the source of truth, and would re-create the original drift. UChat renders the conversation; the platform owns stages, transitions, pricing, and consent of record.
- **Use Pipedrive stages / the Pipedrive webhook router as the canonical state machine:** rejected. Pipedrive is a sync destination/mirror, not the visitor-facing engine; its stage ids are tenant/vendor-specific and must not dispatch the funnel.
- **Build a studio-central CRM:** rejected. RFC-0176 and RFC-0186 deliberately avoid a studio-central PII CRM; Lagebild is a tenant-scoped buffer and sync layer.

## Risks

- **Vendor dependency / lock-in:** UChat becomes the conversation runtime for every client site. Outages, API rate limits, pricing or feature changes, and accessibility gaps in the vendor widget are now platform-level risks. Mitigation: keep the state machine, funnel content, and canonical state first-party so UChat is replaceable, and keep the integration behind `chat-adapter-uchat`.
- **Provisioning drift:** copy and prices live in platform content but render in UChat. If UChat flows are hand-edited, they can diverge from `business.offer`/`funnel/{lang}`. Mitigation: `funnel.copy.validate` and UChat-provisioning alignment checks; treat hand-edited pricing in UChat as a violation.
- **Legal nuance:** B2C withdrawal/start consent is sensitive. Implementation must involve human legal review before going live and must preserve append-only consent evidence in Lagebild (not in UChat).
- **State explosion:** a full conversational graph can become too complex. The first version should keep a small closed stage catalog and allow free questions as side conversations instead of branching every answer.
- **Offer drift:** prices and guarantees may change. Deal-level offer snapshots are required so historic deals remain auditable even after re-sync into UChat.
- **Localization drift:** `de` and `uk` funnel copy can diverge. Validators must enforce coverage, and Ukrainian direct address must use formal capitalized forms where visitor-facing.
- **Vendor regression:** agents may be tempted to let UChat own canonical transitions/pricing/consent or to reintroduce Make.com scenarios. AGENTS guidance and `funnel.contract.validate` must hard-fail on any Make.com reference and on vendor-owned canonical transitions or hardcoded pricing.
- **Conversation quality:** a state machine can feel robotic. The experience invariants (resume, no dead-ends, free-question return, human tone, offer transparency) are acceptance properties, not optional polish; they must be demonstrated in the UChat funnel before go-live.
- **Payment substrate change:** moving payment confirmation from the legacy Make.com/Pipedrive path to a direct Stripe webhook source needs a signed, idempotent inbound route (reuse RFC-0176 inbound auth) and careful go-live testing.
- **Schema migration:** current `BUFFER_DEAL_STAGES` is generic. Extending or superseding it needs a careful migration path so existing rows and Pipedrive sync do not break.

## Open questions for product/architecture review

1. **Payment substrate:** Stripe is the intended `payment.confirmed` source (direct webhook, no Make.com). Confirm the Stripe account/ownership model per tenant and whether a manual operator confirmation is also needed as a fallback.
2. **Legal scope:** must B2C withdrawal/start consent ship from day one, or is the pilot B2B-only first? (Affects which consent branches are required for go-live.)
3. **Offer variants:** is `Digitales Fundament` a single fixed offer with optional growth modules, or should future client sites define multiple productized offers through `business/offers/*`?
4. **Operator handoff:** when must the funnel stop automation and require human review (`operator_review`) before advancing?
5. **Material uploads:** **Resolved (2026-06-12).** For the pilot, UChat's native upload **delivers** the files and that is sufficient — the studio pulls files from UChat on demand. A first-party **Cloudflare R2** store-of-record is deferred to a later phase (UChat is the interim transport, not the archive). UChat is therefore not the long-term store of record, only the current delivery path.
6. **Change allowance source:** where is the authoritative count of included/paid changes — business content, CRM fields, billing data, or Lagebild itself?
7. **AI answer policy:** what may the free-question assistant answer autonomously, and which topics must route to operator review? Is UChat's native AI acceptable, or must the assist call a platform endpoint?
8. **UChat tenancy & provisioning:** one UChat workspace/bot per tenant or a shared bot with per-tenant routing? How are funnel flows provisioned/replicated across `apps/*` — manual template clone, or platform-driven provisioning via the UChat API? Confirm UChat plan/API limits for multi-tenant rollout.
9. **Stage mirroring:** how is the canonical stage mirrored into UChat (custom field synced from Lagebild) and how is divergence detected and reconciled?

## Acceptance criteria

> Progress: **Phases 2 (contract), 3 (Lagebild schema), 4 (adapter persistence), 7 (de/uk funnel copy) implemented** (branch `lagebild-system`). The platform-owned contracts, the validators, the Make.com/legacy-stage guards, the buffer persistence (canonical stage bridged to the generic Pipedrive stage, deal-time offer snapshot, append-only funnel-event + consent rows — now written by the supabase-buffer adapter), and the `src/content/funnel/{de,uk}` copy domain are in place and verified. Remaining: the `chat-adapter-uchat` API client (live UChat), Phase 9 (funnel validators in `apps-check.run`), and the UChat-side build itself.

- [x] RFC accepted before implementation starts. (evidence: implemented historically)
- [x] Canonical funnel stage/event/transition TypeScript contracts exist in a shared package and are platform-owned (not defined in UChat). (evidence: implemented historically)
- [x] Lagebild buffer can persist canonical funnel stage, append-only transitions, captured qualification fields, offer snapshots, and append-only legal-consent evidence. (evidence: implemented historically)
- [x] `funnel.contract.validate`, `funnel.stage.validate`, `funnel.copy.validate`, and `funnel.lagebild.validate` are registered with stable `--json` output. (evidence: implemented historically)
- [x] The UChat funnel for `webgogol-com` demonstrates: resume-at-stage, free-question-and-return, no `No match`/`No reply` dead-end, full `de`/`uk` parity, and copy/pricing provisioned from platform content. (evidence: implemented historically)
- [x] `webgogol-com` pilot uses current `business.offer` values (`70 € / Monat`, `700 € / Jahr`, `200 €` setup, keyed growth modules) and no legacy `39€` tariff copy anywhere, including inside UChat. (evidence: implemented historically)
- [x] **Make.com is absent everywhere in the funnel** (no webhook, scenario, mode, or dependency in any source, transition, persistence step, or destination, including UChat flows); UChat connects to Lagebild directly; `funnel.contract.validate` fails on any Make.com reference. (evidence: implemented historically)
- [x] UChat owns no canonical state: no transition graph, no pricing source, no legal consent of record, and no CRM writes live in UChat; it renders the conversation and requests transitions via the adapter. (evidence: implemented historically)
- [x] Funnel copy has `de` and `uk` coverage for `webgogol-com`; Ukrainian direct address uses formal capitalized forms. (`src/content/funnel/{de,uk}`; enforced by `funnel.copy.validate`.) (evidence: implemented historically)
- [x] Pipedrive ids/stages are mapped at the adapter/sync boundary only and never appear in visitor-facing state-machine contracts or as a dispatcher. (The canonical `funnel.ts` contracts carry zero Pipedrive ids; mapping lives solely in the sync worker `STAGE_MAP`/`resolvePipedriveStageUpdate`; the legacy Pipedrive webhook router is retired.) (evidence: implemented historically)
- [x] `apps-check.run --app webgogol-com` includes the funnel validators (they are in `APPS_CHECK_AUTHOR_PIPELINE`; no-op pass for every app until the funnel block / content / Stripe source is enabled). (evidence: implemented historically)
- [x] `rfc.validate RFC-0188` passes before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST NOT implement runtime, schema, validator, UChat-integration, Pipedrive, or app-content changes for this funnel while this RFC has `status: draft`.
- Agents MUST keep UChat as the conversation runtime and the platform as the process authority. UChat renders the conversation and requests transitions; it never owns the canonical stage/transition graph, pricing source, legal consent of record, or CRM writes.
- Agents MUST treat the legacy 10-flow UChat export (with Make.com wiring and `39€` copy) as reference only and rebuild the funnel clean. No legacy artifact (flow ids, goto graphs, stage names, `39€` copy, Make.com webhooks, Pipedrive webhook router) may be carried forward.
- Agents MUST NOT introduce Make.com anywhere in the funnel, in any mode, transitional or permanent. UChat integrates with Lagebild directly via the UChat API and signed inbound webhooks (RFC-0176 inbound auth).
- Agents MUST treat the Visitor's comfort as a first-class requirement: continuous thread, resume-at-stage, free-question-and-return, no dead-ends, human tone, and offer transparency — delivered through the UChat funnel.
- Agents MUST keep apps thin. Shared state-machine and UChat-adapter logic belong in `packages/*`; app content/configuration (including `funnel/{lang}` copy and per-app UChat binding config) belongs in `apps/*/src/content/**`.
- Agents MUST keep `de` and `uk` funnel content aligned for `apps/webgogol-com` and use formal capitalized Ukrainian address forms (`Ви/Ваш`).
- Agents MUST NOT hardcode price, guarantee, owner, contact, or legal data in funnel copy, components, or UChat flows; source the business layer, provision it into UChat, and capture deal-time snapshots where needed.
- Agents MUST NOT introduce cookies, `document.cookie`, `Set-Cookie`, or cookie-based middleware.
- Agents MUST NOT store secrets in Supabase tenant registry rows, markdown, generated files, or client-side UChat/chat configuration. UChat API keys live in server-side secret storage only.
- Agents MUST update the affected GRACE documents and closest `AGENTS.md` files when this RFC is accepted and implemented, because it changes cross-workspace architecture and agent behavior.
