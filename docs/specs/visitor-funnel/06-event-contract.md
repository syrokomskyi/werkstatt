# 06 — Event contract & stage mapping

> The integration glue: the normalized event UChat/Stripe POST, and the one true mapping of **canonical funnel stage ↔ UChat node ↔ generic buffer stage ↔ Pipedrive pipeline·stage**. Source of truth: `@gogol/integration` (`funnel.ts`, `crm-buffer.ts`).

> **State chart (RFC-0219):** the "which event fires this edge?" question is now answered by the generated graph — see [`state-chart.generated.md`](state-chart.generated.md). The prose mapping table below remains the human reference; the chart is the machine-verified single source for trigger→edge relationships. Read the chart before modifying transition logic.

## Normalized event envelope

Every source (UChat, Stripe, operator) POSTs the same `IntegrationEvent` to `/api/integration-inbound` (RFC-0176). The funnel payload rides inside `payload`:

```jsonc
{
  "eventId": "string",          // idempotency key — stable per logical step
  "kind": "message",            // transport kind ∈ {lead,message,appointment}; funnel kind 🔭 Ph4
  "source": "uchat",            // ∈ {uchat, stripe, operator, send-message}
  "locale": "de",
  "occurredAt": "2026-06-12T10:00:00Z",
  "contact": { "name": "...", "email": "...", "phone": "..." },
  "payload": {                  // VisitorFunnelEventPayload
    "funnelVersion": "1.0.0",
    "eventKind": "offer.selected",
    "stage": "offer_presented",
    "previousStage": "qualification_region",
    "intent": "create_site",
    "organization": { "id": "...", "name": "Bäckerei Müller GmbH" },
    "qualification": { "priority": "new_customers", "companyName": "...", "serviceOrIndustry": "...", "region": "..." },
    "offer": { "plan": "digital_foundation_monthly", "growthModules": ["visibility"], "priceSnapshot": { "monthly": "70 € / Monat", "setup": "200 €" } },
    "legal": { "buyerType": "business", "startBeforeWithdrawalPeriod": true },
    "changeRequest": { "includedChangesAvailable": 2, "description": "..." }
  }
}
```

Include only the sub-objects relevant to the `eventKind`. Full field types: `VisitorFunnelEventPayload` in `funnel.ts`.

### Event kinds (closed catalog)

`session.started` · `privacy.acknowledged` · `language.selected` · `intent.selected` · `organization.selected` · `qualification.answered` · `offer.selected` · `payment.link.requested` · `payment.confirmed` · `start.choice.selected` · `buyer.type.selected` · `legal.consent.recorded` · `material.submitted` · `change.requested` · `operator.note.added`.

🔭 RFC-0191 adds lifecycle kinds: `invoice.paid`, `invoice.payment_failed`, `subscription.updated`, `subscription.canceled`.

### Idempotency

`eventId` must be stable per logical step (a UChat retry or a Stripe redelivery must not double-write). The buffer dedups:

- `buffer_funnel_events.idempotency_key = eventId` (append-only, ignore-duplicates);
- the QStash/Redis ledger dedups in-flight delivery (RFC-0181).

Recommended `eventId`: `{uchat_contact_id}:{eventKind}:{step_nonce}` for UChat; `{stripe_event_id}` for Stripe (already unique).

## Master mapping table

| Canonical stage | Event kind(s) | UChat (§03) | Buffer stage (bridge) | Pipedrive pipeline · stage |
| --- | --- | --- | --- | --- |
| `new_session` | `session.started` | 1.1 Welcome | `new` | P1 · New conversation |
| `privacy_acknowledged` | `privacy.acknowledged` | 1.1 → Yes | `new` | P1 · New conversation |
| `intent_selected` | `intent.selected` | 1.3 Intent | `contacted` | P1 · New conversation |
| `organization_selected` | `organization.selected` | 2.0 | `contacted` | P1 · New conversation |
| `qualification_priority` | `qualification.answered` | 2.1 | `qualified` | P1 · Qualified |
| `qualification_company` | `qualification.answered` | 2.2 | `qualified` | P1 · Qualified |
| `qualification_service` | `qualification.answered` | 2.3 | `qualified` | P1 · Qualified |
| `qualification_region` | `qualification.answered` | 2.4 | `qualified` | P1 · Qualified |
| `offer_presented` | `offer.selected` | 3.1 | `proposal` | P1 · Offer presented |
| `payment_pending` | `payment.link.requested` | 3.2 | `proposal` | P1 · Payment pending |
| `payment_confirmed` | `payment.confirmed` (Stripe) | — (resume) | `negotiation` | P1 · **Won** → spawn P2+P3 |
| `start_choice_pending` | `start.choice.selected` | 4.1 | `negotiation` | P2 · Start consent |
| `start_deferred` | `start.choice.selected` | 4.1 → defer | `negotiation` | P2 · Start consent (`start_after`) |
| `buyer_type_pending` | `buyer.type.selected` | 4.2 | `negotiation` | P2 · Start consent |
| `b2b_start_consent_pending` | `legal.consent.recorded` | 4.3 | `negotiation` | P2 · Start consent |
| `b2c_withdrawal_consent_pending` 🔭 | `legal.consent.recorded` | (deferred) | `negotiation` | P2 · Start consent |
| `start_approved` | `legal.consent.recorded` | 4.3 → Yes | `negotiation` | P2 · Start consent → Legal data |
| `legal_data_requested` | `material.submitted` | 5.1 | `negotiation` | P2 · Legal data |
| `materials_requested` | `material.submitted` | 5.2 | `negotiation` | P2 · Materials |
| `production_ready` | `material.submitted` | 5.3 | `negotiation` | P2 · In production |
| `change_balance_checked` | `change.requested` | 6.1 | `contacted` | P4 · Requested |
| `change_payment_pending` | `change.requested` | 6.2b | `proposal` | P4 · Payment pending |
| `change_description_requested` | `change.requested` | 6.3 | `negotiation` | P4 · In progress |
| `operator_review` | `operator.note.added` | §7 Handoff | `negotiation` | (handoff activity, any pipeline) |
| `won` | — (operator / Stripe) | — | `won` | P1/P2 · Won; P3 · Active |
| `lost` | — (operator / inactivity) | — | `lost` | P1 · Lost; P3 · Churned |

> The **buffer-stage** column is the platform bridge `FUNNEL_STAGE_TO_BUFFER_STAGE` (`crm-buffer.ts`); the worker maps that to the Pipedrive `stage_id` (`STAGE_MAP`). The Pipedrive column is this guide's pipeline design (§01) — the precise stage is also written verbatim to the `funnel_stage` custom field. Keep all three in sync by changing **only** the platform constants, never the vendor consoles by hand.

> Note: terminal stages `won`/`lost` are synced via Pipedrive's deal **status** field, not a `stage_id` (Pipedrive closes deals by status). The worker `resolvePipedriveStageUpdate` handles this with an exhaustiveness guard over `BUFFER_DEAL_STAGES` (fixed in commit `56185318`).

## Resume-by-stage

On re-entry, the platform returns the current `funnel_stage` (from Lagebild); UChat routes to the matching node above. The free-question side conversation (§7) never changes `funnel_stage`, so "back to my request" always lands on the exact step.
