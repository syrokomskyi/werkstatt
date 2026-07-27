/*
<MODULE_CONTRACT>
<purpose>
RFC-0266: registers command.manifest.validate. Wraps @warpgogol/site-kernel's core
validator (CMD-MAN-01 stale manifest, CMD-MAN-02 mutatesState with no writes)
and adds CMD-MAN-03 — cross-checking that every GENERATOR_OWNERSHIP_MAP
output appears in its owning command's declared `writes`. Lives in this
package (not @warpgogol/site-kernel) specifically so it can reach
GENERATOR_OWNERSHIP_MAP without a reverse package dependency.
</purpose>
<non-goals>
  <item>Do not duplicate the manifest-building or drift-detection logic — that lives in @warpgogol/site-kernel.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0266: initial implementation.</item>
  <item>Post-refactor hardening: reuse one command manifest build and expose pure ownership diagnostics.</item>
</CHANGE_SUMMARY>
*/

import {
  buildCommandManifest,
  collectCommandManifestDiagnostics,
  manifestFilePath,
  type CheckResult,
  type CommandManifestEntry,
  type Diagnostic,
  type KernelCommandInput,
  type KernelCommandResult,
  type KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { GENERATOR_OWNERSHIP_MAP } from "./generator-ownership.ts";

interface OwnershipEntryForValidation {
  command: string;
  path: string;
}

/**
 * Normalize a GENERATOR_OWNERSHIP_MAP path (app-relative) into the form the
 * owning command declares in `writes`: `<app>/`-prefixed for app-scope
 * commands, unchanged for workspace-scope commands (whose ownership-map
 * paths, e.g. props.types.generate, are already workspace-relative).
 */
function expectedWriteFor(path: string, scope: "app" | "workspace"): string {
  return scope === "app" ? `<app>/${path}` : path;
}

export function collectOwnershipDiagnostics(
  commands: readonly Pick<CommandManifestEntry, "name" | "scope" | "writes">[],
  ownershipMap: readonly OwnershipEntryForValidation[] = GENERATOR_OWNERSHIP_MAP,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const entryByCommand = new Map(commands.map((entry) => [entry.name, entry]));

  for (const ownershipEntry of ownershipMap) {
    const entry = entryByCommand.get(ownershipEntry.command);

    if (!entry) {
      diagnostics.push({
        ruleId: "CMD-MAN-03",
        severity: "warning",
        message: `GENERATOR_OWNERSHIP_MAP names command "${ownershipEntry.command}" for output "${ownershipEntry.path}", but no such command is registered.`,
        fixHint:
          "Fix the command name in GENERATOR_OWNERSHIP_MAP, or restore/rename the command (RFC-0087/RFC-0266 drift).",
        data: { command: ownershipEntry.command, path: ownershipEntry.path },
      });
      continue;
    }

    const expectedWrite = expectedWriteFor(ownershipEntry.path, entry.scope);
    if (!entry.writes.includes(expectedWrite)) {
      diagnostics.push({
        ruleId: "CMD-MAN-03",
        severity: "warning",
        message: `Command "${ownershipEntry.command}" owns "${ownershipEntry.path}" per GENERATOR_OWNERSHIP_MAP, but its manifest writes[] does not declare "${expectedWrite}".`,
        fixHint: `Add "${expectedWrite}" to the writes: [...] of the "${ownershipEntry.command}" command registration.`,
        data: { command: ownershipEntry.command, path: ownershipEntry.path, expectedWrite },
      });
    }
  }

  return diagnostics;
}

export async function runCommandManifestValidateWithOwnership(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const manifest = await buildCommandManifest(context.workspaceRoot);
  let committedRaw: string | undefined;
  try {
    committedRaw = await context.io.readFile(manifestFilePath(context.workspaceRoot));
  } catch {
    committedRaw = undefined;
  }
  const diagnostics: Diagnostic[] = [
    ...collectCommandManifestDiagnostics(manifest, committedRaw),
    ...collectOwnershipDiagnostics(manifest.commands),
  ];

  const summary = {
    error: diagnostics.filter((d) => d.severity === "error").length,
    warning: diagnostics.filter((d) => d.severity === "warning").length,
    info: diagnostics.filter((d) => d.severity === "info").length,
  };
  const status: CheckResult["status"] =
    summary.error > 0 ? "fail" : summary.warning > 0 ? "warn" : "pass";

  return {
    data: { command: "command.manifest.validate", status, diagnostics, summary },
    exitCode: summary.error > 0 ? 1 : 0,
    summary: `command.manifest.validate: ${summary.error} error(s), ${summary.warning} warning(s)`,
  };
}
