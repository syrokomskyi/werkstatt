/*
<MODULE_CONTRACT>
<purpose>Section anchor resolution for RFC-0048 route registry: maps section ids to localized anchor URLs.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from routes.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import type { LanguageCode, PageId } from "./registry.ts";
import { getRouteRegistry } from "./registry.ts";

/**
 * RFC-0048: Resolve an anchorId to a language-specific HTML fragment id.
 *
 * Looks up the anchorId in the page's anchor registry from system.md.
 * Falls back to the default language value if lang is missing.
 * Falls back to the raw anchorId string if not found in registry (no regression).
 *
 * @example
 * resolveAnchorFragment("approach", "home", "en") // "our-approach"
 * resolveAnchorFragment("approach", "home", "de") // "unser-ansatz"
 * resolveAnchorFragment("hero", "home", "en")     // "hero" (not in registry, used as-is)
 */
export async function resolveAnchorFragment(
  anchorId: string,
  pageId: PageId,
  lang: LanguageCode,
): Promise<string> {
  const registry = await getRouteRegistry();
  const entry = registry.byPageId.get(pageId);
  const langMap = entry?.anchors?.[anchorId];

  if (!langMap) {
    // Not in registry — treat as raw HTML id
    return anchorId;
  }

  return langMap[lang] ?? langMap[registry.defaultLanguage] ?? anchorId;
}

/**
 * Check if a page exists in the registry for a given language.
 */
export async function hasLocalizedPage(pageId: PageId, lang: LanguageCode): Promise<boolean> {
  const registry = await getRouteRegistry();
  const entry = registry.byPageId.get(pageId);
  return entry !== undefined && entry.routes[lang] !== undefined;
}

/**
 * RFC-0048: Resolve a section's HTML `id` from page content props.
 *
 * Reads `pageOverride.anchorId` (stable anchorId) and resolves it through
 * the anchor registry for the current page and language. Falls back to
 * `defaultAnchorId` if no anchorId is declared in content. Falls back to
 * the raw anchorId string if the page has no registry entry (no regression).
 *
 * @example
 * // In a section component:
 * const sectionId = await resolveSectionAnchor(Astro.props, "approach");
 */
export async function resolveSectionAnchor(
  props: Record<string, unknown>,
  defaultAnchorId?: string,
): Promise<string> {
  const pageOverride = (props.pageOverride ?? {}) as Record<string, unknown>;
  const anchorId = pageOverride.anchorId ?? defaultAnchorId;
  if (!anchorId) return "";
  if (props.pageId) {
    return resolveAnchorFragment(anchorId as string, props.pageId as string, props.lang as string);
  }
  // No pageId available — use raw anchorId (language-neutral fallback)
  return anchorId as string;
}
