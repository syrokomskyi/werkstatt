/*
<MODULE_CONTRACT>
<purpose>Facilitates vendor-agnostic event tracking and funnel definitions for growth analytics.</purpose>
<non-goals>
  <item>Do not include vendor-specific methods in the GrowthAdapter interface.</item>
  <item>Do not alter the event catalog outside the designated ontology package.</item>
  <item>Do not manage raw event parsing or transport logic in this module.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Revised Compass scaffolding to enhance clarity on architectural roles and responsibilities.</item>
</CHANGE_SUMMARY>
*/

/**
 * @warpgogol/growth — GrowthAdapter interface
 *
 * DNA-30: All vendor integrations implement this closed contract.
 * No adapter may extend the interface with vendor-specific methods exposed
 * to application code. Vendor specifics stay inside the adapter module.
 *
 * RFC-0027 / DNA-27..30
 */

// ---------------------------------------------------------------------------
// Event catalog — closed vocabulary (DNA-27)
// ---------------------------------------------------------------------------

/**
 * Canonical closed list of all event names that may be emitted via emit().
 * Generated from packages/ontology/growth/events/*.yaml — the ontology YAML
 * files are the single source of truth. Run
 * `pnpm --filter @warpgogol/growth run codegen:event-names` to regenerate.
 *
 * [DNA-27][RFC-0027] Do NOT duplicate this list elsewhere (e.g. as a hardcoded
 * Set in growth-events.ts). Import EVENT_NAMES and build sets from it.
 */
export { EVENT_NAMES } from "./event-names.generated.ts";
import type { EventName as GeneratedEventName } from "./event-names.generated.ts";

/**
 * All event names that may be emitted via emit().
 * Re-exported from the generated file — no separate union literal list required.
 */
export type EventName = GeneratedEventName;

/**
 * Payload shapes keyed by EventName.
 * Every event carries at minimum `locale` (injected by emit() automatically).
 * Event-specific fields are declared per event; unknown keys are forbidden at runtime.
 */
export interface EventPayloadMap {
  "page-view": {
    locale: string;
    path: string;
  };
  "cta-click": {
    locale: string;
    /** Stable label identifying the CTA (e.g. "hero-donate", "nav-spenden") */
    label: string;
    /** Absolute or relative href the CTA navigates to */
    href?: string;
  };
  "form-start": {
    locale: string;
    formId: string;
  };
  "form-submit": {
    locale: string;
    formId: string;
  };
  "form-error": {
    locale: string;
    formId: string;
    /** Machine-readable error code */
    errorCode: string;
  };
  "donation-intent": {
    locale: string;
    /** Donation amount in the smallest currency unit (cents) or 0 if unknown */
    amountCents?: number;
    currency?: string;
  };
  "donation-form-start": {
    locale: string;
    formId: string;
  };
  "donation-form-submit": {
    locale: string;
    formId: string;
    amountCents?: number;
    currency?: string;
  };
  "donation-confirmed": {
    locale: string;
    transactionId?: string;
    amountCents?: number;
    currency?: string;
  };
  "contact-submit": {
    locale: string;
    formId: string;
    subject?: string;
  };
  "contact.phone_click": {
    locale: string;
    /** Stable UI placement such as "header", "footer", or "contact-card". */
    placement: string;
  };
  "contact.form_submit": {
    locale: string;
    /** Stable form identifier; never submit visitor-entered values. */
    formId: string;
    /** Stable UI placement such as "contact-page" or "inline-section". */
    placement?: string;
  };
  "contact.whatsapp_click": {
    locale: string;
    /** Stable UI placement; do not include the WhatsApp target number. */
    placement: string;
  };
  "contact.email_click": {
    locale: string;
    /** Stable UI placement; do not include the email address. */
    placement: string;
  };
  "contact.route_click": {
    locale: string;
    /** Stable UI placement; do not include route, map, or visitor location data. */
    placement: string;
  };
  "outbound-click": {
    locale: string;
    /** Full URL the user clicked to */
    href: string;
    /** Human label of the link */
    label?: string;
  };
  "passport-view": {
    locale: string;
    /** App identifier from passport (e.g. "my-app") */
    appId: string;
    /** Composite Nebula Score 0-100, if available */
    nebulaScore?: number;
  };
  "star-map-navigate": {
    locale: string;
    /** App identifier (e.g. "my-app") */
    appId: string;
    /** Where the map was triggered: "star-map-page" | "passport-inline" */
    source: string;
  };
}

