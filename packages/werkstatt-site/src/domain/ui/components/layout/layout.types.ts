/* 
<MODULE_CONTRACT> 
<purpose>Defines TypeScript interfaces for layout content structures in the UI component layer.</purpose> 
 
 
<non-goals> 
  <item>Do not include runtime validation or parsing logic.</item> 
  <item>Do not manage state or side effects related to layout content.</item> 
</non-goals> 
</MODULE_CONTRACT> 
 
<CHANGE_SUMMARY>
  <item>Introduce type definitions for layout content to improve type safety and maintainability.</item>
</CHANGE_SUMMARY> 
*/

// [RFC-0034] Canonical content-shape type for layout content.
// Plain TypeScript — no Zod, no runtime code.
export interface LayoutContent {
  defaultDescription: string;
  skipLinkLabel: string;
}
