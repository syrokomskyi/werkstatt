/**
 * PBP ProductGroup entity.
 *
 * @see pbp-specification-package/entity-model §12 (ProductGroup and ProductVariant)
 * @see RFC-0415
 */

import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import { pbpSchemaId } from "../schema-id.js";

export const PRODUCT_GROUP_SCHEMA_ID = pbpSchemaId("product-group");

export interface PbpProductGroup extends PbpEntity {
  type: "product-group";
  name: string;
  classification?: { categoryRef?: PbpEntityRef };
  variationAxes: Record<string, { attributeRef: string; required: boolean }>;
}
