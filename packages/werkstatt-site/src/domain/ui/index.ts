/*
<MODULE_CONTRACT>
<purpose>Facilitates the export of shared UI component types for consistent usage across the application.</purpose>
<non-goals>
  <item>Do not implement UI components or their logic here.</item>
  <item>Do not handle icon rendering or styling concerns.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0100: Added StandardListItem export for canonical list-based section content contracts.</item>
</CHANGE_SUMMARY>
*/

/**
 * @warpgogol/werkstatt-site/ui - Shared UI components and icons
 *
 * @packageDocumentation
 */

// Re-export icon types
export type {
  LordIconColor,
  LordIconTrigger,
  LordIconStroke,
  LordIconColors,
  LordIconProps,
} from "./icons/lord-icon-types.ts";

// Re-export vendor-agnostic icon resolver and RFC-0100 list item contract
export type { VendorIconConfig, StandardListItem } from "./icons/icon-resolver.ts";
export { resolveIconFileName, loadVendorIcon } from "./icons/icon-resolver.ts";

// Re-export donation card component
export { default as DonationCard } from "./components/donation-card/donation-card-component.astro";
export type { DonationCardComponentContent } from "./components/donation-card/donation-card-component.types.generated.ts";
