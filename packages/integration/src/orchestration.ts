/*
<MODULE_CONTRACT>
<purpose>
  RFC-0168 / RFC-0176 / RFC-0181: Integration orchestration — adapter registries,
  fan-out functions, inbound authentication, and legacy delivery substrate types.
  Separated from the barrel (index.ts) so type-only consumers don't transitively
  import adapter implementations.
</purpose>
<non-goals>
  <item>Do not import astro:env — the caller injects the secrets bag.</item>
  <item>Do not re-export sibling module types — that is the barrel's job.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from integration/index.ts — registries + fan-out + legacy types moved here; index.ts is now a pure barrel.</item>
</CHANGE_SUMMARY>
*/

import {
  pipedriveCrmAdapter,
  pipedriveDestinationAdapter,
  telegramChannelAdapter,
  whatsappChannelAdapter,
} from "./adapters.ts";
import type {
  CrmAdapter,
  DestinationAdapter,
  DestinationKind,
  IntegrationChannelAdapter,
  IntegrationEvent,
  IntegrationSecrets,
  Lead,
  LeadMessage,
} from "./port.ts";
import { DESTINATION_KINDS, EXECUTION_MODES, eventToLeadMessage } from "./port.ts";
import { LifecycleEventPayloadSchema } from "./lifecycle.ts";
import { z } from "zod";

// @ai-invariant: CHANNEL_ADAPTERS and CRM_ADAPTERS are closed registries.
// Adding a channel/CRM = add one adapter entry here. The adapter self-enables
// by secret presence — no per-channel code in routes. Never log the secrets
// bag; log only adapter id + error message.

/** Closed channel adapter registry (RFC-0168). Add a channel = add an entry here.
 * RFC-0181: email is no longer a fetch channel adapter — it is sent via Cloudflare
 * Email Routing (send_email binding) in the delivery callback. */
export const CHANNEL_ADAPTERS: readonly IntegrationChannelAdapter[] = [
  telegramChannelAdapter,
  whatsappChannelAdapter,
];

/** Closed CRM adapter registry (RFC-0168). */
export const CRM_ADAPTERS: readonly CrmAdapter[] = [pipedriveCrmAdapter];

/**
 * Closed catalog of configurable channel adapter ids (RFC-0168). `"null"` is the
 * safe no-op binding (explicitly declared "no channel"). Used by
 * integration.config.validate to reject unknown adapter ids in system.md.
 */
export const CHANNEL_ADAPTER_IDS: readonly string[] = [
  ...CHANNEL_ADAPTERS.map((adapter) => adapter.id),
  "null",
];

/** Closed catalog of configurable CRM adapter ids (RFC-0168). `"null"` = no CRM. */
export const CRM_ADAPTER_IDS: readonly string[] = [
  ...CRM_ADAPTERS.map((adapter) => adapter.id),
  "null",
];

/**
 * Adapter id → required env secret names, across channels + CRM (RFC-0168). The
 * `"null"` adapter requires none. Used by integration.secrets.validate to assert a
 * configured adapter's secrets are present in the generated env schema.
 */
export const INTEGRATION_ADAPTER_SECRETS: Readonly<Record<string, readonly string[]>> = {
  null: [],
  ...Object.fromEntries(CHANNEL_ADAPTERS.map((adapter) => [adapter.id, adapter.requiredSecrets])),
  ...Object.fromEntries(CRM_ADAPTERS.map((adapter) => [adapter.id, adapter.requiredSecrets])),
};

function hasAllSecrets(secrets: IntegrationSecrets, keys: readonly string[]): boolean {
  return keys.every((key) => Boolean(secrets[key]?.trim()));
}

export interface DeliverResult {
  delivered: string[];
  failed: string[];
  /** Channels left dormant because their required secrets are absent. */
  skipped: string[];
}

/** Fan out to every channel whose required secrets are present. Best-effort. */
export async function deliverLead(
  message: LeadMessage,
  secrets: IntegrationSecrets,
): Promise<DeliverResult> {
  const delivered: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];
  for (const adapter of CHANNEL_ADAPTERS) {
    if (!hasAllSecrets(secrets, adapter.requiredSecrets)) {
      skipped.push(adapter.id);
      continue;
    }
    try {
      await adapter.deliver(message, secrets);
      delivered.push(adapter.id);
    } catch (err) {
      // Never log the secrets bag; log only the adapter id + error message.
      console.warn(`[integration] channel "${adapter.id}" failed:`, (err as Error).message);
      failed.push(adapter.id);
    }
  }
  return { delivered, failed, skipped };
}

