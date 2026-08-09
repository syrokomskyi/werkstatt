/*
<MODULE_CONTRACT>
<purpose>Shared deep-merge utility with JSON Merge Patch (RFC 7386) semantics for PBP entities.</purpose>
<non-goals>
  <item>Does not perform schema validation — callers must validate the merged result.</item>
  <item>Does not handle diff path tracking — that stays in locale.ts findDiffPaths.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0781 — shared deepMerge with null-delete (JSON Merge Patch) semantics.</item>
</CHANGE_SUMMARY>
*/

/**
 * Guard that returns true for plain objects (not arrays, not class instances).
 * Uses Object.prototype.toString to exclude Date, RegExp, Map, Set, etc.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

/**
 * Deep merge with JSON Merge Patch (RFC 7386) semantics:
 *
 * - `null` in overlay → delete the key from the result
 * - `undefined` in overlay → skip (retain the base value)
 * - Plain objects → merge recursively
 * - Arrays and primitives → replace wholesale
 *
 * The result is a new object; neither input is mutated.
 */
export function deepMerge<T>(base: T, overlay: Partial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(overlay)) {
    return (overlay ?? base) as T;
  }

  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };

  for (const key of Object.keys(overlay)) {
    const overlayVal = (overlay as Record<string, unknown>)[key];

    if (overlayVal === null) {
      delete result[key];
      continue;
    }

    if (overlayVal === undefined) {
      continue;
    }

    const baseVal = (base as Record<string, unknown>)[key];

    if (isPlainObject(baseVal) && isPlainObject(overlayVal)) {
      result[key] = deepMerge(baseVal, overlayVal);
    } else {
      result[key] = overlayVal;
    }
  }

  return result as T;
}
