/**
 * PBP Place entity and territory rules.
 *
 * @see pbp-specification-package/entity-model §8 (Place), §8.1 (Rules)
 * @see RFC-0411
 */

import type { PbpEntity } from "../envelope.js";
import type { PbpSemanticStatus } from "../semantic-status.js";
import { pbpSchemaId } from "../schema-id.js";

export const PLACE_SCHEMA_ID = pbpSchemaId("place");

export type PbpPlaceKind = "locality" | "region" | "country";

export const PBP_PLACE_KINDS: readonly PbpPlaceKind[] = ["locality", "region", "country"] as const;

export function isPbpPlaceKind(value: string): value is PbpPlaceKind {
  return PBP_PLACE_KINDS.includes(value as PbpPlaceKind);
}

export interface PbpPlace extends PbpEntity {
  type: "place";
  name: string;
  kind: PbpPlaceKind;
  address?: {
    street?: string;
    streetNumber?: string;
    postalCode?: string;
    locality?: string;
    administrativeArea?: string;
    countryCode: string;
  };
  geo?: { status: PbpSemanticStatus; latitude?: number; longitude?: number };
  publicUrl?: string;
}
