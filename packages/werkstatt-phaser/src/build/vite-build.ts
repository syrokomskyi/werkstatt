/*
<MODULE_CONTRACT>
<purpose>Vite build hook for the Phaser plugin — runs npx vite build in the workpiece directory.</purpose>
<keywords>build, vite, phaser</keywords>
<responsibilities>
  <item>Runs npx vite build with 120s timeout.</item>
  <item>Returns HookResult with success or failure.</item>
</responsibilities>
<non-goals>
  <item>Does not manage deployment — deploy adapters run after build.</item>
  <item>Does not run check gates — checkGate is a separate hook.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial Vite build hook.</item>
  <item>Migration from werkstatt-game: renamed from game to phaser.</item>
</CHANGE_SUMMARY>
*/

import { execFileSync } from "node:child_process";
import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";

export async function runViteBuild(ctx: PluginHookContext): Promise<HookResult> {
  const workpiecePath = ctx.workpiecePath ?? ctx.workspaceRoot;

  try {
    const output = execFileSync("npx", ["vite", "build"], {
      cwd: workpiecePath,
      encoding: "utf-8",
      timeout: 120_000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    ctx.logger.info(`vite build completed:\n${output}`);

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error(`vite build failed: ${message}`);
    return {
      success: false,
      errors: [`vite build failed: ${message}`],
    };
  }
}
