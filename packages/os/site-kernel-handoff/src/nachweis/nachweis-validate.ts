/*
<MODULE_CONTRACT>
<purpose>RFC-0707: nachweis.validate command handler — validates PBP trust entities and enforces publication gate.</purpose>
<keywords>nachweis, validate, publication, gate, consent, evidence, bordbuch</keywords>
<responsibilities>
  <item>Reads PBP EvidenceSource, Consent, and Claim entities from the cache clone.</item>
  <item>Checks EvidenceSource items for sha256 on Nachweis kinds.</item>
  <item>Checks Consent entities with consentStatus granted have grantedAt set.</item>
  <item>Checks Claim entities for valid BCP 47 statementLang tags.</item>
  <item>Enforces publication gate: no published record without all conditions met.</item>
  <item>Delegates bordbuch hash-chain validation to bordbuch.validate.</item>
  <item>Skips silently when nachweis entitlement is not resolved.</item>
</responsibilities>
<non-goals>
  <item>Does not modify any state — read-only validation.</item>
  <item>Does not validate PBP schema conformance — that is the PBP compiler's job.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0707: initial nachweis.validate command handler.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { executeKernelCommand } from "@warpgogol/site-kernel";
import { parseMarkdownFrontmatter } from "@warpgogol/site-kernel-content";
import { readBordbuch } from "../bordbuch/bordbuch-io.ts";
import {
  isNachweisEntitled,
  makeSkipResult,
  resolveNachweisCachePath,
  resolvePbpEntityDir,
  type NachweisPublicationGate,
  type NachweisValidateResult,
  type NachweisViolation,
} from "./nachweis-io.ts";

const NACHWEIS_EVIDENCE_KINDS = new Set([
  "client-statement",
  "project-confirmation",
  "certificate",
  "operational-evidence",
]);

const BCP47_PATTERN = /^[a-z]{2,3}(-[A-Z][a-zA-Z]{3})?(-[A-Z]{2})?$/;

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

interface PbpEntityRecord {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

async function readPbpEntitiesByType(
  cachePath: string,
  entityType: string,
  lang: string,
): Promise<PbpEntityRecord[]> {
  const dir = resolvePbpEntityDir(cachePath, lang, entityType);
  if (!existsSync(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const records: PbpEntityRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".md") && !entry.name.endsWith(".yaml")) continue;
    const filePath = path.join(dir, entry.name);
    const raw = await fs.readFile(filePath, "utf8");
    if (entry.name.endsWith(".md")) {
      const { data } = parseMarkdownFrontmatter(raw);
      records.push({ id: entry.name.replace(/\.(md|yaml)$/, ""), type: entityType, data });
    } else {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        records.push({ id: entry.name.replace(/\.yaml$/, ""), type: entityType, data: parsed });
      } catch {
        // skip invalid YAML
      }
    }
  }
  return records;
}

function evaluateGate(
  slug: string,
  evidenceRecord: PbpEntityRecord | undefined,
  consentRecord: PbpEntityRecord | undefined,
  bordbuchEntries: { kind: string; metadata?: Record<string, unknown> | null; summary: string }[],
): NachweisPublicationGate {
  const consentGranted = consentRecord?.data?.consentStatus === "granted";
  const sourceIntegrityVerified =
    evidenceRecord?.data?.items != null &&
    Object.values(evidenceRecord.data.items as Record<string, { sha256?: string }>).some(
      (item) => item.sha256 != null,
    );
  const recordApproved = bordbuchEntries.some(
    (e) => e.kind === "nachweis-record" && e.summary.includes("approved"),
  );
  const verificationLevelMet = bordbuchEntries.some(
    (e) => e.kind === "nachweis-record" && e.metadata?.verificationLevel === "N3",
  );
  const publicDerivativeReady =
    evidenceRecord?.data?.items != null &&
    Object.values(evidenceRecord.data.items as Record<string, { storage?: string }>).some(
      (item) => item.storage === "public",
    );
  const legalContentCheckPassed = bordbuchEntries.some(
    (e) => e.kind === "nachweis-record" && e.metadata?.legalContentCheckPassed === true,
  );

  const allPassed =
    consentGranted &&
    sourceIntegrityVerified &&
    recordApproved &&
    verificationLevelMet &&
    publicDerivativeReady &&
    legalContentCheckPassed;

  return {
    slug,
    allPassed,
    consentGranted,
    sourceIntegrityVerified,
    recordApproved,
    verificationLevelMet,
    publicDerivativeReady,
    legalContentCheckPassed,
  };
}

export async function runNachweisValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<NachweisValidateResult>> {
  const { workspaceRoot, logger } = context;
  const systemId = flagString(input, "system") ?? context.site?.name;
  if (!systemId) throw new Error("[nachweis.validate] --system is required");

  const entitled = await isNachweisEntitled(workspaceRoot, systemId);
  if (!entitled) {
    return makeSkipResult(
      "nachweis.validate",
      systemId,
    ) as unknown as KernelCommandResult<NachweisValidateResult>;
  }

  const cachePath = await resolveNachweisCachePath(workspaceRoot, systemId);
  const lang = "de";

  const evidenceSources = await readPbpEntitiesByType(cachePath, "evidence-source", lang);
  const consents = await readPbpEntitiesByType(cachePath, "consent", lang);
  const claims = await readPbpEntitiesByType(cachePath, "claim", lang);

  const violations: NachweisViolation[] = [];

  // Check EvidenceSource entities with Nachweis kinds have sha256 in items
  for (const es of evidenceSources) {
    const kind = es.data.kind as string | undefined;
    if (!kind || !NACHWEIS_EVIDENCE_KINDS.has(kind)) continue;
    const items = es.data.items as Record<string, { sha256?: string }> | undefined;
    if (!items) {
      violations.push({
        rule: "evidence-missing-sha256",
        message: `EvidenceSource '${es.id}' has kind '${kind}' but no items[]`,
        recordId: es.id,
      });
      continue;
    }
    for (const [itemKey, item] of Object.entries(items)) {
      if (item.sha256 == null) {
        violations.push({
          rule: "evidence-missing-sha256",
          message: `EvidenceSource '${es.id}' item '${itemKey}' is missing sha256`,
          recordId: es.id,
        });
      }
    }
  }

  // Check Consent entities with consentStatus granted have grantedAt set
  for (const c of consents) {
    const consentStatus = c.data.consentStatus as string | undefined;
    if (consentStatus === "granted") {
      const grantedAt = c.data.grantedAt;
      if (grantedAt == null || grantedAt === "") {
        violations.push({
          rule: "consent-granted-without-timestamp",
          message: `Consent '${c.id}' has consentStatus 'granted' but grantedAt is null`,
          recordId: c.id,
        });
      }
    }
  }

  // Check Claim entities for valid BCP 47 statementLang tags
  for (const cl of claims) {
    const statementLang = cl.data.statementLang as string | undefined;
    if (statementLang && !BCP47_PATTERN.test(statementLang)) {
      violations.push({
        rule: "claim-invalid-statement-lang",
        message: `Claim '${cl.id}' has invalid statementLang '${statementLang}' (not BCP 47)`,
        recordId: cl.id,
      });
    }
  }

  // Delegate bordbuch hash-chain validation
  const bordbuchResult = await executeKernelCommand({
    workspaceRoot,
    commandName: "bordbuch.validate",
    siteName: systemId,
    argv: [`--system=${systemId}`],
  });
  const bordbuchReport = Array.isArray(bordbuchResult) ? bordbuchResult[0] : bordbuchResult;
  if (bordbuchReport.exitCode !== 0) {
    violations.push({
      rule: "bordbuch-hash-chain",
      message: `bordbuch.validate reported violations: ${bordbuchReport.summary ?? "unknown"}`,
    });
  }

  // Publication gate evaluation per record
  const bordbuchEntries = await readBordbuch(workspaceRoot, systemId);
  const nachweisEntries = bordbuchEntries.filter(
    (e) => e.kind === "nachweis-record" || e.kind === "nachweis-consent",
  );

  const gateResults: NachweisPublicationGate[] = [];
  const slugs = new Set<string>();
  for (const es of evidenceSources) {
    const kind = es.data.kind as string | undefined;
    if (!kind || !NACHWEIS_EVIDENCE_KINDS.has(kind)) continue;
    const slug = ((es.data as Record<string, unknown>).slug as string | undefined) ?? es.id;
    slugs.add(slug);
  }

  for (const slug of slugs) {
    const evidenceRecord = evidenceSources.find(
      (e) =>
        ((e.data as Record<string, unknown>).slug as string | undefined) === slug || e.id === slug,
    );
    const consentRecord = consents.find((c) => (c.data as Record<string, unknown>).slug === slug);
    const gate = evaluateGate(slug, evidenceRecord, consentRecord, nachweisEntries);
    gateResults.push(gate);

    // Check if record is published but gate not passed
    const isPublished =
      (evidenceRecord?.data as Record<string, unknown>)?.recordStatus === "published";
    if (isPublished && !gate.allPassed) {
      violations.push({
        rule: "publication-gate-violation",
        message: `Record '${slug}' is published but gate conditions not met (consent: ${gate.consentGranted}, integrity: ${gate.sourceIntegrityVerified}, approved: ${gate.recordApproved}, verification: ${gate.verificationLevelMet}, derivative: ${gate.publicDerivativeReady}, legal: ${gate.legalContentCheckPassed})`,
        recordId: slug,
      });
    }
  }

  const hasViolations = violations.length > 0;
  const publishedCount = gateResults.filter((g) => g.allPassed).length;

  return {
    data: {
      systemId,
      records: slugs.size,
      violations,
      gateResults,
    },
    exitCode: hasViolations ? 1 : 0,
    summary: `[nachweis.validate] ${systemId}: ${slugs.size} records, ${violations.length} violations, ${publishedCount} published`,
  };
}
