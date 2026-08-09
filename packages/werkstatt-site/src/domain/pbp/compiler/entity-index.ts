/*
<MODULE_CONTRACT>
<purpose>Phase 4: Builds a locale-aware Map keyed by entity ID, mapping to locale → entity.</purpose>
<non-goals>
  <item>Does not resolve locales — that is Phase 5 (locale.ts).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — Phase 4: build-entity-index.</item>
  <item>RFC-0781 — Changed to locale-aware Map&lt;string, Map&lt;string, PbpEntity&gt;&gt; with PBP-ID-LOCALE-DUPLICATE.</item>
</CHANGE_SUMMARY>
*/

import type { PbpEntity } from "../envelope.js";
import type { PbpValidationError } from "../validation-errors.js";

export type LocaleAwareEntityIndex = Map<string, Map<string, PbpEntity>>;

export interface EntityIndexResult {
  index: LocaleAwareEntityIndex;
  errors: PbpValidationError[];
}

export async function buildEntityIndex(entities: PbpEntity[]): Promise<EntityIndexResult> {
  const index: LocaleAwareEntityIndex = new Map();
  const errors: PbpValidationError[] = [];

  const sorted = [...entities].sort((a, b) => a.id.localeCompare(b.id));

  for (const entity of sorted) {
    const localeKey = entity.locale ?? "";

    let localeMap = index.get(entity.id);
    if (!localeMap) {
      localeMap = new Map<string, PbpEntity>();
      index.set(entity.id, localeMap);
    }

    if (localeMap.has(localeKey)) {
      errors.push({
        code: "PBP-ID-LOCALE-DUPLICATE",
        severity: "fatal",
        entityId: entity.id,
        locale: entity.locale,
        message: `Duplicate entity ID "${entity.id}" for locale "${localeKey}".`,
      });
      continue;
    }
    localeMap.set(localeKey, entity);
  }

  return { index, errors };
}
