/*
<MODULE_CONTRACT>
<purpose>
  Vendor-agnostic dynamic icon resolver for @warpgogol/werkstatt-site/ui.
  Discovers all generated icon components via import.meta.glob and resolves
  them by vendor, collection, and name so any section can use icons without
  hard-coding vendor-specific import logic.
</purpose>
<non-goals>
  <item>Do not implement rendering logic — returns the component, caller renders it.</item>
  <item>Do not manage deferred hydration — that stays in @warpgogol/werkstatt-site/share/scripts/lordicon.ts.</item>
  <item>Do not hard-code vendor names or collection folders.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Created vendor-agnostic icon resolver to eliminate per-section icon boilerplate.</item>
</CHANGE_SUMMARY>
*/

export interface VendorIconConfig {
  /** Icon vendor / provider, e.g. "lordicon" */
  vendor: string;
  /** Collection / folder inside the vendor, e.g. "doodle-outline" */
  collection: string;
  /** Icon export name (with or without Icon suffix), e.g. "ApproveCheckedSimpleHover" */
  name: string;
  /** Icon size in px. Defaults to 24 if omitted. */
  size?: number;
}

/** Standard list item with optional icon for shared section content contracts (RFC-0100) */
export interface StandardListItem {
  text: string;
  icon?: VendorIconConfig;
}

/**
 * Convert a PascalCase icon name into the generated file path segment.
 * Handles optional "Icon" suffix and maps to kebab-case.
 */
export function resolveIconFileName(name: string): string {
  let base = name;
  if (base.endsWith("Icon")) {
    base = base.slice(0, -4);
  }
  const kebab = base
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase()
    .replace(/^icon-/, "");
  const first = kebab.charAt(0);
  return `${first}/${kebab}-icon.astro`;
}

const allIconModules = (
  import.meta as unknown as {
    glob: <T>(pattern: string) => Record<string, () => Promise<T>>;
  }
).glob<Record<string, unknown>>("./gen/**/*.astro");

/**
 * Resolve a VendorIconConfig to the default Astro component export.
 * Returns null if the vendor/collection/name cannot be matched.
 */
export async function loadVendorIcon(config: VendorIconConfig | undefined): Promise<unknown> {
  if (!config) return null;
  const fileName = resolveIconFileName(config.name);
  const suffix = `/${config.vendor}/${config.collection}/${fileName}`;
  const key = Object.keys(allIconModules).find((k) => k.endsWith(suffix));
  if (!key) {
    console.warn(
      `[icon-resolver] Unknown icon: vendor=${config.vendor} collection=${config.collection} name=${config.name}`,
    );
    return null;
  }
  const mod = await allIconModules[key]();
  return (mod as { default?: unknown }).default ?? null;
}
