/*
<MODULE_CONTRACT>
<purpose>RFC-0286: determinism + shape tests for the Agent Surface Manifest builder.</purpose>
<keywords>RFC-0286, agent surface, manifest, test</keywords>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="tests">determinism, sorting, hash stability, empty-input safe default.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0286: initial builder tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import {
  AGENT_SURFACE_VERSION,
  buildAgentSurfaceManifest,
  computeAgentManifestContentHash,
  canonicalJson,
} from "../agent/manifest.ts";

const baseInput = {
  site: "webgogol-com",
  baseUrl: "https://webgogol.com/",
  languages: { default: "de", supported: ["uk", "de"] },
};

test("buildAgentSurfaceManifest: strips trailing slash and sorts supported languages", () => {
  const m = buildAgentSurfaceManifest(baseInput);
  expect(m.baseUrl).toBe("https://webgogol.com");
  expect(m.languages.supported).toEqual(["de", "uk"]);
});

test("buildAgentSurfaceManifest: safe default — empty knowledge/actions, null interfaces", () => {
  const m = buildAgentSurfaceManifest(baseInput);
  expect(m.knowledge).toEqual([]);
  expect(m.actions).toEqual([]);
  expect(m.interfaces.openapi).toBe(null);
  expect(m.interfaces.mcp).toBe(null);
  expect(m.interfaces.twins).toBe(null);
  expect(m.proof).toBe(null);
  expect(m.surfaceVersion).toBe(AGENT_SURFACE_VERSION);
});

test("buildAgentSurfaceManifest: is deterministic across repeated calls (byte-identical)", () => {
  const a = buildAgentSurfaceManifest(baseInput);
  const b = buildAgentSurfaceManifest(baseInput);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  expect(a.contentHash).toBe(b.contentHash);
});

test("buildAgentSurfaceManifest: sorts knowledge refs by domain and actions by id", () => {
  const m = buildAgentSurfaceManifest({
    ...baseInput,
    knowledge: [
      { domain: "offer", url: "/api/agent/v1/offer.json", schema: "gogol.agent.knowledge/offer@1" },
      {
        domain: "company",
        url: "/api/agent/v1/company.json",
        schema: "gogol.agent.knowledge/company@1",
      },
    ],
    actions: [
      {
        id: "lead.submit",
        url: "/api/agent/actions/lead.submit",
        title: { de: "Anfrage senden" },
        inputSchemaRef: "#/components/schemas/lead.submit-input",
        entitlement: "agent.actions",
      },
      {
        id: "appointment.request",
        url: "/api/agent/actions/appointment.request",
        title: { de: "Termin anfragen" },
        inputSchemaRef: "#/components/schemas/appointment.request-input",
        entitlement: "agent.actions",
      },
    ],
  });
  expect(m.knowledge.map((k) => k.domain)).toEqual(["company", "offer"]);
  expect(m.actions.map((a) => a.id)).toEqual(["appointment.request", "lead.submit"]);
});

test("computeAgentManifestContentHash: excludes contentHash and proof fields from the hash input", () => {
  const doc: Record<string, unknown> = { a: 1, b: 2, contentHash: "whatever", proof: { x: 1 } };
  const withoutHashFields = { a: 1, b: 2 };
  expect(computeAgentManifestContentHash(doc)).toBe(
    computeAgentManifestContentHash({ ...withoutHashFields, contentHash: "other", proof: null }),
  );
});

test("computeAgentManifestContentHash: is a 64-char lowercase hex sha256 digest", () => {
  const hash = computeAgentManifestContentHash({ a: 1 });
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
});

test("canonicalJson: sorts object keys deeply, preserves array order", () => {
  expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
});
