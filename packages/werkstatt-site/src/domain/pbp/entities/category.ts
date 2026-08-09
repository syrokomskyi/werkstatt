/**
 * PBP Category entity (global semantic layer).
 *
 * @see pbp-specification-package/entity-model §31 (Category)
 * @see pbp-specification-package/system-spec §4.1 (Global Semantic Layer)
 * @see RFC-0414
 */

import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import { pbpSchemaId } from "../schema-id.js";

export const CATEGORY_SCHEMA_ID = pbpSchemaId("category");

export interface PbpCategory extends PbpEntity {
  type: "category";
  name: string;
  broaderRef?: PbpEntityRef;
  externalMappings?: Record<string, { value: string }>;
}
