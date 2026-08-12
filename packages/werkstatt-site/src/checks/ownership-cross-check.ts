/*
<MODULE_CONTRACT>
<purpose>
  ownership.generator.cross-check — RFC-0810: cross-reference all registered
  app-scoped .generate commands against GENERATOR_OWNERSHIP_MAP. Detects
  uncovered generators (OWN-XCHECK-01), phantom command references (OWN-XCHECK-02),
  and missing or non-existent module paths (OWN-XCHECK-03).
</purpose>
<non-goals>
  <item>Do not check file presence on disk — that is ownership.sync.validate's job (OWN-01/OWN-02).</item>
  <item>Do not check workspace-scoped generators — they write outside apps/id/ and are exempt.</item>
  <item>Do not validate multi-owner paths — that is generator.ownership.lint's job (RFC-0087).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0810: initial implementation — cross-reference .generate commands against ownership map.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { listRegisteredKernelCommands } from "@warpgogol/werkstatt/kernel";
import { fileExists } from "@warpgogol/werkstatt-site/share/fs";
import { GENERATOR_OWNERSHIP_MAP } from "./generator-ownership.ts";
import { diagnosticsResult } from "./result-helpers.ts";

const GENERATE_SUFFIX = ".generate";

export async function runOwnershipGeneratorCrossCheck(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "ownership.generator.cross-check";
  const diagnostics: Diagnostic[] = [];

  const registered = await listRegisteredKernelCommands(context.workspaceRoot);
  const registeredByName = new Set(registered.map((c) => c.name));

  const appGenerateCommands = registered.filter(
    (c) => c.scope === "app" && c.name.endsWith(GENERATE_SUFFIX),
  );

  const ownershipCommands = new Set<string>();
  for (const entry of GENERATOR_OWNERSHIP_MAP) {
    ownershipCommands.add(entry.command);
  }

  for (const cmd of appGenerateCommands) {
    if (!ownershipCommands.has(cmd.name)) {
      diagnostics.push({
        ruleId: "OWN-XCHECK-01",
        severity: "error",
        message: `OWN-XCHECK-01: command "${cmd.name}" has no ownership map entry.`,
        fixHint: `Add an entry to GENERATOR_OWNERSHIP_MAP in packages/werkstatt-site/src/checks/generator-ownership.ts with command: "${cmd.name}" and the file path(s) it generates.`,
        data: { command: cmd.name },
      });
    }
  }

  for (const entry of GENERATOR_OWNERSHIP_MAP) {
    if (!registeredByName.has(entry.command)) {
      diagnostics.push({
        ruleId: "OWN-XCHECK-02",
        severity: "error",
        message: `OWN-XCHECK-02: ownership entry for path "${entry.path}" references unregistered command "${entry.command}".`,
        fixHint: `Remove the stale entry or register the command "${entry.command}" in the command table.`,
        data: { command: entry.command, path: entry.path },
      });
    }
  }

  for (const entry of GENERATOR_OWNERSHIP_MAP) {
    if (!entry.module) {
      diagnostics.push({
        ruleId: "OWN-XCHECK-03",
        severity: "error",
        message: `OWN-XCHECK-03: ownership entry for "${entry.path}" has no module path.`,
        fixHint: `Add a module field pointing to the source file that implements "${entry.command}".`,
        data: { command: entry.command, path: entry.path },
      });
      continue;
    }

    const modulePath = join(context.workspaceRoot, entry.module);
    if (!(await fileExists(modulePath))) {
      diagnostics.push({
        ruleId: "OWN-XCHECK-03",
        severity: "warning",
        message: `OWN-XCHECK-03: ownership entry for "${entry.path}" points to non-existent module "${entry.module}".`,
        fixHint: `Update the module path for "${entry.command}" or remove the stale entry.`,
        data: { command: entry.command, path: entry.path, module: entry.module },
      });
    }
  }

  return diagnosticsResult(command, diagnostics);
}
