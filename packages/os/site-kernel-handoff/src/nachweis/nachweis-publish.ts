/*
<MODULE_CONTRACT>
<purpose>RFC-0707: nachweis.publish command handler — enforces publication gate and transitions record to published.</purpose>
<keywords>nachweis, publish, gate, public, bordbuch</keywords>
<responsibilities>
  <item>Checks publication gate preconditions (consent, integrity, approval, verification level, derivative, legal).</item>
  <item>Accepts N2 with --pilot-n2-exception flag (temporary, removed when N3 is implemented).</item>
  <item>Sets publication.visibility: public on EvidenceSource entity.</item>
  <item>Appends nachweis-record Bordbuch entry.</item>
  <item>Calls nachweis.manifest.generate to regenerate manifest.</item>
  <item>Fails without modifying state if any gate condition is not met.</item>
  <item>Skips silently when nachweis entitlement is not resolved.</item>
</responsibilities>
<non-goals>
  <item>Does not create EvidenceSource entities — that is done during ingest/content authoring.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0707: initial nachweis.publish command handler.</item>
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
import {
  parseMarkdownFrontmatter,
  stringifyMarkdownFrontmatter,
} from "@warpgogol/site-kernel-content";
import { appendBordbuchEntry } from "../bordbuch/bordbuch-io.ts";
import { acquireLock, releaseLock, generateOperationId } from "../werkstatt/index.ts";
import {
  isNachweisEntitled,
  makeSkipResult,
  resolveNachweisCachePath,
  resolvePbpEntityDir,
  type NachweisPublicationGate,
  type NachweisPublishResult,
} from "./nachweis-io.ts";

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

function flagBool(input: KernelCommandInput, key: string): boolean {
  const v = input.flags[key];
  return v === true || v === "true";
}

export async function runNachweisPublish(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<NachweisPublishResult>> {
  const { workspaceRoot, logger } = context;
  const systemId = flagString(input, "system") ?? context.site?.name;
  const slug = flagString(input, "slug");
  const pilotN2Exception = flagBool(input, "pilot-n2-exception");

  if (!systemId) throw new Error("[nachweis.publish] --system is required");
  if (!slug) throw new Error("[nachweis.publish] --slug is required");

  const entitled = await isNachweisEntitled(workspaceRoot, systemId);
  if (!entitled) {
    return makeSkipResult(
      "nachweis.publish",
      systemId,
    ) as unknown as KernelCommandResult<NachweisPublishResult>;
  }

  const cachePath = await resolveNachweisCachePath(workspaceRoot, systemId);
  const lang = "de";

  // Read EvidenceSource entity
  const evidenceDir = resolvePbpEntityDir(cachePath, lang, "evidence-source");
  const evidenceFile = path.join(evidenceDir, `${slug}.md`);

  if (!existsSync(evidenceFile)) {
    throw new Error(
      `[nachweis.publish] NOT_FOUND: evidence-source '${slug}' not found at ${evidenceFile}`,
    );
  }

  const rawEvidence = await fs.readFile(evidenceFile, "utf8");
  const { data: evidenceData, content: evidenceContent } = parseMarkdownFrontmatter(rawEvidence);

  // Read Consent entity
  const consentDir = resolvePbpEntityDir(cachePath, lang, "consent");
  const consentFile = path.join(consentDir, `${slug}.md`);
  let consentData: Record<string, unknown> | undefined;
  if (existsSync(consentFile)) {
    const rawConsent = await fs.readFile(consentFile, "utf8");
    consentData = parseMarkdownFrontmatter(rawConsent).data;
  }

  // Read bordbuch entries for gate evaluation
  const { readBordbuch } = await import("../bordbuch/bordbuch-io.ts");
  const bordbuchEntries = await readBordbuch(workspaceRoot, systemId);
  const nachweisEntries = bordbuchEntries.filter(
    (e) => e.kind === "nachweis-record" || e.kind === "nachweis-consent",
  );

  // Evaluate gate
  const items = evidenceData.items as
    Record<string, { sha256?: string; storage?: string }> | undefined;
  const gate: NachweisPublicationGate = {
    slug,
    allPassed: false,
    consentGranted: consentData?.consentStatus === "granted",
    sourceIntegrityVerified:
      items != null && Object.values(items).some((item) => item.sha256 != null),
    recordApproved: nachweisEntries.some(
      (e) => e.kind === "nachweis-record" && e.summary.includes("approved"),
    ),
    verificationLevelMet: pilotN2Exception
      ? nachweisEntries.some(
          (e) =>
            e.kind === "nachweis-record" &&
            (e.metadata?.verificationLevel === "N2" || e.metadata?.verificationLevel === "N3"),
        )
      : nachweisEntries.some(
          (e) => e.kind === "nachweis-record" && e.metadata?.verificationLevel === "N3",
        ),
    publicDerivativeReady:
      items != null && Object.values(items).some((item) => item.storage === "public"),
    legalContentCheckPassed: nachweisEntries.some(
      (e) => e.kind === "nachweis-record" && e.metadata?.legalContentCheckPassed === true,
    ),
  };
  gate.allPassed =
    gate.consentGranted &&
    gate.sourceIntegrityVerified &&
    gate.recordApproved &&
    gate.verificationLevelMet &&
    gate.publicDerivativeReady &&
    gate.legalContentCheckPassed;

  if (!gate.allPassed) {
    return {
      data: {
        recordId: (evidenceData.recordId as string | undefined) ?? `nr_${slug}`,
        systemId,
        published: false,
        gateResult: gate,
        bordbuchEventId: null,
      },
      exitCode: 1,
      summary: `[nachweis.publish] ${systemId}: gate failed for '${slug}' — consent: ${gate.consentGranted}, integrity: ${gate.sourceIntegrityVerified}, approved: ${gate.recordApproved}, verification: ${gate.verificationLevelMet}, derivative: ${gate.publicDerivativeReady}, legal: ${gate.legalContentCheckPassed}`,
    };
  }

  // Gate passed — update EvidenceSource publication
  const publication = (evidenceData.publication as Record<string, unknown> | undefined) ?? {};
  publication.visibility = "public";
  publication.publishedAt = new Date().toISOString();
  evidenceData.publication = publication;

  const updatedContent = stringifyMarkdownFrontmatter(evidenceContent, evidenceData);
  await fs.writeFile(evidenceFile, updatedContent, "utf8");

  // Append Bordbuch entry
  const operationId = generateOperationId();
  await acquireLock(workspaceRoot, `system:${systemId}`, operationId, "nachweis.publish", "agent");
  await acquireLock(
    workspaceRoot,
    `bordbuch:${systemId}`,
    operationId,
    "nachweis.publish",
    "agent",
  );

  let bordbuchEventId: string | null = null;
  try {
    const entry = await appendBordbuchEntry(
      workspaceRoot,
      systemId,
      "nachweis-record",
      `Published '${slug}'`,
      "agent",
      {
        writerRole: "nachweis",
        metadata: {
          slug,
          verificationLevel: pilotN2Exception ? "N2" : "N3",
          pilotN2Exception,
          publishedAt: publication.publishedAt,
        },
      },
    );
    bordbuchEventId = entry.id;
  } finally {
    await releaseLock(workspaceRoot, `bordbuch:${systemId}`);
    await releaseLock(workspaceRoot, `system:${systemId}`);
  }

  // Regenerate manifest
  await executeKernelCommand({
    workspaceRoot,
    commandName: "nachweis.manifest.generate",
    siteName: systemId,
    argv: [`--system=${systemId}`],
  });

  logger.info(`[nachweis.publish] published '${slug}' — regenerating manifest`);

  return {
    data: {
      recordId: (evidenceData.recordId as string | undefined) ?? `nr_${slug}`,
      systemId,
      published: true,
      gateResult: gate,
      bordbuchEventId,
    },
    exitCode: 0,
    summary: `[nachweis.publish] ${systemId}: published '${slug}' (bordbuch: ${bordbuchEventId})`,
  };
}
