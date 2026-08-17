/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/string-utils.ts as an authored share authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Dedup: centralise the kebab-case helper previously duplicated in site-kernel and site-kernel-checks.</item>
</CHANGE_SUMMARY>
*/

/** Lowercase, dash-only kebab-case. Strips leading/trailing hyphens. */
export function toKebabCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
