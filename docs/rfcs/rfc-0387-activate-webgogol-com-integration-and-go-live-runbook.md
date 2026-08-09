---
id: RFC-0387
title: "Activate warpgogol-com integration and go-live runbook"
status: draft
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-14
updatedAt: 2026-07-14
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0186
  - RFC-0188
  - RFC-0191
amendedBy: []
related:
  - DNA-40
  - DNA-46
  - DNA-48
  - DNA-49
  - RFC-0175
  - RFC-0176
  - RFC-0181
  - RFC-0186
  - RFC-0188
  - RFC-0190
  - RFC-0191
  - RFC-0381
  - RFC-0385
  - RFC-0386
satisfies:
  - DNA-46
  - DNA-48
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "warpgogol-com is taken live end-to-end through a mission: integrations.funnel enabled, the CRM destination switched from direct pipedrive to supabase-buffer, secrets configured, validators green, and the release propagated alt -> main."
  - "A human integrator can follow one ordered runbook — external accounts, Supabase DDL, Upstash, Pipedrive, Lagebild worker deploy, UChat flows, secrets, validators, smoke tests — without inferring steps from historical RFCs."
  - "The visitor-funnel spec references the Werkstatt/Sternsystem topology (missions/systems), not the retired apps/ layout or the lagebild-system branch."
nonGoals:
  - "Does not change the funnel state machine, buffer contracts, or Stripe adapter (RFC-0188/0190/0191/0385/0386 own those)."
  - "Does not add a new deployable service or command surface — it orchestrates existing Werkstatt and integration commands."
  - "Does not onboard additional client sites; it is the warpgogol-com pilot activation."
  - "Does not automate vendor-console setup (UChat/Pipedrive/Stripe) — those remain human steps documented in the runbook."
---

# RFC-0387: Activate warpgogol-com integration and go-live runbook

## Context

Every platform capability for the visitor sales funnel is implemented in `packages/*` and `services/*`: the chat port (RFC-0175), the inbound → QStash EU → delivery hub (RFC-0176/0181), the Lagebild buffer + shared sync worker (RFC-0186/0190), the funnel state machine (RFC-0188/0219), and the Stripe/lifecycle contour (RFC-0191, completed by RFC-0386). The site `warpgogol-com` has already been extracted to a Sternsystem and released once (`warpgogol-com-r000001`) through the Werkstatt pilot (RFC-0381). The `apps/*` layer is retired; sites are data-only bundles in `systems/*` and are changed only through missions.

What is missing is **activation**: the site's `system.md` still routes CRM directly to `pipedrive` and has no `integrations.funnel` block, the external systems (Supabase, Upstash, Pipedrive, UChat, Stripe) are not provisioned, the shared Lagebild worker/tenant is not deployed, and the operator-facing spec (`docs/specs/visitor-funnel/*`) still describes the pre-Werkstatt `apps/warpgogol-com` layout and the `lagebild-system` branch.

## Problem

There is no single authoritative, ordered procedure to take `warpgogol-com` live under the current Werkstatt model. The knowledge is scattered across nine spec files (written for `apps/`), several RFCs, and command help text. A human integrator cannot execute the launch without reverse-engineering:

- which `system.md` edits belong in a mission Werkstück (not the retired `apps/` tree);
- how to switch the CRM destination from `pipedrive` to `supabase-buffer` and enable `integrations.funnel`;
- which secrets exist, and their canonical names (including the tenant secret corrected by RFC-0385);
- the exact order of external-system provisioning versus platform validators;
- which validators are the go-live gate and when they move into the standard pipeline (RFC-0188 Phase 9).

## Decision

This RFC defines the authoritative warpgogol-com go-live runbook and activation policy: the funnel is activated by a mission that enables `integrations.funnel` and switches the CRM destination to `crm:supabase-buffer`; the human integrator follows the ordered runbook in this document; the `docs/specs/visitor-funnel/*` spec is realigned to the Werkstatt/Sternsystem topology; and once the pilot is stable the four `funnel.*` validators join the standard site-check pipeline.

## Architectural fit

- **DNA-46 (Mission lifecycle):** all site data changes (enabling the funnel, switching the destination, secrets references) pass through a mission Werkstück, reconciled to the Sternsystem repo — never edited in place.
- **DNA-48 (Release discipline):** activation ships as a published, snapshot-verified release promoted alt → main (DNA-49), not a hand deploy.
- **DNA-40 (Env contract):** all secrets are documented env variables set in the deploy env / `.werkstatt/secrets/`, never in content or the tenant registry.
- **RFC-0186/0188/0191:** this RFC is the operational amendment that turns those implemented capabilities on for the pilot; it changes no contract.
- **Forward-only discipline:** the direct `pipedrive` CRM destination is replaced by `supabase-buffer` (buffer-first) — the direct path is removed for this site, not kept as a fallback.

