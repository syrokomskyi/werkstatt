/*
<MODULE_CONTRACT>
<purpose>Section anchor resolution: returns the block id as HTML id for section rendering (RFC-0914).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from routes.ts as part of the domain split.</item>
  <item>RFC-0914: removed resolveAnchorFragment and RFC-0048 anchor registry. resolveSectionAnchor now reads blockId directly from SectionProps.</item>
</CHANGE_SUMMARY>
*/

import type { LanguageCode, PageId } from "./registry.ts";
import { getRouteRegistry } from "./registry.ts";

/**
 * Check if a page exists in the registry for a given language.
 */
export async function hasLocalizedPage(pageId: PageId, lang: LanguageCode): Promise<boolean> {
  const registry = await getRouteRegistry();
  const entry = registry.byPageId.get(pageId);
  return entry !== undefined && entry.routes[lang] !== undefined;
}

/**
 * RFC-0914: Resolve a section's HTML `id` from SectionProps.
 *
 * Reads `blockId` (the stable block.id from content entry) directly.
 * Falls back to `defaultAnchorId` only for shell blocks (which have no content-entry id).
 *
 * @example
 * // In a section component:
 * const sectionId = await resolveSectionAnchor(Astro.props, "approach");
 */
export async function resolveSectionAnchor(
  props: Record<string, unknown>,
  defaultAnchorId?: string,
): Promise<string> {
  const blockId = props.blockId;
  if (typeof blockId === "string" && blockId) return blockId;
  return defaultAnchorId ?? "";
}
