/*
<MODULE_CONTRACT>
<purpose>
RFC-0260: static lint for typed kernel command flag schemas. Detects source
reads of undeclared flags on schema-carrying commands (KERNEL-FLAG-04) and
ratchets which commands still sit on the deprecated heuristic parse path
(KERNEL-FLAG-05).
</purpose>
<non-goals>
  <item>Do not parse TypeScript with a real AST — a brace-matched function-body slice plus a flag-read regex is sufficient for this static scan.</item>
  <item>Do not validate app-local kernel commands outside each app's tools/kernel.config — out of scope for this pass.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0260: initial implementation.</item>
  <item>RFC-0610: extract shared utility functions into src/lib/command-table-tracing.ts.</item>
</CHANGE_SUMMARY>
*/

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { KERNEL_UNIVERSAL_FLAGS, listRegisteredKernelCommands } from "@warpgogol/werkstatt/kernel";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { diagnosticsResult } from "./result-helpers.ts";
import {
  collectTsFiles,
  extractCommandTableHandlers,
  extractFunctionBody,
  indexFunctionSources,
} from "./lib/command-table-tracing.ts";

export interface KernelFlagSchemaSourceEntry {
  /** The registered command name. */
  command: string;
  /** Workspace-relative path to the module implementing `execute()`. */
  file: string;
  /** Exported function name implementing `execute()` for this command. */
  functionName: string;
}

/**
 * RFC-0260: schema-carrying commands and the source location of their
 * `execute()` handler. Add an entry here in the same commit that a command
 * gains a `flags` schema, so KERNEL-FLAG-04 can statically verify every
 * `input.flags.<x>` read the handler performs is declared.
 */
