/*
<MODULE_CONTRACT>
<purpose>
RFC-0555: Studio Gate MCP server entrypoint. Exposes 12 tools (workpiece.read,
workpiece.write, and 10 mission lifecycle commands) via stdio MCP transport.
Reads WERKSTATT_ROOT env var for workspace root resolution. Injects
wg-site-content-edit SKILL.md as serverInfo.instructions.
ADR-0005: build-triggering tools (mission.validate) are routed through an
in-memory BuildQueue to limit concurrent builds on the Werkstatt VM.
</purpose>
<non-goals>
  <item>Does not define tool schemas — tools.ts handles that.</item>
  <item>Does not execute commands directly — executor.ts handles that.</item>
  <item>Does not serve HTTP — agent-gate handles HTTP/JSON-RPC.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0555: initial MCP server entrypoint.</item>
  <item>ADR-0005: route build-triggering tools through in-memory BuildQueue.</item>
  <item>RFC-0559: structured MCP auth errors with JSON-RPC error codes (-32001..-32007), site-scoping via _meta.system, per-tool scope enforcement.</item>
</CHANGE_SUMMARY>
*/

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { STUDIO_GATE_TOOLS } from "./tools.ts";
import { BuildQueue, resolveBuildConcurrency } from "./build-queue.ts";
import { verifyAuthFromMeta } from "./auth.ts";
import { formatAuthError } from "./auth-errors.ts";
import { findTool, dispatchTool } from "./tool-dispatcher.ts";

const SKILL_PATH = join(
  "packages",
  "warpgogol-skills",
  "skills",
  "wg-site-content-edit",
  "SKILL.md",
);

async function loadSkillInstructions(werkstattRoot: string): Promise<string | undefined> {
  try {
    const skillPath = join(werkstattRoot, SKILL_PATH);
    return await readFile(skillPath, "utf8");
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const werkstattRoot = resolve(process.env["WERKSTATT_ROOT"] ?? process.cwd());
  const instructions = await loadSkillInstructions(werkstattRoot);
  const buildQueue = new BuildQueue({
    maxConcurrency: resolveBuildConcurrency(),
  });

  const server = new Server(
    {
      name: "studio-gate",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
      ...(instructions ? { instructions } : {}),
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: STUDIO_GATE_TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = findTool(name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    const meta = (request.params as Record<string, unknown>)["_meta"] as
      Record<string, unknown> | undefined;
    const systemId = meta?.["system"] as string | undefined;

    const authResult = await verifyAuthFromMeta(meta, werkstattRoot, name, systemId);

    if (authResult.authMode === "enforced" && !authResult.authenticated) {
      return formatAuthError(authResult);
    }

    if (
      !authResult.authenticated &&
      authResult.error &&
      authResult.error !== "no-credential-permissive"
    ) {
      process.stderr.write(`[studio-gate] Auth warning: ${authResult.error}\n`);
    }

    const { text, isError } = await dispatchTool({
      toolName: name,
      args: (args as Record<string, unknown>) ?? {},
      werkstattRoot,
      authActorId: authResult.authenticated ? authResult.actorId : undefined,
      buildQueue,
    });

    return {
      content: [{ type: "text", text }],
      isError,
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("[studio-gate] Fatal error:", error);
  process.exit(1);
});
