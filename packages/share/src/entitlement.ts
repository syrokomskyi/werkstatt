/*
<MODULE_CONTRACT>
<purpose>RFC-0169: the closed paid-feature catalog, the resolved-entitlements shape, and the
isEntitled() reader. Stripe Entitlements is the source of truth; this module is the framework-
agnostic contract consumed by the build-time resolver, the feature gates, and runtime endpoints.</purpose>
<non-goals>
  <item>Do not call Stripe here — the resolver command (site OS) performs network I/O and passes
        the mapped lookup keys to resolveEntitlements().</item>
  <item>Do not build a custom entitlements store — Stripe is the source of truth.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0169: initial implementation.</item>
  <item>RFC-0706: add nachweis feature for Nachweisregister commercial module.</item>
</CHANGE_SUMMARY>
*/

/** Closed catalog of paid features that can gate a site's compiled modules. */
export const ENTITLED_FEATURES = [
  "blog",
  "integrations.channels",
  "integrations.crm",
  "integrations.chat",
  "analytics",
  "pseo",
  "team.profiles",
  // RFC-0240: Angebot modular productization
  "offer",
  "booking",
  "trust",
  "i18n-extra",
  "automation",
  // RFC-0288: Agent Surface action tier (AI-agent-invocable capabilities)
  "agent.actions",
  // RFC-0706: Nachweisregister commercial module
  "nachweis",
] as const;

export type EntitledFeature = (typeof ENTITLED_FEATURES)[number];

/** Stripe Feature `lookup_key` → EntitledFeature. The single mapping point. */
export const STRIPE_FEATURE_LOOKUP_MAP: Record<string, EntitledFeature> = {
  feature_blog: "blog",
  feature_integrations_channels: "integrations.channels",
  feature_integrations_crm: "integrations.crm",
  feature_integrations_chat: "integrations.chat",
  feature_analytics: "analytics",
  feature_pseo: "pseo",
  feature_team_profiles: "team.profiles",
  // RFC-0240
  feature_offer: "offer",
  feature_booking: "booking",
  feature_trust: "trust",
  feature_i18n_extra: "i18n-extra",
  feature_automation: "automation",
  // RFC-0288
  feature_agent_actions: "agent.actions",
  // RFC-0706
  feature_nachweis: "nachweis",
};

/**
 * RFC-0196: Stripe Feature `lookup_key` → Programmatic Surface index budget (top-K indexable pages
 * by substance). A site's tier is the highest budget among its active entitlement lookup-keys.
 */
export const PSEO_TIER_BUDGET: Record<string, number> = {
  feature_pseo: 12, // base tier "Быть найденным" — ≈12 target pages
  feature_pseo_regional: 500, // regional-hub upsell — unlocks d3–d4
  feature_pseo_pro: 5000,
  feature_pseo_scale: 50000,
};

/** RFC-0240: tiers that unlock the d3 (region) and d4 levels of the local family. */
export const PSEO_REGIONAL_TIERS = [
  "feature_pseo_regional",
  "feature_pseo_pro",
  "feature_pseo_scale",
] as const;

/** Resolve the index budget for a set of active Stripe lookup-keys (max tier; undefined ⇒ none). */
export function resolvePseoBudget(lookupKeys: readonly string[]): number | undefined {
  let budget: number | undefined;
  for (const key of lookupKeys) {
    const tier = PSEO_TIER_BUDGET[key];
    if (tier !== undefined) budget = budget === undefined ? tier : Math.max(budget, tier);
  }
  return budget;
}

export type EntitlementSource = "stripe" | "override" | "none";

/** The generated, content-driven feature set written by `entitlements.resolve`. */
export interface ResolvedEntitlements {
  customerId: string | null;
  features: EntitledFeature[];
  source: EntitlementSource;
  /**
   * RFC-0196: Programmatic Surface tier. `indexBudget` caps the number of indexable generated
   * pages (top-K by substance score); absent ⇒ unbounded (fail-open). Set by the tier mapping.
   */
  pseo?: {
    indexBudget?: number;
    /** RFC-0240: whether the resolved tier is the regional-hub tier or higher (unlocks d3–d4). */
    regionalUnlocked?: boolean;
  };
}

export function isValidFeature(value: string): value is EntitledFeature {
  return (ENTITLED_FEATURES as readonly string[]).includes(value);
}

/**
 * Pure resolver. The site-OS command performs the Stripe network call and passes the
 * mapped lookup keys as `stripeFeatures`; an offline `override` wins for dev/CI.
 */
export function resolveEntitlements(input: {
  customerId: string | null;
  override?: string[];
  stripeFeatures?: string[];
  /** RFC-0196: optional Programmatic Surface index budget (tier-derived). */
  pseoIndexBudget?: number;
  /**
   * RFC-0240: explicit regional-hub-or-higher unlock for offline/override mode, where no Stripe
   * lookup key is available to derive it from.
   */
  pseoRegionalUnlocked?: boolean;
  /** RFC-0240: raw Stripe lookup keys (Stripe mode only) — used to derive the regional-tier unlock. */
  stripeLookupKeys?: string[];
}): ResolvedEntitlements {
  const dedupe = (values: string[]): EntitledFeature[] =>
    Array.from(new Set(values.filter(isValidFeature)));
  const regionalUnlocked =
    input.pseoRegionalUnlocked ??
    (input.stripeLookupKeys ?? []).some((key) =>
      (PSEO_REGIONAL_TIERS as readonly string[]).includes(key),
    );
  const pseo =
    typeof input.pseoIndexBudget === "number" || regionalUnlocked
      ? { pseo: { indexBudget: input.pseoIndexBudget, regionalUnlocked } }
      : {};

  if (input.override && input.override.length > 0) {
    return {
      customerId: input.customerId,
      features: dedupe(input.override),
      source: "override",
      ...pseo,
    };
  }
  if (input.stripeFeatures) {
    return {
      customerId: input.customerId,
      features: dedupe(input.stripeFeatures),
      source: "stripe",
      ...pseo,
    };
  }
  return { customerId: input.customerId, features: [], source: "none", ...pseo };
}

/** Reader used by build gates (which modules compile) and runtime endpoints. */
export function isEntitled(
  resolved: ResolvedEntitlements | null | undefined,
  feature: EntitledFeature,
): boolean {
  return !!resolved?.features.includes(feature);
}
