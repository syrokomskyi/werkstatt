/*
<MODULE_CONTRACT>
<purpose>RFC-0707: I/O layer for Nachweis kernel module — R2 upload, SHA-256 hashing, record ID generation.</purpose>
<keywords>nachweis, r2, sha256, hash, record, evidence, bordbuch</keywords>
<responsibilities>
  <item>Provides uploadToR2 for private evidence storage in the nachweise bucket.</item>
  <item>Computes SHA-256 hashes via @warpgogol/fingerprint byteHashFile.</item>
  <item>Generates deterministic record IDs in nr_{slug}_{YYYYMMDD} format.</item>
  <item>Resolves R2 storage paths for private and public document storage.</item>
  <item>Reads resolved entitlements to check for the nachweis feature.</item>
</responsibilities>
<non-goals>
  <item>Does not implement command handlers — those live in nachweis-*.ts files.</item>
  <item>Does not implement R2 download — not needed for the pilot lifecycle.</item>
  <item>Does not implement multipart uploads — individual files are under the 5 MB threshold.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0707: initial nachweis I/O layer with R2 upload, hash computation, record ID generation.</item>
  <item>RFC-0713: uploadToR2 passes R2_NACHWEIS envPrefix for per-bucket credential isolation.</item>
  <item>RFC-0714: add NachweisApproveResult, NachweisPublicDerivativeResult interfaces and resolveNachweisPublicR2Path helper.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parse as yamlParse } from "yaml";
import { byteHashFile } from "@warpgogol/fingerprint";
import { createR2Client, resolveR2ConfigFromEnv, MissingEnvError } from "../evidence/r2-client.ts";
import { resolveCachePath } from "../sternsystem/registry-io.ts";

const NACHWEIS_BUCKET = "nachweis";

export interface NachweisRecord {
  recordId: string;
  slug: string;
  recordType: string;
  titleDe: string;
  titleUk: string;
  titleEn?: string;
  qualityStatus: string;
  sourceSha256: string;
  r2Path: string;
  version: number;
  status: "preview" | "published" | "withdrawn";
}

export interface NachweisIngestResult {
  recordId: string;
  systemId: string;
  sourceSha256: string;
  r2Path: string;
  version: number;
  dryRun: boolean;
  bordbuchEventId: string | null;
}

export interface NachweisManifestEntry {
  recordId: string;
  slug: string;
  recordType: string;
  titleDe: string;
  titleUk: string;
  titleEn?: string;
  qualityStatus: string;
  sourceSha256: string;
  publishedAt: string | null;
}

export interface NachweisManifest {
  schemaVersion: string;
  generatedAt: null;
  expiresAt: null;
  records: NachweisManifestEntry[];
}

export interface NachweisPublicationGate {
  slug: string;
  allPassed: boolean;
  consentGranted: boolean;
  sourceIntegrityVerified: boolean;
  recordApproved: boolean;
  verificationLevelMet: boolean;
  publicDerivativeReady: boolean;
  legalContentCheckPassed: boolean;
}

export interface NachweisValidateResult {
  systemId: string;
  records: number;
  violations: NachweisViolation[];
  gateResults: NachweisPublicationGate[];
}

export interface NachweisViolation {
  rule: string;
  message: string;
  recordId?: string;
}

export interface NachweisConsentUpdateResult {
  consentId: string;
  systemId: string;
  previousStatus: string;
  newStatus: string;
  bordbuchEventId: string;
}

export interface NachweisPublishResult {
  recordId: string;
  systemId: string;
  published: boolean;
  gateResult: NachweisPublicationGate;
  bordbuchEventId: string | null;
}

export interface NachweisWithdrawResult {
  recordId: string;
  systemId: string;
  withdrawn: boolean;
  alreadyWithdrawn: boolean;
  bordbuchEventIds: string[];
}

export interface NachweisApproveResult {
  slug: string;
  systemId: string;
  verificationLevel: string;
  legalContentCheckPassed: boolean;
  bordbuchEventId: string | null;
}

export interface NachweisPublicDerivativeResult {
  slug: string;
  systemId: string;
  r2Path: string;
  publicDerivativeSha256: string;
  bordbuchEventId: string | null;
  alreadyUploaded: boolean;
}

export async function computeSourceSha256(filePath: string): Promise<string> {
  const hash = await byteHashFile(filePath);
  return hash;
}

export function generateRecordId(slug: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `nr_${slug}_${date}`;
}

export function resolveNachweisR2Path(systemId: string, recordId: string, version: number): string {
  return `${systemId}/private/${recordId}/v${version}/source.pdf`;
}

export function resolveNachweisPublicR2Path(
  systemId: string,
  recordId: string,
  version: number,
): string {
  return `${systemId}/public/${recordId}/v${version}/public.pdf`;
}

export async function uploadToR2(fileBuffer: Uint8Array, r2Path: string): Promise<void> {
  const config = resolveR2ConfigFromEnv(NACHWEIS_BUCKET, "R2_NACHWEIS");
  const client = createR2Client(config);
  await client.putObject({
    key: r2Path,
    body: fileBuffer,
    contentType: "application/pdf",
  });
}

export function isMissingEnvError(err: unknown): err is MissingEnvError {
  return err instanceof MissingEnvError;
}

const PBP_ENTITY_DIR_MAP: Record<string, string> = {
  "evidence-source": "trust/evidence",
  consent: "trust/consents",
  claim: "trust/claims",
};

export function resolvePbpEntityDir(cachePath: string, lang: string, entityType: string): string {
  const subDir = PBP_ENTITY_DIR_MAP[entityType] ?? entityType;
  return path.join(cachePath, "src", "content", "business-profile", lang, subDir);
}

export async function resolveNachweisCachePath(
  workspaceRoot: string,
  systemId: string,
): Promise<string> {
  return resolveCachePath(workspaceRoot, systemId);
}

export async function readEntitledFeaturesFromCache(cachePath: string): Promise<string[] | null> {
  const entitlementsPath = path.join(cachePath, "src", "entitlements.generated.yaml");
  if (!existsSync(entitlementsPath)) {
    return null;
  }
  try {
    const raw = await fs.readFile(entitlementsPath, "utf8");
    const parsed = yamlParse(raw) as { features?: unknown };
    return Array.isArray(parsed.features) ? parsed.features.map(String) : null;
  } catch {
    return null;
  }
}

export async function isNachweisEntitled(
  workspaceRoot: string,
  systemId: string,
): Promise<boolean> {
  const cachePath = await resolveNachweisCachePath(workspaceRoot, systemId);
  const features = await readEntitledFeaturesFromCache(cachePath);
  return features?.includes("nachweis") ?? false;
}

export function makeSkipResult(
  commandName: string,
  systemId: string,
): {
  data: Record<string, unknown>;
  exitCode: 0;
  summary: string;
} {
  return {
    data: { systemId, skipped: true, reason: "nachweis entitlement not resolved" },
    exitCode: 0,
    summary: `[${commandName}] skipped — nachweis entitlement not resolved for ${systemId}`,
  };
}
