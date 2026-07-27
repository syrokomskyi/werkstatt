/******************************************************************************* 
<MODULE_CONTRACT> 
<purpose>Defines schemas for growth configuration, facilitating validation and runtime parsing for the GrowthProvider and bootGrowthLayer.</purpose> 
 
 
<non-goals> 
<item>Do not handle raw content parsing or transformation.</item> 
<item>Do not manage transport or orchestration of configuration data.</item> 
<item>Do not implement business logic related to growth tracking.</item> 
</non-goals> 
</MODULE_CONTRACT> 
 
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY> 
*******************************************************************************/

/**
 * @gogol/growth — GrowthConfig
 *
 * The runtime-serialisable configuration block that the server injects into the
 * page via <GrowthProvider> and that bootGrowthLayer() reads on the client.
 *
 * All values must be JSON-serialisable (no functions, no class instances).
 *
 * RFC-0027 / DNA-29
 */

import { z } from "zod";
import { growthVendorSchema } from "@gogol/ontology/schemas";

// ---------------------------------------------------------------------------
// Zod schema — used both for authoring-time validation and runtime parsing
// ---------------------------------------------------------------------------

/**
 * Vendor config schema — re-exported from @gogol/ontology as the single source
 * of truth. The ontology schema is shared with systemGrowthSchema so the
 * `growth.vendor` shape in system.md and the runtime config stay in sync.
 */
export const GrowthVendorConfigSchema = growthVendorSchema;

export const GrowthConfigSchema = z.object({
  /** App identifier from src/content/system.md — injected by <GrowthProvider> */
  appId: z.string().min(1),

  /**
   * Active locale injected server-side; used by emit() as the default locale
   * when the caller does not override it.
   */
  locale: z.string().min(2),

  /**
   * Vendor adapter binding — exactly one adapter per app at MVP.
   * Multiple adapters (fan-out) are a post-MVP extension.
   */
  vendor: GrowthVendorConfigSchema,

  /**
   * Funnel ids active for this app, loaded from packages/ontology/growth/funnels/.
   * The bootGrowthLayer() client uses this to set up funnel tracking.
   * Empty array = no funnels active.
   */
  activeFunnels: z.array(z.string()).default([]),

  /**
   * Active experiment ids for this page render, resolved server-side from
   * packages/ontology/growth/experiments/ + src/content/system.md growth.experiments[].
   * Empty array = no experiments active on this page.
   */
  activeExperiments: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// TypeScript types derived from schema
// ---------------------------------------------------------------------------

export type GrowthVendorConfig = z.infer<typeof GrowthVendorConfigSchema>;

/**
 * The shape of the JSON blob that <GrowthProvider> injects into the page and
 * that bootGrowthLayer() reads from the DOM.
 */
export type GrowthConfig = z.infer<typeof GrowthConfigSchema>;

// ---------------------------------------------------------------------------
// DOM attribute used to locate the config JSON blob
// ---------------------------------------------------------------------------

/** The `id` of the <script type="application/json"> injected by <GrowthProvider>. */
export const GROWTH_CONFIG_SCRIPT_ID = "__webgogol_growth_config__";
