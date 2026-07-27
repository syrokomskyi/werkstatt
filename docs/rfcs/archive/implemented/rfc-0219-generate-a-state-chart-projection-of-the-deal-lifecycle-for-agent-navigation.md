---
id: RFC-0219
title: "Generate a state-chart projection of the deal lifecycle for agent navigation"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-20
updatedAt: 2026-06-20
implementedAt: 2026-06-20
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0188
  - RFC-0191
amendedBy: []
related:
  - RFC-0190
commands:
  proposed:
    - funnel.statechart.generate
    - funnel.statechart.validate
  added:
    - funnel.statechart.generate
    - funnel.statechart.validate
  changed:
    - funnel.stage.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/share
  - packages/os/site-kernel-checks
successSignals:
  - "An AI agent (or a human) can navigate the entire deal lifecycle from one explicit, named, edge-labelled graph instead of reconstructing it from a stream of events — and that graph is provably identical to the transition functions the runtime actually executes."
  - "The state chart can never silently drift from the code: it is generated from the canonical transition functions and a drift validator fails the build byte-for-byte if the committed diagram and the code disagree."
  - "Every funnel edge carries its triggering event, so the question 'what event moves a deal from A to B?' is answered by the graph itself — not by cross-referencing a separate table."
  - "The post-sale subscription lifecycle (active / past_due / canceled) is as explicit and machine-checked as the visitor funnel, closing the gap between the pre-sale and post-sale halves of the deal."
nonGoals:
  - "Do not make the diagram a second source of truth: it is a projection of FUNNEL_TRANSITIONS / SUBSCRIPTION_TRANSITIONS, never hand-authored alongside them."
  - "Do not introduce Event Sourcing or replace the existing State (Postgres buffer) with a replayed event log — State stays the source of truth; this RFC only makes the State's transition graph explicit and rendered."
  - "Do not move transition authority into the diagram or any vendor tool — the platform transition functions remain the only authority (RFC-0188)."
  - "Do not implement before this RFC is accepted."
---

# RFC-0219: Generate a state-chart projection of the deal lifecycle for agent navigation

## Context

The visitor sales funnel (RFC-0188) is already a platform-owned state machine: `VISITOR_FUNNEL_STAGES` is the closed state catalog and `FUNNEL_TRANSITIONS` is the pure transition function, with `funnel.stage.validate` proving reachability. The post-sale lifecycle (RFC-0191) adds subscription/invoice states (`SUBSCRIPTION_STATUSES`, `INVOICE_STATUSES`) driven by `LIFECYCLE_EVENT_KINDS`. The canonical state therefore lives, correctly, in version-controlled TypeScript and in the Lagebild Postgres buffer — not in a replayed event log.

A recurring observation (most recently framed via the "transformers represent belief-state geometry" result) is that **AI agents navigate an explicit, named graph of anchor entities far more reliably than a stream of undifferentiated events.** Our contracts already provide that graph as code, but two things are missing for an agent — and a human — to _navigate_ it:

1. the funnel transition graph has **unlabelled edges** — the relationship "event X moves a deal from stage A to stage B" lives in a separate prose table (`06-event-contract.md`), not on the edge;
2. there is **no rendered, drift-guarded diagram** of the whole deal lifecycle — agents must reconstruct it from `FUNNEL_TRANSITIONS`, the master mapping table, and the lifecycle handlers.

## Problem

Without an explicit, edge-labelled, drift-guarded state chart:

- an agent implementing or modifying transition logic must stitch the graph together from three places (the transition map, the event-kind catalog, and the prose mapping table), increasing the chance of an incorrect transition;
- the event→transition relationship is implicit, so "which event fires this edge?" cannot be answered from the graph alone;
- the post-sale subscription lifecycle has no explicit transition graph at all (it is implied by the lifecycle event handlers), so the pre-sale and post-sale halves of a deal are described asymmetrically;
- any diagram a human draws by hand will drift from `FUNNEL_TRANSITIONS` the moment the catalog changes, becoming actively misleading — the worst kind of documentation.

