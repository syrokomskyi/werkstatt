/*
<MODULE_CONTRACT>
<purpose>
RFC-0308: agent.surface.sign and agent.surface.verify — detached Ed25519
proof generation and verification for Agent Surface artifacts (manifest,
knowledge files, OpenAPI). Signing uses the same PASSPORT_SIGNING_KEY env
secret and cosmic-passport-key.json public key file as the Cosmic Passport
(RFC-0028), reusing @gogol/passport's Ed25519 primitives.
</purpose>
<non-goals>
  <item>Do not generate or regenerate artifacts — sign reads what
        agent.manifest.generate / agent.knowledge.generate / agent.openapi.generate
        already wrote. Run those first.</item>
  <item>Do not manage key rotation — use passport.key.rotate for that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0308: initial sign + verify commands.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import { optionalEnv } from "@gogol/site-kernel-integrity";
import { signBytes, verifyBytes } from "@gogol/passport/sign";
import { PassportPublicKeyFileSchema } from "@gogol/passport/schema";
import {
  buildAgentSigningPayload,
  type AgentSurfaceProof,
  type AgentSurfaceManifest,
  type AgentKnowledgeEnvelope,
} from "@gogol/share/agent";
import { readAstroSiteUrl } from "../lib/astro-site-url.ts";
import { loadSystemManifest } from "@gogol/site-kernel-content";
import { diagnosticsResult, passResult, failResult } from "../result-helpers.ts";

const INTERNAL_MANIFEST_FILE = "src/agent-surface.generated.yaml";
const PUBLIC_MANIFEST_FILE = "public/.well-known/agent.json";
const OPENAPI_FILE = "public/.well-known/agent.openapi.json";
const KNOWLEDGE_DIR = "public/api/agent/v1";
const PUBLIC_KEY_FILE = "public/.well-known/cosmic-passport-key.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AgentBlock {
  enabled?: boolean;
}

function readAgentBlock(manifest: unknown): AgentBlock {
  return ((manifest as Record<string, unknown>).agent as AgentBlock | undefined) ?? {};
}

/** Strip generated-ownership markers before parsing (same as agent-openapi.ts). */
function stripGeneratedMarkers<T>(raw: string): T {
  const parsed = yamlParse(raw) as Record<string, unknown>;
  const {
    generatedMarker: _m,
    doNotEdit: _d,
    ownerCommand: _o,
    editInstead: _e,
    regenerateCommand: _r,
    ...rest
  } = parsed;
  return rest as T;
}

/** Resolve the canonical base URL (no trailing slash) for signing payloads. */
async function resolveBaseUrl(paths: ReturnType<typeof requireAstroSitePaths>): Promise<string> {
  const fromConfig = await readAstroSiteUrl(paths.appDirectory);
  if (fromConfig) return fromConfig.replace(/\/$/, "");
  return "https://example.org";
}

/** Load the active public key multibase + version from cosmic-passport-key.json. */
async function loadActivePublicKey(
  appDirectory: string,
  context: KernelRuntimeContext,
): Promise<{ publicKeyMultibase: string; version: string } | null> {
  const keyPath = join(appDirectory, PUBLIC_KEY_FILE);
  if (!(await context.io.exists(keyPath))) return null;
  try {
    const raw = await context.io.readFile(keyPath);
    const file = PassportPublicKeyFileSchema.parse(JSON.parse(raw));
    const active = file.keys.find((k) => k.active);
    if (!active) return null;
    return { publicKeyMultibase: active.publicKeyMultibase, version: active.version };
  } catch {
    return null;
  }
}

/** Build the verification method DID for a given key version and domain. */
function verificationMethod(domain: string, keyVersion: string): string {
  return `did:web:${domain}#key-${keyVersion}`;
}

/** Extract the domain from a site URL like "https://webgogol.com". */
function extractDomain(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return baseUrl.replace(/^https?:\/\//, "").split("/")[0] ?? "example.org";
  }
}

// ---------------------------------------------------------------------------
// agent.surface.sign
// ---------------------------------------------------------------------------

