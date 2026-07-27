/**
 * PBP pricing core: Charge, Plan, Adjustment.
 *
 * @see pbp-specification-package/entity-model §17 (Pricing model)
 * @see RFC-0437
 */

import type { PbpEntityRef } from "../entity-ref.js";

export type PbpChargeType = "one-time" | "recurring" | "usage" | "deposit";

export const PBP_CHARGE_TYPES: readonly PbpChargeType[] = [
  "one-time",
  "recurring",
  "usage",
  "deposit",
] as const;

export function isPbpChargeType(value: string): value is PbpChargeType {
  return PBP_CHARGE_TYPES.includes(value as PbpChargeType);
}

export type PbpAmountModel = "fixed" | "range" | "tiered" | "unit-rate";

export const PBP_AMOUNT_MODELS: readonly PbpAmountModel[] = [
  "fixed",
  "range",
  "tiered",
  "unit-rate",
] as const;

export function isPbpAmountModel(value: string): value is PbpAmountModel {
  return PBP_AMOUNT_MODELS.includes(value as PbpAmountModel);
}

export type PbpTierMethod = "graduated" | "volume";

export const PBP_TIER_METHODS: readonly PbpTierMethod[] = ["graduated", "volume"] as const;

export type PbpChargeAmount =
  | { model: "fixed"; value: string }
  | { model: "range"; minimum: string; maximum: string }
  | { model: "unit-rate"; unitValue: string }
  | {
      model: "tiered";
      method: PbpTierMethod;
      tiers: Record<string, { order: number; upTo?: string; above?: string; unitValue: string }>;
    };

export interface PbpCharge {
  type: PbpChargeType;
  purpose: string;
  amount: PbpChargeAmount;
  trigger?: { event: string };
  recurrence?: string;
  basis?: { metricRef: string; unitRef: string };
  refundPolicyRef?: PbpEntityRef;
  determination?: { method: string; beforePurchase: boolean };
}

export interface PbpPlan {
  name: string;
  chargeRefs: Record<string, { ref: string }>;
  billing: { recurrence: string; billingDay?: number };
  terms?: {
    minimumTerm?: string;
    renewal?: { mode: string; period: string };
  };
}

export type PbpAdjustmentType = "discount" | "surcharge" | "waiver";

export const PBP_ADJUSTMENT_TYPES: readonly PbpAdjustmentType[] = [
  "discount",
  "surcharge",
  "waiver",
] as const;

export function isPbpAdjustmentType(value: string): value is PbpAdjustmentType {
  return PBP_ADJUSTMENT_TYPES.includes(value as PbpAdjustmentType);
}

export interface PbpAdjustment {
  type: PbpAdjustmentType;
  calculation: { model: "fixed" | "percentage"; value: string };
  appliesWhen?: { planRef?: string };
  appliesTo?: { chargeRefs: Record<string, { ref: string }> };
}
