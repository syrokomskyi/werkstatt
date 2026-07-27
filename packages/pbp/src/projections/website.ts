/**
 * PBP Website Projection contract.
 *
 * @see pbp-specification-package/compiler Phase 12 (Projection)
 * @see RFC-0455
 */

import type { PbpEntityRef } from "../entity-ref.js";

export interface PbpWebsiteProjection {
  projectionTarget: "website";
  offeringRef: PbpEntityRef;
  buyerViewSchemaRef?: PbpEntityRef;
  renderedSections: Record<string, unknown>;
  locale: string;
}