export const KERNEL_FLAG_SCHEMA_SOURCES: KernelFlagSchemaSourceEntry[] = [
  {
    command: "rfc.list",
    file: "packages/os/site-kernel/src/rfc/handlers.ts",
    functionName: "runRfcList",
  },
  {
    command: "rfc.create",
    file: "packages/os/site-kernel/src/rfc/handlers.ts",
    functionName: "runRfcCreate",
  },
  {
    command: "rfc.validate",
    file: "packages/os/site-kernel/src/rfc/handlers.ts",
    functionName: "runRfcValidate",
  },
  {
    command: "rfc.command-lifecycle.validate",
    file: "packages/os/site-kernel/src/rfc/handlers.ts",
    functionName: "runRfcCommandLifecycleValidate",
  },
  {
    command: "rfc.check",
    file: "packages/os/site-kernel/src/rfc/handlers.ts",
    functionName: "runRfcCheck",
  },
  {
    command: "rfc.index.generate",
    file: "packages/os/site-kernel/src/rfc/handlers.ts",
    functionName: "runRfcIndexGenerate",
  },
  {
    command: "rfc.index.validate",
    file: "packages/os/site-kernel/src/rfc/handlers.ts",
    functionName: "runRfcIndexValidate",
  },
  {
    command: "rfc.graph",
    file: "packages/os/site-kernel/src/rfc/handlers.ts",
    functionName: "runRfcGraph",
  },
  {
    command: "agent.knowledge.generate",
    file: "packages/os/site-kernel-checks/src/agent-knowledge.ts",
    functionName: "runAgentKnowledgeGenerate",
  },
  {
    command: "agent.knowledge.validate",
    file: "packages/os/site-kernel-checks/src/agent-knowledge.ts",
    functionName: "runAgentKnowledgeValidate",
  },
  {
    command: "agent.capability.validate",
    file: "packages/os/site-kernel-checks/src/agent-capability.ts",
    functionName: "runAgentCapabilityValidate",
  },
  {
    command: "agent.manifest.generate",
    file: "packages/os/site-kernel-checks/src/agent-manifest.ts",
    functionName: "runAgentManifestGenerate",
  },
  {
    command: "agent.surface.validate",
    file: "packages/os/site-kernel-checks/src/agent-manifest.ts",
    functionName: "runAgentSurfaceValidate",
  },
  {
    command: "agent.openapi.generate",
    file: "packages/os/site-kernel-checks/src/agent-openapi.ts",
    functionName: "runAgentOpenApiGenerate",
  },
  {
    command: "agent.openapi.validate",
    file: "packages/os/site-kernel-checks/src/agent-openapi.ts",
    functionName: "runAgentOpenApiValidate",
  },
  {
    command: "agent.api-catalog.generate",
    file: "packages/werkstatt-site/src/checks/agent/agent-api-catalog.ts",
    functionName: "runAgentApiCatalogGenerate",
  },
  {
    command: "agent.api-catalog.validate",
    file: "packages/werkstatt-site/src/checks/agent/agent-api-catalog.ts",
    functionName: "runAgentApiCatalogValidate",
  },
  {
    command: "agent.mcp-card.generate",
    file: "packages/werkstatt-site/src/checks/agent/agent-mcp-card.ts",
    functionName: "runAgentMcpCardGenerate",
  },
  {
    command: "agent.mcp-card.validate",
    file: "packages/werkstatt-site/src/checks/agent/agent-mcp-card.ts",
    functionName: "runAgentMcpCardValidate",
  },
  {
    command: "agent.routes.generate",
    file: "packages/os/site-kernel-checks/src/agent-routes.ts",
    functionName: "runAgentRoutesGenerate",
  },
  {
    command: "agent.gate.fixtures.run",
    file: "packages/os/site-kernel-checks/src/agent-gate-fixtures.ts",
    functionName: "runAgentGateFixturesRun",
  },
  {
    command: "services.workspace.validate",
    file: "packages/os/site-kernel-check-warpgogol/src/commands/services.ts",
    functionName: "runServicesWorkspaceValidate",
  },
  {
    command: "services.check.run",
    file: "packages/os/site-kernel-check-warpgogol/src/commands/services-check.ts",
    functionName: "runServicesCheckRun",
  },
  {
    command: "check-warpgogol.runner.validate",
    file: "packages/os/site-kernel-check-warpgogol/src/commands/services.ts",
    functionName: "runCheckWarpgogolRunnerValidate",
  },
  {
    command: "check-warpgogol.app.validate",
    file: "packages/os/site-kernel-check-warpgogol/src/commands/app.ts",
    functionName: "runCheckWarpgogolAppValidate",
  },
  {
    command: "warpgogol.check-hints.generate",
    file: "packages/os/site-kernel-check-warpgogol/src/commands/hints.ts",
    functionName: "runWarpgogolCheckHintsGenerate",
  },
  {
    command: "warpgogol.check-hints.validate",
    file: "packages/os/site-kernel-check-warpgogol/src/commands/hints.ts",
    functionName: "runWarpgogolCheckHintsValidate",
  },
  {
    command: "check.runner.info",
    file: "packages/os/site-kernel-check-warpgogol/src/commands/target.ts",
    functionName: "runCheckRunnerInfo",
  },
  {
    command: "fingerprint.calculate",
    file: "packages/os/site-kernel-checks/src/fingerprint-commands.ts",
    functionName: "runFingerprintCalculate",
  },
  {
    command: "fingerprint.usage.lint",
    file: "packages/os/site-kernel-checks/src/fingerprint-commands.ts",
    functionName: "runFingerprintUsageLint",
  },
  {
    command: "fingerprint.fixtures.validate",
    file: "packages/os/site-kernel-checks/src/fingerprint-commands.ts",
    functionName: "runFingerprintFixturesValidate",
  },
  {
    command: "sites-check.run",
    file: "packages/os/site-kernel-checks/src/module.ts",
    functionName: "runCommandSequence",
  },
  {
    command: "sites-check.author",
    file: "packages/os/site-kernel-checks/src/module.ts",
    functionName: "runCommandSequence",
  },
  {
    command: "sites-check.postbuild",
    file: "packages/os/site-kernel-checks/src/module.ts",
    functionName: "runCommandSequence",
  },
  {
    command: "packages-check.run",
    file: "packages/os/site-kernel-checks/src/module.ts",
    functionName: "runCommandSequence",
  },
  {
    command: "packages.check",
    file: "packages/os/site-kernel-checks/src/module.ts",
    functionName: "runCommandSequence",
  },
  {
    command: "handoff.validate",
    file: "packages/os/site-kernel-handoff/src/handoff-validate.ts",
    functionName: "runHandoffValidate",
  },
  {
    command: "handoff.pack",
    file: "packages/os/site-kernel-handoff/src/handoff-pack.ts",
    functionName: "runHandoffPack",
  },
  {
    command: "handoff.absorb",
    file: "packages/os/site-kernel-handoff/src/handoff-absorb.ts",
    functionName: "runHandoffAbsorb",
  },
  {
    command: "artifact.store.put",
    file: "packages/os/site-kernel-handoff/src/artifact-store/artifact-store-commands.ts",
    functionName: "runArtifactStorePut",
  },
  {
    command: "artifact.store.get",
    file: "packages/os/site-kernel-handoff/src/artifact-store/artifact-store-commands.ts",
    functionName: "runArtifactStoreGet",
  },
  {
    command: "artifact.store.validate",
    file: "packages/os/site-kernel-handoff/src/artifact-store/artifact-store-commands.ts",
    functionName: "runArtifactStoreValidate",
  },
  {
    command: "artifact.store.gc",
    file: "packages/os/site-kernel-handoff/src/artifact-store/artifact-store-commands.ts",
    functionName: "runArtifactStoreGc",
  },
  {
    command: "bordbuch.append",
    file: "packages/os/site-kernel-handoff/src/bordbuch/bordbuch-append.ts",
    functionName: "runBordbuchAppend",
  },
  {
    command: "bordbuch.validate",
    file: "packages/os/site-kernel-handoff/src/bordbuch/bordbuch-validate.ts",
    functionName: "runBordbuchValidate",
  },
  {
    command: "mission.open",
    file: "packages/os/site-kernel-handoff/src/mission/mission-open.ts",
    functionName: "runMissionOpen",
  },
  {
    command: "mission.status",
    file: "packages/os/site-kernel-handoff/src/mission/mission-status.ts",
    functionName: "runMissionStatus",
  },
  {
    command: "mission.close",
    file: "packages/os/site-kernel-handoff/src/mission/mission-close.ts",
    functionName: "runMissionClose",
  },
  {
    command: "mission.abort",
    file: "packages/os/site-kernel-handoff/src/mission/mission-abort.ts",
    functionName: "runMissionAbort",
  },
  {
    command: "mission.list",
    file: "packages/os/site-kernel-handoff/src/mission/mission-list.ts",
    functionName: "runMissionList",
  },
  {
    command: "mission.materialize",
    file: "packages/os/site-kernel-handoff/src/mission/mission-materialize.ts",
    functionName: "runMissionMaterialize",
  },
  {
    command: "mission.validate",
    file: "packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts",
    functionName: "runMissionValidate",
  },
  {
    command: "mission.preview",
    file: "packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts",
    functionName: "runMissionPreview",
  },
  {
    command: "mission.build",
    file: "packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts",
    functionName: "runMissionBuild",
  },
  {
    command: "mission.diff",
    file: "packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts",
    functionName: "runMissionDiff",
  },
  {
    command: "mission.reconcile",
    file: "packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts",
    functionName: "runMissionReconcile",
  },
  {
    command: "sternsystem.register",
    file: "packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts",
    functionName: "runSternsystemRegister",
  },
  {
    command: "sternsystem.list",
    file: "packages/os/site-kernel-handoff/src/sternsystem/sternsystem-list.ts",
    functionName: "runSternsystemList",
  },
  {
    command: "sternsystem.validate",
    file: "packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts",
    functionName: "runSternsystemValidate",
  },
  {
    command: "sternsystem.pin",
    file: "packages/os/site-kernel-handoff/src/sternsystem/sternsystem-pin.ts",
    functionName: "runSternsystemPin",
  },
  {
    command: "sternsystem.extract",
    file: "packages/os/site-kernel-handoff/src/sternsystem/sternsystem-extract.ts",
    functionName: "runSternsystemExtract",
  },
  {
    command: "release.prepare",
    file: "packages/os/site-kernel-handoff/src/release/release-commands.ts",
    functionName: "runReleasePrepare",
  },
  {
    command: "release.ready",
    file: "packages/os/site-kernel-handoff/src/release/release-commands.ts",
    functionName: "runReleaseReady",
  },
  {
    command: "release.validate",
    file: "packages/os/site-kernel-handoff/src/release/release-commands.ts",
    functionName: "runReleaseValidate",
  },
  {
    command: "release.list",
    file: "packages/os/site-kernel-handoff/src/release/release-commands.ts",
    functionName: "runReleaseList",
  },
  {
    command: "release.rollback",
    file: "packages/os/site-kernel-handoff/src/release/release-commands.ts",
    functionName: "runReleaseRollback",
  },
  {
    command: "leitstand.propagate",
    file: "packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts",
    functionName: "runLeitstandPropagate",
  },
  {
    command: "leitstand.status",
    file: "packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts",
    functionName: "runLeitstandStatus",
  },
  {
    command: "leitstand.rollback",
    file: "packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts",
    functionName: "runLeitstandRollback",
  },
  {
    command: "leitstand.health",
    file: "packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts",
    functionName: "runLeitstandHealth",
  },
  {
    command: "notausgang.export",
    file: "packages/os/site-kernel-handoff/src/notausgang/notausgang-commands.ts",
    functionName: "runNotausgangExport",
  },
  {
    command: "notausgang.validate",
    file: "packages/os/site-kernel-handoff/src/notausgang/notausgang-commands.ts",
    functionName: "runNotausgangValidate",
  },
  {
    command: "werkstatt.lock.status",
    file: "packages/os/site-kernel-handoff/src/werkstatt/werkstatt-lock-status.ts",
    functionName: "runWerkstattLockStatus",
  },
  {
    command: "werkstatt.lock.recover",
    file: "packages/os/site-kernel-handoff/src/werkstatt/werkstatt-lock-recover.ts",
    functionName: "runWerkstattLockRecover",
  },
  {
    command: "behavior.snapshot.capture",
    file: "packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts",
    functionName: "runBehaviorSnapshotCapture",
  },
  {
    command: "behavior.snapshot.diff",
    file: "packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts",
    functionName: "runBehaviorSnapshotDiff",
  },
];

