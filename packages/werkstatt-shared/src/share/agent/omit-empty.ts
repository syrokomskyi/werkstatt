/*
<MODULE_CONTRACT>
<purpose>
RFC-0319: omit-empty serialization for agent knowledge JSON envelopes.
Prunes empty strings, empty objects, and empty arrays from public knowledge
payloads before hashing and serialization. Never omits false, 0, or null
when schema explicitly allows them.
</purpose>
<non-goals>
  <item>Do not omit false, 0, or null when schema allows them.</item>
  <item>Do not invent values to fill empty fields.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0319: initial implementation.</item>
</CHANGE_SUMMARY>
*/

export interface OmitEmptyOptions {
  /** JSON pointer paths where empty arrays are meaningful and should be preserved. */
  preserveEmptyArraysFor?: readonly string[];
  /** JSON pointer paths where empty objects are meaningful and should be preserved. */
  preserveEmptyObjectsFor?: readonly string[];
}

/**
 * RFC-0319: Recursively prune empty strings, empty objects, and empty arrays.
 * Returns `undefined` if the entire value becomes empty after pruning.
 */
export function omitEmptyKnowledgeValues<T>(
  value: T,
  opts: OmitEmptyOptions = {},
  path = "",
): T | undefined {
  if (value === null || value === undefined) return undefined;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : (value as T);
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (Array.isArray(value)) {
    const pruned = value
      .map((item, i) => omitEmptyKnowledgeValues(item, opts, `${path}/${i}`))
      .filter((item) => item !== undefined);

    if (pruned.length === 0) {
      const preserve = opts.preserveEmptyArraysFor?.includes(path);
      return preserve ? ([] as unknown as T) : undefined;
    }
    return pruned as unknown as T;
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}/${key}`;
      const pruned = omitEmptyKnowledgeValues(val, opts, childPath);
      if (pruned !== undefined) {
        result[key] = pruned;
      }
    }

    const keys = Object.keys(result);
    if (keys.length === 0) {
      const preserve = opts.preserveEmptyObjectsFor?.includes(path);
      return preserve ? ({} as unknown as T) : undefined;
    }
    return result as unknown as T;
  }

  return value;
}
