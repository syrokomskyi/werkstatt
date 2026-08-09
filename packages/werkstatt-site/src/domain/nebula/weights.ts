/*******************************************************************************  
<MODULE_CONTRACT>  
<purpose>Defines global scoring weights for the Nebula framework, ensuring consistent evaluation across applications.</purpose>  
  
  
<non-goals>  
  <item>Do not allow per-application customization of weights.</item>  
  <item>Do not parse or modify raw weight data within this module.</item>  
  <item>Do not handle transport or configuration orchestration for weight management.</item>  
</non-goals>  
</MODULE_CONTRACT>  
  
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY>  
*******************************************************************************/

/**
 * @warpgogol/werkstatt-site/nebula — Frozen Nebula Score weights
 *
 * DNA-33 / RFC-0028
 *
 * INVARIANT: Weights are workspace-global and per-app customisation is
 * permanently forbidden. Changing weights requires a superseding RFC
 * that bumps NEBULA_WEIGHTS_VERSION. Any modification without a RFC
 * will fail nebula.score.compute (weight-version drift check).
 *
 * Weight philosophy:
 *   Performance (0.30)             — LCP/TBT/CLS from Lighthouse p50 across routes
 *   Accessibility (0.30)           — Lighthouse a11y + axe-core violations normalised
 *   Content Health (0.20)          — language completeness + prop validity + links + alt text
 *   Architectural Compliance (0.20) — DNA validators green count / total
 */

export const NEBULA_WEIGHTS = Object.freeze({
  performance: 0.3,
  accessibility: 0.3,
  contentHealth: 0.2,
  architecturalCompliance: 0.2,
} as const);

/**
 * Semantic version of the current weight set.
 * Bump minor for additive pillar additions; bump major for weight changes.
 * Changing this value without a superseding RFC is a protocol violation.
 */
export const NEBULA_WEIGHTS_VERSION = "1.0.0" as const;

/** Pillar ids as a closed tuple — derived from NEBULA_WEIGHTS keys. */
export type NebulaWeightKey = keyof typeof NEBULA_WEIGHTS;

export const NEBULA_PILLAR_IDS: readonly NebulaWeightKey[] = Object.keys(
  NEBULA_WEIGHTS,
) as NebulaWeightKey[];

/** Sum of all weights — must equal 1.0 (validated at module load time). */
const _weightSum = Object.values(NEBULA_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(_weightSum - 1.0) > 1e-9) {
  throw new Error(
    `[nebula] NEBULA_WEIGHTS must sum to 1.0 but sums to ${_weightSum}. ` +
      `This is a bug — update weights and bump NEBULA_WEIGHTS_VERSION.`,
  );
}