The risk is subtle: the system is correct, but its _navigability_ by agents is lower than it could be, which raises the cost and error rate of every future change to the funnel.

## Decision

Make the deal-lifecycle state machine **explicit and rendered** as a layered state chart that is a **generated projection** of the canonical transition functions — never a parallel source of truth.

1. **Enrich the funnel graph with triggers.** Add `FUNNEL_TRANSITION_TRIGGERS` to `@gogol/share/integration` — one entry per edge of `FUNNEL_TRANSITIONS`, labelling each transition with its triggering `VisitorFunnelEventKind` (or a small reserved set of system triggers for abandon/operator edges). An internal **bijection invariant** (validated) keeps the trigger overlay and the transition map in exact lock-step.
2. **Make the post-sale lifecycle a first-class graph.** Add `SUBSCRIPTION_TRANSITIONS` + `SUBSCRIPTION_TRANSITION_TRIGGERS` to `lifecycle.ts` — the subscription status machine (`active`/`past_due`/`paused`/`canceled`) with its `LifecycleEventKind` triggers — symmetric with the funnel graph.
3. **Generate the chart.** `funnel.statechart.generate` emits a GENERATED Mermaid `stateDiagram-v2` document (layered: Layer 1 visitor funnel, Layer 2 subscription lifecycle), with every edge labelled by its trigger, derived deterministically from the maps above.
4. **Drift-guard it.** `funnel.statechart.validate` regenerates in memory and asserts byte-equality with the committed document (mirroring the `semantic.parity` pattern), plus the trigger↔graph bijection. `funnel.stage.validate` additionally asserts trigger completeness.

This answers the "State First vs event-driven" debate precisely: **State remains the source of truth** (the Postgres buffer + the in-code transition functions); the state chart is a _deterministic projection over the version-controlled transition function_, regenerated and machine-verified — the explicit "anchor graph" agents want, without weakening the event-driven transport that the integration domain requires.

## Architectural fit

- **RFC-0188:** amends the funnel contract by adding the trigger overlay to `FUNNEL_TRANSITIONS`; the transition map itself, `canTransition`, and `reachableStages` are unchanged. The state machine's authority stays in the platform.
- **RFC-0191:** amends the lifecycle contract by promoting the subscription status set into an explicit `SUBSCRIPTION_TRANSITIONS` graph with triggers; no runtime behaviour changes.
- **Generated-artifact + drift-guard pattern:** reuses the established `semantic.parity` / generated-marker discipline — a generated file carrying the GENERATED marker, regenerated and compared byte-for-byte by a validator. The chart is workspace-scoped (the graph is platform-owned, app-independent), like `uni.registry.build`.
- **RFC-0086 (agent-legible output):** the chart is the agent-facing, deterministic projection; it is referenced from the spec and the closest `AGENTS.md` so agents read the graph before touching transition logic.

## Design

### Trigger overlay (`@gogol/share/integration/funnel.ts`)

```ts
/** Reserved non-funnel-event triggers for abandon / operator edges. */
export const FUNNEL_SYSTEM_TRIGGERS = ["system.timeout", "operator.won", "operator.lost"] as const;
export type FunnelTransitionTrigger =
  | VisitorFunnelEventKind
  | (typeof FUNNEL_SYSTEM_TRIGGERS)[number];

/** One entry per edge in FUNNEL_TRANSITIONS, labelling it with its trigger. */
export const FUNNEL_TRANSITION_TRIGGERS: ReadonlyArray<{
  from: VisitorFunnelStage;
  to: VisitorFunnelStage;
  on: FunnelTransitionTrigger;
}> = [
  { from: "new_session", to: "privacy_acknowledged", on: "privacy.acknowledged" },
  { from: "privacy_acknowledged", to: "intent_selected", on: "intent.selected" },
  // … forward edges labelled with their VisitorFunnelEventKind …
  // abandon edges: { from: <any non-terminal>, to: "lost", on: "system.timeout" }
  // terminal: production_ready → won on "operator.won", operator_review → lost on "operator.lost"
];
```