/** A single emitted event — the unit handed to GrowthAdapter.track(). */
export interface EmittedEvent<N extends EventName = EventName> {
  name: N;
  payload: EventPayloadMap[N];
  /** ISO-8601 timestamp set by emit() at call time */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Funnel definition (DNA-28)
// ---------------------------------------------------------------------------

/** One step inside a funnel, referencing an event from the closed catalog. */
export interface FunnelStep {
  /** Stable machine-readable id for this step (e.g. "intent", "form-start") */
  id: string;
  /** Human label for dashboards */
  label: string;
  /** Which event marks this step as complete */
  event: EventName;
}

/** A content-declared funnel loaded from packages/ontology/growth/funnels/. */
export interface FunnelDefinition {
  /** Machine-readable funnel id (kebab-case, matches filename) */
  id: string;
  /** Human label for dashboards */
  label: string;
  steps: readonly FunnelStep[];
}

// ---------------------------------------------------------------------------
// GrowthAdapter interface — DNA-30
// ---------------------------------------------------------------------------

// Re-exported from registry.ts — the single source of truth for adapter ids.
export { KNOWN_ADAPTER_IDS } from "./registry.ts";

/**
 * The vendor-agnostic contract every adapter must satisfy.
 *
 * Lifecycle:
 *   1. `init(config)` — called once by bootGrowthLayer() after the page loads.
 *      Adapters should set up vendor SDKs here, not at import time.
 *   2. `track(event)` — called for every emit() invocation after init().
 *      Must be idempotent and must not throw; errors are swallowed by emit().
 *   3. `identifySegment(segment)` — called when the active visitor segment
 *      becomes known (RFC-0027 persona detection). No-op at MVP.
 *   4. `destroy()` — optional cleanup called on SPA navigation or test teardown.
 */
export interface GrowthAdapter {
  /** Unique machine-readable adapter id (e.g. "null", "matomo") */
  readonly id: string;

  /**
   * Optional allow-list of event names this adapter accepts. When present,
   * events outside the list are silently dropped by the emit queue before
   * reaching track(). When absent, all events in the closed catalog are accepted.
   */
  readonly accepts?: readonly EventName[];

  /**
   * One-time initialisation.
   * @param config — the resolved GrowthConfig for this app/site.
   * @returns Promise resolves when the adapter is ready to accept track() calls.
   */
  init(config: GrowthAdapterConfig): Promise<void>;

  /**
   * Record a typed event.
   * Must never throw. Log errors internally and return gracefully.
   */
  track<N extends EventName>(event: EmittedEvent<N>): void;

  /**
   * Called when the active visitor segment becomes known (RFC-0027 persona detection).
   * Adapters may use this to set user properties on the vendor SDK.
   * No-op at MVP (segment is always null until RFC-0027 persona detection ships).
   */
  identifySegment?(segment: string | null): void;

  /**
   * Optional cleanup — remove event listeners, flush queued events, etc.
   */
  destroy?(): void;
}

/**
 * Adapter-specific configuration object passed to GrowthAdapter.init().
 * Vendor adapters declare what keys they need via their own config schema.
 * The base contract only requires the app id; adapters read vendor-specific
 * keys from the `vendor` record.
 */
export interface GrowthAdapterConfig {
  /** App identifier from src/content/system.md */
  appId: string;
  /** Active locale at init time */
  locale: string;
  /** Vendor-specific key/value pairs declared in growth.yaml */
  vendor: Record<string, string>;
}
