/*
<MODULE_CONTRACT>
<purpose>Astro-dependent page entry utilities for semantic layer: localized page body retrieval with default-language fallback.</purpose>
<non-goals>
  <item>Do not contain page-specific logic or component content loading.</item>
  <item>Do not handle semantic model construction.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from app semantic pages _shared — astro-dependent functions moved to packages/share/src/astro/ per RFC-0037.</item>
</CHANGE_SUMMARY>
*/

import { getEntry } from "astro:content";
import { pageIdToContentFileSlug } from "../content/entity-id.ts";

type RawPagesEntry = {
  body?: string;
};

/**
 * Extracts raw body content from a content entry.
 * Handles both string and compiled content formats.
 */
export function getEntryBody(entry: unknown): string {
  if (!entry || typeof entry !== "object") {
    return "";
  }

  const value = (entry as RawPagesEntry).body;
  return typeof value === "string" ? value.trim() : "";
}

async function resolveEntrySlug(pageId: string, _lang: string): Promise<string | null> {
  return pageIdToContentFileSlug(pageId);
}

/**
 * Retrieves a localized page entry with fallback to default language.
 * Logs a warning when falling back from a non-default language.
 *
 * @param id - pageId (without language prefix)
 * @param lang - current language code
 * @param defaultLang - default language code (e.g. "de")
 */
export async function getRawPageEntry(
  id: string,
  lang: string,
  defaultLang: string,
): Promise<RawPagesEntry | undefined> {
  const slug = await resolveEntrySlug(id, lang);
  if (!slug) return undefined;

  const localizedEntry = await getEntry("pages", `${lang}/${slug}`);
  if (localizedEntry) {
    return localizedEntry as RawPagesEntry;
  }
  if (lang !== defaultLang) {
    console.warn(
      `[content-fallback] "pages/${lang}/${slug}" not found — using "${defaultLang}" fallback`,
    );
  }
  const fallbackSlug = await resolveEntrySlug(id, defaultLang);
  if (!fallbackSlug) return undefined;
  const fallbackEntry = await getEntry("pages", `${defaultLang}/${fallbackSlug}`);
  return fallbackEntry ? (fallbackEntry as RawPagesEntry) : undefined;
}
