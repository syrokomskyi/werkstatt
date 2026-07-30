/*
<MODULE_CONTRACT>
<purpose>
RFC-0287: the static Agent Surface knowledge tier. Defines the closed domain
list, the per-domain envelope shape, and the pure envelope formatter. Callers
(kernel commands) load and project business content through the existing
RFC-0148 projectors and pass the already-resolved per-language payload here —
this module never reads files or invents fact shapes.
</purpose>
<non-goals>
  <item>Do not read content or call projectors — the kernel command does that.</item>
  <item>Do not define new fact shapes — extend business-projection.ts/models.ts first.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0287: initial knowledge tier — domain list, envelope, formatter.</item>
</CHANGE_SUMMARY>
*/

import { computeAgentManifestContentHash } from "./manifest.ts";
import type { AgentSurfaceProof } from "./proof.ts";

/** Exactly the `public`-visibility keys of BUSINESS_DOMAIN_VISIBILITY (RFC-0148). */
export const AGENT_KNOWLEDGE_DOMAINS = [
  "company",
  "legal",
  "contact",
  "offer",
  "service",
  "location",
  "web",
  "people",
  "trust",
  "faq",
] as const;

export type AgentKnowledgeDomain = (typeof AGENT_KNOWLEDGE_DOMAINS)[number];

export function isAgentKnowledgeDomain(value: string): value is AgentKnowledgeDomain {
  return (AGENT_KNOWLEDGE_DOMAINS as readonly string[]).includes(value);
}

export interface AgentKnowledgeFreshness {
  lastVerified: string | null;
  source: "ckl-claim-ledger" | "authored-verification" | "derived-source";
  coverage: "domain";
}

export interface AgentKnowledgeEnvelope<TData = unknown> {
  /** e.g. "gogol.agent.knowledge/offer@1" or @2 for RFC-0319 shape changes. */
  schema: string;
  site: string;
  baseUrl: string;
  languages: { default: string; supported: string[] };
  /** sha256 hex over sorted-key JSON of this document minus contentHash. */
  contentHash: string;
  /** RFC-0319: required freshness for every emitted envelope. */
  freshness?: AgentKnowledgeFreshness;
  /** Per-language payload; non-default languages carry only overlay fields (RFC-0008). */
  data: Record<string, TData>;
  /** RFC-0308: detached Ed25519 proof, null/absent when unsigned. */
  proof?: AgentSurfaceProof | null;
}

export interface AgentKnowledgeBuildInput<TData = unknown> {
  domain: AgentKnowledgeDomain;
  site: string;
  baseUrl: string;
  languages: { default: string; supported: string[] };
  /** Already-projected per-language payload — never raw content. */
  data: Record<string, TData>;
  freshness?: AgentKnowledgeFreshness;
  /** RFC-0319: schema version. Defaults to 1. Bump to 2 for breaking shape changes. */
  schemaVersion?: number;
}

/** Pure: assemble + hash one domain's knowledge envelope. Deterministic. */
export function formatAgentKnowledge<TData = unknown>(
  input: AgentKnowledgeBuildInput<TData>,
): AgentKnowledgeEnvelope<TData> {
  const version = input.schemaVersion ?? 1;
  const base: Omit<AgentKnowledgeEnvelope<TData>, "contentHash"> = {
    schema: `gogol.agent.knowledge/${input.domain}@${version}`,
    site: input.site,
    baseUrl: input.baseUrl.replace(/\/+$/, ""),
    languages: {
      default: input.languages.default,
      supported: [...input.languages.supported].sort(),
    },
    ...(input.freshness ? { freshness: input.freshness } : {}),
    data: input.data,
  };
  const contentHash = computeAgentManifestContentHash(base as unknown as Record<string, unknown>);
  return { ...base, contentHash };
}
