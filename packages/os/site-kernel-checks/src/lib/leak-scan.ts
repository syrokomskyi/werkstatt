/*
<MODULE_CONTRACT>
<purpose>Shared no-leak scan primitive: recursively collect substantial textual leaf values from parsed frontmatter data, for privacy-boundary checks that must confirm a value from a non-public domain never reaches a public output file.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0287: extracted from the deleted business-projection.ts so agent.knowledge.validate can reuse it.</item>
</CHANGE_SUMMARY>
*/

/**
 * Recursively collect substantial textual leaf values that carry a letter
 * (excludes pure dates/numbers, which coincide too easily for a leak scan).
 */
export function collectTextValues(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length >= 10 && /\p{L}/u.test(trimmed)) out.push(trimmed);
  } else if (Array.isArray(value)) {
    for (const item of value) collectTextValues(item, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectTextValues(v, out);
  }
}
