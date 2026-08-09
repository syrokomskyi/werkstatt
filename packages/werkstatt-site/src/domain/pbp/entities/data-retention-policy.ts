/**
 * PBP Data Retention and Deletion policy.
 *
 * @see pbp-specification-package/entity-model §20 (Policy base)
 * @see RFC-0452
 */

import type { PbpPolicy } from "./policy.js";

export interface PbpRetentionPeriod {
  duration: string;
  startsFrom: string;
}

export interface PbpDataRetentionPolicy extends PbpPolicy {
  kind: "data-retention";
  retention: Record<string, PbpRetentionPeriod>;
  deletion: { method: string; timeline: string };
}
