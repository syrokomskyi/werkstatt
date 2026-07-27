/**
 * PBP LegalIdentity entity and public/private boundary.
 *
 * @see pbp-specification-package/entity-model §6 (LegalIdentity), §6.1 (Privacy boundary)
 * @see RFC-0409
 */

import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import type { PbpSemanticStatus } from "../semantic-status.js";
import type { PbpExternalIdentifier } from "../primitives.js";
import { pbpSchemaId } from "../schema-id.js";

export const LEGAL_IDENTITY_SCHEMA_ID = pbpSchemaId("legal-identity");

export interface PbpLegalIdentity extends PbpEntity {
  type: "legal-identity";
  legalName: string;
  legalForm?: { valueRef: string };
  responsiblePerson?: { name: string };
  registeredPlaceRef?: PbpEntityRef;
  publicIdentifiers?: Record<string, { status: PbpSemanticStatus; value?: string }>;
  publicRegistrations?: Record<string, PbpEntityRef>;
  externalIdentifiers?: Record<string, PbpExternalIdentifier>;
}
