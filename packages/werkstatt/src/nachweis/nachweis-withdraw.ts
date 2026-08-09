/*
<MODULE_CONTRACT>
<purpose>RFC-0707: nachweis.withdraw command handler — revokes consent, sets withdrawn status, regenerates manifest.</purpose>
<keywords>nachweis, withdraw, revoke, consent, bordbuch, manifest</keywords>
<responsibilities>
  <item>Sets consent.status: revoked, record_status: withdrawn, publication.visibility: private.</item>
  <item>Appends nachweis-consent and nachweis-record Bordbuch entries.</item>
  <item>Regenerates manifest to remove withdrawn record from public output.</item>
  <item>Idempotent: if already withdrawn, returns no-op result.</item>
  <item>Does NOT delete R2 object — personal data persists as audit trail.</item>
  <item>Skips silently when nachweis entitlement is not resolved.</item>
</responsibilities>
<non-goals>
  <item>Does not implement data retention policy — deferred to future RFC.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0707: initial nachweis.withdraw command handler.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { executeKernelCommand } from "@warpgogol/werkstatt/kernel";
import {
  parseMarkdownFrontmatter,
  stringifyMarkdownFrontmatter,
} from "@warpgogol/werkstatt-site/content";
import { appendBatchAndCommitBordbuch } from "../bordbuch/bordbuch-commit-helper.ts";
import { acquireLock, releaseLock, generateOperationId } from "../werkstatt/index.ts";
import {
  isNachweisEntitled,
  makeSkipResult,
  resolveNachweisCachePath,
  resolvePbpEntityDir,
  resolveDefaultLang,
  type NachweisWithdrawResult,
} from "./nachweis-io.ts";

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

export async function runNachweisWithdraw(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<NachweisWithdrawResult>> {
  const { workspaceRoot, logger } = context;
  const systemId = flagString(input, "system") ?? context.site?.name;
  const slug = flagString(input, "slug");
  const reason = flagString(input, "reason") ?? "withdrawn by operator";

  if (!systemId) throw new Error("[nachweis.withdraw] --system is required");
  if (!slug) throw new Error("[nachweis.withdraw] --slug is required");

  const entitled = await isNachweisEntitled(workspaceRoot, systemId);
  if (!entitled) {
    return makeSkipResult(
      "nachweis.withdraw",
      systemId,
    ) as unknown as KernelCommandResult<NachweisWithdrawResult>;
  }

  const cachePath = await resolveNachweisCachePath(workspaceRoot, systemId);
  const lang = await resolveDefaultLang(cachePath);

  // Read EvidenceSource entity
  const evidenceDir = resolvePbpEntityDir(cachePath, lang, "evidence-source");
  const evidenceFile = path.join(evidenceDir, `${slug}.md`);

  if (!existsSync(evidenceFile)) {
    throw new Error(
      `[nachweis.withdraw] NOT_FOUND: evidence-source '${slug}' not found at ${evidenceFile}`,
    );
  }

  const rawEvidence = await fs.readFile(evidenceFile, "utf8");
  const { data: evidenceData, content: evidenceContent } = parseMarkdownFrontmatter(rawEvidence);

  // Check if already withdrawn (idempotent)
  const currentRecordStatus = (evidenceData as Record<string, unknown>).recordStatus as
    string | undefined;
  if (currentRecordStatus === "withdrawn") {
    return {
      data: {
        recordId: (evidenceData.recordId as string | undefined) ?? `nr_${slug}`,
        systemId,
        withdrawn: false,
        alreadyWithdrawn: true,
        bordbuchEventIds: [],
      },
      exitCode: 0,
      summary: `[nachweis.withdraw] ${systemId}: '${slug}' already withdrawn — no-op`,
    };
  }

  // Update EvidenceSource: set record_status and publication.visibility
  (evidenceData as Record<string, unknown>).recordStatus = "withdrawn";
  const publication =
    ((evidenceData as Record<string, unknown>).publication as
      Record<string, unknown> | undefined) ?? {};
  publication.visibility = "private";
  (evidenceData as Record<string, unknown>).publication = publication;

  const updatedContent = stringifyMarkdownFrontmatter(evidenceContent, evidenceData);
  await fs.writeFile(evidenceFile, updatedContent, "utf8");

  // Update Consent entity if it exists
  const consentDir = resolvePbpEntityDir(cachePath, lang, "consent");
  const consentFile = path.join(consentDir, `${slug}.md`);
  if (existsSync(consentFile)) {
    const rawConsent = await fs.readFile(consentFile, "utf8");
    const { data: consentData, content: consentContent } = parseMarkdownFrontmatter(rawConsent);
    consentData.consentStatus = "revoked";
    const updatedConsent = stringifyMarkdownFrontmatter(consentContent, consentData);
    await fs.writeFile(consentFile, updatedConsent, "utf8");
  }

  // Append Bordbuch entries
  const operationId = generateOperationId();
  await acquireLock(workspaceRoot, `system:${systemId}`, operationId, "nachweis.withdraw", "agent");
  await acquireLock(
    workspaceRoot,
    `bordbuch:${systemId}`,
    operationId,
    "nachweis.withdraw",
    "agent",
  );

  const bordbuchEventIds: string[] = [];
  try {
    const { entries } = await appendBatchAndCommitBordbuch(
      workspaceRoot,
      systemId,
      [
        {
          kind: "nachweis-consent",
          summary: `Consent revoked for '${slug}': ${reason}`,
          actor: "agent",
          options: {
            writerRole: "nachweis",
            metadata: { slug, reason, action: "withdraw" },
          },
        },
        {
          kind: "nachweis-record",
          summary: `Withdrawn '${slug}': ${reason}`,
          actor: "agent",
          options: {
            writerRole: "nachweis",
            metadata: { slug, reason, action: "withdraw" },
          },
        },
      ],
      `Bordbuch: nachweis-withdraw ${systemId} ${slug}`,
    );
    for (const e of entries) {
      bordbuchEventIds.push(e.id);
    }
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

  logger.info(`[nachweis.withdraw] withdrawn '${slug}' — manifest regenerated`);

  return {
    data: {
      recordId: (evidenceData.recordId as string | undefined) ?? `nr_${slug}`,
      systemId,
      withdrawn: true,
      alreadyWithdrawn: false,
      bordbuchEventIds,
    },
    exitCode: 0,
    summary: `[nachweis.withdraw] ${systemId}: withdrawn '${slug}' (bordbuch: ${bordbuchEventIds.length} entries)`,
  };
}
