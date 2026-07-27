/**
 * PBP Quote and Contract Input projection contracts.
 *
 * @see pbp-specification-package/compiler §19 (Quote and Contract Input Projections)
 * @see RFC-0457
 */

import type { PbpEntityRef } from "../entity-ref.js";

export interface PbpQuoteInput {
  projectionTarget: "quote";
  offeringRef: PbpEntityRef;
  planRef?: string;
  charges: Record<string, unknown>;
  terms?: Record<string, unknown>;
  locale: string;
}

export interface PbpContractInput {
  projectionTarget: "contract";
  offeringRef: PbpEntityRef;
  planRef?: string;
  charges: Record<string, unknown>;
  terms: Record<string, unknown>;
  policyRefs: PbpEntityRef[];
  locale: string;
}
