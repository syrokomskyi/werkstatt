/*
<MODULE_CONTRACT>
<purpose>
Deprecated compatibility barrel for @warpgogol/werkstatt-shared/share (RFC-0264). New code MUST
import from the domain subpath instead — see the map in
packages/share/AGENTS.md. This root barrel re-exports each subpath module
unchanged (never new logic) so existing consumers keep working while they
migrate. The `page` and `i18n` domains have completed their migration wave:
their re-export blocks are deleted here — import them from
`@warpgogol/werkstatt-shared/share/page` / `@warpgogol/werkstatt-shared/share/i18n`.
</purpose>
<non-goals>
  <item>Do not add business logic here — keep as a pure re-export barrel.</item>
  <item>Do not re-add the page or i18n domains — those are fully migrated; import the subpath directly.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial barrel created alongside package extraction.</item>
  <item>RFC-0264: split into subpath entry points. Root barrel shrunk to a deprecated compatibility surface; page and i18n domains fully migrated (root re-export blocks deleted, all consumers rewritten).</item>
  <item>C6: image-utils.ts shim deleted; root barrel re-exports from @warpgogol/werkstatt-site/content-source directly. page-handler.ts shim deleted; export map points to resolve-route.ts.</item>
</CHANGE_SUMMARY>
*/

/** @deprecated import from "@warpgogol/werkstatt-shared/share/content" instead */
export * from "./content/index.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/semantic" instead */
export * from "./semantic/index.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/middleware" instead */
export * from "./middleware/language-redirect.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/entitlement" instead */
export * from "./entitlement.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/offer-capacity" instead */
export * from "./offer-capacity.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/knowledge" instead */
export * from "./knowledge/index.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/schemas" instead */
export * from "./schemas/index.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/feature-policy" instead */
export * from "./feature-policy.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/counter-utils" instead */
export * from "./counter-utils.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/image-provider" instead */
export * from "./image-provider.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/runtime-context" instead */
export { EMPTY_RUNTIME_CONTEXT } from "./runtime-context.ts";
export type { RuntimeContext } from "./runtime-context.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/visibility" instead */
export * from "./visibility.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/wrap-inline-numbers" instead */
export * from "./wrap-inline-numbers.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/text-normalize" instead */
export * from "./text-normalize.ts";
// dev-props-validator is NOT re-exported from the root barrel. It imports
// node:fs/promises and @warpgogol/werkstatt-shared/ontology/schemas (which also imports node:fs),
// so re-exporting it here pulls Node-only modules into the Vite client bundle.
// The sole consumer (resolve-route.ts) imports it via relative path.
// Import from "@warpgogol/werkstatt-shared/share/dev-props-validator" subpath directly if needed.
/** @deprecated import from "@warpgogol/werkstatt-shared/share/rfc0042-utils" instead */
export { need, cast, withDefault } from "./rfc0042-utils.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/shared-context" instead */
export * from "./shared-context.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/content-discipline" instead */
export * from "./content-discipline/types.ts";
export * from "./content-discipline/parsers.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/legal" instead */
export { resolveTranslationContext, TRANSLATION_STATUSES } from "./legal/translation-policy.ts";
export type {
  TranslationStatus,
  PageTranslationPolicy,
  ResolvedTranslationContext,
} from "./legal/translation-policy.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/material-credits" instead */
export {
  parseMaterialCreditMap,
  findMaterialCredit,
  creditByTarget,
  buildMaterialCreditJsonLd,
  langFromCreditPath,
} from "./material-credits.ts";
export type { MaterialCreditRecord, RawMaterialCreditMap } from "./material-credits.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/attribution-display" instead */
export * from "./attribution-display.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/string-utils" instead */
export { toKebabCase } from "./string-utils.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/css-value-normalize" instead */
export { normalizeCssValue } from "./css-value-normalize.ts";
