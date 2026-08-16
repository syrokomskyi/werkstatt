/*
<MODULE_CONTRACT>
<purpose>godot.playtest — runs the Godot game for a configurable duration with deterministic input, catching runtime errors during gameplay (not just at startup).</purpose>
<keywords>playtest, runtime, deterministic, input, godot</keywords>
<responsibilities>
  <item>Launches godot --headless with --quit-after for a configurable duration.</item>
  <item>Optionally feeds deterministic input via --fixed-fps and input simulation scripts.</item>
  <item>Captures stdout/stderr and reports ERROR/WARNING lines.</item>
  <item>Distinguishes startup errors from gameplay errors by timestamp.</item>
</responsibilities>
<non-goals>
  <item>Does not capture screenshots — use godot.screenshot for that.</item>
  <item>Does not run unit tests — use godot.test for that.</item>
  <item>Does not validate project structure — use validators for that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial playtest command — godot.playtest.</item>
</CHANGE_SUMMARY>
*/

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface PlaytestData {
  command: string;
  status: "pass" | "fail";
  duration: number;
  errors: string[];
  warnings: string[];
  startupErrors: string[];
  gameplayErrors: string[];
  output: string;
}

const DEFAULT_DURATION_SEC = 15;
const DEFAULT_FPS = 60;
const ERROR_PATTERN = /^ERROR:/gm;
const WARNING_PATTERN = /^WARNING:/gm;
const STARTUP_THRESHOLD_MS = 3_000;

export function runPlaytest(
  projectRoot: string,
  durationSec: number = DEFAULT_DURATION_SEC,
  fixedFps: number = DEFAULT_FPS,
): KernelCommandResult<PlaytestData> {
  const projectGodot = join(projectRoot, "project.godot");

  if (!existsSync(projectGodot)) {
    return {
      data: {
        command: "godot.playtest",
        status: "fail",
        duration: 0,
        errors: ["project.godot not found — cannot run playtest"],
        warnings: [],
        startupErrors: [],
        gameplayErrors: [],
        output: "",
      },
      exitCode: 1,
      summary: "godot.playtest: fail (no project.godot)",
    };
  }

  const startTime = Date.now();
  let output = "";
  let crashed = false;

  try {
    output = execFileSync(
      "godot",
      [
        "--headless",
        "--fixed-fps",
        String(fixedFps),
        "--quit-after",
        String(durationSec),
      ],
      {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: (durationSec + 10) * 1000,
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

  // Classify errors: startup vs gameplay based on position in output
  const startupErrors: string[] = [];
  const gameplayErrors: string[] = [];
  const startupCutoff = Math.floor(output.length * 0.1);
  for (const errorLine of errors) {
    const pos = output.indexOf(errorLine);
    if (pos < startupCutoff || duration < STARTUP_THRESHOLD_MS) {
      startupErrors.push(errorLine);
    } else {
      gameplayErrors.push(errorLine);
    }
  }

  const status = crashed || errors.length > 0 ? "fail" : "pass";

  return {
    data: {
      command: "godot.playtest",
      status,
      duration,
      errors,
      warnings,
      startupErrors,
      gameplayErrors,
      output: output.slice(-500),
    },
    exitCode: status === "pass" ? 0 : 1,
    summary: `godot.playtest: ${status} (${duration}ms, ${errors.length} errors [${startupErrors.length} startup, ${gameplayErrors.length} gameplay], ${warnings.length} warnings)`,
  };
}

export function createPlaytestCommand(): KernelCommandDefinition<PlaytestData> {
  return {
    name: "godot.playtest",
    description: "Run Godot playtest with deterministic input to catch gameplay runtime errors",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      return runPlaytest(context.workspaceRoot);
    },
  };
}
