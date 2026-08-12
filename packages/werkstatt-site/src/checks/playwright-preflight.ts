/*
<MODULE_CONTRACT>
<purpose>
  RFC-0813: Pre-flight check for Playwright Chromium. Fails fast (exitCode 1)
  if Chromium is not launchable. Does not auto-install — use playwright.chromium.ensure
  for that. Used by mission.validate before build.prepare.
</purpose>
<non-goals>
  <item>Does not auto-install Chromium — that is playwright.chromium.ensure's job.</item>
  <item>Does not check browsers other than Chromium.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0813: initial playwright.preflight.check command handler.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { isChromiumInstalled } from "./playwright-chromium-ensure.ts";

export interface PlaywrightPreflightCheckResult {
  command: "playwright.preflight.check";
  status: "pass" | "fail";
  error?: string;
}

export async function runPlaywrightPreflightCheck(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<PlaywrightPreflightCheckResult>> {
  const { installed, error } = await isChromiumInstalled(context.workspaceRoot);
  if (installed) {
    return {
      data: { command: "playwright.preflight.check", status: "pass" },
      exitCode: 0,
      summary: "playwright.preflight.check: pass",
    };
  }
  return {
    data: {
      command: "playwright.preflight.check",
      status: "fail",
      error,
    },
    exitCode: 1,
    summary: `Playwright Chromium is not installed. Launch error: ${error ?? "unknown"}. Run: pnpm exec playwright install chromium`,
  };
}
