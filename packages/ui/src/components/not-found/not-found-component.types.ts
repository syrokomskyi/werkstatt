/*
<MODULE_CONTRACT>
<purpose>Canonical TypeScript content shape for the shared generated 404 component.</purpose>
<non-goals>
  <item>Do not implement rendering or runtime validation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added RFC-0034 sibling content type for the generated not-found component.</item>
</CHANGE_SUMMARY>
*/

export interface NotFoundComponentContent {
  lang: string;
  title: string;
  intro: string;
  homeLabel: string;
  homeHref: string;
  primaryLabel?: string;
  primaryHref?: string;
  contactLabel?: string;
  contactHref?: string;
}
