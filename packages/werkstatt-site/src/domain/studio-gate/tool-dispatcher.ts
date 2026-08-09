/*
<MODULE_CONTRACT>
<purpose>
  Tool dispatcher for Studio Gate MCP server — handles tool lookup,
  command argument building, and execution dispatch. Extracted from
  index.ts so dispatch logic is independently testable.
</purpose>
<non-goals>
  <item>Does not define tool schemas — tools.ts handles that.</item>
  <item>Does not handle MCP transport — index.ts handles that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review 2026-07-14: extract tool dispatch from index.ts.</item>
</CHANGE_SUMMARY>
*/

import { STUDIO_GATE_TOOLS, type ToolDefinition } from "./tools.ts";
import { executeCommand } from "./executor.ts";
import { isBuildTriggeringTool, type BuildQueue } from "./build-queue.ts";

export function findTool(name: string): ToolDefinition | undefined {
  return STUDIO_GATE_TOOLS.find((t) => t.name === name);
}

export function buildCommandArgs(
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

export interface DispatchOptions {
  toolName: string;
  args: Record<string, unknown>;
  werkstattRoot: string;
  authActorId?: string;
  buildQueue: BuildQueue;
}

export async function dispatchTool(options: DispatchOptions): Promise<{
  text: string;
  isError: boolean;
}> {
  const { cliArgs, stdin } = buildCommandArgs(options.toolName, options.args);

  if (options.authActorId) {
    cliArgs.push("--_authActor", options.authActorId);
  }

  const exec = () =>
    executeCommand("pnpm", ["exec", "site-kernel", "run", options.toolName, ...cliArgs, "--json"], {
      cwd: options.werkstattRoot,
      stdin,
    });

  const result = isBuildTriggeringTool(options.toolName)
    ? await options.buildQueue.run(exec)
    : await exec();

  const text =
    result.exitCode === 0
      ? result.stdout
      : `Command failed (exit ${result.exitCode}):\n${result.stderr || result.stdout}`;

  return {
    text,
    isError: result.exitCode !== 0,
  };
}
