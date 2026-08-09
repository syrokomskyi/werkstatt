/*
<MODULE_CONTRACT>
<purpose>RFC-0715: nachweis.verify-signature command handler — verifies the Ed25519 operator signature and RFC 3161 timestamp for a Nachweis record.</purpose>
<keywords>nachweis, verify, signature, ed25519, timestamp, rfc3161</keywords>
<responsibilities>
  <item>Reads the nachweis-signed and nachweis-timestamped Bordbuch entries for the slug.</item>
  <item>Reconstructs the canonical record payload from the EvidenceSource entity.</item>
  <item>Verifies the Ed25519 signature against the published public key.</item>
  <item>Reports timestamp token presence (does not cryptographically verify the TSA token — deferred).</item>
  <item>Read-only command — does not modify state.</item>
  <item>Skips silently when nachweis entitlement is not resolved.</item>
</responsibilities>
<non-goals>
  <item>Does not cryptographically verify the RFC 3161 timestamp token against the TSA certificate chain — that requires TSA trust anchor configuration and is deferred to a future RFC.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0715: initial nachweis.verify-signature command handler.</item>
  <item>RFC-0715 review fix: import flagString from nachweis-n3-types.ts.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import * as ed from "@noble/ed25519";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { parseMarkdownFrontmatter } from "@warpgogol/site-kernel-content";
import { readBordbuch } from "../bordbuch/bordbuch-io.ts";
import {
  isNachweisEntitled,
  makeSkipResult,
  resolveNachweisCachePath,
  resolveDefaultLang,
  resolvePbpEntityDir,
  flagString,
  type NachweisVerifySignatureResult,
} from "./nachweis-n3-types.ts";
import { canonicalRecordPayload, type NachweisRecordPayload } from "./nachweis-sign.ts";

export async function runNachweisVerifySignature(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<NachweisVerifySignatureResult>> {
  const { workspaceRoot } = context;
  const systemId = flagString(input, "system") ?? context.site?.name;
  const slug = flagString(input, "slug");

  if (!systemId) throw new Error("[nachweis.verify-signature] --system is required");
  if (!slug) throw new Error("[nachweis.verify-signature] --slug is required");

  const entitled = await isNachweisEntitled(workspaceRoot, systemId);
  if (!entitled) {
    return makeSkipResult(
      "nachweis.verify-signature",
      systemId,
    ) as unknown as KernelCommandResult<NachweisVerifySignatureResult>;
  }

  const cachePath = await resolveNachweisCachePath(workspaceRoot, systemId);
  const lang = await resolveDefaultLang(cachePath);
  const evidenceDir = resolvePbpEntityDir(cachePath, lang, "evidence-source");
  const evidenceFile = path.join(evidenceDir, `${slug}.md`);

  if (!existsSync(evidenceFile)) {
    throw new Error(
      `[nachweis.verify-signature] NOT_FOUND: evidence-source '${slug}' not found at ${evidenceFile}`,
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

  const bordbuchEntries = await readBordbuch(workspaceRoot, systemId);
  const signedEntry = bordbuchEntries.find(
    (e) => e.kind === "nachweis-signed" && e.metadata?.slug === slug,
  );
  const timestampedEntry = bordbuchEntries.find(
    (e) => e.kind === "nachweis-timestamped" && e.metadata?.slug === slug,
  );

  if (!signedEntry) {
    return {
      data: {
        slug,
        systemId,
        signatureValid: false,
        timestampVerified: false,
        publicKeyHex: null,
        details: "No nachweis-signed Bordbuch entry found for this slug.",
      },
      exitCode: 1,
      summary: `[nachweis.verify-signature] ${systemId}: FAIL — no signature found for '${slug}'`,
    };
  }

  const signatureHex = signedEntry.metadata?.signatureHex as string | undefined;
  const publicKeyHex = signedEntry.metadata?.publicKeyHex as string | undefined;

  if (!signatureHex || !publicKeyHex) {
    return {
      data: {
        slug,
        systemId,
        signatureValid: false,
        timestampVerified: false,
        publicKeyHex: publicKeyHex ?? null,
        details: "Signature or public key metadata missing from Bordbuch entry.",
      },
      exitCode: 1,
      summary: `[nachweis.verify-signature] ${systemId}: FAIL — incomplete signature metadata for '${slug}'`,
    };
  }

  const signatureBytes = new Uint8Array(Buffer.from(signatureHex, "hex"));
  const publicKeyBytes = new Uint8Array(Buffer.from(publicKeyHex, "hex"));

  let signatureValid = false;
  try {
    signatureValid = await ed.verifyAsync(signatureBytes, canonicalBytes, publicKeyBytes);
  } catch {
    signatureValid = false;
  }

  const timestampVerified = timestampedEntry != null;

  const details = signatureValid
    ? timestampVerified
      ? "Signature valid, RFC 3161 timestamp token present."
      : "Signature valid, but no RFC 3161 timestamp token found."
    : "Signature verification failed — canonical payload does not match.";

  return {
    data: {
      slug,
      systemId,
      signatureValid,
      timestampVerified,
      publicKeyHex,
      details,
    },
    exitCode: signatureValid ? 0 : 1,
    summary: `[nachweis.verify-signature] ${systemId}: ${signatureValid ? "PASS" : "FAIL"} — '${slug}' (signature: ${signatureValid}, timestamp: ${timestampVerified})`,
  };
}
