/*
<MODULE_CONTRACT>
  <purpose>RFC-0531, RFC-0535 Wikidata readiness validation: checks PBP content and
    rendered JSON-LD for Wikidata integration readiness — QID presence, URL construction
    from schemeRef+value, projection parity, LegalIdentity legalName, and Claim/EvidenceSource
    coverage (notability evidence, factual claim evidence, evidence reference integrity,
    evidence source URL validity).</purpose>
  <non-goals>
    <item>Does not call the Wikidata API — this is a static validation command.</item>
    <item>Does not validate Person entities — Person sameAs is handled separately.</item>
    <item>Does not auto-add Wikidata QIDs to content — operators add them manually.</item>
    <item>Does not check non-factual claims (comparative, benefit, risk, limitation) — only factual claims are Wikidata-relevant (RFC-0535).</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0531 — Wikidata readiness validation command.</item>
  <item>Extended by RFC-0535 — Claim/EvidenceSource coverage checks (notability evidence, factual claim evidence, evidence reference integrity, evidence source URL validity).</item>
</CHANGE_SUMMARY>
*/

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { defaultLanguageFromManifest } from "../../lib/i18n.ts";
import { parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { buildAuditResult, loadAuditAppContext } from "../helpers.ts";
import type { Diagnostic } from "../types.ts";
import { collectRenderedHtml, extractJsonLdGraph, finding, jsonLdNodeHasType } from "./helpers.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PbpExternalIdentifier {
  schemeRef: string;
  value: string;
  authorityRef?: string;
}

type ExternalIdentifiers = Record<string, PbpExternalIdentifier>;

type WikidataValidationRule =
  | "wikidata.business-missing-qid"
  | "wikidata.brand-missing-qid"
  | "wikidata.legalidentity-missing-qid"
  | "wikidata.malformed-url"
  | "wikidata.projection-parity"
  | "wikidata.legalidentity-missing-legalname"
  | "wikidata.no-notability-evidence"
  | "wikidata.claim-without-evidence"
  | "wikidata.evidence-broken-ref"
  | "wikidata.evidence-missing-url";

const WIKIDATA_SCHEME_MARKER = "wikidata.org";

const NOTABILITY_EVIDENCE_KINDS = ["external-web-sources", "third-party-registry"];

const STRICT_ESCALATION_RULES: string[] = [
  "wikidata.business-missing-qid",
  "wikidata.brand-missing-qid",
  "wikidata.legalidentity-missing-qid",
  "wikidata.no-notability-evidence",
  "wikidata.claim-without-evidence",
];

interface ClaimRecord {
  id: string;
  claimClass: string;
  statement: string;
  evidenceRefs?: Record<string, { ref: string; expectedType?: string }>;
}

interface EvidenceSourceItem {
  url?: string;
  retrievedAt?: string;
}

interface EvidenceSourceRecord {
  id: string;
  name: string;
  kind: string;
  items?: Record<string, EvidenceSourceItem>;
}

// ---------------------------------------------------------------------------
// Pure validation functions (unit-testable without I/O)
// ---------------------------------------------------------------------------

export function hasWikidataQid(externalIds: ExternalIdentifiers): boolean {
  return Object.values(externalIds).some((id) => id.schemeRef.includes(WIKIDATA_SCHEME_MARKER));
}

export function constructSameAsUrl(id: PbpExternalIdentifier): string {
  return `${id.schemeRef}${id.value}`;
}

