/*
<MODULE_CONTRACT>
<purpose>PBP Consent entity for granular consent management (RFC-0706, RFC-0885, ADR-0028, Nachweisregister).</purpose>
<non-goals>
  <item>Does not define consent lifecycle commands — those belong to RFC-0707.</item>
  <item>Does not define R2 storage integration — that belongs to RFC-0707.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0706 — PbpConsent entity for Nachweisregister consent management.</item>
  <item>RFC-0885 — Replaced consentStatus/grantedAt/method with consentScope (per-aspect granular consent).</item>
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

// RFC-0885: per-aspect consent scope status
export type PbpConsentScopeStatus = "not_requested" | "granted" | "denied";

export const PBP_CONSENT_SCOPE_STATUSES: readonly PbpConsentScopeStatus[] = [
  "not_requested",
  "granted",
  "denied",
] as const;

export function isPbpConsentScopeStatus(value: string): value is PbpConsentScopeStatus {
  return PBP_CONSENT_SCOPE_STATUSES.includes(value as PbpConsentScopeStatus);
}

// RFC-0885: per-aspect consent scope entry
export interface PbpConsentScopeEntry {
  status: PbpConsentScopeStatus;
  grantedAt: string | null;
  method: PbpConsentMethod;
}

// RFC-0885: granular consent scope for document, screenshot, websiteLink aspects
export interface PbpConsentScope {
  document: PbpConsentScopeEntry;
  screenshot: PbpConsentScopeEntry;
  websiteLink: PbpConsentScopeEntry;
}

export interface PbpConsent extends PbpEntity {
  type: "consent";
  name: string;
  textVersion: string;
  purposes: string[];
  channels: string[];
  dataElements: string[];
  evidenceRef: string | null;
  withdrawalContact?: string;
  // RFC-0885: granular per-aspect consent scope (replaces consentStatus/grantedAt/method)
  consentScope: PbpConsentScope;
}
