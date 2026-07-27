import { parse as yamlParse, stringify as yamlStringify } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>
RFC-0286: the Agent Surface spine. agent.manifest.generate assembles the
per-site Agent Surface Manifest (AS-1) from system.md, whatever RFC-0287
knowledge files + RFC-0289 OpenAPI doc + RFC-0290 MCP/action routes already
exist for this app, and writes both the internal artifact and its public
discovery mirror. agent.surface.validate enforces the AS invariants: privacy
boundary (AS-3), manifest↔artifact bijection (AS-1), entitlement gating
(AS-4), route existence (AS-1, RFC-0290), and tamper/staleness detection (AS-7).
</purpose>
<non-goals>
  <item>Do not populate knowledge/action refs here beyond what RFC-0287/0288
        wire in as this file is extended — v1 alone ships empty arrays.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0286: initial spine — manifest generation + core AS invariant checks.</item>
  <item>RFC-0290: added AGS-07 (route existence), closing the RFC-0288 carve-out.</item>
  <item>RFC-0291: added AGS-08..10 (proof presence/validity against passport key).</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";
import {
  buildAgentSurfaceManifest,
  computeAgentManifestContentHash,
  resolveActiveCapabilities,
  capabilityToActionRef,
  buildAgentSigningPayload,
  type AgentSurfaceManifest,
} from "@warpgogol/share/agent";
import { BUSINESS_DOMAIN_VISIBILITY } from "@warpgogol/share/semantic";
import { PINNED_MCP_PROTOCOL_VERSION } from "@warpgogol/agent-gate";
import { verifyBytes } from "@warpgogol/passport/sign";
import { PassportPublicKeyFileSchema } from "@warpgogol/passport/schema";
import { readAstroSiteUrl } from "../lib/astro-site-url.ts";
import { readEntitledFeatures } from "../lib/entitlements.ts";
import { loadCapabilityCatalog, collectRenderedSectionTypes } from "./agent-capability.ts";
import { diagnosticsResult } from "../result-helpers.ts";

const INTERNAL_MANIFEST_FILE = "src/agent-surface.generated.yaml";
const PUBLIC_MANIFEST_FILE = "public/.well-known/agent.json";
/** Filesystem path (under the app root), for reads/writes. */
const KNOWLEDGE_DIR = "public/api/agent/v1";
/** Public URL prefix (site-relative, no "public/"), for manifest refs. */
const KNOWLEDGE_URL_PREFIX = "/api/agent/v1";
const OPENAPI_FILE = "public/.well-known/agent.openapi.json";

interface AgentSystemBlock {
  enabled?: boolean;
  actionsDisabled?: string[];
}

function readAgentBlock(manifest: unknown): AgentSystemBlock {
  const raw = (manifest as Record<string, unknown>).agent as AgentSystemBlock | undefined;
  return raw ?? {};
}

// ---------------------------------------------------------------------------
// agent.manifest.generate
// ---------------------------------------------------------------------------

