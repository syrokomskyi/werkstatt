/**
 * PBP ProductVariant entity.
 *
 * @see pbp-specification-package/entity-model §12 (ProductGroup and ProductVariant), §12.3 (Invariants)
 * @see RFC-0415
 */

import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import type { PbpExternalIdentifier } from "../primitives.js";
import { pbpSchemaId } from "../schema-id.js";

export const PRODUCT_VARIANT_SCHEMA_ID = pbpSchemaId("product-variant");

export interface PbpProductVariant extends PbpEntity {
  type: "product-variant";
  name: string;
  groupRef: PbpEntityRef;
  variantValues: Record<string, { valueRef: string }>;
  externalIdentifiers?: Record<string, PbpExternalIdentifier>;
}
