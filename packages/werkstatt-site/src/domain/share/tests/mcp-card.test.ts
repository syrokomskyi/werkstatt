/*
<MODULE_CONTRACT>
<purpose>RFC-0783: determinism + shape tests for the MCP Server Card projection.</purpose>
<keywords>RFC-0783, agent surface, MCP Server Card, test</keywords>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="tests">null mcp, mcp card fields, determinism.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0783: initial MCP Server Card projection tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { buildMcpServerCard } from "../agent/mcp-card.ts";
import { buildAgentSurfaceManifest } from "../agent/manifest.ts";

test("buildMcpServerCard: null mcp → returns null", () => {
  const manifest = buildAgentSurfaceManifest({
    site: "s",
    baseUrl: "https://s.example",
    languages: { default: "de", supported: ["de"] },
  });
  expect(buildMcpServerCard(manifest)).toBeNull();
});

test("buildMcpServerCard: mcp interface → card with correct fields", () => {
  const manifest = buildAgentSurfaceManifest({
    site: "warpgogol",
    baseUrl: "https://warpgogol.com",
    languages: { default: "de", supported: ["de"] },
    mcp: { url: "/api/agent/mcp", protocolVersion: "2025-06-18" },
  });
  const card = buildMcpServerCard(manifest);
  expect(card).not.toBeNull();
  expect(card!.serverInfo.name).toBe("warpgogol-agent-gate");
  expect(card!.serverInfo.version).toBe(manifest.surfaceVersion);
  expect(card!.transport.type).toBe("streamable-http");
  expect(card!.transport.url).toBe("/api/agent/mcp");
  expect(card!.protocolVersion).toBe("2025-06-18");
  expect(card!.capabilities.tools.listChanged).toBe(false);
  expect(card!.capabilities.resources.listChanged).toBe(false);
  expect(card!.capabilities.resources.subscribe).toBe(false);
  expect(card!.capabilities.prompts.listChanged).toBe(false);
});

test("buildMcpServerCard: determinism — same input produces identical output", () => {
  const input = {
    site: "s",
    baseUrl: "https://s.example",
    languages: { default: "de", supported: ["de"] },
    mcp: { url: "/api/agent/mcp", protocolVersion: "2025-06-18" },
  };
  const a = buildMcpServerCard(buildAgentSurfaceManifest(input));
  const b = buildMcpServerCard(buildAgentSurfaceManifest(input));
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});
