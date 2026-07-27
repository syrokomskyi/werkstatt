/*
<MODULE_CONTRACT>
<purpose>
RFC-0292: the Fleet Agent Catalog — a deterministic projection of every site's
public Agent Surface Manifest into one workspace-level discovery document.
Pure, framework-free assembly: no I/O, no timestamps, sorted-key canonical
hashing so two runs on unchanged input are byte-identical. Consumed by
fleet.agent.catalog.generate (site-kernel-checks) and by the Leitstand.
</purpose>
<non-goals>
  <item>Do not read files or network — callers (kernel commands) load each
        site's agent.json and pass already-parsed data here.</item>
  <item>Do not aggregate knowledge payloads, leads, or any per-site data —
        only public discovery metadata (RFC-0176/0177 isolation).</item>
  <item>Do not add fields absent from the site's own agent.json — the catalog
        is a projection, never a new source of facts (AS-2 at fleet scale).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0292: initial fleet catalog contract and pure builder.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import { canonicalJson } from "./manifest.ts";

export const FLEET_AGENT_CATALOG_SCHEMA = "gogol.fleet.agent-catalog@1";

export interface FleetAgentCatalogEntry {
  site: string;
  baseUrl: string;
  surfaceVersion: string;
  contentHash: string;
  signed: boolean;
  enabled: boolean;
  knowledgeDomains: string[];
  actions: string[];
  interfaces: { openapi: boolean; mcp: boolean };
}

export interface FleetAgentCatalog {
  schema: typeof FLEET_AGENT_CATALOG_SCHEMA;
  /** sha256 over sorted-key JSON of `sites` — no timestamps (byte-stable). */
  contentHash: string;
  sites: FleetAgentCatalogEntry[];
}

export interface FleetAgentCatalogSiteInput {
  site: string;
  /** Parsed agent.json, or null when the site has no agent surface (agent.enabled: false). */
  doc: Record<string, unknown> | null;
}

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

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/**
 * Extract a catalog entry from one site's parsed agent.json.
 * Missing doc ⇒ enabled: false entry with empty arrays.
 */
function entryFromSiteInput(input: FleetAgentCatalogSiteInput): FleetAgentCatalogEntry {
  if (!input.doc) {
    return {
      site: input.site,
      baseUrl: "",
      surfaceVersion: "",
      contentHash: "",
      signed: false,
      enabled: false,
      knowledgeDomains: [],
      actions: [],
      interfaces: { openapi: false, mcp: false },
    };
  }

  const doc = input.doc;
  const knowledge = Array.isArray(doc.knowledge) ? doc.knowledge : [];
  const actions = Array.isArray(doc.actions) ? doc.actions : [];
  const interfaces = (doc.interfaces ?? {}) as Record<string, unknown>;

  return {
    site: input.site,
    baseUrl: asString(doc.baseUrl) ?? "",
    surfaceVersion: asString(doc.surfaceVersion) ?? "",
    contentHash: asString(doc.contentHash) ?? "",
    signed: doc.proof != null,
    enabled: true,
    knowledgeDomains: knowledge
      .map((ref) => asString((ref as Record<string, unknown>)?.domain))
      .filter((d): d is string => typeof d === "string")
      .sort((a, b) => a.localeCompare(b)),
    actions: actions
      .map((ref) => asString((ref as Record<string, unknown>)?.id))
      .filter((d): d is string => typeof d === "string")
      .sort((a, b) => a.localeCompare(b)),
    interfaces: {
      openapi: interfaces.openapi != null,
      mcp: interfaces.mcp != null,
    },
  };
}

/**
 * Pure: (fleet sites × loaded discovery docs) → catalog.
 * Missing doc ⇒ enabled: false entry.
 * Sites are sorted by site id; entries are deterministic.
 */
export function buildFleetAgentCatalog(input: FleetAgentCatalogSiteInput[]): FleetAgentCatalog {
  const sites = input
    .slice()
    .sort((a, b) => a.site.localeCompare(b.site))
    .map(entryFromSiteInput);

  const contentHash = createHash("sha256").update(canonicalJson(sites), "utf8").digest("hex");

  return {
    schema: FLEET_AGENT_CATALOG_SCHEMA,
    contentHash,
    sites,
  };
}

/**
 * Re-compute the catalog contentHash from a parsed catalog's sites array.
 * Used by the validator to detect staleness/tampering (FAC-01).
 */
export function computeFleetCatalogContentHash(sites: unknown[]): string {
  return createHash("sha256")
    .update(JSON.stringify(sortKeysDeep(sites)), "utf8")
    .digest("hex");
}
