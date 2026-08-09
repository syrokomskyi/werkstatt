/*
<MODULE_CONTRACT>
<purpose>Vite build hook for the game plugin — runs vite build in the workpiece (RFC-0777).</purpose>
<keywords>build, vite, game</keywords>
<responsibilities>
  <item>Runs `vite build` in the workpiece directory using the project's own vite.config.ts.</item>
  <item>Reports success/failure via HookResult.</item>
</responsibilities>
<non-goals>
  <item>Does not manage deploy — that is the deploy adapter's job.</item>
  <item>Does not run checkGate — that is a separate hook.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0777: Vite build hook — runs vite build via child_process.</item>
</CHANGE_SUMMARY>
*/

import { execFileSync } from "node:child_process";
import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";

export async function runViteBuild(ctx: PluginHookContext): Promise<HookResult> {
  const cwd = ctx.workpiecePath ?? ctx.workspaceRoot;
  ctx.logger.info(`vite-build: running vite build in ${cwd}`);

  try {
    const output = execFileSync("npx", ["vite", "build"], {
      cwd,
      encoding: "utf-8",
      timeout: 120_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    ctx.logger.info("vite-build: build completed", { output: output.slice(-200) });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error("vite-build: build failed", { error: message });
    return {
      success: false,
      errors: [`vite build failed: ${message}`],
    };
  }
}
