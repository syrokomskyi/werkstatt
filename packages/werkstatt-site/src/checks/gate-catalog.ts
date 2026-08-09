/*
<MODULE_CONTRACT>
<purpose>
  RFC-0519 gate catalog generator and validator. Produces
  docs/gate-catalog.generated.yaml from live command registrations
  (gate metadata from RFC-0518) and pipeline placement. Validates
  the committed catalog for drift against live state.
</purpose>
<non-goals>
  <item>Does not define gate metadata on command definitions — that is RFC-0518.</item>
  <item>Does not extract inline guards into named functions — that is RFC-0520.</item>
  <item>Does not change pipeline execution order or validation logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0519: initial implementation of gate.catalog.generate and gate.catalog.validate.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { byteHash } from "@warpgogol/fingerprint";
import { writeFileAtomic, listRegisteredKernelCommands } from "@warpgogol/site-kernel";
import { stringify as yamlStringify, parse as yamlParse } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  GateConditional,
  GateMetadata,
  GatePhase,
  GateSeverity,
  KernelCommandInput,
  KernelCommandResult,
  KernelPipelineStep,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { diagnosticsResult } from "./result-helpers.ts";
import {
  SITES_CHECK_AUTHOR_PIPELINE,
  SITES_CHECK_POSTBUILD_PIPELINE,
  SITES_BUILD_CHECK_PIPELINE,
  PACKAGES_CHECK_PIPELINE,
  MISSION_PREFLIGHT_CRITICAL,
  MISSION_PREFLIGHT_WARNING,
} from "./pipelines/index.ts";

const GATE_CATALOG_PATH = "docs/gate-catalog.generated.yaml";
const ECOSYSTEM_MANIFEST_PATH = "docs/ecosystem.generated.yaml";
const HASH_PREFIX = "sha" + "256:";

function digestHex(value: string): string {
  return byteHash(value).slice(HASH_PREFIX.length);
}

export interface GateCatalogEntry {
  command: string;
  severity: GateSeverity | null;
  phase: GatePhase | null;
  pipelines: string[];
  conditional: GateConditional | null;
  surfaces: string[] | null;
  rules: string[] | null;
  blocks: string[] | null;
  metadata: "present" | "absent";
  rfc: string | null;
}

export interface GateCatalog {
  meta: {
    schemaVersion: 1;
    deterministic: true;
    generatedAt: null;
    contentHash: string;
    sources: Array<{ path: string; hash: string }>;
  };
  gates: GateCatalogEntry[];
  summary: {
    total: number;
    withMetadata: number;
    withoutMetadata: number;
    bySeverity: Record<string, number>;
    byPhase: Record<string, number>;
  };
}

const PHASE_PRIORITY: GatePhase[] = ["release", "mission", "postbuild", "author", "workspace"];

function phasePriority(phase: GatePhase): number {
  return PHASE_PRIORITY.indexOf(phase);
}

interface PipelineScan {
  name: string;
  steps: KernelPipelineStep[];
  phase: GatePhase;
}

const PIPELINE_SCANS: PipelineScan[] = [
  { name: "sites-check.author", steps: SITES_CHECK_AUTHOR_PIPELINE, phase: "author" },
  { name: "sites-check.postbuild", steps: SITES_CHECK_POSTBUILD_PIPELINE, phase: "postbuild" },
  { name: "build.check", steps: SITES_BUILD_CHECK_PIPELINE, phase: "postbuild" },
  { name: "packages-check.run", steps: PACKAGES_CHECK_PIPELINE, phase: "workspace" },
  { name: "mission-preflight.critical", steps: MISSION_PREFLIGHT_CRITICAL, phase: "mission" },
  { name: "mission-preflight.warning", steps: MISSION_PREFLIGHT_WARNING, phase: "mission" },
];

function scanPipelines(): Map<string, { pipelines: string[]; phases: Set<GatePhase> }> {
  const authorCommands = new Set(SITES_CHECK_AUTHOR_PIPELINE.map((s) => s.command));
  const result = new Map<string, { pipelines: string[]; phases: Set<GatePhase> }>();

  const ensure = (command: string): { pipelines: string[]; phases: Set<GatePhase> } => {
    let entry = result.get(command);
    if (!entry) {
      entry = { pipelines: [], phases: new Set() };
      result.set(command, entry);
    }
    return entry;
  };

  for (const scan of PIPELINE_SCANS) {
    for (const step of scan.steps) {
      if (scan.name === "build.check" && authorCommands.has(step.command)) continue;
      const entry = ensure(step.command);
      if (!entry.pipelines.includes(scan.name)) {
        entry.pipelines.push(scan.name);
      }
      entry.phases.add(scan.phase);
    }
  }

  return result;
}

function resolvePhase(phases: Set<GatePhase>): GatePhase | null {
  if (phases.size === 0) return null;
  let best: GatePhase | null = null;
  let bestPriority = Infinity;
  for (const phase of phases) {
    const priority = phasePriority(phase);
    if (priority < bestPriority) {
      bestPriority = priority;
      best = phase;
    }
  }
  return best;
}

interface CommandProvenanceEntry {
  command: string;
  proposedBy: string[];
  addedBy: string[];
  changedBy: string[];
  removedBy: string[];
}

async function loadCommandProvenance(workspaceRoot: string): Promise<Map<string, string | null>> {
  const manifestPath = join(workspaceRoot, ECOSYSTEM_MANIFEST_PATH);
  let manifestText: string;
  try {
    manifestText = await readFile(manifestPath, "utf8");
  } catch {
    return new Map();
  }

  let parsed: { commandProvenance?: CommandProvenanceEntry[] };
  try {
    parsed = yamlParse(manifestText) as { commandProvenance?: CommandProvenanceEntry[] };
  } catch {
    return new Map();
  }

  const provenance = new Map<string, string | null>();
  if (Array.isArray(parsed.commandProvenance)) {
    for (const entry of parsed.commandProvenance) {
      const rfc = entry.proposedBy[0] ?? entry.addedBy[0] ?? null;
      provenance.set(entry.command, rfc);
    }
  }
  return provenance;
}

async function collectGateCatalogSourceHashes(
  workspaceRoot: string,
): Promise<Array<{ path: string; hash: string }>> {
  const sourcePaths = [
    "packages/os/site-kernel/src/types.ts",
    "packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts",
    "packages/os/site-kernel-checks/src/pipelines/packages-check.ts",
    "packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts",
    "packages/os/site-kernel-checks/src/pipelines/sites-check-postbuild.ts",
    "packages/os/site-kernel-checks/src/pipelines/build-check.ts",
    "packages/os/site-kernel-checks/src/pipelines/mission-preflight.ts",
    "packages/os/site-kernel-checks/src/gate-catalog.ts",
    "tools/kernel.config.ts",
  ];

  // Also scan command-tables directory for all .ts files
  const commandTablesDir = join(workspaceRoot, "packages/os/site-kernel-checks/src/command-tables");
  try {
    const entries = await readdir(commandTablesDir);
    for (const entry of entries) {
      if (entry.endsWith(".ts")) {
        sourcePaths.push(`packages/os/site-kernel-checks/src/command-tables/${entry}`);
      }
    }
  } catch {
    // Directory read failure is non-fatal
  }

  const uniquePaths = [...new Set(sourcePaths)].sort();
  const sources: Array<{ path: string; hash: string }> = [];
  for (const sourcePath of uniquePaths) {
    const absolute = join(workspaceRoot, sourcePath);
    try {
      sources.push({ path: sourcePath, hash: digestHex(await readFile(absolute, "utf8")) });
    } catch {
      // Missing optional source files are silently skipped
    }
  }
  return sources;
}

export async function buildGateCatalog(workspaceRoot: string): Promise<GateCatalog> {
  const commands = await listRegisteredKernelCommands(workspaceRoot);
  const pipelineMap = scanPipelines();
  const provenance = await loadCommandProvenance(workspaceRoot);

  const entries: GateCatalogEntry[] = [];
  const seenCommands = new Set<string>();

  // First: all registered commands (with or without gate metadata)
  for (const cmd of commands) {
    seenCommands.add(cmd.name);
    const gate: GateMetadata | undefined = cmd.gate;
    const pipelineInfo = pipelineMap.get(cmd.name);
    const phases = new Set<GatePhase>();
    if (pipelineInfo) {
      for (const p of pipelineInfo.phases) phases.add(p);
    }
    if (gate) phases.add(gate.phase);

    const phase = gate?.phase ?? resolvePhase(phases);
    const pipelines = pipelineInfo?.pipelines ?? [];

    entries.push({
      command: cmd.name,
      severity: gate?.severity ?? null,
      phase,
      pipelines: [...pipelines].sort(),
      conditional: gate?.conditional ?? null,
      surfaces: gate?.surfaces ?? null,
      rules: gate?.rules ?? null,
      blocks: gate?.blocks ?? null,
      metadata: gate ? "present" : "absent",
      rfc: provenance.get(cmd.name) ?? null,
    });
  }

  // Then: commands in pipelines that are not in the registered command list
  for (const [commandName, pipelineInfo] of pipelineMap) {
    if (seenCommands.has(commandName)) continue;
    seenCommands.add(commandName);
    entries.push({
      command: commandName,
      severity: null,
      phase: resolvePhase(pipelineInfo.phases),
      pipelines: [...pipelineInfo.pipelines].sort(),
      conditional: null,
      surfaces: null,
      rules: null,
      blocks: null,
      metadata: "absent",
      rfc: provenance.get(commandName) ?? null,
    });
  }

  entries.sort((a, b) => a.command.localeCompare(b.command));

  const withMetadata = entries.filter((e) => e.metadata === "present").length;
  const withoutMetadata = entries.length - withMetadata;

  const bySeverity: Record<string, number> = {};
  for (const entry of entries) {
    const key = entry.severity ?? "unknown";
    bySeverity[key] = (bySeverity[key] ?? 0) + 1;
  }

  const byPhase: Record<string, number> = {};
  for (const entry of entries) {
    const key = entry.phase ?? "unknown";
    byPhase[key] = (byPhase[key] ?? 0) + 1;
  }

  const sources = await collectGateCatalogSourceHashes(workspaceRoot);

  const catalogWithoutHash: Omit<GateCatalog, "meta"> & {
    meta: Omit<GateCatalog["meta"], "contentHash">;
  } = {
    meta: {
      schemaVersion: 1,
      deterministic: true,
      generatedAt: null,
      sources,
    },
    gates: entries,
    summary: {
      total: entries.length,
      withMetadata,
      withoutMetadata,
      bySeverity,
      byPhase,
    },
  };

  const contentHash = digestHex(JSON.stringify(catalogWithoutHash));
  return {
    ...catalogWithoutHash,
    meta: { ...catalogWithoutHash.meta, contentHash },
  };
}

export function renderGateCatalog(catalog: GateCatalog): string {
  return yamlStringify(catalog);
}

export async function runGateCatalogGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ file: string }>> {
  const catalog = await buildGateCatalog(context.workspaceRoot);
  const target = join(context.workspaceRoot, GATE_CATALOG_PATH);
  await writeFileAtomic(target, renderGateCatalog(catalog));
  return {
    data: { file: GATE_CATALOG_PATH },
    exitCode: 0,
    summary: `gate.catalog.generate: wrote ${GATE_CATALOG_PATH}`,
  };
}

export async function runGateCatalogValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];
  const target = join(context.workspaceRoot, GATE_CATALOG_PATH);

  let committedText: string;
  try {
    committedText = await readFile(target, "utf8");
  } catch {
    return diagnosticsResult("gate.catalog.validate", [
      {
        ruleId: "GATE-CAT-01",
        severity: "error",
        file: GATE_CATALOG_PATH,
        message: `${GATE_CATALOG_PATH} is missing.`,
        fixHint: "Run gate.catalog.generate.",
      },
    ]);
  }

  const expected = renderGateCatalog(await buildGateCatalog(context.workspaceRoot));

  if (committedText !== expected) {
    diagnostics.push({
      ruleId: "GATE-CAT-02",
      severity: "error",
      file: GATE_CATALOG_PATH,
      message: `${GATE_CATALOG_PATH} drifted from live command registrations.`,
      fixHint: "Run gate.catalog.generate.",
    });
  }

  // GATE-CAT-03: commands in pipelines without gate metadata
  let committed: GateCatalog;
  try {
    committed = yamlParse(committedText) as GateCatalog;
  } catch {
    committed = yamlParse(expected) as GateCatalog;
  }

  if (committed?.gates) {
    for (const gate of committed.gates) {
      if (gate.metadata === "absent" && gate.pipelines.length > 0) {
        diagnostics.push({
          ruleId: "GATE-CAT-03",
          severity: "warning",
          message: `Command \`${gate.command}\` appears in validation pipeline(s) [${gate.pipelines.join(", ")}] but lacks gate metadata.`,
          fixHint: "Add gate metadata to the command definition (RFC-0518).",
        });
      }

      // GATE-CAT-04: phase mismatch — declared phase vs pipeline placement
      if (gate.metadata === "present" && gate.phase) {
        const pipelineInfo = scanPipelines().get(gate.command);
        if (pipelineInfo) {
          const resolvedPhase = resolvePhase(pipelineInfo.phases);
          if (resolvedPhase && gate.phase !== resolvedPhase) {
            diagnostics.push({
              ruleId: "GATE-CAT-04",
              severity: "warning",
              message: `Command \`${gate.command}\` declares phase \`${gate.phase}\` but pipeline placement suggests \`${resolvedPhase}\`.`,
              fixHint:
                "Update the gate.phase in the command definition or move the command to the correct pipeline.",
            });
          }
        }
      }

      // GATE-CAT-05: blocks referencing non-existent workflow steps
      if (gate.blocks && gate.blocks.length > 0) {
        const knownSteps = new Set<string>([
          "release.prepare",
          "release.ready",
          "mission.materialize",
          "mission.migrate",
          "mission.validate",
          "mission.reconcile",
          "mission.close",
          "mission.abort",
          "build.prepare",
          "build.check",
          "build.post",
          "sites-check.author",
          "sites-check.postbuild",
          "packages-check.run",
        ]);
        for (const blocked of gate.blocks) {
          if (!knownSteps.has(blocked)) {
            diagnostics.push({
              ruleId: "GATE-CAT-05",
              severity: "warning",
              message: `Command \`${gate.command}\` declares blocks referencing \`${blocked}\`, which is not a known workflow step.`,
              fixHint:
                "Update the gate.blocks in the command definition to reference a valid workflow step.",
            });
          }
        }
      }
    }
  }

  return diagnosticsResult("gate.catalog.validate", diagnostics);
}
