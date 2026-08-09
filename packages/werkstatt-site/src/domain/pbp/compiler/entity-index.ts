/*
<MODULE_CONTRACT>
<purpose>Phase 4: Builds a typed Map keyed by entity ID from validated entities.</purpose>
<non-goals>
  <item>Does not resolve locales — that is Phase 5 (locale.ts).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — Phase 4: build-entity-index.</item>
</CHANGE_SUMMARY>
*/

import type { PbpEntity } from "../envelope.js";
import type { PbpValidationError } from "../validation-errors.js";

export interface EntityIndexResult {
  index: Map<string, PbpEntity>;
  errors: PbpValidationError[];
}

export async function buildEntityIndex(entities: PbpEntity[]): Promise<EntityIndexResult> {
  const index = new Map<string, PbpEntity>();
  const errors: PbpValidationError[] = [];

  const sorted = [...entities].sort((a, b) => a.id.localeCompare(b.id));

  for (const entity of sorted) {
    if (index.has(entity.id)) {
      errors.push({
        code: "PBP-ID-DUPLICATE",
        severity: "fatal",
        entityId: entity.id,
        message: `Duplicate entity ID "${entity.id}".`,
      });
      continue;
    }
    index.set(entity.id, entity);
  }

  return { index, errors };
}
