/**
 * PBP schema ID utilities — `pbp/{entity}@1` pattern.
 *
 * @see pbp-specification-package/entity-model §2 (Namespace and schema IDs)
 * @see RFC-0399
 */

export const PBP_NAMESPACE = "pbp";
export const PBP_MAJOR_VERSION = 1;

export function pbpSchemaId(entity: string): string {
  return `${PBP_NAMESPACE}/${entity}@${PBP_MAJOR_VERSION}`;
}

const SCHEMA_ID_RE = /^pbp\/([a-z][a-z0-9-]*)@(\d+)$/;

export function validateSchemaId(schema: string): {
  entity: string;
  major: number;
} {
  const match = SCHEMA_ID_RE.exec(schema);
  if (!match) {
    throw new Error(
      `Invalid PBP schema ID "${schema}". Expected pattern: pbp/{entity}@{major}, e.g. "pbp/business@1".`,
    );
  }
  return { entity: match[1], major: Number(match[2]) };
}
