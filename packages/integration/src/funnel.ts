/*
<MODULE_CONTRACT>
<purpose>RFC-0188: Visitor Sales Funnel state-machine contracts. The PLATFORM owns the canonical
funnel stage catalog, the typed event model, and the transition graph; UChat is the conversation
runtime that renders the funnel and REQUESTS transitions — it never defines the graph, owns no
pricing, and writes no canonical state. Make.com is excluded everywhere in the funnel path. Pure
types + constants + pure helpers — no I/O, no astro:env, no vendor SDK.</purpose>
<non-goals>
  <item>Do not let a chat vendor own the graph — UChat requests transitions; this module is the authority.</item>
  <item>Do not reference Make.com or carry any legacy UChat goto/stage string as architecture.</item>
  <item>Do not import astro:env, a Supabase SDK, or a vendor SDK — callers inject persistence.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0188 Phase 2 (contract): initial funnel stage/event/transition contracts.</item>
  <item>RFC-0219: add FUNNEL_SYSTEM_TRIGGERS, FunnelTransitionTrigger, FUNNEL_TRANSITION_TRIGGERS — trigger overlay for the state-chart generator.</item>
</CHANGE_SUMMARY>
*/

/** Current canonical funnel contract version. Bump on a breaking stage/event change. */
export const FUNNEL_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Stage catalog (closed, platform-owned)
// ---------------------------------------------------------------------------

/**
 * Closed catalog of canonical funnel stages (RFC-0188). Names describe the
 * PLATFORM process, never UChat GUI nodes or Pipedrive stage ids. UChat mirrors
 * the current stage (e.g. in a custom field synced from Lagebild) but the catalog
 * is owned here. Extend only by updating this array AND the transition graph.
 */
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
  "lost",
] as const;

export type VisitorFunnelStage = (typeof VISITOR_FUNNEL_STAGES)[number];

/** The single entry stage every visitor session starts at. */
export const FUNNEL_ENTRY_STAGE: VisitorFunnelStage = "new_session";

/** Terminal stages — no outbound transition is allowed from these. */
export const FUNNEL_TERMINAL_STAGES: readonly VisitorFunnelStage[] = ["won", "lost"];

// ---------------------------------------------------------------------------
// Event model (typed business payloads on top of IntegrationEvent)
// ---------------------------------------------------------------------------

/** Closed catalog of typed funnel event kinds (RFC-0188). */
export const VISITOR_FUNNEL_EVENT_KINDS = [
  "session.started",
  "privacy.acknowledged",
  "language.selected",
  "intent.selected",
  "organization.selected",
  "qualification.answered",
  "offer.selected",
  "payment.link.requested",
  "payment.confirmed",
  "start.choice.selected",
  "buyer.type.selected",
  "legal.consent.recorded",
  "material.submitted",
  "change.requested",
  "operator.note.added",
] as const;

export type VisitorFunnelEventKind = (typeof VISITOR_FUNNEL_EVENT_KINDS)[number];

/** Visitor intents — the top-level branch chosen after the welcome. */
export const VISITOR_FUNNEL_INTENTS = ["create_site", "change_site", "ask_question"] as const;
export type VisitorFunnelIntent = (typeof VISITOR_FUNNEL_INTENTS)[number];

/**
 * Allowed funnel event SOURCES. UChat is the conversation runtime; Stripe is the
 * payment-confirmation source (direct webhook, no Make.com); operator covers manual
 * actions; send-message is the first-party contact form. Make.com is never a source.
 */
export const VISITOR_FUNNEL_SOURCES = ["uchat", "stripe", "operator", "send-message"] as const;
export type VisitorFunnelSource = (typeof VISITOR_FUNNEL_SOURCES)[number];

/** Buyer type — drives the legal-consent branch (B2B start vs B2C withdrawal). */
export const VISITOR_BUYER_TYPES = ["business", "consumer"] as const;
export type VisitorBuyerType = (typeof VISITOR_BUYER_TYPES)[number];

/**
 * Typed funnel event payload (RFC-0188). Carried as the `payload` of a normalized
 * IntegrationEvent so the existing inbound/dedup machinery (RFC-0176) is reused.
 * Offer snapshots are captured at selection time so a later offer.md change never
 * re-prices a historical deal; legal-consent payloads are append-only.
 */
