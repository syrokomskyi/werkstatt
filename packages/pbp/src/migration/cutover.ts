/**
 * PBP Migration Coverage and Cutover contract.
 *
 * @see pbp-specification-package/migration-plan
 * @see RFC-0462
 */

export interface PbpMigrationCoverageReport {
  totalLegacyEntities: number;
  mappedEntities: number;
  unmappedEntities: string[];
  verifiedEntities: number;
  coveragePercentage: number;
}

export interface PbpCutoverChecklist {
  allEntitiesMapped: boolean;
  allEntitiesVerified: boolean;
  noSiteImportsFromLegacy: boolean;
  legacyTestsPass: boolean;
  pbpTestsPass: boolean;
  ready: boolean;
}