export async function runAgentSurfaceSign(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  let paths: ReturnType<typeof requireAstroSitePaths>;
  try {
    paths = requireAstroSitePaths(context);
  } catch (err) {
    return failResult("agent.surface.sign", [(err as Error).message]);
  }

  // Check if agent is enabled
  let agentEnabled = true;
  try {
    const { manifest } = await loadSystemManifest(paths.contentDirectory);
    agentEnabled = readAgentBlock(manifest).enabled !== false;
  } catch {
    // If we can't read system manifest, proceed — the manifest file check below will catch it
  }

  if (!agentEnabled) {
    return passResult("agent.surface.sign", "skipped — agent.enabled is false");
  }

  // Load signing key
  const privateKeyHex =
    (await optionalEnv("PASSPORT_SIGNING_KEY", paths.appDirectory)) ??
    process.env["PASSPORT_SIGNING_KEY"] ??
    "";

  if (!privateKeyHex) {
    context.logger.warn(
      "[agent.surface.sign] PASSPORT_SIGNING_KEY is not set — skipping signing. " +
        "Agent surface artifacts remain unsigned but valid.",
    );
    return passResult("agent.surface.sign", "skipped — PASSPORT_SIGNING_KEY not set");
  }

  // Load public key file for key version
  const keyInfo = await loadActivePublicKey(paths.appDirectory, context);
  if (!keyInfo) {
    context.logger.warn(
      "[agent.surface.sign] No active public key found in cosmic-passport-key.json — skipping signing. " +
        "Run passport.key.rotate first.",
    );
    return passResult("agent.surface.sign", "skipped — no active public key");
  }

  const baseUrl = await resolveBaseUrl(paths);
  const domain = extractDomain(baseUrl);
  const vMethod = verificationMethod(domain, keyInfo.version);
  const created = new Date().toISOString();

  const diagnostics: Diagnostic[] = [];
  let signedCount = 0;

  // --- Sign the manifest ---
  const internalPath = join(paths.appDirectory, INTERNAL_MANIFEST_FILE);
  const publicPath = join(paths.appDirectory, PUBLIC_MANIFEST_FILE);

  if (!(await context.io.exists(internalPath))) {
    diagnostics.push({
      ruleId: "ASG-S01",
      severity: "error",
      file: INTERNAL_MANIFEST_FILE,
      message: "Agent Surface Manifest not found. Run agent.manifest.generate first.",
      fixHint: "Run: pnpm exec site-kernel run agent.manifest.generate --site <app>",
    });
  } else {
    try {
      const rawYaml = await context.io.readFile(internalPath);
      const manifest = stripGeneratedMarkers<AgentSurfaceManifest>(rawYaml);

      const canonicalUrl = `${baseUrl}/.well-known/agent.json`;
      const payload = buildAgentSigningPayload("manifest", canonicalUrl, manifest.contentHash);
      const proofValue = await signBytes(privateKeyHex, payload);

      const proof: AgentSurfaceProof = {
        type: "Ed25519Signature2020",
        created,
        verificationMethod: vMethod,
        proofPurpose: "assertionMethod",
        proofValue,
      };

      const signedManifest: AgentSurfaceManifest = { ...manifest, proof };

      // Write internal YAML (with generated markers restored)
      const yaml = yamlStringify(signedManifest);
      await context.io.writeFile(internalPath, yaml);

      // Write public JSON
      const json = `${JSON.stringify(signedManifest, null, 2)}\n`;
      await context.io.writeFile(publicPath, json);

      signedCount++;
    } catch (err) {
      diagnostics.push({
        ruleId: "ASG-S01",
        severity: "error",
        file: INTERNAL_MANIFEST_FILE,
        message: `Failed to sign manifest: ${(err as Error).message}`,
        fixHint: "Ensure agent.manifest.generate has run and the manifest is valid.",
      });
    }
  }

  // --- Sign knowledge files ---
  const knowledgeDir = join(paths.appDirectory, KNOWLEDGE_DIR);
  if (await context.io.exists(knowledgeDir)) {
    const entries = await context.io.readdir(knowledgeDir);
    for (const entry of entries) {
      if (entry.isDirectory || !entry.name.endsWith(".json")) continue;
      const domainName = entry.name.replace(/\.json$/, "");
      const filePath = join(knowledgeDir, entry.name);

      try {
        const raw = await context.io.readFile(filePath);
        const envelope = JSON.parse(raw) as AgentKnowledgeEnvelope;

        const canonicalUrl = `${baseUrl}/api/agent/v1/${entry.name}`;
        const payload = buildAgentSigningPayload("knowledge", canonicalUrl, envelope.contentHash);
        const proofValue = await signBytes(privateKeyHex, payload);

        const proof: AgentSurfaceProof = {
          type: "Ed25519Signature2020",
          created,
          verificationMethod: vMethod,
          proofPurpose: "assertionMethod",
          proofValue,
        };

        const signedEnvelope = { ...envelope, proof };
        await context.io.writeFile(filePath, `${JSON.stringify(signedEnvelope, null, 2)}\n`);
        signedCount++;
      } catch (err) {
        diagnostics.push({
          ruleId: "ASG-S02",
          severity: "error",
          file: `${KNOWLEDGE_DIR}/${entry.name}`,
          message: `Failed to sign knowledge file: ${(err as Error).message}`,
          fixHint: "Rerun agent.knowledge.generate then agent.surface.sign.",
        });
      }
    }
  }

  // --- Sign OpenAPI document ---
  const openapiPath = join(paths.appDirectory, OPENAPI_FILE);
  if (await context.io.exists(openapiPath)) {
    try {
      const raw = await context.io.readFile(openapiPath);
      const doc = JSON.parse(raw) as Record<string, unknown>;
      const contentHash = doc["x-gogol-content-hash"] as string | undefined;

      if (contentHash) {
        const canonicalUrl = `${baseUrl}/.well-known/agent.openapi.json`;
        const payload = buildAgentSigningPayload("openapi", canonicalUrl, contentHash);
        const proofValue = await signBytes(privateKeyHex, payload);

        const proof: AgentSurfaceProof = {
          type: "Ed25519Signature2020",
          created,
          verificationMethod: vMethod,
          proofPurpose: "assertionMethod",
          proofValue,
        };

        doc["x-gogol-proof"] = proof;
        await context.io.writeFile(openapiPath, `${JSON.stringify(doc, null, 2)}\n`);
        signedCount++;
      }
    } catch (err) {
      diagnostics.push({
        ruleId: "ASG-S03",
        severity: "error",
        file: OPENAPI_FILE,
        message: `Failed to sign OpenAPI document: ${(err as Error).message}`,
        fixHint: "Rerun agent.openapi.generate then agent.surface.sign.",
      });
    }
  }

  if (diagnostics.length > 0) {
    return diagnosticsResult("agent.surface.sign", diagnostics);
  }

  return passResult(
    "agent.surface.sign",
    context.dryRun
      ? `agent.surface.sign: dry-run — ${signedCount} artifact(s) would be signed`
      : `agent.surface.sign: ${signedCount} artifact(s) signed with key ${keyInfo.version}`,
  );
}

