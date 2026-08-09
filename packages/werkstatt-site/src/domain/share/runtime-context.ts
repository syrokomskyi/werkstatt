/*
<MODULE_CONTRACT>
<purpose>
Defines RuntimeContext — the single context object threaded through the buildPage
pipeline and every block-level rendering decision (DNA-26, RFC-0026).
At MVP exactly three fields are present; segment and flags are reserved no-ops that
become active when RFC-0027 activates the Growth Layer.
</purpose>
<non-goals>
  <item>Do not add new fields without a superseding RFC (RFC-0026 nonGoal).</item>
  <item>Do not allow non-null segment or non-empty flags at MVP — runtime.context.shape enforces this.</item>
  <item>Do not add rendering logic here.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0026): Initial creation — RuntimeContext shape and EMPTY_RUNTIME_CONTEXT factory.</item>
</CHANGE_SUMMARY>
*/

/**
 * The single context object threaded through the buildPage pipeline.
 *
 * At MVP (RFC-0026):
 *   - `locale`  — the active BCP-47 language code; evaluated by block visibility expressions.
 *   - `segment` — RESERVED. Always null at MVP. RFC-0027 will populate this from edge-runtime
 *                 persona detection. Content authors may write `visibility: { segment: "..." }`
 *                 today; the expression evaluates false until RFC-0027 activates it.
 *   - `flags`   — RESERVED. Always {} at MVP. RFC-0027 will populate this from feature-flag
 *                 edge evaluation. Content authors may write `visibility: { flag: "..." }` today;
 *                 the expression evaluates false until RFC-0027 activates it.
 *
 * `runtime.context.shape` verifies that no workspace code constructs a RuntimeContext
 * with non-null segment or non-empty flags before RFC-0027 supersedes this file.
 */
export interface RuntimeContext {
  /** Active BCP-47 locale (e.g. "de", "en"). Evaluated by { locale: "de" } expressions. */
  readonly locale: string;

  /**
   * RESERVED — always null at MVP.
   * Do NOT construct a RuntimeContext with a non-null segment (violation caught by runtime.context.shape).
   * RFC-0027 will fill this from an edge-runtime persona-detection result.
   */
  readonly segment: string | null;

  /**
   * RESERVED — always {} at MVP.
   * Do NOT construct a RuntimeContext with non-empty flags (violation caught by runtime.context.shape).
   * RFC-0027 will fill this from an edge-runtime feature-flag evaluation result.
   */
  readonly flags: Readonly<Record<string, boolean>>;
}

/**
 * The only legal way to construct a RuntimeContext at MVP.
 *
 * Usage in page routes:
 * ```ts
 * import { EMPTY_RUNTIME_CONTEXT } from "@warpgogol/werkstatt-site/share";
 * const ctx = EMPTY_RUNTIME_CONTEXT(lang);
 * const page = await buildPage(entry, ctx);
 * ```
 *
 * @param locale — the active BCP-47 language code from the route params.
 */
export const EMPTY_RUNTIME_CONTEXT = (locale: string): RuntimeContext => ({
  locale,
  segment: null,
  flags: Object.freeze({}) as Readonly<Record<string, boolean>>,
});
