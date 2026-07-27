/*******************************************************************************
<MODULE_CONTRACT>
<purpose>Content-shape for FAQ entries auto-enumerated from the business content
collection (RFC-0262: the section's own props are generated from its manifest
propsSchema — see faq-list-section.types.generated.ts).</purpose>
<non-goals>
  <item>Do not declare the section's own props — that is faq-list-section.types.generated.ts (RFC-0262).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Backfill type definitions to align with RFC-0101/0102 specifications.</item>
  <item>RFC-0262: FaqListSectionContent is now generated (faq-list-section.types.generated.ts); this file keeps only the content-collection FaqListItem shape.</item>
</CHANGE_SUMMARY>
******************************************************************************/

export interface FaqListItem {
  question: string;
  answer: string;
  slug: string;
}