// ---------------------------------------------------------------------------
// agent.surface.verify
// ---------------------------------------------------------------------------

export async function runAgentSurfaceVerify(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  let paths: ReturnType<typeof requireAstroSitePaths>;
  try {
    paths = requireAstroSitePaths(context);
  } catch (err) {
    return failResult("agent.surface.verify", [(err as Error).message]);
  }

  const diagnostics: Diagnostic[] = [];

  // Load public key
  const keyInfo = await loadActivePublicKey(paths.appDirectory, context);
  if (!keyInfo) {
    diagnostics.push({
      ruleId: "ASG-V01",
      severity: "warning",
      file: PUBLIC_KEY_FILE,
      message: "No active public key found in cosmic-passport-key.json — cannot verify signatures.",
      fixHint: "Run passport.key.rotate to generate a key pair.",
    });
    return diagnosticsResult("agent.surface.verify", diagnostics);
  }

  const baseUrl = await resolveBaseUrl(paths);
  let verifiedCount = 0;
  let unsignedCount = 0;

  // --- Verify manifest ---
  const publicPath = join(paths.appDirectory, PUBLIC_MANIFEST_FILE);
  if (await context.io.exists(publicPath)) {
    try {
      const raw = await context.io.readFile(publicPath);
      const manifest = JSON.parse(raw) as AgentSurfaceManifest;

      if (!manifest.proof) {
        diagnostics.push({
          ruleId: "ASG-V02",
          severity: "warning",
          file: PUBLIC_MANIFEST_FILE,
          message: "Manifest has no proof — artifact is unsigned.",
          fixHint: "Run agent.surface.sign with PASSPORT_SIGNING_KEY set.",
        });
        unsignedCount++;
      } else {
        const canonicalUrl = `${baseUrl}/.well-known/agent.json`;
        const payload = buildAgentSigningPayload("manifest", canonicalUrl, manifest.contentHash);
        const valid = await verifyBytes(
          keyInfo.publicKeyMultibase,
          payload,
          manifest.proof.proofValue,
        );

        if (valid) {
          verifiedCount++;
        } else {
          diagnostics.push({
            ruleId: "ASG-V03",
            severity: "error",
            file: PUBLIC_MANIFEST_FILE,
            message: "Manifest proof signature is invalid.",
            fixHint: "Rerun agent.surface.sign with the correct PASSPORT_SIGNING_KEY.",
          });
        }
      }
    } catch (err) {
      diagnostics.push({
        ruleId: "ASG-V04",
        severity: "error",
        file: PUBLIC_MANIFEST_FILE,
        message: `Failed to parse or verify manifest: ${(err as Error).message}`,
        fixHint: "Rerun agent.manifest.generate then agent.surface.sign.",
      });
    }
  }

  // --- Verify knowledge files ---
  const knowledgeDir = join(paths.appDirectory, KNOWLEDGE_DIR);
  if (await context.io.exists(knowledgeDir)) {
    const entries = await context.io.readdir(knowledgeDir);
    for (const entry of entries) {
      if (entry.isDirectory || !entry.name.endsWith(".json")) continue;
      const filePath = join(knowledgeDir, entry.name);

      try {
        const raw = await context.io.readFile(filePath);
        const envelope = JSON.parse(raw) as AgentKnowledgeEnvelope;

        if (!envelope.proof) {
          diagnostics.push({
            ruleId: "ASG-V02",
            severity: "warning",
            file: `${KNOWLEDGE_DIR}/${entry.name}`,
            message: `Knowledge file "${entry.name}" has no proof — artifact is unsigned.`,
            fixHint: "Run agent.surface.sign with PASSPORT_SIGNING_KEY set.",
          });
          unsignedCount++;
          continue;
        }

        const canonicalUrl = `${baseUrl}/api/agent/v1/${entry.name}`;
        const payload = buildAgentSigningPayload("knowledge", canonicalUrl, envelope.contentHash);
        const valid = await verifyBytes(
          keyInfo.publicKeyMultibase,
          payload,
          envelope.proof.proofValue,
        );

        if (valid) {
          verifiedCount++;
        } else {
          diagnostics.push({
            ruleId: "ASG-V03",
            severity: "error",
            file: `${KNOWLEDGE_DIR}/${entry.name}`,
            message: `Knowledge file "${entry.name}" proof signature is invalid.`,
            fixHint: "Rerun agent.surface.sign with the correct PASSPORT_SIGNING_KEY.",
          });
        }
      } catch (err) {
        diagnostics.push({
          ruleId: "ASG-V04",
          severity: "error",
          file: `${KNOWLEDGE_DIR}/${entry.name}`,
          message: `Failed to parse or verify knowledge file: ${(err as Error).message}`,
          fixHint: "Rerun agent.knowledge.generate then agent.surface.sign.",
        });
      }
    }
  }

  // --- Verify OpenAPI document ---
  const openapiPath = join(paths.appDirectory, OPENAPI_FILE);
  if (await context.io.exists(openapiPath)) {
    try {
      const raw = await context.io.readFile(openapiPath);
      const doc = JSON.parse(raw) as Record<string, unknown>;
      const proof = doc["x-gogol-proof"] as AgentSurfaceProof | undefined;
      const contentHash = doc["x-gogol-content-hash"] as string | undefined;

      if (!proof) {
        diagnostics.push({
          ruleId: "ASG-V02",
          severity: "warning",
          file: OPENAPI_FILE,
          message: "OpenAPI document has no x-gogol-proof — artifact is unsigned.",
          fixHint: "Run agent.surface.sign with PASSPORT_SIGNING_KEY set.",
        });
        unsignedCount++;
      } else if (contentHash) {
        const canonicalUrl = `${baseUrl}/.well-known/agent.openapi.json`;
        const payload = buildAgentSigningPayload("openapi", canonicalUrl, contentHash);
        const valid = await verifyBytes(keyInfo.publicKeyMultibase, payload, proof.proofValue);

        if (valid) {
          verifiedCount++;
        } else {
          diagnostics.push({
            ruleId: "ASG-V03",
            severity: "error",
            file: OPENAPI_FILE,
            message: "OpenAPI document proof signature is invalid.",
            fixHint: "Rerun agent.surface.sign with the correct PASSPORT_SIGNING_KEY.",
          });
        }
      }
    } catch (err) {
      diagnostics.push({
        ruleId: "ASG-V04",
        severity: "error",
        file: OPENAPI_FILE,
        message: `Failed to parse or verify OpenAPI document: ${(err as Error).message}`,
        fixHint: "Rerun agent.openapi.generate then agent.surface.sign.",
      });
    }
  }

  if (diagnostics.length > 0) {
    return diagnosticsResult("agent.surface.verify", diagnostics);
  }

  return passResult(
    "agent.surface.verify",
    `agent.surface.verify: ${verifiedCount} signature(s) valid, ${unsignedCount} unsigned`,
  );
}
