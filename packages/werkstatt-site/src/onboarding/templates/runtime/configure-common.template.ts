/*
<MODULE_CONTRACT>
<purpose>Defines the default language code for static site generation, ensuring consistent language output during the build process.</purpose>
<non-goals>
  <item>Do not handle dynamic language switching or runtime language resolution.</item>
  <item>Do not manage localization resources or translations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Backfill contract to clarify the role and responsibilities of the default language code definition.</item>
</CHANGE_SUMMARY>
*/

// Default language for SSG. Only this language generates static HTML at build time.
export const defaultLanguageCode = "{{DEFAULT_LANG}}" as const;
