/*
<MODULE_CONTRACT>
<purpose>
  Read-only environment audit command that probes the local Linux machine
  for development tools and emits a structured JSON report agents can paste
  into their system prompt. Also verifies the .gitattributes line-ending contract.
</purpose>
<non-goals>
  <item>Do not install, repair, or mutate the environment — the command is read-only.</item>
  <item>Do not gate build pipelines on audit results — it is advisory, on-demand only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0369: initial implementation of agent.environment.audit command.</item>
  <item>Linux-only: removed Windows/WSL/Git Bash tier classification and path detection.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import process from "node:process";

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToolTier = "native" | "not-available";

export interface ToolAuditEntry {
  present: boolean;
  tier: ToolTier;
  source?: string;
  version?: string;
  installHint?: string;
  error?: string;
}

export interface AgentEnvironmentAuditResult {
  command: "agent.environment.audit";
  status: "ok" | "degraded";
  os: "linux" | "darwin";
  shell: {
    name: string;
    path?: string;
  };
  tools: Record<string, ToolAuditEntry>;
  gitattributes: {
    present: boolean;
    path: string;
    lineEndingRule: boolean;
  };
  systemPromptSnippet?: string;
}

// ---------------------------------------------------------------------------
// Tool matrix — maps tool name to detection metadata
// ---------------------------------------------------------------------------

interface ToolSpec {
  /** CLI args to invoke for version detection, e.g. ["--version"]. */
  versionArgs: string[];
  /** apt install hint when missing. */
  installHint?: string;
}

const TOOL_SPECS: Record<string, ToolSpec> = {
  git: {
    versionArgs: ["--version"],
    installHint: "sudo apt install -y git",
  },
  node: {
    versionArgs: ["--version"],
    installHint: "sudo apt install -y nodejs",
  },
  npm: {
    versionArgs: ["--version"],
    installHint: "sudo apt install -y npm",
  },
  pnpm: {
    versionArgs: ["--version"],
    installHint: "corepack enable pnpm",
  },
  python: {
    versionArgs: ["--version"],
    installHint: "sudo apt install -y python3",
  },
  jq: {
    versionArgs: ["--version"],
    installHint: "sudo apt install -y jq",
  },
  curl: {
    versionArgs: ["--version"],
    installHint: "sudo apt install -y curl",
  },
  docker: {
    versionArgs: ["--version"],
    installHint: "sudo apt install -y docker.io",
  },
  bash: {
    versionArgs: ["--version"],
    installHint: "sudo apt install -y bash",
  },
};

const DEFAULT_TOOLS = Object.keys(TOOL_SPECS);

const SPAWN_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------

/** Trim and clean a version string from tool output. */
function cleanVersion(raw: string): string {
  return raw.trim().split("\n")[0]!.trim();
}

/** Run a command and return { success, stdout, stderr } within a timeout. */
function runWithTimeout(
  io: KernelRuntimeContext["io"],
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return io
    .exec(cmd, args, { timeoutMs })
    .then((result) => ({
      success: result.exitCode === 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    }))
    .catch(() => ({ success: false, stdout: "", stderr: "" }));
}

/** Try to locate the executable path using `which`. */
async function resolveToolPath(
  io: KernelRuntimeContext["io"],
  tool: string,
): Promise<string | undefined> {
  const result = await runWithTimeout(io, "which", [tool], SPAWN_TIMEOUT_MS);
  if (!result.success) return undefined;
  const line = result.stdout.trim().split("\n")[0]?.trim();
  return line || undefined;
}

/** Check if a tool is present by locating it with which, then best-effort version. */
async function probeTool(
  io: KernelRuntimeContext["io"],
  tool: string,
  versionArgs: string[],
): Promise<{ present: boolean; version: string; source?: string }> {
  const source = await resolveToolPath(io, tool);
  if (!source) {
    return { present: false, version: "" };
  }
  const versionResult = await runWithTimeout(io, tool, versionArgs, SPAWN_TIMEOUT_MS);
  const version = versionResult.success ? cleanVersion(versionResult.stdout) : "";
  return { present: true, version, source };
}

/** Detect the shell that invoked the process. */
function detectShell(): { name: string; path?: string } {
  const shell = process.env.SHELL;
  if (shell) {
    const name = shell.split("/").pop() ?? "shell";
    return { name, path: shell };
  }
  return { name: "unknown" };
}

// ---------------------------------------------------------------------------
// Core audit logic
// ---------------------------------------------------------------------------