/** Readiness of one adapter: ready when every required secret is present. */
export interface AdapterReadiness {
  id: string;
  kind: "channel" | "crm";
  ready: boolean;
  /** Required secret keys that are absent (gentle, actionable hint — names only). */
  missing: string[];
}

/**
 * Pure, framework-agnostic readiness audit shared across the ecosystem (RFC-0168):
 * the send-message handler uses it for a gentle server-side notice, and
 * `integration.secrets.audit` uses it for the build-time advisory. Reports only
 * secret NAMES, never values. Pass `ids` to restrict the audit to the adapters a
 * site actually intends (e.g. its system.md `integrations:` block).
 */
export function auditIntegrationReadiness(
  secrets: IntegrationSecrets,
  ids?: { channels?: readonly string[]; crm?: readonly string[] },
): AdapterReadiness[] {
  const wantChannel = (id: string) => !ids?.channels || ids.channels.includes(id);
  const wantCrm = (id: string) => !ids?.crm || ids.crm.includes(id);
  const report: AdapterReadiness[] = [];
  for (const adapter of CHANNEL_ADAPTERS) {
    if (!wantChannel(adapter.id)) continue;
    const missing = adapter.requiredSecrets.filter((key) => !secrets[key]?.trim());
    report.push({ id: adapter.id, kind: "channel", ready: missing.length === 0, missing });
  }
  for (const adapter of CRM_ADAPTERS) {
    if (!wantCrm(adapter.id)) continue;
    const missing = adapter.requiredSecrets.filter((key) => !secrets[key]?.trim());
    report.push({ id: adapter.id, kind: "crm", ready: missing.length === 0, missing });
  }
  return report;
}

// ---------------------------------------------------------------------------
// RFC-0176: source-agnostic destination hub
// ---------------------------------------------------------------------------

// @ai-invariant: DESTINATION_ADAPTERS is a closed registry. Every destination
// adapter self-enables by secret presence. When BOTH a buffer adapter AND a
// direct adapter are active for the same (kind, vendor),
// integration.config.validate reports "multiple-active-executors".

/** Closed registry of gogol-adapter destination implementations (RFC-0176). */
export const DESTINATION_ADAPTERS: readonly DestinationAdapter[] = [pipedriveDestinationAdapter];

/**
 * Externally-implemented destination vendors whose adapters live in separate packages
 * (RFC-0186/0190). These vendors are valid `gogol-adapter` targets but cannot be
 * registered in `DESTINATION_ADAPTERS` because their adapter packages depend on
 * `@gogol/integration` (circular-dep guard). The adapter is injected at runtime via
 * `extraAdapters`; the validator checks vendor + secrets against these catalogs.
 */
export const EXTERNAL_DESTINATION_VENDORS: Readonly<Record<DestinationKind, readonly string[]>> = {
  crm: ["supabase-buffer"],
  calendar: [],
  email: [],
  scheduler: [],
};

/** Per `(kind, vendor)` → required secret names for externally-implemented adapters. */
export const EXTERNAL_DESTINATION_SECRETS: Readonly<Record<string, readonly string[]>> = {
  "crm:supabase-buffer": [
    "SUPABASE_BUFFER_URL",
    "SUPABASE_BUFFER_SERVICE_KEY",
    "SUPABASE_BUFFER_TENANT_ID",
  ],
};

/** Closed per-kind vendor catalog, derived from the registry + external vendors (RFC-0176/0186). */
export const DESTINATION_VENDORS_BY_KIND: Readonly<Record<DestinationKind, readonly string[]>> =
  Object.fromEntries(
    DESTINATION_KINDS.map((kind) => [
      kind,
      [
        ...new Set(DESTINATION_ADAPTERS.filter((a) => a.kind === kind).map((a) => a.vendor)),
        ...(EXTERNAL_DESTINATION_VENDORS[kind] ?? []),
      ],
    ]),
  ) as unknown as Record<DestinationKind, readonly string[]>;

/** Per `(kind, vendor)` → required secret names (gogol-adapter mode only). */
export const DESTINATION_ADAPTER_SECRETS: Readonly<Record<string, readonly string[]>> = {
  ...Object.fromEntries(
    DESTINATION_ADAPTERS.map((a) => [`${a.kind}:${a.vendor}`, a.requiredSecrets]),
  ),
  ...EXTERNAL_DESTINATION_SECRETS,
};

