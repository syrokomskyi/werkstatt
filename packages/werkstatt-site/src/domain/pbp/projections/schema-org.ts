/**
 * PBP Schema.org projection mapping contract.
 *
 * @see pbp-specification-package/compiler §18 (Schema.org Projection)
 * @see RFC-0432
 */

export type PbpSchemaOrgMappingRef = string;

export interface PbpSchemaOrgMapping {
  mappingRef: PbpSchemaOrgMappingRef;
  targetSchema: "schema.org";
  schemaOrgVersion: string;
}

export interface PbpSchemaOrgLossEntry {
  sourcePath: string;
  reason: string;
  fallback?: string;
}

export interface PbpSchemaOrgLossReport {
  losses: PbpSchemaOrgLossEntry[];
}