export function isValidHttpsUrl(url: string): boolean {
  if (!url.startsWith("https://")) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function validateQidPresence(
  entityType: "business" | "brand" | "legal-identity",
  externalIds: ExternalIdentifiers | undefined,
  contentFile: string,
): Diagnostic | null {
  const ruleId: WikidataValidationRule =
    entityType === "business"
      ? "wikidata.business-missing-qid"
      : entityType === "brand"
        ? "wikidata.brand-missing-qid"
        : "wikidata.legalidentity-missing-qid";

  if (!externalIds || Object.keys(externalIds).length === 0) {
    return finding({
      ruleId,
      severity: "warning",
      file: contentFile,
      message: `${entityType === "legal-identity" ? "LegalIdentity" : entityType === "business" ? "Business" : "Brand"} entity has no externalIdentifier with a wikidata.org scheme. Wikidata QID is required for entity translation.`,
      evidence: [{ kind: "config", file: contentFile }],
    });
  }

  if (!hasWikidataQid(externalIds)) {
    return finding({
      ruleId,
      severity: "warning",
      file: contentFile,
      message: `${entityType === "legal-identity" ? "LegalIdentity" : entityType === "business" ? "Business" : "Brand"} entity has no externalIdentifier with a wikidata.org scheme. Wikidata QID is required for entity translation.`,
      evidence: [{ kind: "config", file: contentFile }],
    });
  }

  return null;
}

export function validateUrlConstruction(
  externalIds: ExternalIdentifiers | undefined,
  contentFile: string,
): Diagnostic[] {
  if (!externalIds) return [];
  const results: Diagnostic[] = [];
  for (const [key, id] of Object.entries(externalIds)) {
    const url = constructSameAsUrl(id);
    if (!isValidHttpsUrl(url)) {
      results.push(
        finding({
          ruleId: "wikidata.malformed-url",
          severity: "error",
          file: contentFile,
          message: `externalIdentifier "${key}" schemeRef '${id.schemeRef}' + value '${id.value}' produces invalid HTTPS URL '${url}'. schemeRef must be a full HTTPS URL prefix (e.g. https://www.wikidata.org/wiki/).`,
          evidence: [{ kind: "config", file: contentFile }],
        }),
      );
    }
  }
  return results;
}

export function validateLegalIdentityLegalName(
  legalName: string | undefined,
  contentFile: string,
): Diagnostic | null {
  if (!legalName || legalName.trim() === "") {
    return finding({
      ruleId: "wikidata.legalidentity-missing-legalname",
      severity: "error",
      file: contentFile,
      message:
        "LegalIdentity entity lacks legalName — a required field for creating a Wikidata item for an organization.",
      evidence: [{ kind: "config", file: contentFile }],
    });
  }
  return null;
}

export function collectSameAsUrls(externalIds: ExternalIdentifiers | undefined): string[] {
  if (!externalIds) return [];
  return Object.values(externalIds).map(constructSameAsUrl);
}

export function validateProjectionParity(
  pbpSameAsUrls: string[],
  renderedSameAsUrls: string[],
  contentFile: string,
  renderedFile: string,
): Diagnostic[] {
  if (pbpSameAsUrls.length === 0) return [];
  const renderedSet = new Set(renderedSameAsUrls);
  const missing = pbpSameAsUrls.filter((url) => !renderedSet.has(url));
  if (missing.length === 0) return [];
  return [
    finding({
      ruleId: "wikidata.projection-parity",
      severity: "error",
      file: contentFile,
      message: `PBP externalIdentifiers produce sameAs URLs that are not reflected in rendered JSON-LD Organization sameAs: ${missing.join(", ")}. Projection is broken.`,
      evidence: [
        { kind: "config", file: contentFile },
        { kind: "rendered", file: renderedFile },
      ],
    }),
  ];
}

export function validateNotabilityEvidence(
  hasQid: boolean,
  evidenceSources: EvidenceSourceRecord[],
  contentFile: string,
): Diagnostic | null {
  if (!hasQid) return null;
  const hasExternal = evidenceSources.some((es) => NOTABILITY_EVIDENCE_KINDS.includes(es.kind));
  if (hasExternal) return null;
  return finding({
    ruleId: "wikidata.no-notability-evidence",
    severity: "warning",
    file: contentFile,
    message:
      "Business has a Wikidata QID but no EvidenceSource with kind 'external-web-sources' or 'third-party-registry'. At least one independent source is required for Wikidata notability.",
    evidence: [{ kind: "config", file: contentFile }],
  });
}

export function validateClaimEvidenceCoverage(
  claims: ClaimRecord[],
  contentDir: string,
): Diagnostic[] {
  const results: Diagnostic[] = [];
  for (const claim of claims) {
    if (claim.claimClass !== "factual") continue;
    const hasRefs = claim.evidenceRefs && Object.keys(claim.evidenceRefs).length > 0;
    if (!hasRefs) {
      const claimFile = join(contentDir, `${claim.id}.md`);
      results.push(
        finding({
          ruleId: "wikidata.claim-without-evidence",
          severity: "warning",
          file: claimFile,
          message: `Factual claim '${claim.statement}' has no evidenceRefs. Wikidata requires at least one reference per statement.`,
          evidence: [{ kind: "config", file: claimFile }],
        }),
      );
    }
  }
  return results;
}

export function validateEvidenceReferences(
  claims: ClaimRecord[],
  evidenceSourceIds: Set<string>,
  contentDir: string,
): Diagnostic[] {
  const results: Diagnostic[] = [];
  for (const claim of claims) {
    if (!claim.evidenceRefs) continue;
    for (const [key, ref] of Object.entries(claim.evidenceRefs)) {
      if (!evidenceSourceIds.has(ref.ref)) {
        const claimFile = join(contentDir, `${claim.id}.md`);
        results.push(
          finding({
            ruleId: "wikidata.evidence-broken-ref",
            severity: "error",
            file: claimFile,
            message: `Claim evidenceRefs entry '${key}' (ref: '${ref.ref}') does not resolve to an existing EvidenceSource entity.`,
            evidence: [{ kind: "config", file: claimFile }],
          }),
        );
      }
    }
  }
  return results;
}

export function validateEvidenceSourceUrls(
  evidenceSources: EvidenceSourceRecord[],
  contentDir: string,
): Diagnostic[] {
  const results: Diagnostic[] = [];
  for (const es of evidenceSources) {
    const hasUrl =
      es.items && Object.values(es.items).some((item) => item.url && item.url.trim() !== "");
    if (!hasUrl) {
      const esFile = join(contentDir, `${es.id}.md`);
      results.push(
        finding({
          ruleId: "wikidata.evidence-missing-url",
          severity: "error",
          file: esFile,
          message: `EvidenceSource '${es.name}' has no items with url. Wikidata references must be verifiable.`,
          evidence: [{ kind: "config", file: esFile }],
        }),
      );
    }
  }
  return results;
}

function escalateStrictWarnings(findings: Diagnostic[], strict: boolean): Diagnostic[] {
  if (!strict) return findings;
  return findings.map((f) =>
    STRICT_ESCALATION_RULES.includes(f.ruleId) ? { ...f, severity: "error" as const } : f,
  );
}

// ---------------------------------------------------------------------------
// I/O: main command handler
// ---------------------------------------------------------------------------

async function readPbpEntity(
  contentDirectory: string,
  lang: string,
  entityFile: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(
      join(contentDirectory, "business-profile", lang, entityFile),
      "utf8",
    );
    const { data } = parseMarkdownFrontmatter(raw);
    return (data ?? {}) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractExternalIds(data: Record<string, unknown> | null): ExternalIdentifiers | undefined {
  if (!data) return undefined;
  const raw = data.externalIdentifiers;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return raw as ExternalIdentifiers;
}

async function readPbpRepeatables(dir: string): Promise<Record<string, Record<string, unknown>>> {
  const result: Record<string, Record<string, unknown>> = {};
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return result;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    try {
      const raw = await readFile(join(dir, entry), "utf8");
      const { data } = parseMarkdownFrontmatter(raw);
      const key = entry.replace(/\.md$/, "");
      result[key] = (data ?? {}) as Record<string, unknown>;
    } catch {
      // skip unreadable files
    }
  }
  return result;
}

function toClaimRecords(data: Record<string, Record<string, unknown>>): ClaimRecord[] {
  return Object.entries(data).map(([id, frontmatter]) => ({
    id,
    claimClass: String(frontmatter.claimClass ?? ""),
    statement: String(frontmatter.statement ?? ""),
    evidenceRefs: frontmatter.evidenceRefs as
      Record<string, { ref: string; expectedType?: string }> | undefined,
  }));
}

function toEvidenceSourceRecords(
  data: Record<string, Record<string, unknown>>,
): EvidenceSourceRecord[] {
  return Object.entries(data).map(([id, frontmatter]) => ({
    id,
    name: String(frontmatter.name ?? id),
    kind: String(frontmatter.kind ?? ""),
    items: frontmatter.items as Record<string, EvidenceSourceItem> | undefined,
  }));
}

export async function runWikidataValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const started = Date.now();
  const audit = await loadAuditAppContext(context);
  const findings: Diagnostic[] = [];
  const strict = input.flags.strict === true;

  const defaultLang = defaultLanguageFromManifest(audit.systemManifest);
  const bpDir = join(audit.contentDirectory, "business-profile");

  // Read PBP content files
  const businessData = await readPbpEntity(audit.contentDirectory, defaultLang, "business.md");
  const brandData = await readPbpEntity(audit.contentDirectory, defaultLang, "brand.md");
  const legalIdentityData = await readPbpEntity(
    audit.contentDirectory,
    defaultLang,
    "legal-identity.md",
  );

  // If no PBP content at all, skip all checks
  if (!businessData && !brandData && !legalIdentityData) {
    const result = buildAuditResult({
      command: "wikidata.validate",
      app: audit.siteName,
      findings,
      runtimeMs: Date.now() - started,
    });
    return {
      data: result,
      exitCode: 0,
      summary: "wikidata.validate: skipped (no PBP content)",
    };
  }

  const businessFile = join("src/content/business-profile", defaultLang, "business.md");
  const brandFile = join("src/content/business-profile", defaultLang, "brand.md");
  const legalIdentityFile = join("src/content/business-profile", defaultLang, "legal-identity.md");

  // 1. QID presence checks
  const businessQidFinding = validateQidPresence(
    "business",
    extractExternalIds(businessData),
    businessFile,
  );
  if (businessQidFinding) findings.push(businessQidFinding);

  const brandQidFinding = validateQidPresence("brand", extractExternalIds(brandData), brandFile);
  if (brandQidFinding) findings.push(brandQidFinding);

  const legalIdentityQidFinding = validateQidPresence(
    "legal-identity",
    extractExternalIds(legalIdentityData),
    legalIdentityFile,
  );
  if (legalIdentityQidFinding) findings.push(legalIdentityQidFinding);

  // 2. URL construction checks (always errors)
  findings.push(...validateUrlConstruction(extractExternalIds(businessData), businessFile));
  findings.push(...validateUrlConstruction(extractExternalIds(brandData), brandFile));
  findings.push(
    ...validateUrlConstruction(extractExternalIds(legalIdentityData), legalIdentityFile),
  );

  // 3. LegalIdentity legalName check (always error)
  const legalName =
    legalIdentityData && typeof legalIdentityData.legalName === "string"
      ? (legalIdentityData.legalName as string)
      : undefined;
  const legalNameFinding = validateLegalIdentityLegalName(legalName, legalIdentityFile);
  if (legalNameFinding) findings.push(legalNameFinding);

  // 4. Projection parity check (requires dist/ HTML)
  const pbpSameAsUrls = [
    ...collectSameAsUrls(extractExternalIds(businessData)),
    ...collectSameAsUrls(extractExternalIds(brandData)),
    ...collectSameAsUrls(extractExternalIds(legalIdentityData)),
  ];

  const htmlFiles = await collectRenderedHtml(audit.distDirectory);
  if (pbpSameAsUrls.length > 0 && htmlFiles.length > 0) {
    const renderedSameAsUrls: string[] = [];
    for (const page of htmlFiles) {
      const org = extractJsonLdGraph(page.html).find((node) =>
        jsonLdNodeHasType(node, "Organization"),
      );
      if (org && Array.isArray(org.sameAs)) {
        renderedSameAsUrls.push(...(org.sameAs as string[]));
      }
    }
    findings.push(
      ...validateProjectionParity(
        pbpSameAsUrls,
        renderedSameAsUrls,
        businessFile,
        htmlFiles[0]!.file,
      ),
    );
  }

  // 5. Claim and EvidenceSource coverage checks (only when Business has QID)
  const businessHasQid = hasWikidataQid(extractExternalIds(businessData) ?? {});
  if (businessHasQid) {
    const claimsDir = join(bpDir, defaultLang, "claims");
    const evidenceSourcesDir = join(bpDir, defaultLang, "evidence-sources");
    const claimsData = await readPbpRepeatables(claimsDir);
    const evidenceSourcesData = await readPbpRepeatables(evidenceSourcesDir);

    const claims = toClaimRecords(claimsData);
    const evidenceSources = toEvidenceSourceRecords(evidenceSourcesData);

    // 5a. Notability evidence check
    const notabilityFinding = validateNotabilityEvidence(
      businessHasQid,
      evidenceSources,
      businessFile,
    );
    if (notabilityFinding) findings.push(notabilityFinding);

    // 5b. Factual claim evidence coverage check
    findings.push(...validateClaimEvidenceCoverage(claims, claimsDir));

    // 5c. Evidence reference integrity check
    const evidenceSourceIds = new Set(evidenceSources.map((es) => es.id));
    findings.push(...validateEvidenceReferences(claims, evidenceSourceIds, claimsDir));

    // 5d. Evidence source URL validity check
    findings.push(...validateEvidenceSourceUrls(evidenceSources, evidenceSourcesDir));
  }

  // 6. Apply --strict escalation
  const escalatedFindings = escalateStrictWarnings(findings, strict);

  const result = buildAuditResult({
    command: "wikidata.validate",
    app: audit.siteName,
    findings: escalatedFindings,
    runtimeMs: Date.now() - started,
  });

  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `wikidata.validate: ${result.status}`,
  };
}