/** A configured destination from system.md integrations.destinations[]. */
export interface DestinationConfig {
  kind: DestinationKind;
  vendor: string;
  mode: (typeof EXECUTION_MODES)[number];
}

export interface RouteResult {
  /** `${kind}:${vendor}` ids routed successfully. */
  routed: string[];
  /** `${kind}:${vendor}` ids that threw. */
  failed: string[];
  /** Skipped because dedup saw this eventId+destination, or secrets absent. */
  skipped: string[];
}

/**
 * Route an IntegrationEvent to its configured `gogol-adapter` destinations,
 * running on the client's site with the client's tokens. `vendor-native`
 * destinations are NOT executed here (an upstream vendor runs them).
 *
 * Pure + injectable: pass `seen` (a dedup set keyed by `${eventId}:${kind}:${vendor}`)
 * so a queue redelivery never double-writes. Best-effort per destination.
 */
export async function routeEvent(
  event: IntegrationEvent,
  destinations: readonly DestinationConfig[],
  secrets: IntegrationSecrets,
  seen?: { has(key: string): boolean | Promise<boolean>; add(key: string): unknown },
  /** Optional adapter registry override — defaults to DESTINATION_ADAPTERS. */
  adapters?: readonly DestinationAdapter[],
): Promise<RouteResult> {
  const registry = adapters ?? DESTINATION_ADAPTERS;
  const routed: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];
  for (const dest of destinations) {
    const id = `${dest.kind}:${dest.vendor}`;
    if (dest.mode !== "gogol-adapter") continue; // vendor-native: executed upstream
    const adapter = registry.find((a) => a.kind === dest.kind && a.vendor === dest.vendor);
    if (!adapter || !hasAllSecrets(secrets, adapter.requiredSecrets)) {
      skipped.push(id);
      continue;
    }
    const dedupKey = `${event.eventId}:${id}`;
    if (seen && (await seen.has(dedupKey))) {
      skipped.push(id);
      continue;
    }
    try {
      await adapter.route(event, secrets);
      seen?.add(dedupKey);
      routed.push(id);
    } catch (err) {
      console.warn(`[integration] destination "${id}" failed:`, (err as Error).message);
      failed.push(id);
    }
  }
  return { routed, failed, skipped };
}

// @ai-invariant: authenticateInbound uses constant-time comparison. Must remain
// fail-closed: an unconfigured inbound route (secret unset) authenticates nothing.
// IntegrationEventSchema is the validation gate for ALL inbound events.

/** Zod schema for an inbound IntegrationEvent (RFC-0176). Rejects malformed posts. */
export const IntegrationEventSchema = z.object({
  eventId: z.string().min(1),
  kind: z.enum(["lead", "message", "appointment"]),
  source: z.string().min(1),
  locale: z.string().min(2),
  occurredAt: z.string().min(1),
  contact: z
    .object({
      name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
    })
    .optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  // RFC-0191: optional typed lifecycle payload (Stripe billing events). Additive — a
  // funnel/lead event without it still validates.
  lifecycle: LifecycleEventPayloadSchema.optional(),
});

/**
 * Constant-time-ish equality for the inbound webhook secret. Authenticates a
 * source POST to /api/integration-inbound via a bearer token or X-Integration-Secret
 * header against INTEGRATION_INBOUND_SECRET. Returns false when the secret is unset
 * (fail-closed: an unconfigured inbound route authenticates nothing).
 */
