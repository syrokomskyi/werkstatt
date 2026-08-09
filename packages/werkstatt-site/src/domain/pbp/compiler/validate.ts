/*
<MODULE_CONTRACT>
<purpose>Phase 3: Validates raw entities against Zod schemas from RFC-0466.</purpose>
<non-goals>
  <item>Does not build the entity index — that is Phase 4 (entity-index.ts).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — Phase 3: raw-schema-validation.</item>
</CHANGE_SUMMARY>
*/

import type { PbpEntity } from "../envelope.js";
import type { PbpValidationError } from "../validation-errors.js";
import type { PbpBuildStrictness } from "../compiler-pipeline.js";
import { pbpSchemaById } from "../schemas/index.js";
import type { ParsedEntity } from "./parse.js";

export interface RawValidationResult {
  entities: PbpEntity[];
  errors: PbpValidationError[];
}

export async function validateRaw(
  parsed: ParsedEntity[],
  strictness: PbpBuildStrictness,
): Promise<RawValidationResult> {
  const entities: PbpEntity[] = [];
  const errors: PbpValidationError[] = [];

  for (const entry of parsed) {
    const schema = pbpSchemaById[entry.schema];
    if (!schema) {
      errors.push({
        code: "PBP-SCHEMA-UNKNOWN",
        severity: "fatal",
        entityId: entry.entityId,
        message: `No Zod schema registered for schema ID "${entry.schema}".`,
        path: entry.physicalPath,
      });
      continue;
    }

    const result = schema.safeParse(entry.data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          code: "PBP-SCHEMA-VALIDATION",
          severity: "error",
          entityId: entry.entityId,
          message: issue.message,
          path: issue.path.join("."),
        });
      }
      if (strictness === "migration") {
        // In migration mode, still attempt to use the data
        const entity = entry.data as unknown as PbpEntity;
        entity.locale = entry.locale;
        entities.push(entity);
      }
    } else {
      const entity = result.data as unknown as PbpEntity;
      entity.locale = entry.locale;
      entities.push(entity);
    }
  }

  return { entities, errors };
}
