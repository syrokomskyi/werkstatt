/**
 * PBP Offering entity and supporting types.
 *
 * @see pbp-specification-package/entity-model §15 (Offering), §15.1 (Full structure)
 * @see pbp-specification-package/system-spec §9 (Offering)
 * @see RFC-0429
 */

import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import { pbpSchemaId } from "../schema-id.js";

export const OFFERING_SCHEMA_ID = pbpSchemaId("offering");

export type PbpAvailabilityMode = "declared" | "on-request" | "unavailable";

export const PBP_AVAILABILITY_MODES: readonly PbpAvailabilityMode[] = [
  "declared",
  "on-request",
  "unavailable",
] as const;

export function isPbpAvailabilityMode(value: string): value is PbpAvailabilityMode {
  return PBP_AVAILABILITY_MODES.includes(value as PbpAvailabilityMode);
}

export type PbpOfferingRelation =
  "optional" | "requires" | "incompatibleWith" | "alternativeTo" | "included";

export const PBP_OFFERING_RELATIONS: readonly PbpOfferingRelation[] = [
  "optional",
  "requires",
  "incompatibleWith",
  "alternativeTo",
  "included",
] as const;

export function isPbpOfferingRelation(value: string): value is PbpOfferingRelation {
  return PBP_OFFERING_RELATIONS.includes(value as PbpOfferingRelation);
}

export type PbpOfferingAcquisition = "standalone" | "with-this-offering" | "either";

export const PBP_OFFERING_ACQUISITIONS: readonly PbpOfferingAcquisition[] = [
  "standalone",
  "with-this-offering",
  "either",
] as const;

export function isPbpOfferingAcquisition(value: string): value is PbpOfferingAcquisition {
  return PBP_OFFERING_ACQUISITIONS.includes(value as PbpOfferingAcquisition);
}

export interface PbpAllowance {
  subjectRef: string;
  includedQuantity?: { value: string; unitRef: string };
  resetPeriod?: string;
  overageChargeRef?: string;
}

export interface PbpRelatedOffering {
  relation: PbpOfferingRelation;
  offeringRef: PbpEntityRef;
  acquisition?: PbpOfferingAcquisition;
}

export interface PbpPricing {
  currency: string;
  tax?: Record<string, unknown>;
  charges?: Record<string, unknown>;
  plans?: Record<string, unknown>;
  adjustments?: Record<string, unknown>;
}

export interface PbpOffering extends PbpEntity {
  type: "offering";
  name: string;
  summary?: string;
  businessRef: PbpEntityRef;
  catalogEntryRef?: PbpEntityRef;
  audience?: {
    buyerTypes?: Record<string, { valueRef: string }>;
    segments?: Record<string, { valueRef: string }>;
  };
  availability?: {
    mode: PbpAvailabilityMode;
    territories?: Record<string, { countryCode: string }>;
  };
  package?: {
    included?: Record<string, { itemRef: PbpEntityRef; inclusion: string }>;
    allowances?: Record<string, PbpAllowance>;
  };
  pricing?: PbpPricing;
  acquisition?: {
    channelRefs?: Record<string, PbpEntityRef>;
  };
  fulfillment?: Record<string, unknown>;
  customerResponsibilities?: Record<string, unknown>;
  terms?: Record<string, unknown>;
  policyRefs?: Record<string, PbpEntityRef>;
  relatedOfferings?: Record<string, PbpRelatedOffering>;
  limitations?: Record<string, unknown>;
}
