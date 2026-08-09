/*
<MODULE_CONTRACT>
<purpose>RFC-0042 shared utilities for section components — NEED_THIS_* markers and type casting.</purpose>
<non-goals>
  <item>Do not implement content fetching — RFC-0042 removed stub-based loading.</item>
  <item>Do not handle i18n logic — lang is passed separately via SectionProps.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0042: Created shared utilities to centralize NEED_THIS_* pattern and type casting.</item>
</CHANGE_SUMMARY>
*/

/**
 * [RFC-0042] Helper for NEED_THIS_* markers — shows explicit placeholder when field is missing.
 * Use this in section components to indicate required fields that were not provided in blocks[].props.
 *
 * @param fieldName - The name of the field (will be uppercased in the marker)
 * @param value - The value from pageOverride.props
 * @returns The value if present and non-empty, otherwise `NEED_THIS_${fieldName.toUpperCase()}`
 *
 * @example
 * ```typescript
 * const content = {
 *   heading: need("heading", props.heading),
 *   description: need("description", props.description),
 * };
 * ```
 */
export function need<T>(fieldName: string, value: T | undefined | null): T | string {
  if (value === undefined || value === null) {
    return `NEED_THIS_${fieldName.toUpperCase()}`;
  }
  if (typeof value === "string") {
    return value.trim() !== "" ? value : `NEED_THIS_${fieldName.toUpperCase()}`;
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value : (`NEED_THIS_${fieldName.toUpperCase()}` as unknown as T);
  }
  if (typeof value === "object") {
    return Object.keys(value as object).length > 0
      ? value
      : (`NEED_THIS_${fieldName.toUpperCase()}` as unknown as T);
  }
  return value;
}

/**
 * [RFC-0042] Type-safe casting function for pageOverride to section content types.
 * Use this instead of `as unknown as T` to make type casting explicit and searchable.
 *
 * @ai-invariant Use this function when casting pageOverride to a specific section content type.
 *
 * @param pageOverride - The pageOverride from SectionProps (blocks[].props)
 * @returns The same object cast to type T
 *
 * @example
 * ```typescript
 * const props = cast<TeamSectionContent>(pageOverride);
 * ```
 */
export function cast<T extends Record<string, unknown>>(pageOverride: Record<string, unknown>): T {
  return pageOverride as unknown as T;
}

/**
 * [RFC-0042] Default value helper with NEED_THIS_* marker fallback.
 * Returns the value if present, otherwise returns the provided default or a NEED_THIS marker.
 *
 * @param value - The value from pageOverride.props
 * @param defaultValue - Default value to use if value is missing
 * @param fieldName - Field name for NEED_THIS marker (only used if defaultValue is not provided)
 * @returns The value, defaultValue, or NEED_THIS marker
 *
 * @example
 * ```typescript
 * const content = {
 *   texture: withDefault(props.texture, false),
 *   heading: withDefault(props.heading, null, "heading"), // becomes NEED_THIS_HEADING if missing
 * };
 * ```
 */
export function withDefault<T>(
  value: T | undefined,
  defaultValue: T | null,
  fieldName?: string,
): T | string {
  if (value !== undefined && value !== null) {
    return value;
  }
  if (defaultValue !== null) {
    return defaultValue;
  }
  return fieldName ? `NEED_THIS_${fieldName.toUpperCase()}` : "NEED_THIS_VALUE";
}
