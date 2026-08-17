/*
<MODULE_CONTRACT>
<purpose>RFC-0289: bijection + shape tests for the OpenAPI projection formatter.</purpose>
<keywords>RFC-0289, agent surface, OpenAPI, test</keywords>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="tests">empty manifest, knowledge ref projection, action ref projection, mcp/proof omission.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0289: initial OpenAPI formatter tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { formatAgentOpenApi } from "../agent/openapi.ts";
import { buildAgentSurfaceManifest } from "../agent/manifest.ts";

test("formatAgentOpenApi: empty manifest yields a valid document with no paths", () => {
  const manifest = buildAgentSurfaceManifest({
    site: "s",
    baseUrl: "https://s.example",
    languages: { default: "de", supported: ["de"] },
  });
  const doc = formatAgentOpenApi(manifest, []);
  expect(doc.openapi).toBe("3.1.0");
  expect(doc.info.title).toBe("s agent surface");
  expect(doc.info["x-gogol-content-hash"]).toBe(manifest.contentHash);
  expect(doc.paths).toEqual({});
  expect("x-gogol-mcp" in doc).toBe(false);
  expect("x-gogol-proof" in doc).toBe(false);
});

test("formatAgentOpenApi: one knowledge ref → one GET path + one component schema", () => {
  const manifest = buildAgentSurfaceManifest({
    site: "s",
    baseUrl: "https://s.example",
    languages: { default: "de", supported: ["de"] },
    knowledge: [
      { domain: "offer", url: "/api/agent/v1/offer.json", schema: "gogol.agent.knowledge/offer@1" },
    ],
  });
  const doc = formatAgentOpenApi(manifest, []);
  const op = doc.paths["/api/agent/v1/offer.json"]?.get;
  expect(op).toBeTruthy();
  expect(op!.operationId).toBe("knowledge.offer.get");
  expect(op!.tags).toEqual(["knowledge"]);
  expect(doc.components.schemas["knowledge-offer"]).toBeTruthy();
});

test("formatAgentOpenApi: one action ref → one POST path with verbatim input/output schemas", () => {
  const inputSchema = {
    type: "object" as const,
    additionalProperties: false as const,
    required: ["message"],
    properties: { message: { type: "string" as const } },
  };
  const outputSchema = {
    type: "object" as const,
    additionalProperties: false as const,
    properties: { accepted: { type: "boolean" as const } },
  };
  const manifest = buildAgentSurfaceManifest({
    site: "s",
    baseUrl: "https://s.example",
    languages: { default: "de", supported: ["de"] },
    actions: [
      {
        id: "lead.submit",
        url: "/api/agent/actions/lead.submit",
        title: { de: "Anfrage senden" },
        inputSchemaRef: "#/components/schemas/lead.submit-input",
        entitlement: "agent.actions",
      },
    ],
  });
  const doc = formatAgentOpenApi(manifest, [
    { id: "lead.submit", input: inputSchema, output: outputSchema },
  ]);
  const op = doc.paths["/api/agent/actions/lead.submit"]?.post;
  expect(op).toBeTruthy();
  expect(op!.operationId).toBe("action.lead.submit");
  expect(op!.summary).toBe("Anfrage senden");
  expect(doc.components.schemas["lead.submit-input"]).toEqual(inputSchema);
  expect(doc.components.schemas["lead.submit-output"]).toEqual(outputSchema);
  expect(op!.requestBody!.content["application/json"].schema).toEqual(inputSchema);
});

test("formatAgentOpenApi: an action ref without a matching capability schema is skipped defensively", () => {
  const manifest = buildAgentSurfaceManifest({
    site: "s",
    baseUrl: "https://s.example",
    languages: { default: "de", supported: ["de"] },
    actions: [
      {
        id: "lead.submit",
        url: "/api/agent/actions/lead.submit",
        title: { de: "x" },
        inputSchemaRef: "#/components/schemas/lead.submit-input",
        entitlement: "agent.actions",
      },
    ],
  });
  const doc = formatAgentOpenApi(manifest, []);
  expect(doc.paths["/api/agent/actions/lead.submit"]).toBe(undefined);
});

test("formatAgentOpenApi: mcp interface present → x-gogol-mcp is set", () => {
  const manifest = buildAgentSurfaceManifest({
    site: "s",
    baseUrl: "https://s.example",
    languages: { default: "de", supported: ["de"] },
    mcp: { url: "/api/agent/mcp", protocolVersion: "2025-06-18" },
  });
  const doc = formatAgentOpenApi(manifest, []);
  expect(doc["x-gogol-mcp"]).toEqual({ url: "/api/agent/mcp", protocolVersion: "2025-06-18" });
});