export async function runAgentManifestGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const { manifest } = await loadSystemManifest(paths.contentDirectory);
  const agentBlock = readAgentBlock(manifest);
  const enabled = agentBlock.enabled !== false;

  const internalPath = join(paths.appDirectory, INTERNAL_MANIFEST_FILE);
  const publicPath = join(paths.appDirectory, PUBLIC_MANIFEST_FILE);

  if (!enabled) {
    if (await context.io.exists(internalPath)) await context.io.rm(internalPath);
    if (await context.io.exists(publicPath)) await context.io.rm(publicPath);
    return {
      data: { command: "agent.manifest.generate", status: "skip", site: context.site?.name },
      exitCode: 0,
      summary: "agent.manifest.generate: skipped — agent.enabled is false",
    };
  }

  const siteUrl = ((await readAstroSiteUrl(paths.appDirectory)) ?? "https://example.com").replace(
    /\/$/,
    "",
  );
  const i18n = (manifest as { i18n?: { default?: string; supported?: Record<string, unknown> } })
    .i18n;
  const languages = {
    default: i18n?.default ?? "de",
    supported: Object.keys(i18n?.supported ?? { [i18n?.default ?? "de"]: {} }),
  };

  // RFC-0287: reflect whatever knowledge envelopes already exist on disk —
  // agent.knowledge.generate runs immediately before this command.
  const knowledgeDir = join(paths.appDirectory, KNOWLEDGE_DIR);
  const knowledge: AgentSurfaceManifest["knowledge"] = [];
  if (await context.io.exists(knowledgeDir)) {
    const entries = await context.io.readdir(knowledgeDir);
    for (const entry of entries) {
      if (entry.isDirectory || !entry.name.endsWith(".json")) continue;
      const domain = entry.name.replace(/\.json$/, "");
      let schema = `gogol.agent.knowledge/${domain}@1`;
      try {
        const raw = JSON.parse(await context.io.readFile(join(knowledgeDir, entry.name))) as {
          schema?: string;
        };
        if (typeof raw.schema === "string") schema = raw.schema;
      } catch {
        // malformed file — agent.knowledge.validate reports it; keep a best-effort default here.
      }
      knowledge.push({ domain, url: `${KNOWLEDGE_URL_PREFIX}/${entry.name}`, schema });
    }
  }

  // RFC-0288: resolve the closed capability catalog down to what is active on
  // this app (agent.actions + any extra per-capability entitlement + rendered
  // humanEquivalent sections), then project each into an AgentActionRef.
  const { records: catalog } = await loadCapabilityCatalog(context.workspaceRoot);
  const entitlementFeatures = context.site
    ? ((await readEntitledFeatures(context.site.directory)) ?? [])
    : [];
  const renderedSectionTypes = [
    ...(await collectRenderedSectionTypes(paths.contentPagesDirectory)),
  ];
  const activeCapabilities = resolveActiveCapabilities({
    catalog,
    entitlements: entitlementFeatures,
    renderedSectionTypes,
    actionsDisabled: agentBlock.actionsDisabled ?? [],
  });
  const actions = activeCapabilities.map(capabilityToActionRef);

  // RFC-0289/0290: the OpenAPI document and MCP endpoint are deterministic
  // siblings of this manifest — their paths are known in advance; agent.openapi.generate
  // and agent.routes.generate run immediately after this command in build.prepare.
  const result = buildAgentSurfaceManifest({
    site: String((manifest as { app?: string }).app ?? context.site?.name ?? "site"),
    baseUrl: siteUrl,
    languages,
    knowledge,
    actions,
    hasTwins: true,
    openapiUrl: "/.well-known/agent.openapi.json",
    mcp: { url: "/api/agent/mcp", protocolVersion: PINNED_MCP_PROTOCOL_VERSION },
  });

  const payload = {
    ...result,
  };
  const yaml = `${yamlStringify(payload)}`;
  const json = `${JSON.stringify(payload, null, 2)}\n`;

  await context.io.mkdir(join(paths.appDirectory, "public", ".well-known"));
  await context.io.writeFile(internalPath, yaml);
  await context.io.writeFile(publicPath, json);

  return {
    data: {
      command: "agent.manifest.generate",
      status: "pass",
      site: context.site?.name,
      knowledgeCount: result.knowledge.length,
      actionCount: result.actions.length,
      contentHash: result.contentHash,
    },
    exitCode: 0,
    summary: context.dryRun
      ? `agent.manifest.generate: dry-run — ${result.knowledge.length} knowledge ref(s), ${result.actions.length} action(s)`
      : `agent.manifest.generate: ${result.knowledge.length} knowledge ref(s), ${result.actions.length} action(s) → agent.json`,
  };
}

// ---------------------------------------------------------------------------
// agent.surface.validate
// ---------------------------------------------------------------------------

