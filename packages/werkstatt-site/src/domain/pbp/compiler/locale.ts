/*
<MODULE_CONTRACT>
<purpose>Phase 5: Resolves locale fallbacks by deep-merging non-default locale overrides onto default locale entities.</purpose>
<non-goals>
  <item>Does not resolve cross-entity references — that is Phase 6 (references.ts).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — Phase 5: locale-resolution.</item>
  <item>RFC-0781 — Accept locale-aware index, use shared deepMerge with JSON Merge Patch semantics.</item>
</CHANGE_SUMMARY>
*/

import type { PbpEntity } from "../envelope.js";
import type { PbpFallbackReport, PbpFallbackEntry } from "../locale.js";
import type { LocaleAwareEntityIndex } from "./entity-index.js";
import { deepMerge } from "../utils/deep-merge.js";

export interface LocaleResolutionResult {
  resolved: Map<string, PbpEntity>;
  fallbackReport: PbpFallbackReport;
}

export async function resolveLocales(
  index: LocaleAwareEntityIndex,
  locale: string,
  defaultLocale: string,
): Promise<LocaleResolutionResult> {
  const resolved = new Map<string, PbpEntity>();
  const fallbacks: PbpFallbackEntry[] = [];

  const defaultLocaleKey = defaultLocale;
  const targetLocaleKey = locale;

  for (const [id, localeMap] of index) {
    const defaultEntity = localeMap.get(defaultLocaleKey);
    const targetEntity = localeMap.get(targetLocaleKey);

    if (!defaultEntity && !targetEntity) {
      const firstEntity = localeMap.values().next().value;
      if (firstEntity) {
        resolved.set(id, firstEntity);
      }
      continue;
    }

    if (locale === defaultLocale) {
      if (defaultEntity) {
        resolved.set(id, defaultEntity);
      }
      continue;
    }

    if (!defaultEntity) {
      if (targetEntity) {
        resolved.set(id, targetEntity);
      }
      continue;
    }

    if (!targetEntity) {
      resolved.set(id, defaultEntity);
      continue;
    }

    const merged = deepMerge(
      defaultEntity as unknown as Record<string, unknown>,
      targetEntity as unknown as Record<string, unknown>,
    ) as unknown as PbpEntity;
    resolved.set(id, merged);

    const diffPaths = findDiffPaths(
      defaultEntity as unknown as Record<string, unknown>,
      targetEntity as unknown as Record<string, unknown>,
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
