/**
 * PBP Invoice Input projection contract.
 *
 * @see pbp-specification-package/compiler §20 (Invoice Input Projection)
 * @see RFC-0458
 */

import type { PbpEntityRef } from "../entity-ref.js";

export interface PbpInvoiceInput {
  projectionTarget: "invoice";
  offeringRef: PbpEntityRef;
  planRef?: string;
  charges: Record<string, unknown>;
  tax: Record<string, unknown>;
  customerRef?: PbpEntityRef;
  locale: string;
}
