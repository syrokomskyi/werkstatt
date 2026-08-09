/*
<MODULE_CONTRACT>
<purpose>Validates passport artifacts by checking their structure, signatures, and system integrity.</purpose>
<non-goals>
  <item>Do not create or modify passport artifacts or schemas.</item>
  <item>Do not manage public key storage beyond the verification process.</item>
  <item>Do not perform external API calls or network requests.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Refined Compass scaffolding to accurately reflect the verification module's responsibilities and boundaries.</item>
</CHANGE_SUMMARY>
*/

/**
 * @warpgogol/werkstatt-site/passport — Passport verification
 *
 * DNA-34 / RFC-0028
 *
 * Verifies:
 *   1. Passport JSON parses against PassportSchema
 *   2. VC proof signature is valid against the published public key
 *   3. composition.systemHash matches a recomputed hash of current system.yaml
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";
import { PassportSchema, PassportPublicKeyFileSchema } from "./schema.ts";
import { verifyCredential, type CredentialSubjectDigest } from "./sign.ts";

export interface VerifyResult {
  appId: string;
  issuedAt: string;
  commitSha: string;
  systemHashMatch: boolean;
  signatureValid: boolean;
  keyVersion: string;
  errors: string[];
}

/**
 * Verify a passport artifact.
 *
 * @param artifactDirectory — path to dist/ (contains .well-known/)
 * @param appDirectory      — path to the app root (contains system.yaml and public/.well-known/)
 */
export async function verifyPassport(
  artifactDirectory: string,
  appDirectory: string,
): Promise<VerifyResult> {
  const errors: string[] = [];

  // 1. Read and parse passport.json
  const passportPath = join(artifactDirectory, ".well-known", "cosmic-passport.json");
  let passportRaw: string;
  try {
    passportRaw = await readFile(passportPath, "utf8");
  } catch {
    return {
      appId: "unknown",
      issuedAt: "",
      commitSha: "",
      systemHashMatch: false,
      signatureValid: false,
      keyVersion: "",
      errors: [`PV-01: passport.json not found at ${passportPath}`],
    };
  }

  const parseResult = PassportSchema.safeParse(JSON.parse(passportRaw));
  if (!parseResult.success) {
    return {
      appId: "unknown",
      issuedAt: "",
      commitSha: "",
      systemHashMatch: false,
      signatureValid: false,
      keyVersion: "",
      errors: parseResult.error.issues.map((i) => `PV-02: ${i.path.join(".")}: ${i.message}`),
    };
  }

  const passport = parseResult.data;
  const prov = passport.provenance;
  const vc = prov.verifiableCredential;

  // 2. Load public key file
  const publicKeyPath = join(appDirectory, "public", ".well-known", "cosmic-passport-key.json");
  let publicKeyFile: ReturnType<typeof PassportPublicKeyFileSchema.parse>;
  try {
    const keyRaw = await readFile(publicKeyPath, "utf8");
    publicKeyFile = PassportPublicKeyFileSchema.parse(JSON.parse(keyRaw));
  } catch {
    errors.push(`PV-03: cosmic-passport-key.json not found at ${publicKeyPath}`);
    return {
      appId: passport.appId,
      issuedAt: passport.issuedAt,
      commitSha: prov.commitSha,
      systemHashMatch: false,
      signatureValid: false,
      keyVersion: prov.keyVersion,
      errors,
    };
  }

  // Find the matching key version
  const keyEntry = publicKeyFile.keys.find((k) => k.version === prov.keyVersion);
  if (!keyEntry) {
    errors.push(`PV-04: Key version "${prov.keyVersion}" not found in public key file`);
    return {
      appId: passport.appId,
      issuedAt: passport.issuedAt,
      commitSha: prov.commitSha,
      systemHashMatch: false,
      signatureValid: false,
      keyVersion: prov.keyVersion,
      errors,
    };
  }

  // 3. Verify VC signature
  const subject: CredentialSubjectDigest = {
    appId: passport.appId,
    systemHash: passport.composition.systemHash,
    commitSha: prov.commitSha,
    issuedAt: passport.issuedAt,
  };

  let signatureValid = false;
  try {
    signatureValid = await verifyCredential(subject, vc.proof, keyEntry.publicKeyMultibase);
  } catch (err) {
    errors.push(`PV-05: Signature verification threw: ${(err as Error).message}`);
  }

  if (!signatureValid && errors.length === 0) {
    errors.push("PV-05: VC signature is invalid");
  }

  // 4. Verify system hash against current system manifest
  let systemHashMatch = false;
  try {
    const systemResult = await loadSystemManifest(join(appDirectory, "src", "content"));
    const systemRaw = await readFile(systemResult.filePath, "utf8");
    const recomputedHash = "sha256:" + createHash("sha256").update(systemRaw).digest("hex");
    systemHashMatch = recomputedHash === passport.composition.systemHash;
    if (!systemHashMatch) {
      errors.push(
        `PV-06: systemHash mismatch — passport has ${passport.composition.systemHash} ` +
          `but current system manifest hashes to ${recomputedHash}`,
      );
    }
  } catch {
    errors.push("PV-06: Could not read system manifest to verify systemHash");
  }

  return {
    appId: passport.appId,
    issuedAt: passport.issuedAt,
    commitSha: prov.commitSha,
    systemHashMatch,
    signatureValid,
    keyVersion: prov.keyVersion,
    errors,
  };
}