export function authenticateInbound(headers: Headers, secret: string | undefined): boolean {
  if (!secret) return false;
  const provided =
    headers.get("x-integration-secret") ??
    headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (provided.length !== secret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < secret.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Route an event to every registered gogol-adapter destination whose required
 * secrets are present (self-enabling, mirroring the channel fan-out). Used by the
 * inbound handler and the queue consumer when no explicit destinations list is
 * supplied. `seen` is the optional dedup set (RFC-0176).
 *
 * `extraAdapters` lets a specific site's delivery callback inject additional
 * DestinationAdapters (e.g. supabaseBufferDestinationAdapter) without modifying
 * the closed shared registry. They are self-enabling (skip if secrets absent).
 */
export function routeEventToReady(
  event: IntegrationEvent,
  secrets: IntegrationSecrets,
  seen?: { has(key: string): boolean | Promise<boolean>; add(key: string): unknown },
  extraAdapters?: readonly DestinationAdapter[],
): Promise<RouteResult> {
  const allAdapters = extraAdapters
    ? [...DESTINATION_ADAPTERS, ...extraAdapters]
    : DESTINATION_ADAPTERS;
  const destinations: DestinationConfig[] = allAdapters.map((a) => ({
    kind: a.kind,
    vendor: a.vendor,
    mode: "gogol-adapter",
  }));
  return routeEvent(event, destinations, secrets, seen, allAdapters);
}

/** Combined result of a unified event delivery (channels + destinations). RFC-0181. */
export interface DeliverEventResult {
  channels: DeliverResult;
  destinations: RouteResult;
}

/**
 * RFC-0181: the standardized fan-out for ANY source (send-message form, chat widget).
 * Runs the event through the channel adapters (Telegram/WhatsApp) AND the gogol-adapter
 * destinations (CRM), with the client's own tokens. Email is NOT here — it is sent via
 * Cloudflare Email Routing (send_email binding) in the callback route. `seen` dedups the
 * destination side on redelivery. Best-effort per sink; the caller decides ack vs retry.
 * `extraAdapters` lets a specific site inject additional DestinationAdapters (e.g.
 * supabaseBufferDestinationAdapter) without modifying the closed shared registry.
 */
export async function deliverEvent(
  event: IntegrationEvent,
  secrets: IntegrationSecrets,
  seen?: { has(key: string): boolean | Promise<boolean>; add(key: string): unknown },
  extraAdapters?: readonly DestinationAdapter[],
): Promise<DeliverEventResult> {
  const channels = await deliverLead(eventToLeadMessage(event), secrets);
  const destinations = await routeEventToReady(event, secrets, seen, extraAdapters);
  return { channels, destinations };
}

/*
 * LEGACY delivery substrate (RFC-0176, Cloudflare Queues + KV).
 *
 * SUPERSEDED for the EU path by the QStash + Upstash Redis substrate in ./qstash.ts
 * (RFC-0181): Cloudflare Queues/KV cannot be pinned to the EU, and the per-site
 * consumer Worker was retired. `cloudflare.residency.validate` now fails the build if a
 * wrangler.jsonc declares queues/KV. These primitives are kept only for the structural
 * contracts + the unit test; production routes publish to QStash and fan out via
 * /api/integration-route. Do NOT wire these into a live delivery path.
 * See docs/specs/integration-delivery.md (authoritative).
 */

/** Minimal structural type for a Cloudflare Queue binding (no hard dependency). */
export interface QueueBinding<T = IntegrationEvent> {
  send(message: T): Promise<void>;
}

/** Minimal structural type for a Cloudflare KV namespace used for dedup. */
export interface KvDedupStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** Wrap a KV namespace as a dedup `seen` set with a short TTL (in-flight only). */
export function kvDedup(kv: KvDedupStore, ttlSeconds = 86400) {
  return {
    async has(key: string): Promise<boolean> {
      return (await kv.get(key)) !== null;
    },
    add(key: string): void {
      void kv.put(key, "1", { expirationTtl: ttlSeconds });
    },
  };
}

/**
 * LEGACY (RFC-0176, see the banner above). Enqueue an event onto a Cloudflare Queue.
 * The live EU path no longer uses this — sources publish to QStash (./qstash.ts,
 * RFC-0181). Retained for the structural contract + unit test only.
 */
export async function enqueueEvent(queue: QueueBinding, event: IntegrationEvent): Promise<void> {
  await queue.send(event);
}

/**
 * Process a batch of queued events (the Cloudflare `queue()` consumer body).
 * Dedups via KV, routes to ready gogol-adapter destinations, and ACKs each
 * message; a thrown route lets the platform retry that message (bounded → DLQ).
 */
export async function consumeIntegrationBatch(
  events: readonly IntegrationEvent[],
  secrets: IntegrationSecrets,
  dedup?: { has(key: string): boolean | Promise<boolean>; add(key: string): unknown },
): Promise<RouteResult[]> {
  const results: RouteResult[] = [];
  for (const event of events) {
    results.push(await routeEventToReady(event, secrets, dedup));
  }
  return results;
}

export async function upsertLead(lead: Lead, secrets: IntegrationSecrets): Promise<string | null> {
  for (const adapter of CRM_ADAPTERS) {
    if (!hasAllSecrets(secrets, adapter.requiredSecrets)) continue;
    try {
      const result = await adapter.upsertLead(lead, secrets);
      return result?.id ?? null;
    } catch (err) {
      console.warn(`[integration] crm "${adapter.id}" failed:`, (err as Error).message);
    }
  }
  return null;
}