**Bijection invariant** (validated, not just asserted in prose): the set of `(from,to)` pairs in `FUNNEL_TRANSITION_TRIGGERS` equals the edge set of `FUNNEL_TRANSITIONS` exactly, and every `on` is a valid trigger. This makes the overlay incapable of drifting from the transition map.

### Subscription lifecycle graph (`lifecycle.ts`)

```ts
export const SUBSCRIPTION_TRANSITIONS: Readonly<Record<SubscriptionStatus, readonly SubscriptionStatus[]>> = {
  active: ["past_due", "paused", "canceled"],
  past_due: ["active", "canceled"],
  paused: ["active", "canceled"],
  canceled: [],
};
export const SUBSCRIPTION_TRANSITION_TRIGGERS: ReadonlyArray<{
  from: SubscriptionStatus; to: SubscriptionStatus; on: LifecycleEventKind;
}> = [
  { from: "active", to: "past_due", on: "invoice.payment_failed" },
  { from: "past_due", to: "active", on: "invoice.paid" },
  { from: "active", to: "canceled", on: "subscription.canceled" },
  // …
];
```

### Generator — `funnel.statechart.generate` (workspace)

Emits `docs/specs/visitor-funnel/state-chart.generated.md` (GENERATED marker, RFC-0081) containing two Mermaid `stateDiagram-v2` blocks:

- **Layer 1 — visitor funnel**: `[*] --> new_session`; one `A --> B : on` line per forward edge; terminal `won`/`lost --> [*]`. The ubiquitous abandon edges (`* --> lost : system.timeout`) are rendered as a single deterministic annotation rather than 24 near-identical edges, to keep the diagram legible — the full edge set still lives in the code maps and is checked there.
- **Layer 2 — subscription lifecycle**: the `SUBSCRIPTION_TRANSITIONS` graph with `LifecycleEventKind` labels.

The rendering is a pure, deterministic function of the code maps (stable ordering), so byte-equality is well-defined.

### Validators

- **`funnel.statechart.validate`** (workspace, new): regenerate in memory and assert byte-equality with the committed `state-chart.generated.md`; assert the trigger↔graph bijection for both layers; assert every `on` is a known event/trigger.
- **`funnel.stage.validate`** (changed): additionally assert trigger completeness for the funnel layer (every `FUNNEL_TRANSITIONS` edge has exactly one trigger) — so the graph self-test now covers edges _and_ their triggers.

### Where it is referenced

The generated doc is linked from `docs/specs/visitor-funnel/README.md`, cross-referenced from `06-event-contract.md` (which keeps the human prose table), and pointed to from the closest `AGENTS.md` so agents read the explicit graph before modifying transition logic.

## Rollout

1. **RFC acceptance only.**
2. **Contract phase:** add `FUNNEL_TRANSITION_TRIGGERS` and `SUBSCRIPTION_TRANSITIONS`/`SUBSCRIPTION_TRANSITION_TRIGGERS` (pure), with unit tests proving the bijection to their stage graphs and trigger validity.
3. **Generator phase:** `funnel.statechart.generate` → the GENERATED layered Mermaid doc; commit the first generated artifact.
4. **Validator phase:** `funnel.statechart.validate` (byte-equality + bijection); extend `funnel.stage.validate` with trigger completeness.
5. **Wire phase:** add `funnel.statechart.validate` to the workspace/packages check pipeline; reference the doc from the spec README, `06-event-contract.md`, and `AGENTS.md`.

## Alternatives considered

