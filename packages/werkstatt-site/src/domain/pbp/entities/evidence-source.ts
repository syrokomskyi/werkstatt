/**
 * PBP EvidenceSource entity.
 *
 * @see pbp-specification-package/entity-model §25 (EvidenceSource)
 * @see RFC-0416
 * @see RFC-0706 (Nachweisregister evidence kind + items extensions)
 * @see RFC-0872 (technical-assessment kind, artifact roles, assessment field)
 * @see RFC-0885 (display control, website fields)
 * @see ADR-0028 (Nachweisregister as PBP trust-layer extension)
 * @see ADR-0054 (technical assessments as first-class Nachweisregister evidence profile)
 */

import type { PbpEntity } from "../envelope.js";
import { pbpSchemaId } from "../schema-id.js";

export const EVIDENCE_SOURCE_SCHEMA_ID = pbpSchemaId("evidence-source");

export type PbpEvidenceKind =
  | "external-web-sources"
  | "verified-record"
  | "third-party-registry"
  // RFC-0706: Nachweisregister evidence types
  | "client-statement"
  | "project-confirmation"
  | "certificate"
  | "operational-evidence"
  // RFC-0872: technical assessment evidence type
  | "technical-assessment";

export const PBP_EVIDENCE_KINDS: readonly PbpEvidenceKind[] = [
  "external-web-sources",
  "verified-record",
  "third-party-registry",
  // RFC-0706: Nachweisregister evidence types
  "client-statement",
  "project-confirmation",
  "certificate",
  "operational-evidence",
  // RFC-0872: technical assessment evidence type
  "technical-assessment",
] as const;

export function isPbpEvidenceKind(value: string): value is PbpEvidenceKind {
  return PBP_EVIDENCE_KINDS.includes(value as PbpEvidenceKind);
}

// RFC-0872: artifact role for technical-assessment evidence items
export type PbpEvidenceArtifactRole =
  "raw-result" | "report" | "screenshot" | "summary" | "methodology";

// RFC-0872: technical assessment sub-types
export type NachweisAssessmentExecutionMode = "operator-run" | "provider-run";

export type NachweisAssessmentAuthorizationBasis =
  "site-owner" | "service-contract" | "explicit-operator";

export type NachweisAssessmentDimensionStatus = "pass" | "fail" | "not-checked";

export interface NachweisAssessmentProvider {
  id: string;
  name: string;
  homepage?: string;
}

export interface NachweisAssessmentTool {
  id: string;
  name: string;
  version?: string;
}

export interface NachweisAssessmentMethodology {
  id: string;
  version: string;
  runCount: number;
  aggregation: "provider" | "median" | "none";
}

export interface NachweisAssessmentDimension {
  id: string;
  providerLabel: string;
  score?: number;
  numerator?: number;
  denominator?: number;
  status?: NachweisAssessmentDimensionStatus;
  level?: string;
  experimental?: boolean;
  min?: number;
  max?: number;
  samples?: number[];
}

export interface NachweisTechnicalAssessmentV1 {
  profile: "technical-assessment";
  seriesId: string;
  observationId: string;
  subject: { url: string; canonicalUrl?: string };
  provider: NachweisAssessmentProvider;
  tool: NachweisAssessmentTool;
  executionMode: NachweisAssessmentExecutionMode;
  authorizationBasis: NachweisAssessmentAuthorizationBasis;
  observedAt: string;
  methodology: NachweisAssessmentMethodology;
  overall?: { score?: number; level?: string };
  dimensions: NachweisAssessmentDimension[];
  freshness: { maxAgeDays: number };
  providerReportUrl?: string;
}

// RFC-0885: display control aspects for Nachweis evidence kinds
export type PbpEvidenceDisplayAspect = "visible" | "hidden";

// RFC-0885: display control for evidence rendering
export interface PbpEvidenceDisplay {
  document: PbpEvidenceDisplayAspect;
  screenshot: PbpEvidenceDisplayAspect;
  websiteLink: PbpEvidenceDisplayAspect;
}

// RFC-0885: client website screenshot artifact
export interface PbpWebsiteScreenshot {
  sha256: string;
  mediaType: string;
  storage: "private" | "public";
  url?: string;
  // RFC-0887: capture date for UI display
  capturedAt?: string;
}

export interface PbpEvidenceSource extends PbpEntity {
  type: "evidence-source";
  name: string;
  kind: PbpEvidenceKind;
  authority: { kind: string };
  // RFC-0706: items fields are optional for file-based evidence without public URLs
  items?: Record<
    string,
    {
      url?: string;
      retrievedAt?: string;
      sha256?: string;
      storage?: "private" | "public";
      mediaType?: string;
      qualityStatus?:
        "unverified" | "verified" | "verified_with_quality_issue" | "changed" | "rejected";
      // RFC-0872: artifact semantics for technical-assessment evidence
      role?: PbpEvidenceArtifactRole;
      canonical?: boolean;
    }
  >;
  // RFC-0872: normalized technical assessment metadata
  assessment?: NachweisTechnicalAssessmentV1;
  // RFC-0885: display control — required for Nachweis evidence kinds, rejected for others
  display?: PbpEvidenceDisplay;
  // RFC-0885: client website link
  websiteUrl?: string;
  // RFC-0885: client website screenshot
  websiteScreenshot?: PbpWebsiteScreenshot;
}
