/**
 * PBP Legacy extraction contract types.
 *
 * @see pbp-specification-package/migration-plan §2, §3
 * @see RFC-0408
 */

export interface PbpLegacySourceFile {
  file: string;
  currentRole: string;
  problem: string;
}

export type PbpMigrationDecision =
  "extracted" | "needs-owner-decision" | "deferred" | "not-applicable";

export interface PbpUnresolvedItem {
  field: string;
  reason: string;
  sourceFile: string;
}

export interface PbpExtractionResult {
  sourceFile: string;
  targetEntities: string[];
  decisions: Record<string, PbpMigrationDecision>;
  unresolved: PbpUnresolvedItem[];
}
