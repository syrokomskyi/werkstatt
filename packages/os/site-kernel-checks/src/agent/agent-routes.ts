import { parse as yamlParse, stringify as yamlStringify } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>
RFC-0290: agent.routes.generate emits the two thin, generated Agent Gate
route re-exports plus the small companion JSON (the active capability
records with full schemas — YAML cannot be imported directly by Vite, so
this is the bridge from the ontology catalog into the Astro bundle).
</purpose>
<non-goals>
  <item>Do not implement gate logic here — the files are thin re-exports into @warpgogol/agent-gate/astro.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0290: initial route generator.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";
import { buildGeneratedHeader } from "@warpgogol/site-kernel-codegen";
import { loadCapabilityCatalog } from "./agent-capability.ts";

const INTERNAL_MANIFEST_FILE = "src/agent-surface.generated.yaml";
const CAPABILITIES_FILE = "src/agent-capabilities.generated.yaml";
const MANIFEST_JSON_BRIDGE = "src/agent-surface.generated.json";
const CAPABILITIES_JSON_BRIDGE = "src/agent-capabilities.generated.json";
const MCP_ROUTE_FILE = "src/pages/api/agent/mcp.ts";
const ACTION_ROUTE_FILE = "src/pages/api/agent/actions/[id].ts";

const MCP_ROUTE_CONTENT = `${buildGeneratedHeader({ ownerCommand: "agent.routes.generate", filePath: MCP_ROUTE_FILE }).trimEnd()}
// Section-owned Agent Gate route (RFC-0290). Handler logic lives once in
// @warpgogol/agent-gate; this file is a thin re-export emitted by
// agent.routes.generate. Do not edit — rerun agent.routes.generate.
export const prerender = false;
import agentSurfaceManifest from "../../../agent-surface.generated.json";
import agentCapabilities from "../../../agent-capabilities.generated.json";
import { createAgentMcpRoute } from "@warpgogol/agent-gate/astro";

const route = createAgentMcpRoute(agentSurfaceManifest as never, agentCapabilities as never);
export const GET = route.GET;
export const POST = route.POST;
`;

const ACTION_ROUTE_CONTENT = `${buildGeneratedHeader({ ownerCommand: "agent.routes.generate", filePath: ACTION_ROUTE_FILE }).trimEnd()}
// Section-owned Agent Gate route (RFC-0290). Handler logic lives once in
// @warpgogol/agent-gate; this file is a thin re-export emitted by
// agent.routes.generate. Do not edit — rerun agent.routes.generate.
export const prerender = false;
import agentSurfaceManifest from "../../../../agent-surface.generated.json";
import agentCapabilities from "../../../../agent-capabilities.generated.json";
import { createAgentActionRoute } from "@warpgogol/agent-gate/astro";

const route = createAgentActionRoute(agentSurfaceManifest as never, agentCapabilities as never);
export const POST = route.POST;
`;

export async function runAgentRoutesGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const { manifest } = await loadSystemManifest(paths.contentDirectory);
  const agentBlock = (manifest as unknown as Record<string, unknown>).agent as
    { enabled?: boolean } | undefined;
  const enabled = agentBlock?.enabled !== false;

  const mcpRoutePath = join(paths.appDirectory, MCP_ROUTE_FILE);
  const actionRoutePath = join(paths.appDirectory, ACTION_ROUTE_FILE);
  const capabilitiesPath = join(paths.appDirectory, CAPABILITIES_FILE);
  const manifestJsonPath = join(paths.appDirectory, MANIFEST_JSON_BRIDGE);
  const capabilitiesJsonPath = join(paths.appDirectory, CAPABILITIES_JSON_BRIDGE);

  if (!enabled) {
    for (const p of [
      mcpRoutePath,
      actionRoutePath,
      capabilitiesPath,
      manifestJsonPath,
      capabilitiesJsonPath,
    ]) {
      if (await context.io.exists(p)) await context.io.rm(p);
    }
    return {
      data: { command: "agent.routes.generate", status: "skip", site: context.site?.name },
      exitCode: 0,
      summary: "agent.routes.generate: skipped — agent.enabled is false",
    };
  }

  const internalManifestPath = join(paths.appDirectory, INTERNAL_MANIFEST_FILE);
  let activeActionIds: string[] = [];
  if (await context.io.exists(internalManifestPath)) {
    try {
      const parsed = yamlParse(await context.io.readFile(internalManifestPath)) as {
        actions?: Array<{ id: string }>;
      };
      activeActionIds = (parsed.actions ?? []).map((a) => a.id);
    } catch {
      // agent.surface.validate reports a malformed manifest; emit an empty capability set here.
    }
  }
  const { records: catalog } = await loadCapabilityCatalog(context.workspaceRoot);
  const activeCapabilities = catalog.filter((c) => activeActionIds.includes(c.id));

  // The MCP route + capabilities JSON are always emitted (read tools serve
  // knowledge even with zero actions, and mcp.ts's import must always resolve);
  // the action ROUTE FILE exists only when there is at least one active
  // capability, matching agent.surface.validate's AGS-07 expectation.
  await context.io.writeFile(mcpRoutePath, MCP_ROUTE_CONTENT);
  await context.io.writeFile(capabilitiesPath, `${yamlStringify(activeCapabilities)}`);

  const manifestYaml = await context.io.readFile(join(paths.appDirectory, INTERNAL_MANIFEST_FILE));
  const manifestParsed = yamlParse(manifestYaml);
  await context.io.writeFile(manifestJsonPath, JSON.stringify(manifestParsed));
  await context.io.writeFile(capabilitiesJsonPath, JSON.stringify(activeCapabilities));

  if (activeCapabilities.length > 0) {
    await context.io.mkdir(join(paths.appDirectory, "src", "pages", "api", "agent", "actions"));
    await context.io.writeFile(actionRoutePath, ACTION_ROUTE_CONTENT);
  } else if (await context.io.exists(actionRoutePath)) {
    await context.io.rm(actionRoutePath);
  }

  return {
    data: {
      command: "agent.routes.generate",
      status: "pass",
      site: context.site?.name,
      activeCapabilities: activeCapabilities.length,
    },
    exitCode: 0,
    summary: `agent.routes.generate: ${activeCapabilities.length} active capability record(s) → ${activeCapabilities.length > 0 ? 2 : 1} route file(s)`,
  };
}
