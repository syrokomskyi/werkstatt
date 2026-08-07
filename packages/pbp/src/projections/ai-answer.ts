/**
 * PBP AI Answer Projection contract.
 *
 * @see pbp-specification-package/compiler Phase 12 (Projection)
 * @see pbp-specification-package/system-spec §25 (MachineUsePolicy)
 * @see RFC-0456
 */

import type { PbpEntityRef } from "../entity-ref.js";
import type { PbpCurrencyConversionTrace } from "../derivations/currency-conversion.js";

export interface PbpAiAnswerProjection {
  projectionTarget: "ai-answer";
  offeringRef: PbpEntityRef;
  policyRef: PbpEntityRef;
  allowedFacts: Record<string, unknown>;
  deniedFacts: string[];
  locale: string;
  /** Price calculation traces keyed by target currency code. Only present when multi-currency is entitled (RFC-0742). */
  priceTraces?: Record<string, PbpCurrencyConversionTrace>;
}