export interface VisitorFunnelEventPayload {
  funnelVersion: string;
  eventKind: VisitorFunnelEventKind;
  stage?: VisitorFunnelStage;
  previousStage?: VisitorFunnelStage;
  intent?: VisitorFunnelIntent;
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
    /** Captured at selection time (deal-time snapshot) — never recomputed later. */
    priceSnapshot?: Record<string, string>;
  };
  legal?: {
    buyerType?: VisitorBuyerType;
    startBeforeWithdrawalPeriod?: boolean;
    withdrawalExpiryAcknowledged?: boolean;
  };
  changeRequest?: {
    includedChangesAvailable?: number;
    description?: string;
  };
}

// ---------------------------------------------------------------------------
// Transition graph (platform-owned authority)
// ---------------------------------------------------------------------------

/**
 * The valid transition graph (RFC-0188). UChat may REQUEST a transition; this graph
 * is the authority that validates it. `lost` (abandon) is reachable from every
 * non-terminal stage. Free-question side-conversations are NOT transitions — they
 * are an orthogonal resume mechanism (the visitor returns to the SAME stage), so
 * they intentionally do not appear here.
 */
export const FUNNEL_TRANSITIONS: Readonly<
  Record<VisitorFunnelStage, readonly VisitorFunnelStage[]>
> = {
  new_session: ["privacy_acknowledged", "lost"],
  privacy_acknowledged: ["intent_selected", "lost"],
  // create_site → organization_selected; change_site → change_balance_checked.
  intent_selected: ["organization_selected", "change_balance_checked", "lost"],
  organization_selected: ["qualification_priority", "lost"],
  qualification_priority: ["qualification_company", "lost"],
  qualification_company: ["qualification_service", "lost"],
  qualification_service: ["qualification_region", "lost"],
  qualification_region: ["offer_presented", "lost"],
  offer_presented: ["payment_pending", "lost"],
  payment_pending: ["payment_confirmed", "lost"],
  payment_confirmed: ["start_choice_pending", "lost"],
  // start now → buyer_type_pending; in 14 days → start_deferred (keeps the place).
  start_choice_pending: ["start_deferred", "buyer_type_pending", "lost"],
  start_deferred: ["buyer_type_pending", "lost"],
  buyer_type_pending: ["b2b_start_consent_pending", "b2c_withdrawal_consent_pending", "lost"],
  b2b_start_consent_pending: ["start_approved", "lost"],
  b2c_withdrawal_consent_pending: ["start_approved", "lost"],
  start_approved: ["legal_data_requested", "lost"],
  legal_data_requested: ["materials_requested", "lost"],
  materials_requested: ["production_ready", "lost"],
  production_ready: ["operator_review", "won", "lost"],
  // Change journey: balance check → (no changes left) pay → describe, or describe directly.
  change_balance_checked: ["change_payment_pending", "change_description_requested", "lost"],
  change_payment_pending: ["change_description_requested", "lost"],
  change_description_requested: ["operator_review", "production_ready", "won", "lost"],
  operator_review: ["won", "lost", "production_ready"],
  won: [],
  lost: [],
};

const STAGE_SET: ReadonlySet<string> = new Set(VISITOR_FUNNEL_STAGES);

/** True when `value` is a canonical funnel stage. */
export function isValidFunnelStage(value: string): value is VisitorFunnelStage {
  return STAGE_SET.has(value);
}

/** True when `to` is a declared next stage of `from` in the transition graph. */
export function canTransition(from: VisitorFunnelStage, to: VisitorFunnelStage): boolean {
  return FUNNEL_TRANSITIONS[from]?.includes(to) ?? false;
}

/** The declared next stages of `from` (empty for terminal stages). */
export function nextStages(from: VisitorFunnelStage): readonly VisitorFunnelStage[] {
  return FUNNEL_TRANSITIONS[from] ?? [];
}

/**
 * Every stage reachable from `start` (default: the entry stage) by following the
 * transition graph. Used by funnel.stage.validate to prove no canonical stage is
 * stranded (unreachable) from the funnel entry.
 */
