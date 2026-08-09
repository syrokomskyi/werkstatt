/**
 * PBP CurrencyPricingPolicy entity — business-level currency strategy.
 *
 * @see RFC-0736
 */

import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import { pbpSchemaId } from "../schema-id.js";
import type { PbpPriceDerivationPipeline } from "../derivations/currency-conversion.js";

export type PbpCurrencyStrategy = "derived" | "fixed";

export const PBP_CURRENCY_STRATEGIES: readonly PbpCurrencyStrategy[] = [
  "derived",
  "fixed",
] as const;

export function isPbpCurrencyStrategy(value: string): value is PbpCurrencyStrategy {
  return PBP_CURRENCY_STRATEGIES.includes(value as PbpCurrencyStrategy);
}

export interface PbpCurrentUses {
  presentation: boolean;
  aiAnswers: boolean;
  quote: boolean;
  contract: boolean;
  invoice: boolean;
  settlement: boolean;
}

export interface PbpCurrencyTarget {
  currency: string;
  strategy: PbpCurrencyStrategy;
  derivationContractRef?: PbpEntityRef;
  ratePolicyRef?: PbpEntityRef;
  pipelineOverride?: Partial<PbpPriceDerivationPipeline>;
  currentUses: PbpCurrentUses;
}

export interface PbpCurrencyPricingPolicy extends PbpEntity {
  type: "currency-pricing-policy";
  businessRef: PbpEntityRef;
  baseCurrency: string;
  targetCurrencies: Record<string, PbpCurrencyTarget>;
}

export const CURRENCY_PRICING_POLICY_SCHEMA_ID = pbpSchemaId("currency-pricing-policy");
