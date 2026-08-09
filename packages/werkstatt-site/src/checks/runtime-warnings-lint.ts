/*
<MODULE_CONTRACT>
<purpose>
RFC-0250 focused guard for actionable runtime warnings. Known missing asset and
route warnings must be mirrored by static diagnostic commands before render.
</purpose>
<non-goals>
  <item>Do not ban operational console.warn calls repository-wide.</item>
  <item>Do not parse every possible warning string; this guard is intentionally narrow.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0250: add warning-class coverage guard for missing assets and routes.</item>
</CHANGE_SUMMARY>
*/

import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isRegisteredRuleId } from "./diagnostics/rules.ts";
import { diagnosticsResult } from "./result-helpers.ts";

const WARNING_CLASSES = [
  {
    producer: "packages/content-source/src/adapters/fs/assets.ts",
    marker: "[resolveImage] Image not found",
    ruleId: "RUNTIME-WARN-01",
    equivalent: "asset.reference.validate",
    command: "asset.reference.validate",
    message: "Missing image runtime warning must have a static asset diagnostic equivalent.",
  },
  {
    producer: "packages/share/src/astro/routes.ts",
    marker: "[routes] PageId not found",
    ruleId: "RUNTIME-WARN-02",
    equivalent: "SEM-TARGET-01",
    command: "semantic.targets.validate",
    message:
      "Missing pageId runtime warning must have a static semantic-target diagnostic equivalent.",
  },
] as const;

export async function runRuntimeWarningsLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "runtime.warnings.lint";
  const diagnostics: Diagnostic[] = [];

  for (const warning of WARNING_CLASSES) {
    const source = await readFile(join(context.workspaceRoot, warning.producer), "utf-8").catch(
      () => "",
    );
    if (!source.includes(warning.marker)) continue;
    if (!isRegisteredRuleId(warning.equivalent)) {
      diagnostics.push({
        ruleId: warning.ruleId,
        severity: "error",
        file: warning.producer,
        message: warning.message,
        fixHint: `Register and wire ${warning.command} so "${warning.marker}" is represented as Diagnostic[].`,
        data: { marker: warning.marker, equivalent: warning.equivalent },
      });
    }
  }

  return diagnosticsResult(command, diagnostics);
}
