/*
<MODULE_CONTRACT>
<purpose>RFC-0789: tests for conditional agent discovery links in buildLlmsIndex.</purpose>
<keywords>RFC-0789, llms.txt, agent surface, discovery links, test</keywords>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="tests">agent absent (default enabled), agent.enabled true, agent.enabled false, absolute URLs.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0789: initial tests for conditional agent discovery links in buildLlmsIndex.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { buildLlmsIndex } from "../semantic/llms.ts";
import type { SemanticSiteModel } from "../semantic/models.ts";

function makeSite(overrides: Partial<SemanticSiteModel> = {}): SemanticSiteModel {
  return {
    baseUrl: "https://example.com",
    lang: "de",
    organization: {
      name: "Test Org",
      description: "A test organization.",
      url: "https://example.com",
    },
    pages: [],
    ...overrides,
  };
}

test("buildLlmsIndex: agent absent → all 4 agent discovery links present", () => {
  const output = buildLlmsIndex(makeSite());
  expect(output).toContain("agent.json");
  expect(output).toContain("api-catalog");
  expect(output).toContain("mcp/server-card.json");
  expect(output).toContain("agent.openapi.json");
});

test("buildLlmsIndex: agent.enabled true → all 4 agent discovery links present", () => {
  const output = buildLlmsIndex(makeSite({ agent: { enabled: true } }));
  expect(output).toContain("agent.json");
  expect(output).toContain("api-catalog");
  expect(output).toContain("mcp/server-card.json");
  expect(output).toContain("agent.openapi.json");
});

test("buildLlmsIndex: agent.enabled false → zero agent discovery links", () => {
  const output = buildLlmsIndex(makeSite({ agent: { enabled: false } }));
  expect(output).not.toContain("agent.json");
  expect(output).not.toContain("api-catalog");
  expect(output).not.toContain("server-card.json");
  expect(output).not.toContain("agent.openapi.json");
  expect(output).toContain("llms-full.txt");
});

test("buildLlmsIndex: agent links use absolute https URLs", () => {
  const output = buildLlmsIndex(makeSite());
  expect(output).toContain("https://example.com/.well-known/agent.json");
  expect(output).toContain("https://example.com/.well-known/api-catalog");
  expect(output).toContain("https://example.com/.well-known/mcp/server-card.json");
  expect(output).toContain("https://example.com/.well-known/agent.openapi.json");
});
