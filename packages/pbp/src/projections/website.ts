/**
 * PBP Website Projection contract.
 *
 * @see pbp-specification-package/compiler Phase 12 (Projection)
 * @see RFC-0455
 */

import type { PbpEntityRef } from "../entity-ref.js";
import type { PbpPriceProjection } from "./price-projection.js";

export interface PbpWebsiteProjection {
  projectionTarget: "website";
  offeringRef: PbpEntityRef;
  buyerViewSchemaRef?: PbpEntityRef;
  renderedSections: Record<string, unknown>;
  locale: string;
  /** Price projections keyed by target currency code. Only present when multi-currency is entitled (RFC-0742). */
  priceProjections?: Record<string, PbpPriceProjection>;
}
