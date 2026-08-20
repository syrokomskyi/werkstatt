/*
<MODULE_CONTRACT>
<purpose>godot.smoke.test — launches the Godot game headless for a few seconds to catch runtime errors that static validators cannot detect.</purpose>
<keywords>smoke, test, headless, runtime, godot</keywords>
<responsibilities>
  <item>Runs godot --headless with a configurable timeout (default 10s).</item>
  <item>Captures stdout/stderr and reports errors/warnings.</item>
  <item>Returns exit code 1 if Godot crashes or outputs ERROR: lines.</item>
</responsibilities>
<non-goals>
  <item>Does not run unit tests — use godot.test (dotnet test) for that.</item>
  <item>Does not test visual output — headless mode has no rendering.</item>
  <item>Does not run the editor — uses --headless game mode only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial headless smoke test command — godot.smoke.test.</item>
</CHANGE_SUMMARY>
*/

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface SmokeTestData {
  command: string;
  status: "pass" | "fail";
  duration: number;
  errors: string[];
  warnings: string[];
  output: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const ERROR_PATTERN = /^ERROR:/gm;
const WARNING_PATTERN = /^WARNING:/gm;

export function runSmokeTest(
  projectRoot: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): KernelCommandResult<SmokeTestData> {
  const projectGodot = join(projectRoot, "project.godot");

  if (!existsSync(projectGodot)) {
    return {
      data: {
        command: "godot.smoke.test",
        status: "fail",
        duration: 0,
        errors: ["project.godot not found — cannot run smoke test"],
        warnings: [],
        output: "",
      },
      exitCode: 1,
      summary: "godot.smoke.test: fail (no project.godot)",
    };
  }

  const startTime = Date.now();
  let output = "";
  let crashed = false;

  try {
    output = execFileSync(
      "godot",
      ["--headless", "--quit-after", String(Math.ceil(timeoutMs / 1000))],
      {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: timeoutMs + 5_000,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  } catch (err) {
    crashed = true;
    const error = err as { stdout?: string; stderr?: string; message: string };
    output = [error.stdout ?? "", error.stderr ?? "", error.message].join("\n");
  }

  const duration = Date.now() - startTime;
  const errors: string[] = [];
  const warnings: string[] = [];

  // Extract ERROR: lines
  let match: RegExpExecArray | null;
  const errorPattern = new RegExp(ERROR_PATTERN);
  errorPattern.lastIndex = 0;
  while ((match = errorPattern.exec(output)) !== null) {
    const lineEnd = output.indexOf("\n", match.index);
    const line = output.slice(match.index, lineEnd === -1 ? undefined : lineEnd);
    errors.push(line);
  }

  // Extract WARNING: lines
  const warningPattern = new RegExp(WARNING_PATTERN);
  warningPattern.lastIndex = 0;
  while ((match = warningPattern.exec(output)) !== null) {
    const lineEnd = output.indexOf("\n", match.index);
    const line = output.slice(match.index, lineEnd === -1 ? undefined : lineEnd);
    warnings.push(line);
  }

  const status = crashed || errors.length > 0 ? "fail" : "pass";

  return {
    data: {
      command: "godot.smoke.test",
      status,
      duration,
      errors,
      warnings,
      output: output.slice(-500),
    },
    exitCode: status === "pass" ? 0 : 1,
    summary: `godot.smoke.test: ${status} (${duration}ms, ${errors.length} errors, ${warnings.length} warnings)`,
  };
}

export function createSmokeTestCommand(): KernelCommandDefinition<SmokeTestData> {
  return {
    name: "godot.smoke.test",
    description: "Run Godot headless smoke test to catch runtime errors",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      return runSmokeTest(context.workspaceRoot);
    },
  };
}