async function auditTool(
  io: KernelRuntimeContext["io"],
  tool: string,
  spec: ToolSpec,
): Promise<ToolAuditEntry> {
  const probe = await probeTool(io, tool, spec.versionArgs);
  if (!probe.present) {
    return {
      present: false,
      tier: "not-available",
      installHint: spec.installHint,
    };
  }
  return {
    present: true,
    tier: "native",
    source: probe.source,
    version: probe.version || undefined,
  };
}

async function checkGitattributes(
  context: KernelRuntimeContext,
): Promise<AgentEnvironmentAuditResult["gitattributes"]> {
  const { workspaceRoot } = context;
  const gitattributesPath = join(workspaceRoot, ".gitattributes");
  try {
    const content = await context.io.readFile(gitattributesPath);
    const hasLineEndingRule = /^\* text=auto eol=lf/im.test(content);
    return {
      present: true,
      path: gitattributesPath,
      lineEndingRule: hasLineEndingRule,
    };
  } catch {
    return {
      present: false,
      path: gitattributesPath,
      lineEndingRule: false,
    };
  }
}

function buildSystemPromptSnippet(
  os: string,
  shell: { name: string; path?: string },
  tools: Record<string, ToolAuditEntry>,
  gitattributes: AgentEnvironmentAuditResult["gitattributes"],
): string {
  const lines: string[] = [
    "# Agent Environment Audit",
    "",
    `OS: ${os}`,
    `Shell: ${shell.name}${shell.path ? ` (${shell.path})` : ""}`,
    "",
    "## Available tools",
  ];

  for (const [name, entry] of Object.entries(tools)) {
    if (entry.present) {
      const parts = [`  ${name}: ${entry.tier}`];
      if (entry.version) parts.push(`v${entry.version}`);
      if (entry.source) parts.push(`(${entry.source})`);
      lines.push(parts.join(" "));
    } else {
      const hint = entry.installHint ? ` — install: ${entry.installHint}` : "";
      lines.push(`  ${name}: NOT AVAILABLE${hint}`);
    }
  }

  lines.push("");
  lines.push(
    `## .gitattributes: ${gitattributes.present ? "present" : "MISSING"}, line-ending rule: ${gitattributes.lineEndingRule ? "OK" : "MISSING"}`,
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Command runner
// ---------------------------------------------------------------------------

export async function runAgentEnvironmentAudit(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<AgentEnvironmentAuditResult>> {
  const emitPrompt = input.flags["emit-prompt"] === true || input.flags["emit-prompt"] === "true";
  const os = process.platform as "linux" | "darwin";
  const shell = detectShell();

  const toolNames = (input.flags.tools as string | undefined)
    ? (input.flags.tools as string)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : DEFAULT_TOOLS;

  const tools: Record<string, ToolAuditEntry> = {};
  const toolPromises = toolNames.map(async (tool) => {
    const spec = TOOL_SPECS[tool];
    if (!spec) {
      tools[tool] = {
        present: false,
        tier: "not-available",
        error: `Unknown tool "${tool}" — not in tool matrix`,
      };
      return;
    }
    tools[tool] = await auditTool(context.io, tool, spec);
  });
  await Promise.all(toolPromises);

  const gitattributes = await checkGitattributes(context);

  const anyMissing = Object.values(tools).some((t) => !t.present);
  const degraded = !gitattributes.present || !gitattributes.lineEndingRule || anyMissing;
  const status: "ok" | "degraded" = degraded ? "degraded" : "ok";

  const result: AgentEnvironmentAuditResult = {
    command: "agent.environment.audit",
    status,
    os,
    shell,
    tools,
    gitattributes,
  };

  if (emitPrompt) {
    result.systemPromptSnippet = buildSystemPromptSnippet(os, shell, tools, gitattributes);
  }

  const missingCount = Object.values(tools).filter((t) => !t.present).length;
  const summaryParts = [
    "agent.environment.audit:",
    status,
    `${Object.keys(tools).length} tools checked`,
    missingCount > 0 ? `${missingCount} missing` : "all present",
    `gitattributes: ${gitattributes.lineEndingRule ? "OK" : "degraded"}`,
  ];

  if (emitPrompt && context.outputFormat !== "json") {
    context.logger.info(result.systemPromptSnippet ?? "");
  }

  return {
    data: result,
    exitCode: 0,
    summary: summaryParts.join(", "),
  };
}
