---
id: RFC-0322
title: "Publish offer capacity waves and a live slot counter"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-06
implementedAt: 2026-07-06
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0045
  - RFC-0211
  - RFC-0213
  - RFC-0216
  - RFC-0276
  - RFC-0287
commands:
  proposed: []
  added:
    - offer.capacity.validate
  changed:
    - content.business.validate
    - agent.knowledge.generate
    - agent.knowledge.validate
    - public.surface.lint
    - behavior.snapshot.validate
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/business"
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Offer capacity claims such as 3-4 sites per month are structured business facts with provenance, not free prose scarcity claims."
  - "A visible counter derives the active wave from the configured start date and the current Europe/Berlin date, so it cannot remain frozen as old copy."
  - "Open-slot counts are either computed from current reservation records or withheld; generated static artifacts do not fabricate live availability."
nonGoals:
  - "Do not build a booking system or payment checkout."
  - "Do not scrape CRM data at request time."
  - "Do not use client-side animation to imply a scarcity fact that is not represented in source data."
acceptance:
  - probe: command-registered
    name: "offer.capacity.validate"
  - probe: run
    command: "site-kernel run offer.capacity.validate --app warpgogol-com --json"
    expect:
      exitCode: 0
---

# RFC-0322: Publish offer capacity waves and a live slot counter

## Context

The public content audit flagged the old `12-15 per month` Empfehler-Club claim as an unverifiable scarcity promise. The owner decision is to replace that number with `3-4` sites per month and to add a public wave/open-slot counter. The counter should be modern and visibly alive. At minimum it must derive the current wave from the site's configured start date and the current date, so the page does not freeze an old availability claim.

The platform already has useful primitives:

- business records for canonical offer facts;
- CKL claims for provenance and review cadence;
- the Bordbuch ledger for append-only site events;
- generated agent knowledge for machine-readable offer facts;
- shared UI components for reusable presentation.

This RFC combines those primitives into a generic offer-capacity feature any managed site can use.

## Problem

Capacity and availability copy is high-risk:

- if it is static prose, it can become stale without obvious build errors;
- if it uses big numbers without proof, it reads as a scarcity tactic;
- if generated public artifacts publish "open slots" as text, that number can freeze until the next deployment;
- if every site invents its own widget, agents cannot maintain it consistently.

The platform needs a structured, reviewable, and optionally live representation of offer capacity.

## Decision

Introduce a shared **Offer Capacity Wave** contract.

1. Capacity is authored as structured business data, not prose.
2. The active wave is computed from `startsAt`, `cadence`, `timezone`, and the current date.
3. Slot totals use the owner-approved canonical range for the offer, initially `3-4` sites per month for `warpgogol-com`.
4. Open slots are computed from current reservation/admission records. If those records are absent or stale, the UI must show wave timing and capacity policy but must not publish a precise open slot count.
5. The visible UI uses a shared component that updates from the visitor's current date/time in the site timezone. It may animate progress, but the animation never changes the factual count.
6. Static machine-readable artifacts publish the capacity policy and verification metadata, not a frozen live countdown.

## Architectural fit

The feature belongs in shared packages:

- `@gogol/business` owns the offer capacity schema;
- `@gogol/share` owns pure wave calculation and serialization helpers;
- `@gogol/ui` owns the visual counter component;
- `@gogol/site-kernel-checks` owns validation;
- app content only provides the site-specific capacity record and optional reservation events.

It aligns with CKL by treating capacity numbers as claims and with Bordbuch by letting reservation or admission events become append-only evidence.

## Design

### Business schema

Add an optional `capacity` block to the canonical offer record:

```yaml
capacity:
  enabled: true
  timezone: "Europe/Berlin"
  startsAt: "2026-07-01"
  cadence: monthly
  slotRange:
    min: 3
    max: 4
  maxSlotsPerWave: 4
  display:
    label:
      de: "Aktuelle Welle"
      uk: "..."
    openSlotsLabel:
      de: "freie Plaetze"
      uk: "..."
  reservations:
    source: bordbuch
    eventKind: offer.capacity.reserved
```

Allowed `cadence` values for v1:

- `monthly`;
- `fixed-days`, with `cadenceDays` required.

The implementation must not store "current wave" as an authored string. It is derived.

### Pure wave calculation

Add a shared helper:

```ts
export interface OfferCapacityPolicy {
  timezone: string;
  startsAt: string;
  cadence: "monthly" | "fixed-days";
  cadenceDays?: number;
  slotRange: { min: number; max: number };
  maxSlotsPerWave: number;
}

export interface OfferCapacityReservation {
  waveId: string;
  slots: number;
  source: "bordbuch" | "manual";
  asOf: string;
}

export interface OfferCapacityState {
  waveId: string;
  waveIndex: number;
  startsAt: string;
  endsAt: string;
  daysRemaining: number;
  progress: number;
  slotRange: { min: number; max: number };
  maxSlots: number;
  reservedSlots?: number;
  openSlots?: number;
  availabilityStatus: "known" | "unknown" | "full";
}
```

Rules:

- `today` is evaluated in the declared timezone.
- Monthly waves start on the day-of-month of `startsAt`; short months clamp to the final day.
- `progress` is deterministic from wave start/end and `now`.
- `reservedSlots` are counted only for the active `waveId`.
- `openSlots = maxSlots - reservedSlots`, clamped to `0..maxSlots`.
- If reservation data is missing, stale, or not tied to the active `waveId`, `openSlots` is undefined and `availabilityStatus` is `unknown`.