export async function runAgentSurfaceValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const paths = requireAstroSitePaths(context);
  const { manifest } = await loadSystemManifest(paths.contentDirectory);
  const agentBlock = readAgentBlock(manifest);
  const enabled = agentBlock.enabled !== false;

  const internalPath = join(paths.appDirectory, INTERNAL_MANIFEST_FILE);
  const publicPath = join(paths.appDirectory, PUBLIC_MANIFEST_FILE);
  const diagnostics: Diagnostic[] = [];

  const internalExists = await context.io.exists(internalPath);
  const publicExists = await context.io.exists(publicPath);

  if (!enabled) {
    if (internalExists || publicExists) {
      diagnostics.push({
        ruleId: "AGS-06",
        severity: "warning",
        file: PUBLIC_MANIFEST_FILE,
        message: "agent.enabled is false but agent surface artifacts still exist on disk.",
        fixHint: "Rerun agent.manifest.generate to remove stale artifacts.",
      });
    }
    return diagnosticsResult("agent.surface.validate", diagnostics);
  }

  if (!internalExists || !publicExists) {
    diagnostics.push({
      ruleId: "AGS-02",
      severity: "error",
      file: INTERNAL_MANIFEST_FILE,
      message: "Agent Surface Manifest not found. Run agent.manifest.generate first.",
      fixHint: "Run: pnpm exec site-kernel run agent.manifest.generate --site <app>",
    });
    return diagnosticsResult("agent.surface.validate", diagnostics);
  }

  let doc: AgentSurfaceManifest;
  try {
    // The advisory fields are outer file markers, never part of the
    // AgentSurfaceManifest shape the hash was computed over — strip them
    // before recomputing so the comparison mirrors buildAgentSurfaceManifest exactly.
    const {
      generatedMarker: _m,
      doNotEdit: _d,
      ownerCommand: _o,
      editInstead: _e,
      regenerateCommand: _r,
      ...rest
    } = yamlParse(await context.io.readFile(internalPath)) as Record<string, unknown> &
      AgentSurfaceManifest;
    doc = rest as AgentSurfaceManifest;
  } catch {
    diagnostics.push({
      ruleId: "AGS-02",
      severity: "error",
      file: INTERNAL_MANIFEST_FILE,
      message: "Agent Surface Manifest is not valid JSON.",
      fixHint: "Rerun agent.manifest.generate.",
    });
    return diagnosticsResult("agent.surface.validate", diagnostics);
  }

  // AGS-05: staleness / tamper — recomputed hash must match, and the public
  // mirror must be byte-identical to the internal manifest (v1: same content).
  const recomputedHash = computeAgentManifestContentHash(doc as unknown as Record<string, unknown>);
  if (recomputedHash !== doc.contentHash) {
    diagnostics.push({
      ruleId: "AGS-05",
      severity: "error",
      file: INTERNAL_MANIFEST_FILE,
      message: "contentHash does not match the recomputed hash — stale or hand-edited artifact.",
      fixHint: "Rerun agent.manifest.generate; never hand-edit generated agent surface files.",
    });
  }
  const publicRaw = await context.io.readFile(publicPath);
  const internalRaw = await context.io.readFile(internalPath);
  let publicParsed: Record<string, unknown>;
  let internalParsed: Record<string, unknown>;
  try {
    publicParsed = JSON.parse(publicRaw) as Record<string, unknown>;
  } catch {
    diagnostics.push({
      ruleId: "AGS-05",
      severity: "error",
      file: PUBLIC_MANIFEST_FILE,
      message: "Public agent.json is not valid JSON.",
      fixHint: "Rerun agent.manifest.generate to resynchronize both artifacts.",
    });
    publicParsed = {};
  }
  try {
    internalParsed = yamlParse(internalRaw) as Record<string, unknown>;
  } catch {
    diagnostics.push({
      ruleId: "AGS-05",
      severity: "error",
      file: INTERNAL_MANIFEST_FILE,
      message: "Internal manifest is not valid YAML.",
      fixHint: "Rerun agent.manifest.generate to resynchronize both artifacts.",
    });
    internalParsed = {};
  }
  if (JSON.stringify(publicParsed) !== JSON.stringify(internalParsed)) {
    diagnostics.push({
      ruleId: "AGS-05",
      severity: "error",
      file: PUBLIC_MANIFEST_FILE,
      message: "Public agent.json diverges from the internal manifest.",
      fixHint: "Rerun agent.manifest.generate to resynchronize both artifacts.",
    });
  }

  // AGS-01: privacy boundary — every knowledge ref domain must be `public`.
  for (const ref of doc.knowledge ?? []) {
    const visibility = (BUSINESS_DOMAIN_VISIBILITY as Record<string, string>)[ref.domain];
    if (visibility !== "public") {
      diagnostics.push({
        ruleId: "AGS-01",
        severity: "error",
        file: PUBLIC_MANIFEST_FILE,
        message: `Knowledge ref "${ref.domain}" violates BUSINESS_DOMAIN_VISIBILITY (visibility: ${visibility ?? "unknown"}).`,
        fixHint:
          "Remove the domain from the knowledge projection; non-public domains never reach agent outputs.",
      });
    }
  }

  // AGS-02 (knowledge + openapi only — action/mcp route existence is AGS-07, RFC-0290):
  // every referenced file must exist, and no unreferenced file may exist (AGS-03).
  const referencedKnowledgeFiles = new Set(
    (doc.knowledge ?? []).map((ref) => join(paths.appDirectory, "public", ref.url)),
  );
  for (const ref of doc.knowledge ?? []) {
    const filePath = join(paths.appDirectory, "public", ref.url);
    if (!(await context.io.exists(filePath))) {
      diagnostics.push({
        ruleId: "AGS-02",
        severity: "error",
        file: ref.url,
        message: `Manifest references knowledge domain "${ref.domain}" but its file does not exist.`,
        fixHint: "Rerun agent.knowledge.generate then agent.manifest.generate.",
      });
    }
  }
  if (doc.interfaces?.openapi) {
    const openapiPath = join(paths.appDirectory, "public", doc.interfaces.openapi);
    if (!(await context.io.exists(openapiPath))) {
      diagnostics.push({
        ruleId: "AGS-02",
        severity: "error",
        file: doc.interfaces.openapi,
        message: "Manifest references an OpenAPI document that does not exist.",
        fixHint: "Rerun agent.openapi.generate then agent.manifest.generate.",
      });
    }
  }

  const knowledgeDir = join(paths.appDirectory, KNOWLEDGE_DIR);
  if (await context.io.exists(knowledgeDir)) {
    const entries = await context.io.readdir(knowledgeDir);
    for (const entry of entries) {
      if (entry.isDirectory || !entry.name.endsWith(".json")) continue;
      const filePath = join(knowledgeDir, entry.name);
      if (!referencedKnowledgeFiles.has(filePath)) {
        diagnostics.push({
          ruleId: "AGS-03",
          severity: "error",
          file: `${KNOWLEDGE_DIR}/${entry.name}`,
          message: "Knowledge file on disk is not referenced by the Agent Surface Manifest.",
          fixHint: "Rerun agent.manifest.generate, or remove the orphaned file.",
        });
      }
    }
  }
  const openapiPath = join(paths.appDirectory, OPENAPI_FILE);
  if ((await context.io.exists(openapiPath)) && !doc.interfaces?.openapi) {
    diagnostics.push({
      ruleId: "AGS-03",
      severity: "error",
      file: OPENAPI_FILE,
      message: "agent.openapi.json exists on disk but the manifest does not reference it.",
      fixHint: "Rerun agent.manifest.generate.",
    });
  }

  // AGS-04: an action ref requires the agent.actions entitlement to be resolved.
  if ((doc.actions ?? []).length > 0) {
    const features = context.site ? await readEntitledFeatures(context.site.directory) : null;
    if (!features || !features.includes("agent.actions")) {
      diagnostics.push({
        ruleId: "AGS-04",
        severity: "error",
        file: INTERNAL_MANIFEST_FILE,
        message: "Manifest advertises action(s) but agent.actions is not a resolved entitlement.",
        fixHint: "Rerun entitlements.resolve then agent.manifest.generate.",
      });
    }
  }

  // AGS-07 (RFC-0290): action/mcp routes must exist when the manifest advertises them,
  // and the generated route files must not exist when the manifest advertises neither
  // (closes the RFC-0288 carve-out — action route existence is now checked here).
  const mcpRoutePath = join(paths.appDirectory, "src", "pages", "api", "agent", "mcp.ts");
  const actionRoutePath = join(
    paths.appDirectory,
    "src",
    "pages",
    "api",
    "agent",
    "actions",
    "[id].ts",
  );
  if (doc.interfaces?.mcp) {
    if (!(await context.io.exists(mcpRoutePath))) {
      diagnostics.push({
        ruleId: "AGS-07",
        severity: "error",
        file: "src/pages/api/agent/mcp.ts",
        message: "Manifest advertises an MCP endpoint but the generated route does not exist.",
        fixHint: "Rerun agent.routes.generate.",
      });
    }
  }
  if ((doc.actions ?? []).length > 0) {
    if (!(await context.io.exists(actionRoutePath))) {
      diagnostics.push({
        ruleId: "AGS-07",
        severity: "error",
        file: "src/pages/api/agent/actions/[id].ts",
        message: "Manifest advertises action(s) but the generated action route does not exist.",
        fixHint: "Rerun agent.routes.generate.",
      });
    }
  } else if (await context.io.exists(actionRoutePath)) {
    diagnostics.push({
      ruleId: "AGS-07",
      severity: "error",
      file: "src/pages/api/agent/actions/[id].ts",
      message: "Action route exists but the manifest advertises no actions.",
      fixHint: "Rerun agent.routes.generate, or remove the stale file.",
    });
  }

  // AGS-08..10 (RFC-0291): proof presence and validity against the passport key.
  const publicKeyPath = join(
    paths.appDirectory,
    "public",
    ".well-known",
    "cosmic-passport-key.json",
  );
  let publicKeyMultibase: string | null = null;
  if (await context.io.exists(publicKeyPath)) {
    try {
      const keyFile = PassportPublicKeyFileSchema.parse(
        JSON.parse(await context.io.readFile(publicKeyPath)),
      );
      const activeKey = keyFile.keys.find((k) => k.active);
      if (activeKey) publicKeyMultibase = activeKey.publicKeyMultibase;
    } catch {
      // malformed key file — treat as no key
    }
  }

  if (!publicKeyMultibase) {
    // AGS-10: no passport key material — unsigned is valid but noted.
    diagnostics.push({
      ruleId: "AGS-10",
      severity: "warning",
      file: PUBLIC_MANIFEST_FILE,
      message: "Site has no passport key material — agent surface ships unsigned.",
      fixHint: "Run passport.key.rotate to generate a key pair, then agent.surface.sign.",
    });
  } else if (!doc.proof) {
    // AGS-08: key present but manifest has no proof — signing was silently skipped.
    diagnostics.push({
      ruleId: "AGS-08",
      severity: "warning",
      file: PUBLIC_MANIFEST_FILE,
      message: "Passport key is present but agent.json has no proof — signing was skipped.",
      fixHint: "Run agent.surface.sign with PASSPORT_SIGNING_KEY set.",
    });
  } else {
    // AGS-09: proof present but invalid against the committed public key.
    try {
      const baseUrl = (
        (await readAstroSiteUrl(paths.appDirectory)) ?? "https://example.com"
      ).replace(/\/$/, "");
      const canonicalUrl = `${baseUrl}/.well-known/agent.json`;
      const payload = buildAgentSigningPayload("manifest", canonicalUrl, doc.contentHash);
      const valid = await verifyBytes(publicKeyMultibase, payload, doc.proof.proofValue);
      if (!valid) {
        diagnostics.push({
          ruleId: "AGS-09",
          severity: "error",
          file: PUBLIC_MANIFEST_FILE,
          message: "Manifest proof is invalid against the committed public key.",
          fixHint: "Rerun agent.surface.sign with the correct PASSPORT_SIGNING_KEY.",
        });
      }
    } catch (err) {
      diagnostics.push({
        ruleId: "AGS-09",
        severity: "error",
        file: PUBLIC_MANIFEST_FILE,
        message: `Failed to verify manifest proof: ${(err as Error).message}`,
        fixHint: "Ensure the passport key and agent.surface.sign are consistent.",
      });
    }
  }

  return diagnosticsResult("agent.surface.validate", diagnostics);
}

