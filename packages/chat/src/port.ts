/*
<MODULE_CONTRACT>
<purpose>RFC-0175: the Chat Widget Port. Vendor-agnostic contract for a consent-gated, click-to-load
chat widget. ChatWidgetAdapter.load() injects the vendor script and MUST be called only after
explicit user activation; before that, nothing third-party loads or touches storage. Mirrors the
growth (RFC-0027) and content-source (RFC-0141) port/adapter pattern. Also owns the Zod config schema
and DOM script id (folded from config.ts to resolve a circular import and deepen the port module).</purpose>
<non-goals>
  <item>Do not import a vendor SDK here — adapters inject their own script lazily.</item>
  <item>Do not read astro:env or carry secrets — lead routing/secrets live in the hub (RFC-0176).</item>
  <item>Do not allow secrets in the config — options are public strings only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0175: initial implementation.</item>
  <item>Architecture review: ChatWidgetAdapter is self-describing — requiredOptions and
        vendorOrigins live on the adapter, not in hardcoded maps elsewhere.</item>
  <item>Architecture review: load() returns ChatWidgetLoadResult, open() returns ChatWidgetOpenResult —
        the interface is the test surface, callers can react to failure.</item>
  <item>Architecture review: folded config.ts into port.ts — resolves a circular import
        (port→config→port), deepens the port module, removes a 30-line shallow file.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

/**
 * The vendor-agnostic contract every chat adapter must satisfy.
 *
 * Lifecycle:
 *   1. `load(config)` — inject the vendor script + initialise. MUST be called
 *      ONLY after explicit user activation (the launcher click). Idempotent.
 *   2. `open()` — open / focus the widget panel after load().
 *
 * Self-describing metadata (architecture review):
 *   - `requiredOptions` — groups of alternative option keys, at least one required.
 *   - `vendorOrigins` — public origins the adapter loads from (for consent.activation.validate).
 */
/** Result of load() — lets the caller react to failure without catching errors. */
export type ChatWidgetLoadResult = "ready" | "error" | "cached";

/** Result of open() — lets the caller show fallback UI or retry. */
export type ChatWidgetOpenResult = "opened" | "not-ready" | "no-global";

export interface ChatWidgetAdapter {
  /** Unique machine-readable adapter id (e.g. "uchat", "null"). */
  readonly id: string;
  /**
   * Inject the vendor script + initialise. Resolves with a ChatWidgetLoadResult.
   * Called only after user activation — never at import or hydration time.
   */
  load(config: ChatWidgetConfig): Promise<ChatWidgetLoadResult>;
  /** Open / focus the widget panel. Returns a ChatWidgetOpenResult. Safe to call repeatedly. */
  open(): ChatWidgetOpenResult;
  /** Groups of alternative option keys; at least one in each group must be present. */
  readonly requiredOptions?: readonly (readonly string[])[];
  /** Public origins this adapter loads from (for consent.activation.validate). */
  readonly vendorOrigins?: readonly string[];
}

/**
 * Closed catalog of configurable chat adapter ids (RFC-0175). `"null"` is the
 * safe no-op binding. Used by chat.config.validate to reject unknown ids in
 * system.md and by the loader's enum-dispatch.
 */
export const CHAT_ADAPTER_IDS = ["uchat", "null"] as const;

export type ChatAdapterId = (typeof CHAT_ADAPTER_IDS)[number];

/** Type guard: is `value` a known chat adapter id? */
export function isChatAdapterId(value: string): value is ChatAdapterId {
  return (CHAT_ADAPTER_IDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Config schema + DOM script id (folded from config.ts)
// ---------------------------------------------------------------------------

export const ChatWidgetConfigSchema = z.object({
  appId: z.string().min(1),
  locale: z.string().min(2),
  adapter: z.enum(CHAT_ADAPTER_IDS),
  /** PUBLIC vendor options forwarded verbatim to ChatWidgetAdapter.load(). */
  options: z.record(z.string(), z.string()).default({}),
});

export type ChatWidgetConfig = z.infer<typeof ChatWidgetConfigSchema>;

/** The `id` of the <script type="application/json"> injected by the chat-widget section. */
export const CHAT_CONFIG_SCRIPT_ID = "__webgogol_chat_config__";
