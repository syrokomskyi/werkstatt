/*
<MODULE_CONTRACT>
<purpose>ARD ai-catalog.json projection tests: determinism, shape, entry coverage.</purpose>
<keywords>ARD, ai-catalog, agent surface, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial ARD ai-catalog.json projection tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { buildArdCatalog } from "../agent/ard-catalog.ts";
import { buildAgentSurfaceManifest } from "../agent/manifest.ts";

test("buildArdCatalog: produces specVersion, host, and entries array", () => {
  const manifest = buildAgentSurfaceManifest({
    site: "s",
    baseUrl: "https://s.example",
    languages: { default: "de", supported: ["de"] },
  });
  const catalog = buildArdCatalog(manifest, "My Site");
  expect(catalog.specVersion).toBe("1.0");
  expect(catalog.host.displayName).toBe("My Site");
  expect(catalog.host.identifier).toBe("did:web:s.example");
  expect(catalog.entries.length).toBeGreaterThan(0);
});

test("buildArdCatalog: each entry has identifier, displayName, type, url, representativeQueries", () => {
  const manifest = buildAgentSurfaceManifest({
    site: "s",
    baseUrl: "https://s.example",
    languages: { default: "de", supported: ["de"] },
    mcp: { url: "/api/agent/mcp", protocolVersion: "2025-06-18" },
    knowledge: [
      { domain: "offer", url: "/api/agent/v1/offer.json", schema: "gogol.agent.knowledge/offer@1" },
    ],
  });
  const catalog = buildArdCatalog(manifest);
  for (const entry of catalog.entries) {
    expect(entry.identifier).toMatch(/^urn:air:s\.example:/);
    expect(entry.displayName).toBeTruthy();
    expect(entry.type).toBeTruthy();
    expect(entry.url).toBeTruthy();
    expect(entry.representativeQueries.length).toBeGreaterThanOrEqual(2);
    expect(entry.representativeQueries.length).toBeLessThanOrEqual(5);
  }
});

test("buildArdCatalog: MCP interface adds MCP server entry", () => {
  const manifest = buildAgentSurfaceManifest({
    site: "s",
    baseUrl: "https://s.example",
    languages: { default: "de", supported: ["de"] },
    mcp: { url: "/api/agent/mcp", protocolVersion: "2025-06-18" },
  });
  const catalog = buildArdCatalog(manifest);
  const mcpEntry = catalog.entries.find((e) => e.identifier.includes(":server:mcp"));
  expect(mcpEntry).toBeDefined();
  expect(mcpEntry?.type).toBe("application/mcp-server-card+json");
  expect(mcpEntry?.url).toBe("/.well-known/mcp/server-card.json");
});

test("buildArdCatalog: knowledge refs produce entries", () => {
  const manifest = buildAgentSurfaceManifest({
    site: "s",
    baseUrl: "https://s.example",
    languages: { default: "de", supported: ["de"] },
    knowledge: [
      { domain: "offer", url: "/api/agent/v1/offer.json", schema: "gogol.agent.knowledge/offer@1" },
      { domain: "team", url: "/api/agent/v1/team.json", schema: "gogol.agent.knowledge/team@1" },
    ],
  });
  const catalog = buildArdCatalog(manifest);
  const knowledgeEntries = catalog.entries.filter((e) => e.identifier.includes(":knowledge:"));
  expect(knowledgeEntries).toHaveLength(2);
  expect(knowledgeEntries[0].url).toBe("/api/agent/v1/offer.json");
});

test("buildArdCatalog: entries are sorted by identifier", () => {
  const manifest = buildAgentSurfaceManifest({
    site: "s",
    baseUrl: "https://s.example",
    languages: { default: "de", supported: ["de"] },
    knowledge: [
      { domain: "zeta", url: "/api/agent/v1/zeta.json", schema: "gogol.agent.knowledge/zeta@1" },
      { domain: "alpha", url: "/api/agent/v1/alpha.json", schema: "gogol.agent.knowledge/alpha@1" },
    ],
  });
  const catalog = buildArdCatalog(manifest);
  const identifiers = catalog.entries.map((e) => e.identifier);
  const sorted = [...identifiers].sort();
  expect(identifiers).toEqual(sorted);
});

test("buildArdCatalog: determinism — same input produces identical output", () => {
  const input = {
    site: "s",
    baseUrl: "https://s.example",
    languages: { default: "de", supported: ["de"] },
    knowledge: [
      { domain: "offer", url: "/api/agent/v1/offer.json", schema: "gogol.agent.knowledge/offer@1" },
    ],
    mcp: { url: "/api/agent/mcp", protocolVersion: "2025-06-18" },
  };
  const a = buildArdCatalog(buildAgentSurfaceManifest(input), "My Site");
  const b = buildArdCatalog(buildAgentSurfaceManifest(input), "My Site");
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});

test("buildArdCatalog: host identifier uses did:web format with domain", () => {
  const manifest = buildAgentSurfaceManifest({
    site: "warpgogol-com",
    baseUrl: "https://warpgogol.com",
    languages: { default: "de", supported: ["de"] },
  });
  const catalog = buildArdCatalog(manifest, "Warpgogol");
  expect(catalog.host.identifier).toBe("did:web:warpgogol.com");
  expect(catalog.host.displayName).toBe("Warpgogol");
});

test("buildArdCatalog: default hostDisplayName falls back to site name", () => {
  const manifest = buildAgentSurfaceManifest({
    site: "my-site",
    baseUrl: "https://example.com",
    languages: { default: "de", supported: ["de"] },
  });
  const catalog = buildArdCatalog(manifest);
  expect(catalog.host.displayName).toBe("my-site");
});
