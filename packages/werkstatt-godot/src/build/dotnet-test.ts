/*
<MODULE_CONTRACT>
<purpose>Test hook for the Godot plugin — runs dotnet test for C# unit tests.</purpose>
<keywords>test, dotnet, xunit, nunit, godot</keywords>
<responsibilities>
  <item>Runs `dotnet test` in the workpiece directory if test projects exist.</item>
  <item>Reports success/failure via HookResult.</item>
</responsibilities>
<non-goals>
  <item>Does not build — that is the build hook's job.</item>
  <item>Does not run GdUnit4 tests — only dotnet test (xUnit/NUnit).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial test hook — runs dotnet test for C# unit test integration.</item>
</CHANGE_SUMMARY>
*/

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";

export async function runDotnetTest(ctx: PluginHookContext): Promise<HookResult> {
  const cwd = ctx.workpiecePath ?? ctx.workspaceRoot;

  const hasTestProjects = checkForTestProjects(cwd);
  if (!hasTestProjects) {
    ctx.logger.info("test: no test projects found, skipping dotnet test");
    return { success: true };
  }

  ctx.logger.info(`test: running dotnet test in ${cwd}`);

  try {
    const output = execFileSync("dotnet", ["test", "--no-build", "--verbosity", "normal"], {
      cwd,
      encoding: "utf-8",
      timeout: 300_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    ctx.logger.info("test: completed", { output: output.slice(-200) });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error("test: failed", { error: message });
    return {
      success: false,
      errors: [`dotnet test failed: ${message}`],
    };
  }
}

function checkForTestProjects(projectRoot: string): boolean {
  try {
    const entries = readdirSync(projectRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".Test.csproj")) {
        return true;
      }
      if (entry.isFile() && entry.name.endsWith(".Tests.csproj")) {
        return true;
      }
    }

    const testDir = join(projectRoot, "Tests");
    if (existsSync(testDir)) {
      const testEntries = readdirSync(testDir, { withFileTypes: true });
      for (const entry of testEntries) {
        if (entry.isFile() && entry.name.endsWith(".csproj")) {
          return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}
