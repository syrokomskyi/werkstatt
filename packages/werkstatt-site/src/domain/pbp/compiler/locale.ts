/*
<MODULE_CONTRACT>
<purpose>Phase 5: Resolves locale fallbacks by deep-merging non-default locale overrides onto default locale entities.</purpose>
<non-goals>
  <item>Does not resolve cross-entity references — that is Phase 6 (references.ts).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — Phase 5: locale-resolution.</item>
</CHANGE_SUMMARY>
*/

import type { PbpEntity } from "../envelope.js";
import type { PbpFallbackReport, PbpFallbackEntry } from "../locale.js";

export interface LocaleResolutionResult {
  resolved: Map<string, PbpEntity>;
  fallbackReport: PbpFallbackReport;
}

export async function resolveLocales(
  index: Map<string, PbpEntity>,
  locale: string,
  defaultLocale: string,
): Promise<LocaleResolutionResult> {
  const resolved = new Map<string, PbpEntity>();
  const fallbacks: PbpFallbackEntry[] = [];

  if (locale === defaultLocale) {
    for (const [id, entity] of index) {
      resolved.set(id, entity);
    }
    return {
      resolved,
      fallbackReport: { locale, fallbacks: [] },
    };
  }

  for (const [id, entity] of index) {
    const defaultEntity = index.get(id);
    if (!defaultEntity) {
      resolved.set(id, entity);
      continue;
    }

    const merged = deepMerge(
      defaultEntity as unknown as Record<string, unknown>,
      entity as unknown as Record<string, unknown>,
    );
    resolved.set(id, merged);

    const diffPaths = findDiffPaths(
      defaultEntity as unknown as Record<string, unknown>,
      entity as unknown as Record<string, unknown>,
    );
    for (const path of diffPaths) {
      fallbacks.push({
        entityId: id,
        path,
        sourceLocale: defaultLocale,
        targetLocale: locale,
        severity: "info",
      });
    }
  }

  fallbacks.sort((a, b) => a.entityId.localeCompare(b.entityId) || a.path.localeCompare(b.path));

  return {
    resolved,
    fallbackReport: { locale, fallbacks },
  };
}

function deepMerge(base: Record<string, unknown>, overlay: Record<string, unknown>): PbpEntity {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overlay).sort()) {
    const baseVal = base[key];
    const overlayVal = overlay[key];
    if (
      baseVal &&
      overlayVal &&
      typeof baseVal === "object" &&
      typeof overlayVal === "object" &&
      !Array.isArray(baseVal) &&
      !Array.isArray(overlayVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overlayVal as Record<string, unknown>,
      );
    } else if (overlayVal !== undefined) {
      result[key] = overlayVal;
    }
  }
  return result as unknown as PbpEntity;
}

function findDiffPaths(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
  prefix = "",
): string[] {
  const paths: string[] = [];
  for (const key of Object.keys(overlay).sort()) {
    const path = prefix ? `${prefix}.${key}` : key;
    const baseVal = base[key];
    const overlayVal = overlay[key];
    if (
      baseVal &&
      overlayVal &&
      typeof baseVal === "object" &&
      typeof overlayVal === "object" &&
      !Array.isArray(baseVal) &&
      !Array.isArray(overlayVal)
    ) {
      paths.push(
        ...findDiffPaths(
          baseVal as Record<string, unknown>,
          overlayVal as Record<string, unknown>,
          path,
        ),
      );
    } else if (JSON.stringify(baseVal) !== JSON.stringify(overlayVal)) {
      paths.push(path);
    }
  }
  return paths;
}
