/*
<MODULE_CONTRACT>
  <purpose>
  RFC-0558: Studio Gate auth middleware — verifies VC tokens from MCP metadata
  against werkstatt.identity.json before dispatching to Site OS commands.
  Supports permissive (warn-only) and enforced (reject) modes.
  </purpose>
  <non-goals>
    <item>Does not execute Site OS commands — that remains in executor.ts.</item>
    <item>Does not handle key management — public keys are read from werkstatt.identity.json.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0558: initial auth middleware for Studio Gate.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  WerkstattIdentityConfigSchema,
  verifyIdentityCredential,
  type WerkstattIdentityConfig,
  type WerkstattCredential,
} from "@warpgogol/passport";

export interface StudioGateAuthResult {
  authenticated: boolean;
  actorId?: string;
  error?: string;
}

export const IDENTITY_CONFIG_FILENAME = "werkstatt.identity.json";

function identityConfigPath(werkstattRoot: string): string {
  return join(werkstattRoot, IDENTITY_CONFIG_FILENAME);
}

export async function loadIdentityConfig(
  werkstattRoot: string,
): Promise<WerkstattIdentityConfig | undefined> {
  try {
    const raw = await readFile(identityConfigPath(werkstattRoot), "utf-8");
    return WerkstattIdentityConfigSchema.parse(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function extractCredentialId(meta: Record<string, unknown> | undefined): string | undefined {
  if (!meta) return undefined;
  const identity = meta["identity"];
  if (typeof identity === "string") return identity;
  if (typeof identity === "object" && identity !== null) {
    const credentialId = (identity as Record<string, unknown>)["credentialId"];
    if (typeof credentialId === "string") return credentialId;
  }
  return undefined;
}

function findCredential(
  config: WerkstattIdentityConfig,
  credentialId: string,
): WerkstattCredential | undefined {
  return config.issuedCredentials.find((c) => c.credentialId === credentialId);
}

function isRevoked(config: WerkstattIdentityConfig, credentialId: string): boolean {
  return config.revokedCredentialIds.includes(credentialId);
}

export async function verifyAuthFromMeta(
  meta: Record<string, unknown> | undefined,
  werkstattRoot: string,
): Promise<StudioGateAuthResult> {
  const config = await loadIdentityConfig(werkstattRoot);
  if (!config) {
    return {
      authenticated: false,
      error: "identity-not-configured",
    };
  }

  if (config.authMode === "permissive") {
    const credentialId = extractCredentialId(meta);
    if (!credentialId) {
      return { authenticated: false, error: "no-credential-permissive" };
    }
    return { authenticated: true, actorId: credentialId };
  }

  const credentialId = extractCredentialId(meta);
  if (!credentialId) {
    return {
      authenticated: false,
      error: "authentication-required",
    };
  }

  const credential = findCredential(config, credentialId);
  if (!credential) {
    return { authenticated: false, error: "credential-not-found" };
  }

  if (isRevoked(config, credentialId)) {
    return { authenticated: false, error: "credential-revoked" };
  }

  if (credential.type === "ActorDelegationCredential" && "expiresAt" in credential.subject) {
    if (new Date(credential.subject.expiresAt).getTime() < Date.now()) {
      return { authenticated: false, error: "credential-expired" };
    }
  }

  const signatureValid = await verifyIdentityCredential(
    credential.subject,
    credential.proof,
    config.operatorKeyPair.publicKeyMultibase,
  );

  if (!signatureValid) {
    return { authenticated: false, error: "signature-invalid" };
  }

  return { authenticated: true, actorId: credential.subject.id };
}