## Design

### Activation change set (inside a mission Werkstück)

The `system.md` `integrations` block for `warpgogol-com` changes as follows:

```yaml
integrations:
  chat:
    adapter: uchat
    options:
      widgetId: ndslwdpu82roynku
  inbound:
    sources:
      - uchat
      - stripe          # Tier 2 (RFC-0386)
  destinations:
    - kind: crm
      vendor: supabase-buffer   # was: pipedrive (direct). Buffer-first; worker -> Pipedrive.
      mode: gogol-adapter
  funnel:                       # NEW (RFC-0188)
    version: "1.0.0"            # must equal FUNNEL_VERSION
    enabled: true
    sources:
      - uchat
      - stripe                  # Tier 2 (RFC-0386)
  region: eu
  tier: shared
  delivery:
    provider: upstash
    region: eu
```

### Secrets (canonical names)

Set in the deploy env and `.werkstatt/secrets/warpgogol-com/{alt,main}.env` (gitignored, RFC-0379):

```
INTEGRATION_INBOUND_SECRET
UPSTASH_QSTASH_URL
UPSTASH_QSTASH_TOKEN
UPSTASH_QSTASH_CURRENT_SIGNING_KEY
UPSTASH_QSTASH_NEXT_SIGNING_KEY
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
SUPABASE_BUFFER_URL
SUPABASE_BUFFER_SERVICE_KEY
SUPABASE_BUFFER_TENANT_ID          # canonical (RFC-0385) — NOT TENANT_ID
INTEGRATION_EMAIL_TO
INTEGRATION_EMAIL_FROM
# Tier 2 (RFC-0386):
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_BASE_MONTHLY
STRIPE_PRICE_BASE_YEARLY
STRIPE_PRICE_SETUP
```

Per-tenant Lagebild worker secrets follow the `TENANT_WEBGOGOL_COM_*` pattern in `services/lagebild-sync-worker` (RFC-0186).

### Go-live gate (validators)

The following must pass for `warpgogol-com` before propagation:

```sh
pnpm exec werkstatt run funnel.contract.validate    --site warpgogol-com --json
pnpm exec werkstatt run funnel.stage.validate       --site warpgogol-com --json
pnpm exec werkstatt run funnel.copy.validate        --site warpgogol-com --json
pnpm exec werkstatt run funnel.lagebild.validate    --site warpgogol-com --json
pnpm exec werkstatt run funnel.org.validate         --site warpgogol-com --json
pnpm exec werkstatt run integration.config.validate --site warpgogol-com --json
pnpm exec werkstatt run integration.secrets.validate --site warpgogol-com --json
pnpm exec werkstatt run consent.activation.validate --site warpgogol-com --json
pnpm exec werkstatt run legal.processors.validate   --site warpgogol-com --json
# Tier 2:
pnpm exec werkstatt run billing.config.validate     --site warpgogol-com --json
pnpm exec werkstatt run billing.secrets.validate    --site warpgogol-com --json
```

### Pipeline promotion (RFC-0188 Phase 9)

Once the pilot is stable, the four `funnel.*` validators are added to `APPS_CHECK_AUTHOR_PIPELINE` in `@warpgogol/site-kernel-checks` so every mission build runs them.

### Spec realignment

`docs/specs/visitor-funnel/{00,05,09,README}.md` are updated to reference the Werkstatt/Sternsystem topology: `systems/warpgogol-com/src/content/system.md` and mission Werkstück paths replace `apps/warpgogol-com/*`; the `lagebild-system` branch reference and stale "to-build" rows are updated to reflect implemented RFC-0190/0191 and the existing `systems/warpgogol-com/src/content/funnel/{de,uk}` copy domain.

## Human integrator runbook (ordered)

> Execute in order. Each phase ends with a verify gate; do not proceed past a red gate. `<SITE>` = `warpgogol-com`.

### Phase 0 — accounts & platform fixes

