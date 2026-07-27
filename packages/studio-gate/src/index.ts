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
</CHANGE_SUMMARY>
*/

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { STUDIO_GATE_TOOLS } from "./tools.ts";
import { executeCommand } from "./executor.ts";
import { BuildQueue, resolveBuildConcurrency, isBuildTriggeringTool } from "./build-queue.ts";
import { verifyAuthFromMeta, loadIdentityConfig } from "./auth.ts";

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

function buildCommandArgs(
  toolName: string,
  args: Record<string, unknown>,
): { cliArgs: string[]; stdin?: string } {
  const cliArgs: string[] = [];
  let stdin: string | undefined;

  for (const [key, value] of Object.entries(args)) {
    if (toolName === "workpiece.write" && key === "content") {
      stdin = typeof value === "string" ? value : String(value);
      continue;
    }
    if (typeof value === "boolean") {
      if (value) cliArgs.push(`--${key}`);
    } else if (typeof value === "string") {
      cliArgs.push(`--${key}`, value);
    }
  }

  return { cliArgs, stdin };
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
    const tool = STUDIO_GATE_TOOLS.find((t) => t.name === name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    const identityConfig = await loadIdentityConfig(werkstattRoot);
    const authResult = await verifyAuthFromMeta(
      (request.params as Record<string, unknown>)["_meta"] as Record<string, unknown> | undefined,
      werkstattRoot,
    );

    if (identityConfig?.authMode === "enforced" && !authResult.authenticated) {
      return {
        content: [
          {
            type: "text",
            text: `Authentication required: ${authResult.error}`,
          },
        ],
        isError: true,
      };
    }

    const { cliArgs, stdin } = buildCommandArgs(name, (args as Record<string, unknown>) ?? {});

    if (authResult.authenticated && authResult.actorId) {
      cliArgs.push("--_authActor", authResult.actorId);
    }

    const exec = () =>
      executeCommand("pnpm", ["exec", "site-kernel", "run", name, ...cliArgs, "--json"], {
        cwd: werkstattRoot,
        stdin,
      });

    const result = isBuildTriggeringTool(name) ? await buildQueue.run(exec) : await exec();

    const text =
      result.exitCode === 0
        ? result.stdout
        : `Command failed (exit ${result.exitCode}):\n${result.stderr || result.stdout}`;

    return {
      content: [{ type: "text", text }],
      isError: result.exitCode !== 0,
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("[studio-gate] Fatal error:", error);
  process.exit(1);
});
