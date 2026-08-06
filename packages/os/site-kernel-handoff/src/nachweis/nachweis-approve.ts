/*
<MODULE_CONTRACT>
<purpose>RFC-0714: nachweis.approve command handler — records human approval, verification level, and legal content check in a Bordbuch entry.</purpose>
<keywords>nachweis, approve, verification, legal, bordbuch, gate</keywords>
<responsibilities>
  <item>Appends nachweis-record Bordbuch entry with approval metadata (verificationLevel, legalContentCheckPassed, approved).</item>
  <item>Satisfies publication gate conditions: recordApproved, verificationLevelMet, legalContentCheckPassed.</item>
  <item>Acquires system and bordbuch locks before modifying state.</item>
  <item>Emits logger.warn if no evidence-source file is found for the slug (non-blocking, informational).</item>
  <item>Supports --dry-run to skip Bordbuch write.</item>
  <item>Skips silently when nachweis entitlement is not resolved.</item>
</responsibilities>
<non-goals>
  <item>Does not read or modify the evidence-source entity — approval is recorded only in the Bordbuch audit trail.</item>
  <item>Does not validate the verification level — the operator is responsible for passing the correct level.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0714: initial nachweis.approve command handler.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { appendBordbuchEntry } from "../bordbuch/bordbuch-io.ts";
import { acquireLock, releaseLock, generateOperationId } from "../werkstatt/index.ts";
import {
  isNachweisEntitled,
  makeSkipResult,
  resolveNachweisCachePath,
  type NachweisApproveResult,
} from "./nachweis-io.ts";

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

function flagBool(input: KernelCommandInput, key: string): boolean {
  const v = input.flags[key];
  return v === true || v === "true";
}

export async function runNachweisApprove(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<NachweisApproveResult>> {
  const { workspaceRoot, logger } = context;
  const systemId = flagString(input, "system") ?? context.site?.name;
  const slug = flagString(input, "slug");
  const verificationLevel = flagString(input, "verification-level");
  const legalContentCheckRaw = flagString(input, "legal-content-check");
  const dryRun = flagBool(input, "dry-run");

  if (!systemId) throw new Error("[nachweis.approve] --system is required");
  if (!slug) throw new Error("[nachweis.approve] --slug is required");
  if (!verificationLevel) throw new Error("[nachweis.approve] --verification-level is required");
  if (!legalContentCheckRaw) throw new Error("[nachweis.approve] --legal-content-check is required");

  const legalContentCheckPassed = legalContentCheckRaw === "passed";

  const entitled = await isNachweisEntitled(workspaceRoot, systemId);
  if (!entitled) {
    return makeSkipResult(
      "nachweis.approve",
      systemId,
    ) as unknown as KernelCommandResult<NachweisApproveResult>;
  }

  const cachePath = await resolveNachweisCachePath(workspaceRoot, systemId);
  const lang = "de";
  const evidenceDir = path.join(
    cachePath,
    "src",
    "content",
    "business-profile",
    lang,
    "evidence-source",
  );
  const evidenceFile = path.join(evidenceDir, `${slug}.md`);

  if (!existsSync(evidenceFile)) {
    logger.warn(
      `[nachweis.approve] no evidence-source file found for slug '${slug}' — Bordbuch entry will still be written`,
    );
  }

  if (dryRun) {
    return {
      data: {
        slug,
        systemId,
        verificationLevel,
        legalContentCheckPassed,
        bordbuchEventId: null,
      },
      exitCode: 0,
      summary: `[nachweis.approve] ${systemId}: DRY RUN — would approve '${slug}' (verification: ${verificationLevel}, legal: ${legalContentCheckRaw})`,
    };
  }

  const operationId = generateOperationId();
  await acquireLock(workspaceRoot, `system:${systemId}`, operationId, "nachweis.approve", "agent");
  await acquireLock(
    workspaceRoot,
    `bordbuch:${systemId}`,
    operationId,
    "nachweis.approve",
    "agent",
  );

  let bordbuchEventId: string;
  try {
    const entry = await appendBordbuchEntry(
      workspaceRoot,
      systemId,
      "nachweis-record",
      `Record '${slug}' approved (verification: ${verificationLevel}, legal: ${legalContentCheckRaw})`,
      "agent",
      {
        writerRole: "nachweis",
        metadata: {
          slug,
          verificationLevel,
          legalContentCheckPassed,
          approved: true,
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
      slug,
      systemId,
      verificationLevel,
      legalContentCheckPassed,
      bordbuchEventId,
    },
    exitCode: 0,
    summary: `[nachweis.approve] ${systemId}: approved '${slug}' (verification: ${verificationLevel}, legal: ${legalContentCheckRaw}, bordbuch: ${bordbuchEventId})`,
  };
}