1. Create/confirm accounts: **UChat**, **Pipedrive**, **Stripe** (studio's own for the pilot), **Supabase** (EU region), **Upstash** (QStash + Redis, EU).
2. Ensure RFC-0385 (tenant-secret fix) and — for Tier 2 — RFC-0386 (lifecycle deltas) are implemented and merged.

### Phase 1 — Supabase / Lagebild (EU)

3. Apply DDL in order (all additive + idempotent): `services/lagebild-sync-worker/supabase/funnel-base.sql`, `funnel-phase3.sql`, `organizations.sql`, `subscriptions-invoices.sql`.
4. Record `SUPABASE_BUFFER_URL`, `SUPABASE_BUFFER_SERVICE_KEY`, and the tenant UUID for `SUPABASE_BUFFER_TENANT_ID`.

### Phase 2 — Upstash (EU)

5. Create QStash (eu-central-1) and Redis (EU). Record `UPSTASH_QSTASH_URL`, `UPSTASH_QSTASH_TOKEN`, both signing keys, and the Redis REST url + token.

### Phase 3 — Pipedrive

6. Create the four pipelines (Acquisition, Onboarding & Production, Subscription & Lifecycle, Change & Support) with the stages from spec §01; record every stage id.
7. Create the custom fields incl. `funnel_stage` (single-select), `site_key`, `lagebild_*`, `organization_name`; configure Acquisition lost reasons.
8. **Verify:** the `funnel_stage` option list is byte-identical to `VISITOR_FUNNEL_STAGES` (26 stages).

### Phase 4 — Lagebild worker

9. `pnpm exec werkstatt run lagebild.tenant.add --site <SITE>`.
10. Set the `TENANT_WEBGOGOL_COM_*` secrets via `wrangler secret put`; then `lagebild.tenant.enable --site <SITE>`.
11. `pnpm exec werkstatt run lagebild.worker.deploy`.
12. **Verify:** `lagebild.validate` and `lagebild.tenant.status --site <SITE>` are green (no per-site workers, no leaked values).

### Phase 5 — site activation mission

13. `mission.open --system <SITE> --brief "Activate visitor funnel (Lagebild + UChat)"` → note the mission id (`<SITE>-mNNNNNN`).
14. `mission.materialize --mission <MISSION>`.
15. In the Werkstück `system.md`, apply the activation change set above (enable `integrations.funnel`, switch CRM destination to `supabase-buffer`; add `stripe` sources only for Tier 2).
16. Populate `.werkstatt/secrets/<SITE>/{alt,main}.env` with the canonical secrets.
17. Ensure the Datenschutz page names all processors (UChat, Supabase, Upstash, Pipedrive, Stripe) with a studio↔client DPA reference — already present in `systems/<SITE>/src/content/prose/{de,uk}/datenschutz.md`; verify.
18. **Verify (go-live gate):** run every validator in the "Go-live gate" list above; all green.

### Phase 6 — UChat flows

19. Build the flows/subflows from `systems/<SITE>/src/content/funnel/{de,uk}` (welcome, create-site, change-site, consent, ask-anything) node-by-node per spec §03.
20. Set offer variables from `business/{lang}/offer.md` (never hardcode a price); re-sync on any offer change.
21. Wire the Stage-Tracker External Request → `POST https://warpgogol.com/api/integration-inbound` with `Authorization: Bearer {INTEGRATION_INBOUND_SECRET}` and the normalized event body (spec §06). Set `organization.name` from qualification (RFC-0190).
22. Configure the AI free-question KB and operator-handoff triggers. **Tier 1:** payment step routes to manual operator confirmation. **Tier 2:** payment step shows the Stripe Checkout URL.
23. Confirm the click-to-load launcher loads UChat only after DSGVO acknowledgement (RFC-0175/0177).

### Phase 7 — release & propagate

24. `mission.validate --mission <MISSION>` → `mission.build --mission <MISSION>`.
25. `release.prepare --mission <MISSION>` → `release.publish --release <RELEASE>`.
26. `leitstand.propagate --release <RELEASE> --channel alt` → verify `leitstand.health --system <SITE> --channel alt`.
27. `leitstand.propagate --release <RELEASE> --channel main` → verify health on main.
28. `mission.reconcile --mission <MISSION>` → `mission.close --mission <MISSION>`.

### Phase 8 — smoke tests (definition of done)

29. Full create-site journey de/uk: welcome → DSGVO → intent → qualification (incl. "for which company?") → offer (prices from `offer.md`) → payment (manual T1 / Stripe T2) → B2B consent → legal data → materials → done. Verify resume-at-stage, free-question-and-return, no dead-ends, de/uk parity.
30. Lagebild has `buffer_contacts`, `buffer_organizations`, `buffer_deals` (with `funnel_stage` + `offer_snapshot`), append-only `buffer_funnel_events`, and a `buffer_consent_events` row.
31. Pipedrive shows Person → N Deals → Organization with the precise `funnel_stage`.
32. Change request: included (decrements balance) and — Tier 2 — paid (`changePrice` invoice).
33. **Tier 2 only:** a renewal (`invoice.paid` → balance reset) and a failed payment (`invoice.payment_failed` → P3 At-risk).
34. No Make.com anywhere; `funnel.contract.validate` stays green.

### Rollback / abort

- The launcher is click-to-load — nothing third-party loads before consent, so disabling is safe.
- To pause a site: `lagebild.tenant.disable --site <SITE>` (keeps history).
- To pull the funnel: open a mission that removes `integrations.funnel` from `system.md` (validators return to no-op) and unpublish the UChat flow. No data is lost (Lagebild is the durable record).
- Deployment rollback: `leitstand.rollback --system <SITE> --channel <alt|main>`.

## Rollout

1. Implement RFC-0385 (Tier 1 unblock) and — for Tier 2 — RFC-0386.
2. Realign `docs/specs/visitor-funnel/{00,05,09,README}.md` to the Werkstatt/Sternsystem topology and link this RFC.
3. Execute the human integrator runbook (Phases 0–8) once for `warpgogol-com`, Tier 1 first.
4. After the first stable Tier-1 launch, add the four `funnel.*` validators to `APPS_CHECK_AUTHOR_PIPELINE` in `@warpgogol/site-kernel-checks` (RFC-0188 Phase 9) so every mission build runs them.
5. Enable Tier 2 in a follow-up mission (add `stripe` to `inbound.sources` + `funnel.sources`, set `STRIPE_*` secrets) after RFC-0386 is verified live.
6. New client sites adopt the same runbook; nothing about this activation is `warpgogol-com`-specific except the recorded ids and secrets.

## Alternatives considered

- **Edit `system.md` directly in a working copy.** Rejected: sites are data-only Sternsystems; all changes pass through a mission (DNA-46/47).
- **Keep the direct `pipedrive` CRM destination and add the buffer alongside.** Rejected: `integration.config.validate` reports `multiple-active-executors` for `(kind=crm)`; buffer-first is the single chosen executor.
- **Document the runbook only in `docs/specs`, not an RFC.** Rejected: activation amends the operational contract of RFC-0186/0188/0191 and defines a pipeline-promotion policy (Phase 9), which needs RFC governance; the spec is the detailed companion, kept in sync by this RFC.

## Risks

- **External-console drift (stage ids, price ids).** Mitigation: the runbook records ids and asserts `funnel_stage` parity against `VISITOR_FUNNEL_STAGES`.
- **Secret misnaming.** Mitigation: canonical names listed here; RFC-0385 removes the `TENANT_ID` ambiguity.
- **Agent misinterpretation.** An agent might edit the Sternsystem repo directly or reintroduce the direct Pipedrive destination. The Implementation notes forbid both.
- **Spec/code divergence recurring.** Mitigation: the acceptance criteria require the spec to reference the Werkstatt topology and this RFC.

## Acceptance criteria

- [ ] The warpgogol-com `system.md` (via a reconciled mission) has `integrations.funnel.enabled: true` with `version` equal to `FUNNEL_VERSION`, and the CRM destination is `crm:supabase-buffer` (no direct `pipedrive` destination).
- [ ] The go-live gate validators all pass for `warpgogol-com` (Tier 1 set; Tier 2 set when Stripe is enabled).
- [ ] The shared Lagebild worker is deployed and the `warpgogol-com` tenant is enabled (`lagebild.validate` + `lagebild.tenant.status` green).
- [ ] `docs/specs/visitor-funnel/{00,05,09,README}.md` reference `systems/`/mission paths and this RFC, not `apps/warpgogol-com` or the `lagebild-system` branch.
- [ ] The four `funnel.*` validators are added to `APPS_CHECK_AUTHOR_PIPELINE` (RFC-0188 Phase 9) once the pilot is stable.
- [ ] A release is propagated alt → main and health-verified for `warpgogol-com`.
- [ ] The Phase 8 smoke tests pass (Tier 1 at minimum).
- [ ] `rfc.validate RFC-0387` passes on this file before merging.

## Implementation notes for agents

- Agents MAY perform activation changes ONLY when this RFC has status `accepted` (or `implemented`), and only after RFC-0385 (Tier 1) — plus RFC-0386 for Tier 2 — are implemented.
- All site data changes MUST go through a mission Werkstück and be reconciled to the Sternsystem repo. Agents MUST NOT edit `systems/warpgogol-com/**` in place or add runtime files to the Sternsystem repo (DNA-44).
- Do NOT keep the direct `pipedrive` CRM destination alongside `supabase-buffer`; the buffer is the single active CRM executor for this site.
- Secrets live only in the deploy env / `.werkstatt/secrets/**` (gitignored). Never commit secret values or place them in content or the tenant registry.
- Vendor-console steps (UChat/Pipedrive/Stripe) are human actions; agents document and verify them but do not fabricate console state.
- Before stamping `implemented`, run `site-kernel run rfc.verification.emit --id RFC-0387` and commit the evidence file in the same commit.
- On invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0387 --reason "..." --invariant "DNA-46"` instead of working around it.
