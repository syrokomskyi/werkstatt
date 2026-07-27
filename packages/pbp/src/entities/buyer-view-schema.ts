/**
 * PBP BuyerViewSchema entity.
 *
 * @see pbp-specification-package/entity-model §34 (BuyerViewSchema)
 * @see RFC-0441
 */

import type { PbpEntity } from "../envelope.js";
import { pbpSchemaId } from "../schema-id.js";

export const BUYER_VIEW_SCHEMA_ID = pbpSchemaId("buyer-view-schema");

export interface PbpBuyerViewSection {
  order: number;
  required: boolean;
}

export interface PbpBuyerViewSchema extends PbpEntity {
  type: "buyer-view-schema";
  name: string;
  sections: Record<string, PbpBuyerViewSection>;
}
