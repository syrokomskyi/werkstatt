/*
<MODULE_CONTRACT>
<purpose>
App-agnostic i18n helpers: a factory that creates type-safe localization utilities
bound to any language mapping. Each app supplies its own mapping constant; this module
provides the reusable logic without hard-coding any language list.
</purpose>
<non-goals>
  <item>Do not hard-code any language list — each app owns its own LANGUAGE_MAPPING constant.</item>
  <item>Do not import from apps/* or astro:content.</item>
  <item>Do not manage language preferences, user sessions, or UI rendering.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial extraction from app utils/localization into packages/share.</item>
  <item>Refactored to factory pattern so LANGUAGE_MAPPING stays in each app and the shared logic is truly app-agnostic.</item>
</CHANGE_SUMMARY>
*/

// [DNA-02][DNA-10] App-agnostic localization utilities.
// Each app calls createLocalizationHelpers(LANGUAGE_MAPPING) to get type-safe i18n helpers
// bound to its own language list.

export function createLocalizationHelpers<TMapping extends Record<string, string>>(
  languageMapping: TMapping,
) {
  type SupportedLanguage = keyof TMapping & string;

  function isLanguageCode(code: string): code is SupportedLanguage {
    return code in languageMapping;
  }

  function getSupportedLanguageCodes(): SupportedLanguage[] {
    return Object.keys(languageMapping) as SupportedLanguage[];
  }

  function getLocalizedUrl(currentPath: string, targetLang: string): string {
    const cleanPath = currentPath.startsWith("/") ? currentPath.slice(1) : currentPath;

    if (!cleanPath) {
      return `/${targetLang}/`;
    }

    const parts = cleanPath.split("/");

    // If the first segment is an existing language code, replace it.
    if (parts[0] && parts[0] in languageMapping) {
      parts[0] = targetLang;
      return `/${parts.join("/")}`;
    }

    // Otherwise, prepend the target language.
    return `/${targetLang}/${cleanPath}`;
  }

  return { isLanguageCode, getSupportedLanguageCodes, getLocalizedUrl } as const;
}