- **Hand-authored Mermaid diagram in the spec:** rejected. It would drift from `FUNNEL_TRANSITIONS` and become misleading; the codebase's discipline is generate-and-drift-guard.
- **Single mega-diagram (funnel + lifecycle + invoices in one graph):** rejected for the default. Visually overloaded and harder to navigate; the layered form keeps each machine legible. (The code maps remain the unified machine-readable form.)
- **Leave edges unlabelled, keep the prose trigger table only:** rejected. The whole point is a self-sufficient navigable graph; an unlabelled graph still forces a cross-reference.
- **Adopt Event Sourcing / replay to derive State:** rejected and explicitly out of scope. State is already the source of truth in Postgres; events are transport (RFC-0186/0188). This RFC makes the State's transition graph explicit, not the persistence strategy.
- **Emit SCXML/XState instead of Mermaid:** rejected as the primary format. Mermaid renders on GitHub and is highly agent-legible; the typed code maps already are the machine-consumable form. A machine format can be added later if a runtime interpreter ever needs it.

## Risks

- **Diagram/code drift:** the central risk — fully mitigated by the byte-equality validator (the diagram cannot be committed out of sync).
- **Overlay duplication:** `FUNNEL_TRANSITION_TRIGGERS` restates the edge set — mitigated by the bijection validator (it cannot diverge from `FUNNEL_TRANSITIONS`).
- **Legibility at 26 states:** mitigated by layering and by collapsing the uniform abandon edges into an annotation; the full edges remain in code.
- **Maintenance friction:** adding a stage now means updating the transition map, the trigger overlay, and regenerating — but the validators make an omission a hard build failure, so it cannot be forgotten silently.
- **Trigger ambiguity:** a single edge must map to exactly one trigger; if a real transition can fire on multiple events, model it as multiple edges (or a small enum) — the validator enforces one trigger per edge to keep the graph deterministic.

## Acceptance criteria

- [x] RFC accepted before implementation starts. (evidence: implemented historically)
- [x] `FUNNEL_TRANSITION_TRIGGERS` (funnel.ts) and `SUBSCRIPTION_TRANSITIONS` + `SUBSCRIPTION_TRANSITION_TRIGGERS` (lifecycle.ts) exist, each in exact bijection with its stage graph, unit-tested. (evidence: implemented historically)
- [x] `funnel.statechart.generate` emits a GENERATED, layered Mermaid `stateDiagram-v2` document (visitor funnel + subscription lifecycle) with every edge labelled by its trigger. (evidence: implemented historically)
- [x] `funnel.statechart.validate` drift-guards the document byte-for-byte and asserts the trigger↔graph bijection; `funnel.stage.validate` asserts funnel trigger completeness. (evidence: implemented historically)
- [x] The generated document is referenced from the spec README, `06-event-contract.md`, and the closest `AGENTS.md` (root AGENTS.md). (evidence: AGENTS.md:1, agent guide updated)
- [x] `funnel.statechart.validate` is in the workspace/packages check pipeline. (evidence: implemented historically)
- [x] `rfc.validate RFC-0219` passes before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST NOT implement the trigger overlay, the subscription graph, the generator, or the validators while this RFC has `status: draft`.
- Agents MUST treat `FUNNEL_TRANSITIONS` / `SUBSCRIPTION_TRANSITIONS` as the single source of truth and the state chart as a generated projection — never hand-edit the GENERATED diagram, and never let the diagram define transitions.
- Agents MUST keep `FUNNEL_TRANSITION_TRIGGERS` in exact bijection with `FUNNEL_TRANSITIONS` (and likewise for the subscription graph); the validator enforces this and a mismatch is a hard failure.
- Agents MUST keep the generator a pure, deterministic function of the code maps (stable ordering) so byte-equality drift-guarding is well-defined.
- Agents MUST NOT introduce Event Sourcing, a replayed event log, or a vendor state-machine tool as a parallel authority; State stays in the Lagebild buffer and the platform transition functions.
- Agents MUST update the affected GRACE documents and the closest `AGENTS.md` (link the generated state chart) when this RFC is accepted and implemented.
