/*
<MODULE_CONTRACT>
<purpose>App validation command handler for check-webgogol: validates the check-webgogol app configuration.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from commands.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { diagnosticsResult } from "../result.ts";

export async function runCheckWebgogolAppValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const appDir = join(context.workspaceRoot, "apps", "check-webgogol-com");
  const requiredFiles = [
    "package.json",
    "src/content/system.md",
    "src/content/pages/de/home.md",
    "public/.well-known/webgogol-check.json",
  ];
  const diagnostics: Diagnostic[] = [];
  for (const file of requiredFiles) {
    if (!(await context.io.exists(join(appDir, file)))) {
      diagnostics.push({
        ruleId: "CW-APP-01",
        severity: "error",
        file: `apps/check-webgogol-com/${file}`,
        message: `check-webgogol-com is missing required file ${file}.`,
        fixHint:
          "Run onboarding.scaffold and webgogol.check-hints.generate for check-webgogol-com.",
      });
    }
  }
  if (await context.io.exists(join(appDir, "src/content/pages/de/home.md"))) {
    const home = await context.io.readFile(join(appDir, "src/content/pages/de/home.md"));
    if (!home.includes("Check Webgogol") || !home.includes("Action Pack")) {
      diagnostics.push({
        ruleId: "CW-APP-02",
        severity: "warning",
        file: "apps/check-webgogol-com/src/content/pages/de/home.md",
        message: "Operator home page does not clearly describe Check Webgogol and its action pack.",
        fixHint: "Update the home page copy to describe the product workflow and output.",
      });
    }
  }
  if (await context.io.exists(join(appDir, "package.json"))) {
    const pkg = JSON.parse(await context.io.readFile(join(appDir, "package.json"))) as {
      name?: string;
    };
    if (pkg.name !== "check-webgogol-com") {
      diagnostics.push({
        ruleId: "CW-APP-01",
        severity: "error",
        file: "apps/check-webgogol-com/package.json",
        message: "Operator app package name must be check-webgogol-com.",
        fixHint: "Regenerate or correct the app package metadata.",
      });
    }
  }
  return diagnosticsResult("check-webgogol.app.validate", diagnostics);
}
