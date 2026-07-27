/**
 * PBP Business entity.
 *
 * @see pbp-specification-package/entity-model §5 (Business)
 * @see RFC-0403
 */

import type { PbpEntity, PbpGovernance } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import type { PbpControlledValue, PbpExternalIdentifier } from "../primitives.js";
import { pbpSchemaId } from "../schema-id.js";

export const BUSINESS_SCHEMA_ID = pbpSchemaId("business");

export interface PbpBusiness extends PbpEntity {
  type: "business";
  name: string;
  summary?: string;
  description?: string;
  businessModel?: { typeRef: string };
  markets?: Record<string, PbpControlledValue>;
  industries?: Record<string, { categoryRef: string }>;
  yearEstablished?: number;
  mission?: string;
  brandRefs?: Record<string, PbpEntityRef>;
  legalIdentityRef?: PbpEntityRef;
  placeRefs?: Record<string, PbpEntityRef & { role?: string }>;
  contactPointRefs?: Record<string, PbpEntityRef>;
  webPresenceRefs?: Record<string, PbpEntityRef>;
  catalogRefs?: Record<string, PbpEntityRef>;
  externalIdentifiers?: Record<string, PbpExternalIdentifier>;
}
