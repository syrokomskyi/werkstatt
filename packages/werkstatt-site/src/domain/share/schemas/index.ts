/*
<MODULE_CONTRACT>
<purpose>
RFC-0264: barrel for the entire @warpgogol/werkstatt-site/share schemas domain — base page schema,
navigation, feature policy, and the RFC-0101..0106/0202/0210/0220/0231/0257
canonical section-visual / section-content / media / material-credit / print
contracts. Consumers should prefer `@warpgogol/werkstatt-site/share/schemas` over the deprecated
root barrel.
</purpose>
<non-goals>
  <item>Do not contain schema definitions — pure re-export barrel.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0264: initial creation — aggregates the schemas/ domain for the @warpgogol/werkstatt-site/share/schemas subpath.</item>
</CHANGE_SUMMARY>
*/

export * from "./page-base.ts";
export * from "./navigation.ts";
export * from "./features.ts";
export * from "./horizontal-align.ts";
export * from "./section-background.ts";
export * from "./effects.ts";
export * from "./section-shell.ts";
export * from "./section-header.ts";
export * from "./icon-color.ts";
export * from "./standard-list-item.ts";
export * from "./section-cards.ts";
export * from "./section-stats.ts";
export * from "./section-body.ts";
export * from "./section-cta.ts";
export * from "./section-image.ts";
export * from "./live-photo.ts";
export * from "./media.ts";
export * from "./material-credit.ts";
export * from "./site-background.ts";
export * from "./section-motion.ts";
export * from "./print.ts";
export * from "./claims.ts";
export * from "./claim-records.ts";
export * from "./person.ts";
export * from "./participant.ts";
