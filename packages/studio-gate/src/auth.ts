/*
<MODULE_CONTRACT>
  <purpose>
  RFC-0558/RFC-0559: Studio Gate auth middleware — verifies VC tokens from MCP
  metadata against werkstatt.identity.json before dispatching to Site OS commands.
  Supports permissive (warn-only) and enforced (reject) modes.
  RFC-0559: adds site-scoping (credential siteId vs _meta.system), per-tool scope
  enforcement, and distinct error types for auth-config-missing vs auth-config-malformed.
  </purpose>
  <non-goals>
    <item>Does not execute Site OS commands — that remains in executor.ts.</item>
    <item>Does not handle key management — public keys are read from werkstatt.identity.json.</item>
    <item>Does not modify Site OS command implementations — actor context is injected via --_authActor CLI flag.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0558: initial auth middleware for Studio Gate.</item>
  <item>RFC-0559: add site-scoping, scope enforcement, malformed config detection, system-id-required error.</item>
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
  authMode: "permissive" | "enforced";
  actorId?: string;
  siteId?: string;
  scopes?: string[];
  error?: string;
  expected?: string;
  presented?: string | string[];
  required?: string;
}

export const IDENTITY_CONFIG_FILENAME = "werkstatt.identity.json";

const FALLBACK_AUTH_MODE = "enforced" as const;

function identityConfigPath(werkstattRoot: string): string {
  return join(werkstattRoot, IDENTITY_CONFIG_FILENAME);
}

export type IdentityConfigResult =
  | { status: "ok"; config: WerkstattIdentityConfig }
  | { status: "missing" }
  | { status: "malformed" };

export async function loadIdentityConfig(werkstattRoot: string): Promise<IdentityConfigResult> {
  let raw: string;
  try {
    raw = await readFile(identityConfigPath(werkstattRoot), "utf-8");
  } catch {
    return { status: "missing" };
  }
  try {
    return { status: "ok", config: WerkstattIdentityConfigSchema.parse(JSON.parse(raw)) };
  } catch {
    return { status: "malformed" };
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

function extractScopes(credential: WerkstattCredential): string[] {
  if ("scopes" in credential.subject) {
    return credential.subject.scopes;
  }
  return ["*"];
}

function extractSiteId(credential: WerkstattCredential): string {
  return credential.subject.siteId;
}

export async function verifyAuthFromMeta(
  meta: Record<string, unknown> | undefined,
  werkstattRoot: string,
  toolName: string,
  systemId?: string,
): Promise<StudioGateAuthResult> {
  const configResult = await loadIdentityConfig(werkstattRoot);

  if (configResult.status === "missing") {
    return { authenticated: false, authMode: FALLBACK_AUTH_MODE, error: "auth-config-missing" };
  }
  if (configResult.status === "malformed") {
    return { authenticated: false, authMode: FALLBACK_AUTH_MODE, error: "auth-config-malformed" };
  }

  const config = configResult.config;
  const isEnforced = config.authMode === "enforced";

  if (isEnforced && !systemId) {
    return { authenticated: false, authMode: "enforced", error: "system-id-required" };
  }

  const credentialId = extractCredentialId(meta);
  if (!credentialId) {
    return {
      authenticated: false,
      authMode: config.authMode,
      error: isEnforced ? "authentication-required" : "no-credential-permissive",
    };
  }

  const credential = findCredential(config, credentialId);
  if (!credential) {
    return { authenticated: false, authMode: config.authMode, error: "credential-not-found" };
  }

  if (isRevoked(config, credentialId)) {
    return { authenticated: false, authMode: config.authMode, error: "credential-revoked" };
  }

  if (credential.type === "ActorDelegationCredential" && "expiresAt" in credential.subject) {
    if (new Date(credential.subject.expiresAt).getTime() < Date.now()) {
      return { authenticated: false, authMode: config.authMode, error: "credential-expired" };
    }
  }

  const signatureValid = await verifyIdentityCredential(
    credential.subject,
    credential.proof,
    config.operatorKeyPair.publicKeyMultibase,
  );

  if (!signatureValid) {
    return { authenticated: false, authMode: config.authMode, error: "signature-invalid" };
  }

  const credentialSiteId = extractSiteId(credential);
  if (systemId && credentialSiteId !== systemId) {
    return {
      authenticated: false,
      authMode: config.authMode,
      error: "site-mismatch",
      expected: systemId,
      presented: credentialSiteId,
    };
  }

  const scopes = extractScopes(credential);
  if (!scopes.includes("*") && !scopes.includes(toolName)) {
    return {
      authenticated: false,
      authMode: config.authMode,
      error: "insufficient-scope",
      required: toolName,
      presented: scopes,
    };
  }

  return {
    authenticated: true,
    authMode: config.authMode,
    actorId: credential.subject.id,
    siteId: credentialSiteId,
    scopes,
  };
}
