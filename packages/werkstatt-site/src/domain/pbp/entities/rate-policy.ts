/**
 * PBP RatePolicy and RateSchedule entities — rate source and schedule definitions.
 *
 * @see RFC-0737
 */

import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import { pbpSchemaId } from "../schema-id.js";

export type PbpRateMode = "external" | "business-fixed";

export const PBP_RATE_MODES: readonly PbpRateMode[] = ["external", "business-fixed"] as const;

export function isPbpRateMode(value: string): value is PbpRateMode {
  return PBP_RATE_MODES.includes(value as PbpRateMode);
}

export type PbpRateDirection = "target-per-source" | "source-per-target";

export const PBP_RATE_DIRECTIONS: readonly PbpRateDirection[] = [
  "target-per-source",
  "source-per-target",
] as const;

export function isPbpRateDirection(value: string): value is PbpRateDirection {
  return PBP_RATE_DIRECTIONS.includes(value as PbpRateDirection);
}

export interface PbpCurrencyPair {
  sourceCurrency: string;
  targetCurrency: string;
}

export interface PbpQuotation {
  direction: PbpRateDirection;
}

export interface PbpRatePolicy extends PbpEntity {
  type: "rate-policy";
  pair: PbpCurrencyPair;
  quotation: PbpQuotation;
  mode: PbpRateMode;
  sources?: { primary: PbpEntityRef; fallback?: PbpEntityRef };
  freshness: { maximumAge: string; allowLastKnownValue: boolean };
  failure: { noAcceptableRate: "source-price-only" | "block-publication" };
}

export interface PbpRateScheduleEntry {
  value: string;
  validFrom: string;
}

export interface PbpRateSchedule extends PbpEntity {
  type: "rate-schedule";
  pair: PbpCurrencyPair;
  quotation: PbpQuotation;
  entries: Record<string, PbpRateScheduleEntry>;
}

export const RATE_POLICY_SCHEMA_ID = pbpSchemaId("rate-policy");
export const RATE_SCHEDULE_SCHEMA_ID = pbpSchemaId("rate-schedule");
