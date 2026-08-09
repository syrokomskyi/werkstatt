/*
<MODULE_CONTRACT>
<purpose>Resolve a dotted field path through a data object, reporting the first missing segment — the shared primitive behind content-reference substitution (RFC-0045 / RFC-0138).</purpose>
<non-goals>
  <item>Do not perform substitution or formatting — only path resolution.</item>
  <item>Do not throw on a missing field; report it in the result.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0155: add Compass scaffolding markers for compass.validate compliance.</item>
</CHANGE_SUMMARY>
*/
export interface FieldResolution {
  value: unknown;
  missingField: string | null;
}

/**
 * Walks a field path through a data object. Returns the value and the first
 * missing field name, or null if the entire path resolves.
 */
export function resolveFieldPath(data: unknown, fieldPath: string[]): FieldResolution {
  let value: unknown = data;
  for (let i = 0; i < fieldPath.length; i++) {
    const field = fieldPath[i];
    if (value === null || value === undefined) {
      return { value: undefined, missingField: field };
    }
    if (typeof value !== "object") {
      return { value: undefined, missingField: field };
    }
    if (!(field in value)) {
      const nextField = i + 1 < fieldPath.length ? fieldPath[i + 1] : null;
      return { value: undefined, missingField: nextField };
    }
    value = (value as Record<string, unknown>)[field];
  }
  return { value, missingField: null };
}
