/*
<MODULE_CONTRACT>
<purpose>
RFC-0286: the Agent Surface Manifest — the single generated artifact every
protocol projection (knowledge files, OpenAPI, MCP) derives from (AS-1). Pure,
deterministic assembly: no I/O, no timestamps, sorted-key canonical hashing so
two runs on unchanged input are byte-identical (AS-7).
</purpose>
<non-goals>
  <item>Do not read files or content — callers (kernel commands) load and pass data.</item>
  <item>Do not sign — proof is always null here; RFC-0308 adds signing over the
        domain-separated content hash payload via agent.surface.sign.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0286: initial manifest contract and pure builder.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import type { AgentSurfaceProof } from "./proof.ts";

/** Semver of THIS manifest schema. Bump only via an RFC amending RFC-0286 (AS-7). */
export const AGENT_SURFACE_VERSION = "1.0.0";

export interface AgentKnowledgeRef {
  /** A BusinessDomain with visibility "public" (RFC-0287). */
  domain: string;
  url: string;
  /** e.g. "gogol.agent.knowledge/offer@1". */
  schema: string;
}

export interface AgentActionRef {
  /** Capability catalog id, e.g. "lead.submit" (RFC-0288). */
  id: string;
  url: string;
  title: Record<string, string>;
  inputSchemaRef: string;
  entitlement: "agent.actions";
}

export interface AgentSurfaceManifest {
  surfaceVersion: string;
  site: string;
  baseUrl: string;
  languages: { default: string; supported: string[] };
  /** sha256 hex over sorted-key JSON of this document minus contentHash + proof. */
  contentHash: string;
  knowledge: AgentKnowledgeRef[];
  actions: AgentActionRef[];
  interfaces: {
    llms: string;
    twins: { pattern: string } | null;
    openapi: string | null;
    mcp: { url: string; protocolVersion: string } | null;
  };
  /** Null until agent.surface.sign signs it (RFC-0308) or when no key material exists. */
  proof: AgentSurfaceProof | null;
}

export interface AgentSurfaceManifestInput {
  site: string;
  baseUrl: string;
  languages: { default: string; supported: string[] };
  knowledge?: AgentKnowledgeRef[];
  actions?: AgentActionRef[];
  hasTwins?: boolean;
  openapiUrl?: string | null;
  mcp?: { url: string; protocolVersion: string } | null;
}

// ---------------------------------------------------------------------------
// Canonicalization — shared by hashing here and by signing in RFC-0308
// ---------------------------------------------------------------------------

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Deterministic sorted-key JSON serialization — no whitespace, stable key order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

/** sha256 hex over the canonical JSON of `doc` with `contentHash` and `proof` removed. */
export function computeAgentManifestContentHash(doc: Record<string, unknown>): string {
  const { contentHash: _contentHash, proof: _proof, ...rest } = doc;
  return createHash("sha256").update(canonicalJson(rest), "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/** Pure: assemble + hash the manifest. Deterministic — sorts refs and languages. */
export function buildAgentSurfaceManifest(input: AgentSurfaceManifestInput): AgentSurfaceManifest {
  const base: Omit<AgentSurfaceManifest, "contentHash"> = {
    surfaceVersion: AGENT_SURFACE_VERSION,
    site: input.site,
    baseUrl: input.baseUrl.replace(/\/+$/, ""),
    languages: {
      default: input.languages.default,
      supported: [...input.languages.supported].sort(),
    },
    knowledge: [...(input.knowledge ?? [])].sort((a, b) => a.domain.localeCompare(b.domain)),
    actions: [...(input.actions ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
    interfaces: {
      llms: "/llms.txt",
      twins: input.hasTwins ? { pattern: "/**.md" } : null,
      openapi: input.openapiUrl ?? null,
      mcp: input.mcp ?? null,
    },
    proof: null,
  };
  const contentHash = computeAgentManifestContentHash(base as unknown as Record<string, unknown>);
  return { ...base, contentHash };
}
