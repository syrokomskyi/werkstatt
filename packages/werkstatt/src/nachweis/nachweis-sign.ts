/*
<MODULE_CONTRACT>
<purpose>RFC-0715: nachweis.sign command handler — signs the core evidence fields of a Nachweis record with an Ed25519 operator key.</purpose>
<keywords>nachweis, sign, ed25519, operator, signature, bordbuch</keywords>
<responsibilities>
  <item>Reads the EvidenceSource entity and extracts core evidence fields {recordId, slug, kind, name, items}.</item>
  <item>Canonicalizes the payload via stable JSON stringify (sorted keys, no whitespace).</item>
  <item>Signs the canonical bytes with @noble/ed25519 using the operator private key.</item>
  <item>Appends nachweis-signed Bordbuch entry with signature metadata.</item>
  <item>Idempotent: if a nachweis-signed entry already exists for the slug, returns the existing signature.</item>
  <item>Skips silently when nachweis entitlement is not resolved.</item>
</responsibilities>
<non-goals>
  <item>Does not timestamp — that is nachweis.timestamp.</item>
  <item>Does not verify — that is nachweis.verify-signature.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0715: initial nachweis.sign command handler.</item>
  <item>RFC-0715 review fix: use byteHash from @warpgogol/fingerprint for payloadHash (DNA-53). Import flagString/flagBool from nachweis-n3-types.ts.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import * as ed from "@noble/ed25519";
import { stableStringify, byteHash } from "@warpgogol/werkstatt/fingerprint";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";
import { appendAndCommitBordbuch } from "../bordbuch/bordbuch-commit-helper.ts";
import { readBordbuch } from "../bordbuch/bordbuch-io.ts";
import { acquireLock, releaseLock, generateOperationId } from "../werkstatt/index.ts";
import {
  isNachweisEntitled,
  makeSkipResult,
  resolveNachweisCachePath,
  resolveDefaultLang,
  resolvePbpEntityDir,
  flagString,
  flagBool,
  type NachweisSignResult,
} from "./nachweis-n3-types.ts";

export interface NachweisRecordPayload {
  recordId: string;
  slug: string;
  kind: string;
  name: string;
  items: Record<string, unknown>;
}

export function canonicalRecordPayload(payload: NachweisRecordPayload): Uint8Array {
  const canonical = stableStringify({
    recordId: payload.recordId,
    slug: payload.slug,
    kind: payload.kind,
    name: payload.name,
    items: payload.items,
  });
  return new TextEncoder().encode(canonical);
}

export async function runNachweisSign(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<NachweisSignResult>> {
  const { workspaceRoot } = context;
  const systemId = flagString(input, "system") ?? context.site?.name;
  const slug = flagString(input, "slug");
  const keyFilePath = flagString(input, "key-file");
  const dryRun = flagBool(input, "dry-run");

  if (!systemId) throw new Error("[nachweis.sign] --system is required");
  if (!slug) throw new Error("[nachweis.sign] --slug is required");
  if (!keyFilePath) throw new Error("[nachweis.sign] --key-file is required");

  const entitled = await isNachweisEntitled(workspaceRoot, systemId);
  if (!entitled) {
    return makeSkipResult(
      "nachweis.sign",
      systemId,
    ) as unknown as KernelCommandResult<NachweisSignResult>;
  }

  if (!existsSync(keyFilePath)) {
    throw new Error(
      `[nachweis.sign] KEY_NOT_FOUND: private key file '${keyFilePath}' does not exist. Run nachweis.key.ensure first.`,
    );
  }

  const privateKeyHex = (await fs.readFile(keyFilePath, "utf8")).trim();
  const privateKeyBytes = new Uint8Array(Buffer.from(privateKeyHex, "hex"));

  const cachePath = await resolveNachweisCachePath(workspaceRoot, systemId);
  const lang = await resolveDefaultLang(cachePath);
  const evidenceDir = resolvePbpEntityDir(cachePath, lang, "evidence-source");
  const evidenceFile = path.join(evidenceDir, `${slug}.md`);

  if (!existsSync(evidenceFile)) {
    throw new Error(
      `[nachweis.sign] NOT_FOUND: evidence-source '${slug}' not found at ${evidenceFile}`,
    );
  }

  const rawEvidence = await fs.readFile(evidenceFile, "utf8");
  const { data: evidenceData } = parseMarkdownFrontmatter(rawEvidence);

  const payload: NachweisRecordPayload = {
    recordId: (evidenceData.recordId as string | undefined) ?? `nr_${slug}`,
    slug,
    kind: (evidenceData.kind as string | undefined) ?? "evidence",
    name: (evidenceData.name as string | undefined) ?? slug,
    items: (evidenceData.items as Record<string, unknown> | undefined) ?? {},
  };

  const canonicalBytes = canonicalRecordPayload(payload);
  const signatureBytes = await ed.signAsync(canonicalBytes, privateKeyBytes);
  const signatureHex = Buffer.from(signatureBytes).toString("hex");

  const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes);
  const publicKeyHex = Buffer.from(publicKeyBytes).toString("hex");

  // Idempotency: check for existing nachweis-signed entry
  const bordbuchEntries = await readBordbuch(workspaceRoot, systemId);
  const existingSigned = bordbuchEntries.find(
    (e) =>
      e.kind === "nachweis-signed" &&
      e.metadata?.slug === slug &&
      e.metadata?.signatureHex === signatureHex,
  );
  if (existingSigned) {
    return {
      data: {
        slug,
        systemId,
        signatureHex,
        publicKeyHex,
        bordbuchEventId: existingSigned.id,
        idempotent: true,
      },
      exitCode: 0,
      summary: `[nachweis.sign] ${systemId}: already signed '${slug}' (bordbuch: ${existingSigned.id})`,
    };
  }

  if (dryRun) {
    return {
      data: {
        slug,
        systemId,
        signatureHex,
        publicKeyHex,
        bordbuchEventId: null,
        idempotent: false,
      },
      exitCode: 0,
      summary: `[nachweis.sign] ${systemId}: DRY RUN — would sign '${slug}'`,
    };
  }

  const operationId = generateOperationId();
  await acquireLock(workspaceRoot, `system:${systemId}`, operationId, "nachweis.sign", "agent");
  await acquireLock(workspaceRoot, `bordbuch:${systemId}`, operationId, "nachweis.sign", "agent");

  let bordbuchEventId: string;
  try {
    const { entry } = await appendAndCommitBordbuch(
      workspaceRoot,
      systemId,
      "nachweis-signed",
      `Record '${slug}' signed by operator`,
      "agent",
      {
        writerRole: "nachweis",
        metadata: {
          slug,
          signatureHex,
          publicKeyHex,
          payloadHash: byteHash(canonicalBytes).replace("sha256:", ""),
        },
      },
      `Bordbuch: nachweis-signed ${systemId} ${slug}`,
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
      signatureHex,
      publicKeyHex,
      bordbuchEventId,
      idempotent: false,
    },
    exitCode: 0,
    summary: `[nachweis.sign] ${systemId}: signed '${slug}' (bordbuch: ${bordbuchEventId})`,
  };
}
