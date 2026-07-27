/*
<MODULE_CONTRACT>
<purpose>RFC-0168: the Integration Port. Vendor-agnostic contracts for delivering a captured
lead to outbound channels (Telegram, email, WhatsApp) and upserting it into a CRM (Pipedrive),
mirroring the growth (RFC-0027) and content-source (RFC-0141) port/adapter pattern. Pure — takes
secrets as parameters; never imports astro:env (the section handler reads secrets and passes them).</purpose>
<non-goals>
  <item>Do not import vendor SDKs or astro:env here — adapters use fetch + injected secrets.</item>
  <item>Do not log or return secrets.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0168: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import type { LifecycleEventPayload } from "./lifecycle.ts";

/** Secrets bag (env name → value). Adapters read only their declared requiredSecrets. */
export type IntegrationSecrets = Record<string, string | undefined>;

export interface LeadMessage {
  message: string;
  formId: string;
  locale: string;
  /** ISO-8601 submission time. */
  submittedAt: string;
  contact?: { email?: string; phone?: string };
}

export interface Lead {
  name?: string;
  email?: string;
  phone?: string;
  note: string;
  source: string;
}

export interface IntegrationChannelAdapter {
  readonly id: string;
  /** Env secret names required for this adapter to be active. */
  readonly requiredSecrets: readonly string[];
  /** Deliver the message. Throws on transport failure. */
  deliver(message: LeadMessage, secrets: IntegrationSecrets): Promise<void>;
}

export interface CrmAdapter {
  readonly id: string;
  readonly requiredSecrets: readonly string[];
  /** Upsert a lead. Returns the CRM id, or null. Throws on transport failure. */
  upsertLead(lead: Lead, secrets: IntegrationSecrets): Promise<{ id: string } | null>;
}

// ---------------------------------------------------------------------------
// RFC-0176: source-agnostic destination hub
// ---------------------------------------------------------------------------

/**
 * Closed catalog of destination kinds the hub can route to (RFC-0176). The hub
 * runs on the client's site with the client's tokens; "channel"/"crm" from
 * RFC-0168 are subsumed here (a channel is a message/email destination).
 */
export const DESTINATION_KINDS = ["crm", "calendar", "email", "scheduler"] as const;
export type DestinationKind = (typeof DESTINATION_KINDS)[number];

/**
 * How a configured destination is executed (RFC-0176):
 *  - `gogol-adapter` (default): an adapter runs on the client's site with the
 *    client's tokens — the studio's code routes, but on the client's deploy.
 *  - `vendor-native` (optional): an upstream vendor's own flow executes it; the
 *    studio holds no secret and runs no code for it (declared for validation +
 *    the RFC-0177 processor disclosure only).
 */
export const EXECUTION_MODES = ["gogol-adapter", "vendor-native"] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

/**
 * Normalized event produced by any IntegrationSource (the send-message form, the
 * chat widget, future sources). Generalizes LeadMessage/Lead. `eventId` is the
 * idempotency key the queue consumer dedups on (RFC-0176).
 */
export interface IntegrationEvent {
  /** Idempotency key (source-provided) — dedup on redelivery. */
  eventId: string;
  kind: "lead" | "message" | "appointment";
  /** Source id, e.g. "send-message" | "uchat" | "stripe". */
  source: string;
  locale: string;
  /** ISO-8601 occurrence time. */
  occurredAt: string;
  contact?: { name?: string; email?: string; phone?: string };
  payload: Record<string, unknown>;
  /** RFC-0191: optional typed lifecycle payload for Stripe billing events. */
  lifecycle?: LifecycleEventPayload;
}

/**
 * A destination executed on the client's site (client tokens) — only for mode
 * `gogol-adapter`. `vendor-native` destinations have no executed adapter.
 */
export interface DestinationAdapter {
  readonly kind: DestinationKind;
  readonly vendor: string;
  readonly requiredSecrets: readonly string[];
  /** Route the event to the destination. Returns its id, or null. Throws on transport failure. */
  route(event: IntegrationEvent, secrets: IntegrationSecrets): Promise<{ id: string } | null>;
}

/** Map a normalized event onto the RFC-0168 LeadMessage shape (for channel fan-out). */
export function eventToLeadMessage(event: IntegrationEvent): LeadMessage {
  const message =
    typeof event.payload.message === "string"
      ? event.payload.message
      : typeof event.payload.note === "string"
        ? (event.payload.note as string)
        : "";
  const email = event.contact?.email;
  const phone = event.contact?.phone;
  return {
    message,
    formId: event.source,
    locale: event.locale,
    submittedAt: event.occurredAt,
    ...(email || phone
      ? { contact: { ...(email ? { email } : {}), ...(phone ? { phone } : {}) } }
      : {}),
  };
}

/** Map a normalized `lead`-kind event onto the RFC-0168 Lead shape (back-compat). */
export function eventToLead(event: IntegrationEvent): Lead {
  const note =
    typeof event.payload.note === "string"
      ? event.payload.note
      : ((event.payload.message as string) ?? "");
  return {
    name: event.contact?.name,
    email: event.contact?.email,
    phone: event.contact?.phone,
    note,
    source: event.source,
  };
}
