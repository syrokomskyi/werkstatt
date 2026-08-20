/*
<MODULE_CONTRACT>
<purpose>
  Pure utility for converting PascalCase icon names into generated file path
  segments. Extracted from icon-resolver.ts so it can be imported in Node.js
  contexts (kernel CLI, build-time validators) without triggering
  import.meta.glob evaluation.
</purpose>
<non-goals>
  <item>Do not import.meta.glob here — this module must be Node.js-safe.</item>
  <item>Do not implement icon resolution logic — only the file name conversion.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0893: Extracted resolveIconFileName from icon-resolver.ts for Node.js-safe import.</item>
</CHANGE_SUMMARY>
*/

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
