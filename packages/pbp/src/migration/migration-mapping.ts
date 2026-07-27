/**
 * PBP Warpgogol legacy migration contract.
 *
 * @see pbp-specification-package/migration-plan
 * @see RFC-0461
 */

export interface PbpLegacyToPbpFieldMap {
  legacyPath: string;
  pbpPath: string;
  transformation?: string;
}

export interface PbpMigrationMapping {
  legacyEntity: string;
  pbpEntity: string;
  fieldMaps: PbpLegacyToPbpFieldMap[];
  status: "pending" | "mapped" | "verified" | "cutover";
}
