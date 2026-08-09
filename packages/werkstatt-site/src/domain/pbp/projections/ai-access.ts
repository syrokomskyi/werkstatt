/**
 * PBP AI access projection contract.
 *
 * @see pbp-specification-package/compiler — projection targets include ai-answer
 * @see RFC-0434
 */

import type { PbpEntityRef } from "../entity-ref.js";

export interface PbpAiAccessProjection {
  projectionTarget: "ai-answer";
  policyRef: PbpEntityRef;
  allowedFacts: string[];
  deniedFacts: string[];
}
