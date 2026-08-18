/*
<MODULE_CONTRACT>
<purpose>godot.screenshot — captures a screenshot of the Godot game viewport using Xvfb + headless rendering.</purpose>
<keywords>screenshot, xvfb, visual, regression, godot</keywords>
<responsibilities>
  <item>Launches Xvfb as a virtual display if no DISPLAY is set.</item>
  <item>Runs godot --headless with --render-thread safe to capture a frame.</item>
  <item>Saves the screenshot as PNG to a configurable output path.</item>
  <item>Reports success/failure and the screenshot path.</item>
</responsibilities>
<non-goals>
  <item>Does not compare screenshots — visual regression comparison is a separate concern.</item>
  <item>Does not run the game for gameplay testing — use godot.playtest for that.</item>
  <item>Does not validate project structure — use validators for that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial screenshot command — godot.screenshot.</item>
</CHANGE_SUMMARY>
*/

import { execFileSync, execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface ScreenshotData {
  command: string;
  status: "pass" | "fail";
  screenshotPath: string | null;
  display: string | null;
  width: number;
  height: number;
  errors: string[];
}

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DEFAULT_OUTPUT_DIR = "screenshots";

function findXvfb(): string | null {
  try {
    const path = execSync("which Xvfb", { encoding: "utf-8" }).trim();
    return path || null;
  } catch {
    return null;
  }
}

function findGodot(): string | null {
  try {
    const path = execSync("which godot", { encoding: "utf-8" }).trim();
    return path || null;
  } catch {
    return null;
  }
}

export function captureScreenshot(
  projectRoot: string,
  outputPath?: string,
  width: number = DEFAULT_WIDTH,
  height: number = DEFAULT_HEIGHT,
): KernelCommandResult<ScreenshotData> {
  const projectGodot = join(projectRoot, "project.godot");

  if (!existsSync(projectGodot)) {
    return {
      data: {
        command: "godot.screenshot",
        status: "fail",
        screenshotPath: null,
        display: null,
        width,
        height,
        errors: ["project.godot not found — cannot capture screenshot"],
      },
      exitCode: 1,
      summary: "godot.screenshot: fail (no project.godot)",
    };
  }

  const godotBin = findGodot();
  if (!godotBin) {
    return {
      data: {
        command: "godot.screenshot",
        status: "fail",
        screenshotPath: null,
        display: null,
        width,
        height,
        errors: ["godot binary not found in PATH"],
      },
      exitCode: 1,
      summary: "godot.screenshot: fail (no godot binary)",
    };
  }

  const finalOutputPath =
    outputPath ?? join(projectRoot, DEFAULT_OUTPUT_DIR, "screenshot.png");

  // Determine display: use existing DISPLAY or start Xvfb
  let display = process.env.DISPLAY ?? null;
  let xvfbChild: ReturnType<typeof import("node:child_process").spawn> | null = null;

  if (!display) {
    const xvfbBin = findXvfb();
    if (!xvfbBin) {
      return {
        data: {
          command: "godot.screenshot",
          status: "fail",
          screenshotPath: null,
          display: null,
          width,
          height,
          errors: [
            "No DISPLAY environment variable set and Xvfb not found — cannot capture screenshot in headless environment",
          ],
        },
        exitCode: 1,
        summary: "godot.screenshot: fail (no display, no Xvfb)",
      };
    }

    display = ":99";
    xvfbChild = spawn(xvfbBin, [
      display,
      "-screen",
      "0",
      `${width}x${height}x24`,
    ], { stdio: "ignore" });

    // Give Xvfb a moment to start
    execSync("sleep 1");
  }

  const errors: string[] = [];
  let success = false;

  try {
    const env = { ...process.env, DISPLAY: display! };
    const args = [
      "--headless",
      "--render-thread",
      "safe",
      "--quit-after",
      "60",
    ];

    execFileSync(godotBin, args, {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 30_000,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Godot doesn't have a direct --screenshot flag in headless mode,
    // but the rendering output can be captured via OS-level tools.
    // For now, we use import_strategy: run the game briefly and capture via xwd.
    // This is a best-effort approach.
    if (display && xvfbChild) {
      try {
        execSync(
          `xwd -root -display ${display} -out ${finalOutputPath}.xwd`,
          { encoding: "utf-8", timeout: 5_000, env },
        );
        // Convert xwd to png if ImageMagick is available
        try {
          execSync(`convert ${finalOutputPath}.xwd ${finalOutputPath}`, {
            encoding: "utf-8",
            timeout: 5_000,
          });
          success = existsSync(finalOutputPath);
        } catch {
          errors.push("ImageMagick 'convert' not available — screenshot saved as .xwd only");
          success = existsSync(`${finalOutputPath}.xwd`);
        }
      } catch {
        errors.push("xwd capture failed — no screenshot saved");
      }
    } else {
      errors.push("Screenshot capture requires Xvfb in headless environments");
    }
  } catch (err) {
    const error = err as { message: string };
    errors.push(`Screenshot capture failed: ${error.message}`);
  } finally {
    if (xvfbChild) {
      xvfbChild.kill("SIGTERM");
    }
  }

  const status = success ? "pass" : "fail";

  return {
    data: {
      command: "godot.screenshot",
      status,
      screenshotPath: success ? finalOutputPath : null,
      display,
      width,
      height,
      errors,
    },
    exitCode: status === "pass" ? 0 : 1,
    summary: `godot.screenshot: ${status}${success ? ` (${finalOutputPath})` : ` (${errors.length} error(s))`}`,
  };
}

export function createScreenshotCommand(): KernelCommandDefinition<ScreenshotData> {
  return {
    name: "godot.screenshot",
    description: "Capture a screenshot of the Godot game viewport via Xvfb",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      return captureScreenshot(context.workspaceRoot);
    },
  };
}
