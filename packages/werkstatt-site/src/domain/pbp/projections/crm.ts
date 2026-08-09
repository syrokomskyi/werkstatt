/**
 * PBP CRM projection contract.
 *
 * @see pbp-specification-package/compiler §22 (CRM Projection)
 * @see RFC-0433
 */

export interface PbpCrmPayload {
  businessId: string;
  catalogEntryId: string;
  offeringId: string;
  planId: string;
  charges: Record<string, unknown>;
  relatedOfferingIds: string[];
  sourceRevision: string;
}

export interface PbpCrmProjection {
  payload: PbpCrmPayload;
  projectionTarget: "crm";
}
