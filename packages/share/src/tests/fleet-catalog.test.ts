/*
<MODULE_CONTRACT>
<purpose>RFC-0292: determinism + shape tests for the Fleet Agent Catalog builder.</purpose>
<keywords>RFC-0292, fleet, agent catalog, test</keywords>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="tests">determinism, missing-doc entry, sorting, hash stability, empty-input safe default.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0292: initial builder tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import {
  buildFleetAgentCatalog,
  computeFleetCatalogContentHash,
  FLEET_AGENT_CATALOG_SCHEMA,
} from "../agent/fleet-catalog.ts";

const sampleDoc = {
  surfaceVersion: "1.0.0",
  site: "webgogol-com",
  baseUrl: "https://webgogol.com",
  contentHash: "abc123",
  knowledge: [
    { domain: "offer", url: "/api/agent/v1/offer.json", schema: "gogol.agent.knowledge/offer@1" },
  ],
  actions: [
    {
      id: "lead.submit",
      url: "/api/agent/actions/lead.submit",
      title: { de: "Anfrage" },
      inputSchemaRef: "#/x",
      entitlement: "agent.actions",
    },
  ],
  interfaces: {
    llms: "/llms.txt",
    twins: { pattern: "/**.md" },
    openapi: "/.well-known/agent.openapi.json",
    mcp: { url: "/api/agent/mcp", protocolVersion: "1" },
  },
  proof: null,
};

test("buildFleetAgentCatalog: missing doc ⇒ enabled: false entry", () => {
  const catalog = buildFleetAgentCatalog([{ site: "alpha", doc: null }]);
  expect(catalog.sites).toHaveLength(1);
  expect(catalog.sites[0]!.enabled).toBe(false);
  expect(catalog.sites[0]!.signed).toBe(false);
  expect(catalog.sites[0]!.knowledgeDomains).toEqual([]);
  expect(catalog.sites[0]!.actions).toEqual([]);
  expect(catalog.sites[0]!.baseUrl).toBe("");
});

test("buildFleetAgentCatalog: populated doc ⇒ enabled: true with extracted fields", () => {
  const catalog = buildFleetAgentCatalog([{ site: "alpha", doc: sampleDoc }]);
  const entry = catalog.sites[0]!;
  expect(entry.enabled).toBe(true);
  expect(entry.signed).toBe(false);
  expect(entry.baseUrl).toBe("https://webgogol.com");
  expect(entry.surfaceVersion).toBe("1.0.0");
  expect(entry.contentHash).toBe("abc123");
  expect(entry.knowledgeDomains).toEqual(["offer"]);
  expect(entry.actions).toEqual(["lead.submit"]);
  expect(entry.interfaces).toEqual({ openapi: true, mcp: true });
});

test("buildFleetAgentCatalog: proof present ⇒ signed: true", () => {
  const catalog = buildFleetAgentCatalog([
    {
      site: "alpha",
      doc: {
        ...sampleDoc,
        proof: { type: "Ed25519Signature2020", verificationMethod: "k", proofValue: "v" },
      },
    },
  ]);
  expect(catalog.sites[0]!.signed).toBe(true);
});

test("buildFleetAgentCatalog: sorts sites by site id", () => {
  const catalog = buildFleetAgentCatalog([
    { site: "zeta", doc: null },
    { site: "alpha", doc: null },
    { site: "mid", doc: null },
  ]);
  expect(catalog.sites.map((s) => s.site)).toEqual(["alpha", "mid", "zeta"]);
});

test("buildFleetAgentCatalog: is deterministic across repeated calls (byte-identical)", () => {
  const input = [
    { site: "alpha", doc: sampleDoc },
    { site: "beta", doc: null },
  ];
  const a = buildFleetAgentCatalog(input);
  const b = buildFleetAgentCatalog(input);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  expect(a.contentHash).toBe(b.contentHash);
});

test("buildFleetAgentCatalog: empty input ⇒ valid catalog with empty sites", () => {
  const catalog = buildFleetAgentCatalog([]);
  expect(catalog.sites).toEqual([]);
  expect(catalog.schema).toBe(FLEET_AGENT_CATALOG_SCHEMA);
  expect(catalog.contentHash).toMatch(/^[0-9a-f]{64}$/);
});

test("buildFleetAgentCatalog: contentHash is a 64-char lowercase hex sha256", () => {
  const catalog = buildFleetAgentCatalog([{ site: "alpha", doc: sampleDoc }]);
  expect(catalog.contentHash).toMatch(/^[0-9a-f]{64}$/);
});

test("computeFleetCatalogContentHash: matches the builder's hash for the same sites", () => {
  const catalog = buildFleetAgentCatalog([
    { site: "alpha", doc: sampleDoc },
    { site: "beta", doc: null },
  ]);
  const recomputed = computeFleetCatalogContentHash(catalog.sites);
  expect(recomputed).toBe(catalog.contentHash);
});

test("buildFleetAgentCatalog: input array order does not affect output (sorted)", () => {
  const a = buildFleetAgentCatalog([
    { site: "alpha", doc: sampleDoc },
    { site: "beta", doc: null },
  ]);
  const b = buildFleetAgentCatalog([
    { site: "beta", doc: null },
    { site: "alpha", doc: sampleDoc },
  ]);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});
