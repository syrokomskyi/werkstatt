/*
<MODULE_CONTRACT>
<purpose>
RFC-0783: pure, dependency-free formatter that projects a site's Agent Surface
Manifest into a SEP-1649 MCP Server Card for /.well-known/mcp/server-card.json.
No I/O — the kernel command loads the manifest and passes it here.
</purpose>
<non-goals>
  <item>Do not read files — callers load and pass the manifest.</item>
  <item>Do not sign — signing is a separate concern (agent.surface.sign).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0783: initial MCP Server Card projection.</item>
</CHANGE_SUMMARY>
*/

import type { AgentSurfaceManifest } from "./manifest.ts";

/** SEP-1649 MCP Server Card. */
export interface McpServerCard {
  serverInfo: {
    name: string;
    version: string;
    description?: string;
  };
  transport: {
    type: "streamable-http";
    url: string;
  };
  protocolVersion: string;
  capabilities: {
    tools: { listChanged: boolean };
    resources: { listChanged: boolean; subscribe: boolean };
    prompts: { listChanged: boolean };
  };
}

/**
 * Pure: project Agent Surface Manifest into SEP-1649 server card.
 * Deterministic — same manifest input produces byte-identical output (DNA-58).
 * Returns null when manifest.interfaces.mcp is null (no MCP endpoint).
 */
export function buildMcpServerCard(manifest: AgentSurfaceManifest): McpServerCard | null {
  if (!manifest.interfaces.mcp) return null;

  return {
    serverInfo: {
      name: `${manifest.site}-agent-gate`,
      version: manifest.surfaceVersion,
    },
    transport: {
      type: "streamable-http",
      url: manifest.interfaces.mcp.url,
    },
    protocolVersion: manifest.interfaces.mcp.protocolVersion,
    capabilities: {
      tools: { listChanged: false },
      resources: { listChanged: false, subscribe: false },
      prompts: { listChanged: false },
    },
  };
}
