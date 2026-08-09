/**
 * PBP migration contract types for major version transitions.
 *
 * Defined but not enforced until @2 is created.
 *
 * @see RFC-0401
 */

export interface PbpMigrationTransformation {
  field: string;
  kind: "rename" | "type-convert" | "split" | "merge" | "remove";
  before: string;
  after: string;
  scriptRef?: string;
}

export interface PbpMigrationContract {
  fromMajor: number;
  toMajor: number;
  transformations: PbpMigrationTransformation[];
}
