/*
<MODULE_CONTRACT>
<purpose>RFC-0707: nachweis.consent.update command handler — updates PBP Consent entity and appends Bordbuch entry.</purpose>
<keywords>nachweis, consent, update, bordbuch, pbp</keywords>
<responsibilities>
  <item>Updates PBP Consent entity's consentStatus field in cache clone.</item>
  <item>Appends nachweis-consent Bordbuch entry with metadata (previous/new status, method, actor).</item>
  <item>Acquires system and bordbuch locks before modifying state.</item>
  <item>Skips silently when nachweis entitlement is not resolved.</item>
</responsibilities>
<non-goals>
  <item>Does not validate consent text or legal sufficiency — that is a human review step.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0707: initial nachweis.consent.update command handler.</item>
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
  type NachweisConsentUpdateResult,
} from "./nachweis-io.ts";

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

export async function runNachweisConsentUpdate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<NachweisConsentUpdateResult>> {
  const { workspaceRoot, logger } = context;
  const systemId = flagString(input, "system") ?? context.site?.name;
  const consentId = flagString(input, "consent-id");
  const newStatus = flagString(input, "status");
  const method = flagString(input, "method") ?? "none";

  if (!systemId) throw new Error("[nachweis.consent.update] --system is required");
  if (!consentId) throw new Error("[nachweis.consent.update] --consent-id is required");
  if (!newStatus) throw new Error("[nachweis.consent.update] --status is required");

  const entitled = await isNachweisEntitled(workspaceRoot, systemId);
  if (!entitled) {
    return makeSkipResult(
      "nachweis.consent.update",
      systemId,
    ) as unknown as KernelCommandResult<NachweisConsentUpdateResult>;
  }

  const cachePath = await resolveNachweisCachePath(workspaceRoot, systemId);
  const lang = "de";
  const consentDir = path.join(cachePath, "src", "content", "business-profile", lang, "consent");
  const consentFile = path.join(consentDir, `${consentId}.md`);

  if (!existsSync(consentFile)) {
    throw new Error(
      `[nachweis.consent.update] NOT_FOUND: consent '${consentId}' not found at ${consentFile}`,
    );
  }

  const raw = await fs.readFile(consentFile, "utf8");
  const { data, content } = parseMarkdownFrontmatter(raw);
  const previousStatus = (data.consentStatus as string | undefined) ?? "not_requested";

  // Update consent fields
  data.consentStatus = newStatus;
  data.method = method;
  if (newStatus === "granted") {
    data.grantedAt = new Date().toISOString();
  } else if (newStatus === "revoked") {
    // Keep grantedAt as-is for audit trail
  }

  const updatedContent = stringifyMarkdownFrontmatter(content, data);
  await fs.writeFile(consentFile, updatedContent, "utf8");

  logger.info(
    `[nachweis.consent.update] updated consent '${consentId}': ${previousStatus} → ${newStatus}`,
  );

  // Append Bordbuch entry
  const operationId = generateOperationId();
  await acquireLock(
    workspaceRoot,
    `system:${systemId}`,
    operationId,
    "nachweis.consent.update",
    "agent",
  );
  await acquireLock(
    workspaceRoot,
    `bordbuch:${systemId}`,
    operationId,
    "nachweis.consent.update",
    "agent",
  );

  let bordbuchEventId: string;
  try {
    const entry = await appendBordbuchEntry(
      workspaceRoot,
      systemId,
      "nachweis-consent",
      `Consent '${consentId}' updated: ${previousStatus} → ${newStatus}`,
      "agent",
      {
        writerRole: "nachweis",
        metadata: {
          consentId,
          previousStatus,
          newStatus,
          method,
        },
      },
    );
    bordbuchEventId = entry.id;
  } finally {
    await releaseLock(workspaceRoot, `bordbuch:${systemId}`);
    await releaseLock(workspaceRoot, `system:${systemId}`);
  }

  return {
    data: {
      consentId,
      systemId,
      previousStatus,
      newStatus,
      bordbuchEventId,
    },
    exitCode: 0,
    summary: `[nachweis.consent.update] ${systemId}: consent '${consentId}' ${previousStatus} → ${newStatus} (bordbuch: ${bordbuchEventId})`,
  };
}
