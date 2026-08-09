/**
 * PBP fulfillment, shipping, pickup and return.
 *
 * @see pbp-specification-package/entity-model §18 (Fulfillment and Buyer Responsibilities)
 * @see RFC-0451
 */

import type { PbpEntityRef } from "../entity-ref.js";

export type PbpFulfillmentMode =
  "service-delivery" | "digital-delivery" | "physical-shipping" | "pickup" | "hybrid";

export const PBP_FULFILLMENT_MODES: readonly PbpFulfillmentMode[] = [
  "service-delivery",
  "digital-delivery",
  "physical-shipping",
  "pickup",
  "hybrid",
] as const;

export function isPbpFulfillmentMode(value: string): value is PbpFulfillmentMode {
  return PBP_FULFILLMENT_MODES.includes(value as PbpFulfillmentMode);
}

export interface PbpFulfillment {
  mode: PbpFulfillmentMode;
  startTrigger?: { event: string };
  target?: { duration: { value: string; unitRef: string } };
  deliveryMethods?: Record<string, { valueRef: string }>;
  returnPolicy?: { policyRef: PbpEntityRef };
}

export interface PbpCustomerResponsibility {
  requirementRef: string;
}
