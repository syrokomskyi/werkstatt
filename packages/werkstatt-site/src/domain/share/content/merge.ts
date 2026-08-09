/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/content/merge.ts as an authored share content module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
  <item>Deepening: unified deepMergeEntryData and mergeComponentContent into one configurable deepMerge; old names kept as thin wrappers.</item>
</CHANGE_SUMMARY>
*/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface DeepMergeOptions {
  /** When true, keep the default array if the override array is empty. Default: false. */
  keepDefaultOnEmptyArray?: boolean;
}

/**
 * Unified deep merge: override wins at each key, recursing into objects.
 * Arrays are replaced wholesale (no per-element merge). When
 * `keepDefaultOnEmptyArray` is true, an empty override array falls back to the
 * default array instead of replacing it.
 */
export function deepMerge(
  defaultValue: Record<string, unknown>,
  overrideValue: Record<string, unknown>,
  options?: DeepMergeOptions,
): Record<string, unknown> {
  const keepDefaultOnEmptyArray = options?.keepDefaultOnEmptyArray ?? false;
  const result: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(defaultValue), ...Object.keys(overrideValue)]);
  for (const key of keys) {
    const dv = defaultValue[key];
    const ov = overrideValue[key];
    if (ov === undefined) {
      result[key] = dv;
    } else if (Array.isArray(dv) && Array.isArray(ov)) {
      if (ov.length > 0) {
        result[key] = ov;
      } else if (keepDefaultOnEmptyArray) {
        result[key] = dv;
      } else {
        result[key] = ov;
      }
    } else if (isRecord(dv) && isRecord(ov)) {
      result[key] = deepMerge(dv, ov, options);
    } else {
      result[key] = ov;
    }
  }
  return result;
}

/**
 * Deep merge for content entry data: override wins, non-empty arrays replace
 * wholesale, empty override arrays keep the default. Thin wrapper over deepMerge.
 */
export function deepMergeEntryData(
  defaultValue: Record<string, unknown>,
  overrideValue: Record<string, unknown>,
): Record<string, unknown> {
  return deepMerge(defaultValue, overrideValue, { keepDefaultOnEmptyArray: true });
}

/**
 * Deep merge for component content: override wins, arrays always replace.
 * Handles undefined override and non-record inputs. Thin wrapper over deepMerge.
 */
export function mergeComponentContent<TContent>(
  defaultContent: TContent,
  overrideContent?: Partial<TContent>,
): TContent {
  if (overrideContent == null) return defaultContent;
  if (!isRecord(defaultContent) || !isRecord(overrideContent)) {
    return overrideContent as TContent;
  }
  return deepMerge(
    defaultContent as Record<string, unknown>,
    overrideContent as Record<string, unknown>,
  ) as TContent;
}
