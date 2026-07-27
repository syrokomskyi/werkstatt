/**
 * PBP Brand entity.
 *
 * @see pbp-specification-package/entity-model §7 (Brand)
 * @see RFC-0410
 */

import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import type { PbpExternalIdentifier } from "../primitives.js";
import { pbpSchemaId } from "../schema-id.js";

export const BRAND_SCHEMA_ID = pbpSchemaId("brand");

export interface PbpBrand extends PbpEntity {
  type: "brand";
  name: string;
  tagline?: string;
  ownerBusinessRef: PbpEntityRef;
  externalIdentifiers?: Record<string, PbpExternalIdentifier>;
}
