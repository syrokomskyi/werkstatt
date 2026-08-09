/**
 * PBP schema evolution and compatibility types.
 *
 * @see pbp-specification-package/system-spec §3.10 (Stability of @1)
 * @see pbp-specification-package/decision-log ADR-031
 * @see RFC-0401
 */

export interface PbpSchemaVersion {
  major: number;
  schemaId: string;
}

export interface PbpDataRevision {
  gitRef: string;
  timestamp: string;
}

export interface PbpSchemaField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface PbpSchemaDefinition {
  schemaId: string;
  fields: PbpSchemaField[];
}

export interface PbpCompatibilityViolation {
  kind: "key-rename" | "type-change" | "optional-to-required" | "unit-change" | "semantic-change";
  field: string;
  before: string;
  after: string;
}

export function validateSchemaCompatibility(
  before: PbpSchemaDefinition,
  after: PbpSchemaDefinition,
): { ok: true } | { ok: false; violations: PbpCompatibilityViolation[] } {
  const violations: PbpCompatibilityViolation[] = [];
  const beforeFields = new Map(before.fields.map((f) => [f.name, f]));
  const afterFields = new Map(after.fields.map((f) => [f.name, f]));

  for (const [name, beforeField] of beforeFields) {
    const afterField = afterFields.get(name);

    if (!afterField) {
      violations.push({
        kind: "key-rename",
        field: name,
        before: name,
        after: "(removed)",
      });
      continue;
    }

    if (beforeField.type !== afterField.type) {
      violations.push({
        kind: "type-change",
        field: name,
        before: beforeField.type,
        after: afterField.type,
      });
    }

    if (!beforeField.required && afterField.required) {
      violations.push({
        kind: "optional-to-required",
        field: name,
        before: "optional",
        after: "required",
      });
    }
  }

  if (violations.length === 0) {
    return { ok: true };
  }
  return { ok: false, violations };
}
