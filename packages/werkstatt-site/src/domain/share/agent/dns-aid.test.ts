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
  it("builds record with _index._agents.<domain> name", () => {
    const record = buildDnsAidRecord(makeManifest("https://warpgogol.com"));
    expect(record.name).toBe("_index._agents.warpgogol.com");
  });

  it("builds record with SVCB type", () => {
    const record = buildDnsAidRecord(makeManifest("https://warpgogol.com"));
    expect(record.type).toBe("SVCB");
  });

  it("builds SVCB content with target, alpn and port params (RFC 9460)", () => {
    const record = buildDnsAidRecord(makeManifest("https://warpgogol.com"));
    expect(record.content).toBe("1 warpgogol.com alpn=h2 port=443");
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
    expect(record.name).toBe("_index._agents.localhost");
    expect(record.content).toBe("1 localhost alpn=h2 port=443");
  });

  it("strips trailing slash from baseUrl", () => {
    const record = buildDnsAidRecord(makeManifest("https://warpgogol.com/"));
    expect(record.content).toBe("1 warpgogol.com alpn=h2 port=443");
  });
});
