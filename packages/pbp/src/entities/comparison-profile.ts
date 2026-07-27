/**
 * PBP ComparisonProfile entity.
 *
 * @see pbp-specification-package/entity-model §32 (ComparisonProfile)
 * @see RFC-0440
 */

import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import { pbpSchemaId } from "../schema-id.js";

export const COMPARISON_PROFILE_SCHEMA_ID = pbpSchemaId("comparison-profile");

export type PbpComparisonValueType =
  "money" | "recurring-money" | "derived-money" | "duration" | "controlled-value";

export const PBP_COMPARISON_VALUE_TYPES: readonly PbpComparisonValueType[] = [
  "money",
  "recurring-money",
  "derived-money",
  "duration",
  "controlled-value",
] as const;

export function isPbpComparisonValueType(value: string): value is PbpComparisonValueType {
  return PBP_COMPARISON_VALUE_TYPES.includes(value as PbpComparisonValueType);
}

export interface PbpComparisonDimension {
  valueType: PbpComparisonValueType;
  selectorRef?: string;
  derivationRef?: string;
  required?: boolean;
}

export interface PbpComparisonProfile extends PbpEntity {
  type: "comparison-profile";
  name: string;
  appliesToCategoryRefs: Record<string, PbpEntityRef>;
  dimensions: Record<string, PbpComparisonDimension>;
}
