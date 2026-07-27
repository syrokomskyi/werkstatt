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
import { executeCommand } from "./executor.ts";
import { BuildQueue, resolveBuildConcurrency, isBuildTriggeringTool } from "./build-queue.ts";
import { verifyAuthFromMeta } from "./auth.ts";
import type { StudioGateAuthResult } from "./auth.ts";

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

const AUTH_ERROR_CODES: Record<string, { code: number; message: string }> = {
  "authentication-required": { code: -32001, message: "authentication-required" },
  "site-mismatch": { code: -32002, message: "site-mismatch" },
  "insufficient-scope": { code: -32003, message: "insufficient-scope" },
  "credential-revoked": { code: -32004, message: "credential-revoked" },
  "auth-config-missing": { code: -32005, message: "auth-config-missing" },
  "auth-config-malformed": { code: -32006, message: "auth-config-malformed" },
  "system-id-required": { code: -32007, message: "system-id-required" },
  "credential-not-found": { code: -32001, message: "authentication-required" },
  "credential-expired": { code: -32001, message: "authentication-required" },
  "signature-invalid": { code: -32001, message: "authentication-required" },
  "identity-not-configured": { code: -32005, message: "auth-config-missing" },
};

function formatAuthError(result: StudioGateAuthResult): {
  content: { type: "text"; text: string }[];
  isError: boolean;
} {
  const errorKey = result.error ?? "authentication-required";
  const mapped = AUTH_ERROR_CODES[errorKey] ?? AUTH_ERROR_CODES["authentication-required"]!;

  const data: Record<string, unknown> = {};
  if (result.expected) data["expected"] = result.expected;
  if (result.presented) data["presented"] = result.presented;
  if (result.required) data["required"] = result.required;
  if (mapped.code === -32001) {
    data["hint"] =
      "Provide a valid VC credential in _meta.identity or X-Werkstatt-Credential header";
  }
  if (mapped.code === -32005) {
    data["hint"] =
      "werkstatt.identity.json not found. Run identity.bootstrap (RFC-0558) to create it.";
  }
  if (mapped.code === -32006) {
    data["hint"] = "werkstatt.identity.json is not valid JSON or is missing required fields.";
  }
  if (mapped.code === -32007) {
    data["hint"] = "_meta.system is required in enforced mode for site-scoping";
  }

  const errorObject = {
    code: mapped.code,
    message: mapped.message,
    data,
  };

  return {
    content: [{ type: "text", text: JSON.stringify(errorObject) }],
    isError: true,
  };
}