export function reachableStages(
  start: VisitorFunnelStage = FUNNEL_ENTRY_STAGE,
): ReadonlySet<VisitorFunnelStage> {
  const seen = new Set<VisitorFunnelStage>();
  const queue: VisitorFunnelStage[] = [start];
  while (queue.length > 0) {
    const stage = queue.shift()!;
    if (seen.has(stage)) continue;
    seen.add(stage);
    for (const next of FUNNEL_TRANSITIONS[stage] ?? []) {
      if (!seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

// ---------------------------------------------------------------------------
// Trigger overlay (RFC-0219)
// ---------------------------------------------------------------------------

/**
 * Reserved non-funnel-event triggers for abandon / operator / system-advance edges.
 * `system.timeout` covers every unforced transition to `lost` (visitor abandons the
 * conversation). `system.advance` covers automatic state advances with no explicit
 * visitor input. `operator.won` / `operator.lost` are operator-initiated closures.
 */
export const FUNNEL_SYSTEM_TRIGGERS = [
  "system.timeout",
  "system.advance",
  "operator.won",
  "operator.lost",
] as const;
export type FunnelSystemTrigger = (typeof FUNNEL_SYSTEM_TRIGGERS)[number];

/** A trigger label: either a typed funnel event kind or a reserved system trigger. */
export type FunnelTransitionTrigger = VisitorFunnelEventKind | FunnelSystemTrigger;

/**
 * One entry per directed edge in `FUNNEL_TRANSITIONS` (RFC-0219). Labels each
 * `(from, to)` pair with exactly one trigger. The bijection invariant — checked by
 * `funnel.statechart.validate` — keeps this overlay and the transition map in exact
 * lock-step: the edge sets must be equal and every `on` must be a valid trigger.
 *
 * Ordering follows `FUNNEL_TRANSITIONS` key order, then target order within each key,
 * so the generator produces a deterministic document that can be drift-guarded
 * byte-for-byte.
 */
export const FUNNEL_TRANSITION_TRIGGERS: ReadonlyArray<{
  from: VisitorFunnelStage;
  to: VisitorFunnelStage;
  on: FunnelTransitionTrigger;
}> = [
  { from: "new_session", to: "privacy_acknowledged", on: "privacy.acknowledged" },
  { from: "new_session", to: "lost", on: "system.timeout" },
  { from: "privacy_acknowledged", to: "intent_selected", on: "intent.selected" },
  { from: "privacy_acknowledged", to: "lost", on: "system.timeout" },
  // create_site branch → org selection; change_site branch → change balance check.
  { from: "intent_selected", to: "organization_selected", on: "organization.selected" },
  { from: "intent_selected", to: "change_balance_checked", on: "change.requested" },
  { from: "intent_selected", to: "lost", on: "system.timeout" },
  { from: "organization_selected", to: "qualification_priority", on: "qualification.answered" },
  { from: "organization_selected", to: "lost", on: "system.timeout" },
  { from: "qualification_priority", to: "qualification_company", on: "qualification.answered" },
  { from: "qualification_priority", to: "lost", on: "system.timeout" },
  { from: "qualification_company", to: "qualification_service", on: "qualification.answered" },
  { from: "qualification_company", to: "lost", on: "system.timeout" },
  { from: "qualification_service", to: "qualification_region", on: "qualification.answered" },
  { from: "qualification_service", to: "lost", on: "system.timeout" },
  { from: "qualification_region", to: "offer_presented", on: "qualification.answered" },
  { from: "qualification_region", to: "lost", on: "system.timeout" },
  { from: "offer_presented", to: "payment_pending", on: "offer.selected" },
  { from: "offer_presented", to: "lost", on: "system.timeout" },
  { from: "payment_pending", to: "payment_confirmed", on: "payment.confirmed" },
  { from: "payment_pending", to: "lost", on: "system.timeout" },
  // After Stripe confirms payment the platform auto-advances to the start-choice screen.
  { from: "payment_confirmed", to: "start_choice_pending", on: "system.advance" },
  { from: "payment_confirmed", to: "lost", on: "system.timeout" },
  // start now → buyer_type_pending; in 14 days → start_deferred.
  { from: "start_choice_pending", to: "start_deferred", on: "start.choice.selected" },
  { from: "start_choice_pending", to: "buyer_type_pending", on: "start.choice.selected" },
  { from: "start_choice_pending", to: "lost", on: "system.timeout" },
  { from: "start_deferred", to: "buyer_type_pending", on: "start.choice.selected" },
  { from: "start_deferred", to: "lost", on: "system.timeout" },
  { from: "buyer_type_pending", to: "b2b_start_consent_pending", on: "buyer.type.selected" },
  {
    from: "buyer_type_pending",
    to: "b2c_withdrawal_consent_pending",
    on: "buyer.type.selected",
  },
  { from: "buyer_type_pending", to: "lost", on: "system.timeout" },
  { from: "b2b_start_consent_pending", to: "start_approved", on: "legal.consent.recorded" },
  { from: "b2b_start_consent_pending", to: "lost", on: "system.timeout" },
  {
    from: "b2c_withdrawal_consent_pending",
    to: "start_approved",
    on: "legal.consent.recorded",
  },
  { from: "b2c_withdrawal_consent_pending", to: "lost", on: "system.timeout" },
  // After both consent branches reach start_approved, the platform auto-advances.
  { from: "start_approved", to: "legal_data_requested", on: "system.advance" },
  { from: "start_approved", to: "lost", on: "system.timeout" },
  { from: "legal_data_requested", to: "materials_requested", on: "material.submitted" },
  { from: "legal_data_requested", to: "lost", on: "system.timeout" },
  { from: "materials_requested", to: "production_ready", on: "material.submitted" },
  { from: "materials_requested", to: "lost", on: "system.timeout" },
  { from: "production_ready", to: "operator_review", on: "operator.note.added" },
  { from: "production_ready", to: "won", on: "operator.won" },
  { from: "production_ready", to: "lost", on: "system.timeout" },
  // Change journey: no credits left → payment link; credits available → describe directly.
  {
    from: "change_balance_checked",
    to: "change_payment_pending",
    on: "payment.link.requested",
  },
  { from: "change_balance_checked", to: "change_description_requested", on: "system.advance" },
  { from: "change_balance_checked", to: "lost", on: "system.timeout" },
  { from: "change_payment_pending", to: "change_description_requested", on: "payment.confirmed" },
  { from: "change_payment_pending", to: "lost", on: "system.timeout" },
  { from: "change_description_requested", to: "operator_review", on: "change.requested" },
  { from: "change_description_requested", to: "production_ready", on: "system.advance" },
  { from: "change_description_requested", to: "won", on: "operator.won" },
  { from: "change_description_requested", to: "lost", on: "system.timeout" },
  { from: "operator_review", to: "won", on: "operator.won" },
  { from: "operator_review", to: "lost", on: "operator.lost" },
  { from: "operator_review", to: "production_ready", on: "system.advance" },
];

// ---------------------------------------------------------------------------
// Legacy denylist + Make.com exclusion (governance teeth)
// ---------------------------------------------------------------------------

/**
 * Legacy UChat stage strings from the retired 10-flow export. These are reference
 * only and MUST NOT appear as canonical stages or in funnel config/copy. The
 * validators hard-fail on any of these (RFC-0188 nonGoals).
 */
export const LEGACY_FUNNEL_STAGES: readonly string[] = [
  "q_website_tier",
  "new_chat",
  "q_new",
  "q_what_important",
  "q_company",
  "q_industry",
  "q_region",
  "after_start_now_delay",
  "start_now_or_later",
];

/**
 * Pure scanner: report every Make.com reference in `text` (line, matched token).
 * The funnel path — config, content, and code — must contain ZERO references, in
 * any mode, transitional or permanent (RFC-0188 Decision §5). Integromat is the
 * legacy name for Make.com and is denied too.
 */
export function scanForMakeComReferences(text: string): Array<{ line: number; match: string }> {
  const pattern = /\b(?:hook\.(?:[a-z0-9-]+\.)*)?make\.com\b|\bintegromat\b/gi;
  const hits: Array<{ line: number; match: string }> = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    for (const m of raw.matchAll(pattern)) {
      hits.push({ line: index + 1, match: m[0] });
    }
  });
  return hits;
}
