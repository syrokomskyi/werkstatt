/*
<MODULE_CONTRACT>
<purpose>
RFC-0783: shared helpers for agent surface command handlers — eliminates
duplicated boilerplate (loadInternalManifest, readAgentBlock) across
agent-openapi.ts, agent-api-catalog.ts, and agent-mcp-card.ts.
</purpose>
<non-goals>
  <item>Do not add command-specific logic — only shared loading helpers.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0783: extract shared agent surface handler helpers.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { parse as yamlParse } from "yaml";
import type { KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";
import type { AgentSurfaceManifest } from "@warpgogol/werkstatt-site/share/agent";

const INTERNAL_MANIFEST_FILE = "src/agent-surface.generated.yaml";

export interface AgentSystemBlock {
  enabled?: boolean;
}

export function readAgentBlock(manifest: unknown): AgentSystemBlock {
  return ((manifest as Record<string, unknown>).agent as AgentSystemBlock | undefined) ?? {};
}

export async function loadInternalManifest(
  context: KernelRuntimeContext,
  appDirectory: string,
): Promise<AgentSurfaceManifest | null> {
  const path = join(appDirectory, INTERNAL_MANIFEST_FILE);
  if (!(await context.io.exists(path))) return null;
  try {
    const {
      generatedMarker: _m,
      doNotEdit: _d,
      ownerCommand: _o,
      editInstead: _e,
      regenerateCommand: _r,
      ...rest
    } = yamlParse(await context.io.readFile(path)) as Record<string, unknown> &
      AgentSurfaceManifest;
    return rest as AgentSurfaceManifest;
  } catch {
    return null;
  }
}
