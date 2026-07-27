/*
<MODULE_CONTRACT>
<purpose>Facilitates the generation and rotation of Ed25519 keypairs for secure application authentication.</purpose>
<non-goals>
  <item>Do not handle raw key parsing or validation beyond schema checks.</item>
  <item>Do not manage application configuration or orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY>
*/

/**
 * @gogol/passport — Key rotation
 *
 * DNA-34 / RFC-0028
 *
 * SECURITY CONTRACT:
 * - Private key is NEVER written to disk. It is printed to stdout ONCE
 *   for the engineer to paste into GitHub Actions secret PASSPORT_SIGNING_KEY.
 * - The public key file is written to apps/<app>/public/.well-known/cosmic-passport-key.json
 *   and committed to the repository.
 * - Old public keys remain in the file (active: false) for historical verification.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { generateKeypair } from "./sign.ts";
import { PassportPublicKeyFileSchema } from "./schema.ts";
import type { PassportPublicKeyFile, PassportPublicKeyEntry } from "./schema.ts";

export interface KeyRotateOptions {
  /** Absolute path to the app directory */
  appDirectory: string;
  /** App identifier (from system.yaml) */
  appId: string;
  /** If true, this is the initial key generation (no previous key file exists) */
  initial?: boolean;
}

export interface KeyRotateResult {
  /** New key version string (e.g. "v2") */
  newVersion: string;
  /** New public key multibase — written to key file */
  publicKeyMultibase: string;
  /**
   * Private key as hex string — print to stdout and discard.
   * Store as GitHub Actions secret PASSPORT_SIGNING_KEY.
   * NEVER log, write, or return this beyond the immediate CLI call.
   */
  privateKeyHex: string;
  /** Path where the updated public key file was written */
  publicKeyFilePath: string;
}

/**
 * Generate a new Ed25519 keypair and update the public key file.
 *
 * Steps:
 *   1. Generate new keypair
 *   2. Load existing public key file (if any)
 *   3. Mark all existing keys as active: false
 *   4. Append new key as active: true
 *   5. Write updated file to apps/<app>/public/.well-known/cosmic-passport-key.json
 *   6. Return private key for secure storage (never written to disk)
 *
 * After calling this function:
 *   - Update system.yaml release.passport.keyVersion to the new version
 *   - Paste the returned privateKeyHex into GitHub Actions secret PASSPORT_SIGNING_KEY
 *   - Commit the updated public key file
 */
export async function rotateKey(options: KeyRotateOptions): Promise<KeyRotateResult> {
  const { appDirectory, appId, initial = false } = options;
  const publicKeyFilePath = join(appDirectory, "public", ".well-known", "cosmic-passport-key.json");

  // Step 1: Generate new keypair
  const { privateKeyHex, publicKeyMultibase } = await generateKeypair();

  // Step 2: Load existing key file
  let existingKeys: PassportPublicKeyEntry[] = [];
  let nextVersionNumber = 1;

  if (!initial) {
    try {
      const raw = await readFile(publicKeyFilePath, "utf8");
      const existing = PassportPublicKeyFileSchema.parse(JSON.parse(raw));
      existingKeys = existing.keys;

      // Determine next version number
      const versionNumbers = existingKeys
        .map((k) => parseInt(k.version.replace("v", ""), 10))
        .filter((n) => !isNaN(n));
      nextVersionNumber = Math.max(0, ...versionNumbers) + 1;
    } catch {
      // No existing file — treat as initial
    }
  }

  const newVersion = `v${nextVersionNumber}`;

  // Step 3: Mark existing keys inactive
  const updatedKeys: PassportPublicKeyEntry[] = existingKeys.map((k) => ({
    ...k,
    active: false,
  }));

  // Step 4: Append new key
  updatedKeys.push({
    version: newVersion,
    active: true,
    type: "Ed25519VerificationKey2020",
    publicKeyMultibase,
    createdAt: new Date().toISOString(),
  });

  // Step 5: Write updated file
  const updatedFile: PassportPublicKeyFile = {
    schemaVersion: "1.0",
    appId,
    keys: updatedKeys,
  };

  await mkdir(dirname(publicKeyFilePath), { recursive: true });
  await writeFile(publicKeyFilePath, JSON.stringify(updatedFile, null, 2), "utf8");

  return {
    newVersion,
    publicKeyMultibase,
    privateKeyHex,
    publicKeyFilePath,
  };
}
