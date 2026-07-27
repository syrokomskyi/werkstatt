/*
<MODULE_CONTRACT>
<purpose>Integrations schema for the system manifest: vendor adapter bindings and integration configuration.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from schemas/system.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

/**
 * The `integrations:` block in system.yaml (engineering-owned). Declares which
 * outbound channel adapters and (optionally) which CRM adapter this app activates
 * through the Integration Port (RFC-0168).
 *
 * Adapter ids are validated against the closed adapter catalog in
 * @warpgogol/integration by `integration.config.validate`; each configured
 * adapter's required secret names are validated against the generated env schema
 * by `integration.secrets.validate`.
 *
 * When the block is absent, channels self-enable purely by secret presence at
 * runtime (back-compat) and the validators are a no-op pass.
 *
 * Example:
 *   integrations:
 *     channels:
 *       - adapter: telegram
 *       - adapter: email
 *         options: { to: "info@example.org" }
 *     crm:
 *       adapter: pipedrive
 */
export const systemIntegrationsSchema = z.object({
  /** Outbound channel adapter bindings (telegram | email | whatsapp | null). */
  channels: z
    .array(
      z.object({
        adapter: z.string().min(1),
        options: z.record(z.string(), z.string()).optional(),
      }),
    )
    .optional()
    .default([]),

  /** Optional CRM adapter binding (pipedrive | null). */
  crm: z
    .object({
      adapter: z.string().min(1),
      options: z.record(z.string(), z.string()).optional(),
    })
    .optional(),

  /**
   * Optional consent-gated chat widget binding (uchat | null) — RFC-0175.
   * `options` carries PUBLIC vendor values only (e.g. uchat needs widgetId or a
   * full scriptUrl). Validated by `chat.config.validate`; gated by the
   * `integrations.chat` entitlement (RFC-0169). The widget is click-to-load: no
   * third-party script/storage exists before the visitor activates the launcher.
   */
  chat: z
    .object({
      adapter: z.string().min(1),
      options: z.record(z.string(), z.string()).optional(),
    })
    .optional(),

  /**
   * RFC-0176: out-of-process source bindings. When a source is enabled (e.g.
   * `uchat`), the inbound route `/api/integration-inbound` is generated and
   * requires `INTEGRATION_INBOUND_SECRET` to authenticate posts.
   */
  inbound: z
    .object({
      sources: z.array(z.string().min(1)).default([]),
    })
    .optional(),

  /**
   * RFC-0176: source-agnostic destination hub. Each destination declares a kind,
   * a vendor, and an execution mode. `gogol-adapter` (default) runs on the
   * client's site with the client's tokens; `vendor-native` is executed by an
   * upstream vendor. Validated by `integration.config.validate`.
   */
  destinations: z
    .array(
      z.object({
        kind: z.string().min(1),
        vendor: z.string().min(1),
        mode: z.enum(["gogol-adapter", "vendor-native"]).default("gogol-adapter"),
      }),
    )
    .optional()
    .default([]),

  /**
   * RFC-0179: the site's placement on the shared, sharded delivery backbone.
   * `region` pins the site's events to a jurisdiction's queue/dedup shard (data
   * residency); `tier` is `shared` (the low-volume long tail, hash-fanned across
   * the region's shared pool) or `dedicated` (a noisy/high-volume client isolated
   * onto its own queue). Both default so existing apps need no edit. Validated by
   * `integration.config.validate`; consumed by `integration.infrastructure.generate`
   * (RFC-0180) to resolve the `ShardAssignment`.
   */
  region: z.enum(["eu", "us"]).optional().default("eu"),
  tier: z.enum(["shared", "dedicated"]).optional().default("shared"),

  /**
   * RFC-0181: EU-resident delivery substrate. `provider: upstash` routes leads via
   * Upstash QStash (EU, eu-central-1) with an Upstash Redis (EU) idempotency ledger
   * — Cloudflare Queues/KV cannot be EU-pinned. `region: eu` keeps lead PII physically
   * in the EU. Validated by `integration.config.validate`.
   */
  delivery: z
    .object({
      provider: z.enum(["upstash"]).default("upstash"),
      region: z.enum(["eu"]).default("eu"),
    })
    .optional(),

  /**
   * RFC-0188: Visitor Sales Funnel binding. The PLATFORM owns the stage/event/
   * transition graph (@warpgogol/integration funnel.ts); this block only declares
   * which canonical funnel `version` the app renders, which event `sources` feed it
   * (e.g. uchat, stripe, operator), and whether the pilot is `enabled`. UChat is the
   * conversation runtime — it renders the funnel and requests transitions; it never
   * owns the graph, pricing, or canonical state. Make.com is never a source. Validated
   * by `funnel.contract.validate` / `funnel.stage.validate` / `funnel.lagebild.validate`.
   * Absent ⇒ the funnel validators are a no-op pass (funnel not yet enabled for the app).
   */
  funnel: z
    .object({
      version: z.string().min(1),
      sources: z.array(z.string().min(1)).optional().default([]),
      enabled: z.boolean().optional().default(false),
    })
    .optional(),
});

export type SystemIntegrations = z.infer<typeof systemIntegrationsSchema>;