// ---------------------------------------------------------------------------
// agent.manifest.verify (RFC-0291)
// ---------------------------------------------------------------------------

interface ManifestVerifyCheck {
  check: string;
  ok: boolean;
  detail?: string;
}

function manifestVerifyResult(
  checks: ManifestVerifyCheck[],
  site: string | undefined,
): KernelCommandResult {
  const allOk = checks.every((c) => c.ok);
  return {
    data: {
      command: "agent.manifest.verify",
      status: allOk ? "pass" : "fail",
      site,
      checks,
    },
    exitCode: allOk ? 0 : 1,
    summary: `agent.manifest.verify: ${allOk ? "pass" : "fail"} (${checks.filter((c) => c.ok).length}/${checks.length} checks ok)`,
  };
}

export async function runAgentManifestVerify(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const url = typeof input.flags["url"] === "string" ? input.flags["url"] : undefined;
  const paths = requireAstroSitePaths(context);
  const checks: ManifestVerifyCheck[] = [];

  if (url) {
    // --url mode: fetch manifest + key from remote origin, verify signature + contentHash + ref-reachability.
    const origin = url.replace(/\/$/, "");
    const manifestUrl = `${origin}/.well-known/agent.json`;
    const keyUrl = `${origin}/.well-known/cosmic-passport-key.json`;

    // Fetch manifest
    let manifest: AgentSurfaceManifest;
    try {
      const res = await fetch(manifestUrl);
      if (!res.ok) {
        checks.push({
          check: "manifest-fetch",
          ok: false,
          detail: `${manifestUrl} → ${res.status}`,
        });
        return manifestVerifyResult(checks, context.site?.name);
      }
      manifest = (await res.json()) as AgentSurfaceManifest;
      checks.push({ check: "manifest-fetch", ok: true });
    } catch (err) {
      checks.push({ check: "manifest-fetch", ok: false, detail: (err as Error).message });
      return manifestVerifyResult(checks, context.site?.name);
    }

    // Fetch public key
    let publicKeyMultibase: string;
    try {
      const res = await fetch(keyUrl);
      if (!res.ok) {
        checks.push({ check: "key-fetch", ok: false, detail: `${keyUrl} → ${res.status}` });
        return manifestVerifyResult(checks, context.site?.name);
      }
      const keyFile = PassportPublicKeyFileSchema.parse(await res.json());
      const activeKey = keyFile.keys.find((k) => k.active);
      if (!activeKey) {
        checks.push({ check: "key-fetch", ok: false, detail: "no active key in key file" });
        return manifestVerifyResult(checks, context.site?.name);
      }
      publicKeyMultibase = activeKey.publicKeyMultibase;
      checks.push({ check: "key-fetch", ok: true });
    } catch (err) {
      checks.push({ check: "key-fetch", ok: false, detail: (err as Error).message });
      return manifestVerifyResult(checks, context.site?.name);
    }

    // Verify contentHash
    const recomputedHash = computeAgentManifestContentHash(
      manifest as unknown as Record<string, unknown>,
    );
    checks.push({
      check: "content-hash",
      ok: recomputedHash === manifest.contentHash,
      detail:
        recomputedHash !== manifest.contentHash ? "recomputed hash does not match" : undefined,
    });

    // Verify signature
    if (!manifest.proof) {
      checks.push({ check: "signature", ok: false, detail: "manifest has no proof" });
    } else {
      try {
        const canonicalUrl = `${origin}/.well-known/agent.json`;
        const payload = buildAgentSigningPayload("manifest", canonicalUrl, manifest.contentHash);
        const valid = await verifyBytes(publicKeyMultibase, payload, manifest.proof.proofValue);
        checks.push({
          check: "signature",
          ok: valid,
          detail: valid ? undefined : "signature invalid",
        });
      } catch (err) {
        checks.push({ check: "signature", ok: false, detail: (err as Error).message });
      }
    }

    // Check ref-reachability (knowledge files + openapi)
    const refChecks: ManifestVerifyCheck[] = [];
    for (const ref of manifest.knowledge ?? []) {
      const refUrl = `${origin}${ref.url}`;
      try {
        const res = await fetch(refUrl, { method: "HEAD" });
        if (!res.ok) {
          // Retry with GET (some CDNs don't support HEAD)
          const getRes = await fetch(refUrl);
          refChecks.push({
            check: "ref-reachability",
            ok: getRes.ok,
            detail: `${refUrl} → ${getRes.status}`,
          });
        } else {
          refChecks.push({ check: "ref-reachability", ok: true, detail: refUrl });
        }
      } catch (err) {
        refChecks.push({
          check: "ref-reachability",
          ok: false,
          detail: `${refUrl} → ${(err as Error).message}`,
        });
      }
    }
    if (manifest.interfaces?.openapi) {
      const refUrl = `${origin}${manifest.interfaces.openapi}`;
      try {
        const res = await fetch(refUrl, { method: "HEAD" });
        if (!res.ok) {
          const getRes = await fetch(refUrl);
          refChecks.push({
            check: "ref-reachability",
            ok: getRes.ok,
            detail: `${refUrl} → ${getRes.status}`,
          });
        } else {
          refChecks.push({ check: "ref-reachability", ok: true, detail: refUrl });
        }
      } catch (err) {
        refChecks.push({
          check: "ref-reachability",
          ok: false,
          detail: `${refUrl} → ${(err as Error).message}`,
        });
      }
    }
    // Summarize ref-reachability
    if (refChecks.length === 0) {
      checks.push({ check: "ref-reachability", ok: true, detail: "no refs to check" });
    } else {
      const allRefsOk = refChecks.every((c) => c.ok);
      const failedRefs = refChecks
        .filter((c) => !c.ok)
        .map((c) => c.detail)
        .join("; ");
      checks.push({
        check: "ref-reachability",
        ok: allRefsOk,
        detail: allRefsOk ? `${refChecks.length} ref(s) reachable` : failedRefs,
      });
    }

    return manifestVerifyResult(checks, context.site?.name);
  }

  // Local mode: verify the freshly generated agent.json against the committed public key.
  const publicPath = join(paths.appDirectory, PUBLIC_MANIFEST_FILE);
  const publicKeyPath = join(
    paths.appDirectory,
    "public",
    ".well-known",
    "cosmic-passport-key.json",
  );

  // Check key material presence (skip with a note when absent)
  if (!(await context.io.exists(publicKeyPath))) {
    return {
      data: {
        command: "agent.manifest.verify",
        status: "skip",
        site: context.site?.name,
        checks: [{ check: "key-presence", ok: false, detail: "no passport key file" }],
      },
      exitCode: 0,
      summary: "agent.manifest.verify: skipped — no passport key material",
    };
  }

  let publicKeyMultibase: string;
  try {
    const keyFile = PassportPublicKeyFileSchema.parse(
      JSON.parse(await context.io.readFile(publicKeyPath)),
    );
    const activeKey = keyFile.keys.find((k) => k.active);
    if (!activeKey) {
      return {
        data: {
          command: "agent.manifest.verify",
          status: "skip",
          site: context.site?.name,
          checks: [{ check: "key-presence", ok: false, detail: "no active key" }],
        },
        exitCode: 0,
        summary: "agent.manifest.verify: skipped — no active passport key",
      };
    }
    publicKeyMultibase = activeKey.publicKeyMultibase;
  } catch (err) {
    checks.push({ check: "key-presence", ok: false, detail: (err as Error).message });
    return manifestVerifyResult(checks, context.site?.name);
  }
  checks.push({ check: "key-presence", ok: true });

  // Read manifest
  if (!(await context.io.exists(publicPath))) {
    checks.push({ check: "manifest-presence", ok: false, detail: "agent.json not found" });
    return manifestVerifyResult(checks, context.site?.name);
  }
  checks.push({ check: "manifest-presence", ok: true });

  let manifest: AgentSurfaceManifest;
  try {
    manifest = JSON.parse(await context.io.readFile(publicPath)) as AgentSurfaceManifest;
  } catch (err) {
    checks.push({ check: "manifest-parse", ok: false, detail: (err as Error).message });
    return manifestVerifyResult(checks, context.site?.name);
  }
  checks.push({ check: "manifest-parse", ok: true });

  // Verify contentHash
  const recomputedHash = computeAgentManifestContentHash(
    manifest as unknown as Record<string, unknown>,
  );
  checks.push({
    check: "content-hash",
    ok: recomputedHash === manifest.contentHash,
    detail: recomputedHash !== manifest.contentHash ? "recomputed hash does not match" : undefined,
  });

  // Verify signature
  if (!manifest.proof) {
    checks.push({
      check: "signature",
      ok: true,
      detail:
        "manifest has no proof (unsigned — run agent.surface.sign with PASSPORT_SIGNING_KEY to sign)",
    });
  } else {
    try {
      const baseUrl = (
        (await readAstroSiteUrl(paths.appDirectory)) ?? "https://example.com"
      ).replace(/\/$/, "");
      const canonicalUrl = `${baseUrl}/.well-known/agent.json`;
      const payload = buildAgentSigningPayload("manifest", canonicalUrl, manifest.contentHash);
      const valid = await verifyBytes(publicKeyMultibase, payload, manifest.proof.proofValue);
      checks.push({
        check: "signature",
        ok: valid,
        detail: valid ? undefined : "signature invalid",
      });
    } catch (err) {
      checks.push({ check: "signature", ok: false, detail: (err as Error).message });
    }
  }

  return manifestVerifyResult(checks, context.site?.name);
}
