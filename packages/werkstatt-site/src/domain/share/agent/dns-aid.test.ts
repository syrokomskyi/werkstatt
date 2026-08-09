/*
<MODULE_CONTRACT>
<purpose>
RFC-0786: Unit tests for the buildDnsAidRecord pure function.
Verifies determinism, domain extraction, and content URL construction.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0786: initial unit tests for buildDnsAidRecord.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { buildDnsAidRecord } from "@warpgogol/werkstatt-site/share/agent";
import type { AgentSurfaceManifest } from "@warpgogol/werkstatt-site/share/agent";

function makeManifest(baseUrl: string): AgentSurfaceManifest {
  return {
    surfaceVersion: "1.0.0",
    site: "test-site",
    baseUrl,
    languages: { default: "de", supported: ["de"] },
    contentHash: "abc123",
    knowledge: [],
    actions: [],
    interfaces: { llms: "", twins: null, openapi: null, mcp: null },
    proof: null,
  };
}

describe("buildDnsAidRecord (RFC-0786)", () => {
  it("builds record with _agent.<domain> name", () => {
    const record = buildDnsAidRecord(makeManifest("https://warpgogol.com"));
    expect(record.name).toBe("_agent.warpgogol.com");
  });

  it("builds record with TXT type", () => {
    const record = buildDnsAidRecord(makeManifest("https://warpgogol.com"));
    expect(record.type).toBe("TXT");
  });

  it("builds content URL pointing to .well-known/agent.json", () => {
    const record = buildDnsAidRecord(makeManifest("https://warpgogol.com"));
    expect(record.content).toBe("https://warpgogol.com/.well-known/agent.json");
  });

  it("sets ttl to 3600", () => {
    const record = buildDnsAidRecord(makeManifest("https://warpgogol.com"));
    expect(record.ttl).toBe(3600);
  });

  it("sets proxied to false", () => {
    const record = buildDnsAidRecord(makeManifest("https://warpgogol.com"));
    expect(record.proxied).toBe(false);
  });

  it("is deterministic — same input produces same output (DNA-58)", () => {
    const manifest = makeManifest("https://example.org");
    const r1 = buildDnsAidRecord(manifest);
    const r2 = buildDnsAidRecord(manifest);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("extracts domain from URL with port", () => {
    const record = buildDnsAidRecord(makeManifest("http://localhost:3000"));
    expect(record.name).toBe("_agent.localhost");
    expect(record.content).toBe("http://localhost:3000/.well-known/agent.json");
  });

  it("strips trailing slash from baseUrl", () => {
    const record = buildDnsAidRecord(makeManifest("https://warpgogol.com/"));
    expect(record.content).toBe("https://warpgogol.com/.well-known/agent.json");
  });
});