const BASELINE_PATH =
  "packages/os/site-kernel-checks/src/kernel-flags-lint.baseline.generated.yaml";
const COMMAND_TABLES_DIR = "packages/os/site-kernel-checks/src/command-tables";

interface KernelFlagsLintBaseline {
  meta: { schemaVersion: 1 };
  /** Command names accepted on the deprecated heuristic parse path. */
  commands: string[];
}

function dedupeSourceEntries(
  entries: KernelFlagSchemaSourceEntry[],
): KernelFlagSchemaSourceEntry[] {
  const seen = new Set<string>();
  const deduped: KernelFlagSchemaSourceEntry[] = [];

  for (const entry of entries) {
    const key = `${entry.command}\0${entry.file}\0${entry.functionName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

async function discoverCommandTableFlagSchemaSources(
  workspaceRoot: string,
  registeredByName: Map<string, { flags?: Record<string, unknown> }>,
): Promise<KernelFlagSchemaSourceEntry[]> {
  const commandTableFiles = await collectTsFiles(workspaceRoot, COMMAND_TABLES_DIR);
  const tableHandlers: Array<{ command: string; functionName: string }> = [];
  const functionNames = new Set<string>();

  for (const file of commandTableFiles) {
    let source: string;
    try {
      source = await readFile(join(workspaceRoot, file), "utf8");
    } catch {
      continue;
    }

    for (const handler of extractCommandTableHandlers(source)) {
      if (!registeredByName.get(handler.command)?.flags) continue;
      tableHandlers.push(handler);
      functionNames.add(handler.functionName);
    }
  }

  const sourceByFunction = await indexFunctionSources(workspaceRoot, functionNames);
  const entries: KernelFlagSchemaSourceEntry[] = [];
  for (const handler of tableHandlers) {
    const file = sourceByFunction.get(handler.functionName);
    if (!file) continue;
    entries.push({ command: handler.command, file, functionName: handler.functionName });
  }

  return entries;
}

const FLAG_READ_PATTERN =
  /\binput(?:\.|\?\.)flags(?:(?:\.|\?\.)([a-zA-Z0-9_-]+)|(?:\?\.)?\[\s*["']([a-zA-Z0-9_-]+)["']\s*\])/g;

function extractFlagReads(body: string): Set<string> {
  const flags = new Set<string>();
  for (const match of body.matchAll(FLAG_READ_PATTERN)) {
    const name = match[1] ?? match[2];
    if (name) flags.add(name);
  }
  return flags;
}

/** KERNEL-FLAG-04: undeclared flag reads in a schema-carrying command's handler source. */
export async function findUndeclaredFlagReads(
  workspaceRoot: string,
  registeredByName: Map<string, { flags?: Record<string, unknown> }>,
  entries: KernelFlagSchemaSourceEntry[] = KERNEL_FLAG_SCHEMA_SOURCES,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];

  for (const entry of entries) {
    const registered = registeredByName.get(entry.command);
    if (!registered?.flags) continue;

    let source: string;
    try {
      source = await readFile(join(workspaceRoot, entry.file), "utf8");
    } catch {
      continue;
    }

    const body = extractFunctionBody(source, entry.functionName);
    if (!body) continue;

    const declared = new Set([
      ...Object.keys(KERNEL_UNIVERSAL_FLAGS),
      ...Object.keys(registered.flags),
    ]);
    for (const flagName of extractFlagReads(body)) {
      if (declared.has(flagName)) continue;
      diagnostics.push({
        ruleId: "KERNEL-FLAG-04",
        severity: "error",
        file: entry.file,
        message: `${entry.command} reads input.flags.${flagName}, which is not declared in its flags schema.`,
        fixHint: `Add "${flagName}" to the flags schema for ${entry.command} in its registerCommand() call, or stop reading it.`,
        data: { command: entry.command, flagName },
      });
    }
  }

  return diagnostics;
}

async function readBaseline(workspaceRoot: string): Promise<KernelFlagsLintBaseline | undefined> {
  try {
    return yamlParse(
      await readFile(join(workspaceRoot, BASELINE_PATH), "utf8"),
    ) as KernelFlagsLintBaseline;
  } catch {
    return undefined;
  }
}

function renderBaseline(commands: string[]): string {
  const baseline: KernelFlagsLintBaseline = {
    meta: { schemaVersion: 1 },
    commands: [...new Set(commands)].sort(),
  };
  return `${yamlStringify(baseline)}`;
}

/**
 * `listRegisteredKernelCommands` returns one entry per (command, provider,
 * app) — the same app-scoped command name repeats once per app that
 * registers it. Dedupe by name before ratcheting so the baseline and
 * violation list count each command once.
 */
function dedupeByName<T extends { name: string; flags?: Record<string, unknown> }>(
  commands: T[],
): T[] {
  const byName = new Map<string, T>();
  for (const command of commands) {
    if (!byName.has(command.name) || command.flags) byName.set(command.name, command);
  }
  return [...byName.values()];
}

/** KERNEL-FLAG-05: ratchet which commands still lack a `flags` schema. */
export function findHeuristicPathViolations(
  registered: Array<{ name: string; flags?: Record<string, unknown> }>,
  baseline: KernelFlagsLintBaseline | undefined,
): Diagnostic[] {
  const baselineSet = new Set(baseline?.commands ?? []);
  const diagnostics: Diagnostic[] = [];

  for (const command of registered) {
    if (command.flags) continue;
    if (baselineSet.has(command.name)) {
      diagnostics.push({
        ruleId: "KERNEL-FLAG-05",
        severity: "warning",
        message: `${command.name} has not migrated to a typed flags schema (heuristic parse path).`,
        fixHint: `Declare a flags schema for ${command.name} (RFC-0260), then regenerate the baseline with --write-baseline.`,
        data: { command: command.name },
      });
    } else {
      diagnostics.push({
        ruleId: "KERNEL-FLAG-05",
        severity: "error",
        message: `${command.name} is a new command registered without a typed flags schema.`,
        fixHint: `New commands must declare a flags schema from day one (RFC-0260). Add flags: {...} to its registration.`,
        data: { command: command.name },
      });
    }
  }

  return diagnostics;
}

export async function runKernelFlagsLint(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult | { file: string; commands: number }>> {
  const { workspaceRoot } = context;
  const registered = dedupeByName(await listRegisteredKernelCommands(workspaceRoot));

  if (input.flags["write-baseline"] === true) {
    const heuristicCommandNames = registered.filter((c) => !c.flags).map((c) => c.name);
    await writeFile(
      join(workspaceRoot, BASELINE_PATH),
      renderBaseline(heuristicCommandNames),
      "utf8",
    );
    return {
      data: { file: BASELINE_PATH, commands: heuristicCommandNames.length },
      exitCode: 0,
      summary: `kernel.flags.lint: wrote ${heuristicCommandNames.length} heuristic-path command(s) to ${BASELINE_PATH}`,
    };
  }

  const registeredByName = new Map(registered.map((c) => [c.name, c]));
  const baseline = await readBaseline(workspaceRoot);
  const flagSchemaSources = dedupeSourceEntries([
    ...KERNEL_FLAG_SCHEMA_SOURCES,
    ...(await discoverCommandTableFlagSchemaSources(workspaceRoot, registeredByName)),
  ]);

  const diagnostics: Diagnostic[] = [
    ...(await findUndeclaredFlagReads(workspaceRoot, registeredByName, flagSchemaSources)),
    ...findHeuristicPathViolations(registered, baseline),
  ];

  return diagnosticsResult("kernel.flags.lint", diagnostics);
}
