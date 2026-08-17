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
export * from "@warpgogol/werkstatt-shared/share/content";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/semantic" instead */
export * from "./semantic/index.ts";
/** @deprecated import from "./astro/content.ts" etc. via a dedicated subpath instead */
export * from "./astro/content.ts";
export * from "./astro/semantic-target.ts";
export * from "./astro/routes.ts";
export * from "./astro/articles.ts";
export * from "./astro/people.ts";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/middleware" instead */
export * from "@warpgogol/werkstatt-shared/share/middleware";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/entitlement" instead */
export * from "@warpgogol/werkstatt-shared/share/entitlement";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/offer-capacity" instead */
export * from "@warpgogol/werkstatt-shared/share/offer-capacity";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/knowledge" instead */
export * from "@warpgogol/werkstatt-shared/share/knowledge";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/schemas" instead */
export * from "@warpgogol/werkstatt-shared/share/schemas";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/feature-policy" instead */
export * from "@warpgogol/werkstatt-shared/share/feature-policy";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/counter-utils" instead */
export * from "@warpgogol/werkstatt-shared/share/counter-utils";
/** @deprecated import from "@warpgogol/werkstatt-site/content-source" instead */
export {
  resolveImage,
  resolveImageRequired,
  resolveVideo,
  resolveMedia,
  createImageResolver,
  contentAssetSyntaxDiagnostics,
  describeContentAssetResolution,
  IMAGE_EXTENSIONS,
  CONTENT_ASSET_DOMAINS,
  VIDEO_EXTENSIONS,
  MEDIA_SOURCE_EXTENSIONS,
  DEFAULT_LANGUAGE,
} from "@warpgogol/werkstatt-site/content-source";
/** @deprecated import from "@warpgogol/werkstatt-site/content-source" instead */
export type {
  ImageResolverOptions,
  ResolvedMediaSource,
  ContentAssetDomain,
  ContentAssetExtension,
  ContentAssetSyntaxDiagnostic,
  ContentAssetToken,
  ContentAssetCandidate,
  ContentAssetResolutionContract,
  ContentAssetResolutionOptions,
} from "@warpgogol/werkstatt-site/content-source";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/image-provider" instead */
export * from "@warpgogol/werkstatt-shared/share/image-provider";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/runtime-context" instead */
export { EMPTY_RUNTIME_CONTEXT } from "@warpgogol/werkstatt-shared/share/runtime-context";
export type { RuntimeContext } from "@warpgogol/werkstatt-shared/share/runtime-context";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/visibility" instead */
export * from "@warpgogol/werkstatt-shared/share/visibility";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/wrap-inline-numbers" instead */
export * from "@warpgogol/werkstatt-shared/share/wrap-inline-numbers";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/text-normalize" instead */
export * from "@warpgogol/werkstatt-shared/share/text-normalize";
// dev-props-validator is NOT re-exported from the root barrel. It imports
// node:fs/promises and @warpgogol/werkstatt-shared/ontology/schemas (which also imports node:fs),
// so re-exporting it here pulls Node-only modules into the Vite client bundle.
// The sole consumer (resolve-route.ts) imports it via relative path.
// Import from "@warpgogol/werkstatt-shared/share/dev-props-validator" subpath directly if needed.
/** @deprecated import from "@warpgogol/werkstatt-shared/share/rfc0042-utils" instead */
export { need, cast, withDefault } from "@warpgogol/werkstatt-shared/share/rfc0042-utils";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/shared-context" instead */
export * from "@warpgogol/werkstatt-shared/share/shared-context";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/content-discipline" instead */
export * from "@warpgogol/werkstatt-shared/share/content-discipline/types";
export * from "@warpgogol/werkstatt-shared/share/content-discipline/parsers";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/legal" instead */
export {
  resolveTranslationContext,
  TRANSLATION_STATUSES,
} from "@warpgogol/werkstatt-shared/share/legal/translation-policy";
export type {
  TranslationStatus,
  PageTranslationPolicy,
  ResolvedTranslationContext,
} from "@warpgogol/werkstatt-shared/share/legal/translation-policy";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/material-credits" instead */
export {
  parseMaterialCreditMap,
  findMaterialCredit,
  creditByTarget,
  buildMaterialCreditJsonLd,
  langFromCreditPath,
} from "@warpgogol/werkstatt-shared/share/material-credits";
export type {
  MaterialCreditRecord,
  RawMaterialCreditMap,
} from "@warpgogol/werkstatt-shared/share/material-credits";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/attribution-display" instead */
export * from "@warpgogol/werkstatt-shared/share/attribution-display";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/string-utils" instead */
export { toKebabCase } from "@warpgogol/werkstatt-shared/share/string-utils";
/** @deprecated import from "@warpgogol/werkstatt-shared/share/css-value-normalize" instead */
export { normalizeCssValue } from "@warpgogol/werkstatt-shared/share/css-value-normalize";