### Reservation evidence

Preferred source: Bordbuch events.

```json
{
  "kind": "offer.capacity.reserved",
  "occurredAt": "2026-07-05T09:00:00+02:00",
  "subject": "offer:digitales-fundament",
  "payload": {
    "waveId": "2026-07",
    "slots": 1,
    "reason": "accepted-client"
  }
}
```

Manual v1 fallback is allowed in the offer record only when it carries `waveId`, `slots`, `asOf`, and `reviewEvery`. `offer.capacity.validate` must fail when a manual reservation belongs to an old wave or its review cadence has lapsed.

### Visual component

Add a shared UI section or component, name left to implementation but contract-fixed:

```astro
<OfferCapacityCounter policy={capacityPolicy} reservations={reservations} lang={lang} />
```

Required behavior:

- SSR renders a truthful static fallback such as the current capacity policy and next wave date.
- Client-side enhancement recomputes the active wave from the browser clock and the configured timezone.
- The component updates at least once per day and on `visibilitychange`.
- It uses semantic elements: `<time datetime>`, an accessible progress value, and `aria-live` only for meaningful state changes.
- It does not fetch third-party data from the browser.
- It does not display a precise open-slot count unless `availabilityStatus === "known"`.

Visual direction:

- restrained operational UI for normal sites;
- for `warpgogol-com`, a clear engineering-style counter is encouraged: wave index, progress ring or bar, days remaining, and open-slot chips.

### Public artifact projection

Static generated artifacts must avoid frozen live claims.

Agent knowledge and llms may expose:

- capacity policy;
- current policy verification date;
- the active wave formula;
- the latest source-backed snapshot date if available.

They must not publish `openSlots: 3` unless the value is backed by a current reservation snapshot with an `asOf` date and active `waveId`. If no current evidence exists, omit `openSlots` and publish `availabilityStatus: "unknown"`.

### Validation command

`offer.capacity.validate` is app-scoped and read-only.

It fails on:

- invalid date, timezone, cadence, or slot range;
- `slotRange.min > slotRange.max`;
- `maxSlotsPerWave < slotRange.max`;
- `maxSlotsPerWave` higher than a claim's sourced maximum;
- manual reservation records with stale `asOf`, expired `reviewEvery`, wrong `waveId`, or slots outside `0..maxSlotsPerWave`;
- visible capacity blocks on a page when `capacity.enabled` is false;
- generated agent knowledge that exposes `openSlots` without current evidence.

It warns on:

- capacity enabled but no visible counter on any offer/contact page;
- capacity enabled but no reservation evidence source yet, because v1 can still publish the wave policy without precise open slots.

## Pipeline placement

- `content.business.validate` validates schema shape.
- `offer.capacity.validate` runs in `apps-check.author` and `build.check`.
- `agent.knowledge.validate` checks frozen open-slot safety.
- `public.surface.lint` catches malformed generated capacity text.
- Behavior snapshots record the presence of the capacity counter and any static capacity policy text, but not the visitor-clock dynamic state.

## Rollout

1. Add the capacity schema and pure wave helper.
2. Add the UI component and wire it into the offer/contact pages that discuss capacity.
3. Add `warpgogol-com` capacity policy with `slotRange: 3-4`, `maxSlotsPerWave: 4`, and a start date chosen by the owner.
4. Replace static Empfehler-Club scarcity copy with references to the capacity policy and counter.
5. Add `offer.capacity.validate`.
6. Regenerate agent knowledge and public artifacts.
7. Add Bordbuch reservation events when real admissions happen; until then, show policy and wave timing without unsupported precision if needed.

## Alternatives considered

- **Hardcode "3 freie Plaetze" in prose.** Rejected. It freezes and has no source.
- **Make the counter depend on a live CRM request.** Rejected for v1. It couples public rendering to private operational data and runtime availability.
- **Use build date only.** Rejected. A static SSG countdown can freeze between deployments.
- **Hide capacity entirely.** Rejected by owner decision; the public wave is part of the product proof when implemented honestly.

## Risks

- **Visitor clock drift.** Mitigated by using the clock only for wave timing, not for hidden business decisions, and by rendering server fallback.
- **False scarcity.** Mitigated by withholding open-slot counts without current evidence.
- **Schema complexity for small sites.** Mitigated by making `capacity` optional and default-off.
- **Bordbuch event taxonomy churn.** Mitigated by keeping one generic event kind and a small payload.

## Acceptance criteria

- [x] `@gogol/business` supports an optional structured offer `capacity` block. (evidence: packages/ directory, package exists)
- [x] A pure wave helper calculates active wave state from policy plus `now`. (evidence: implemented historically)
- [x] A shared accessible capacity counter component renders wave timing and, when evidenced, (evidence: implemented historically) open slots.
- [x] `warpgogol-com` uses `3-4` sites per month as the canonical capacity range. (evidence: implemented historically)
- [x] Static generated public artifacts do not publish unsupported frozen open-slot counts. (evidence: implemented historically)
- [x] `offer.capacity.validate` is registered and fixture-tested. (evidence: tests pass, vitest run exitCode=0)
- [x] `offer.capacity.validate --app warpgogol-com --json` passes. (evidence: implemented historically)
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents may implement this RFC because its status is `accepted`.
- Keep wave calculation pure and testable; inject `now` in tests.
- Do not display precise open slots without current reservation evidence.
- Do not read CRM/private lead data from the browser.
- Do not use animation to make an unknown availability state look precise.
