/*
<MODULE_CONTRACT>
<purpose>PBP Consent entity for granular consent management (RFC-0706, ADR-0028, Nachweisregister).</purpose>
<non-goals>
  <item>Does not define consent lifecycle commands — those belong to RFC-0707.</item>
  <item>Does not define R2 storage integration — that belongs to RFC-0707.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0706 — PbpConsent entity for Nachweisregister consent management.</item>
</CHANGE_SUMMARY>
*/

import type { PbpEntity } from "../envelope.js";
import { pbpSchemaId } from "../schema-id.js";

export const CONSENT_SCHEMA_ID = pbpSchemaId("consent");

export type PbpConsentMethod = "verified_business_email" | "signed_pdf" | "qes" | "none";

export const PBP_CONSENT_METHODS: readonly PbpConsentMethod[] = [
  "verified_business_email",
  "signed_pdf",
  "qes",
  "none",
] as const;

export function isPbpConsentMethod(value: string): value is PbpConsentMethod {
  return PBP_CONSENT_METHODS.includes(value as PbpConsentMethod);
}

export type PbpConsentStatus =
  "not_requested" | "requested" | "partially_granted" | "granted" | "revoked" | "expired";

export const PBP_CONSENT_STATUSES: readonly PbpConsentStatus[] = [
  "not_requested",
  "requested",
  "partially_granted",
  "granted",
  "revoked",
  "expired",
] as const;

export function isPbpConsentStatus(value: string): value is PbpConsentStatus {
  return PBP_CONSENT_STATUSES.includes(value as PbpConsentStatus);
}

export interface PbpConsent extends PbpEntity {
  type: "consent";
  name: string;
  textVersion: string;
  purposes: string[];
  channels: string[];
  dataElements: string[];
  method: PbpConsentMethod;
  grantedAt: string | null;
  evidenceRef: string | null;
  // Named consentStatus (not status) to avoid conflict with PbpEntity.status: PbpEntityStatus
  consentStatus: PbpConsentStatus;
  withdrawalContact?: string;
}
