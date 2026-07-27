/*
<MODULE_CONTRACT>
<purpose>Build the deterministic Agent Control Plane manifest from live registries and package files.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0245: Add Agent Control Plane generated manifest and maintenance debt ledger command handlers.</item>
  <item>RFC-0246: Derive workspace packages from pnpm-workspace.yaml and emit schema v2 deterministic metadata.</item>
  <item>RFC-0249: Project per-package test signal classification into the Agent Control Plane manifest.</item>
  <item>RFC-0251: Project test policy and maintenance baseline summaries into the Agent Control Plane manifest.</item>
  <item>RFC-0256: Include maintenance debt queue command and plan sources in ACP drift hashes.</item>
  <item>RFC-0245-amendment: Project implemented RFC list with DNA refs and DNA registry into the ACP manifest as a configuration baseline.</item>
  <item>RFC-0303: extracted manifest builder from ecosystem.ts into ecosystem/manifest.ts.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { byteHash } from "@gogol/fingerprint";
import { readJsonFile } from "@gogol/share/fs";
import {
  GENERATED_MARKER,
  listSiteWorkspaces,
  listRegisteredKernelCommands,
  loadWorkspaceConfig,
  discoverWorkspacePackages,
} from "@gogol/site-kernel";
import type { WorkspacePackageInfo } from "@gogol/site-kernel";
import { parse, parse as yamlParse, stringify as yamlStringify } from "yaml";
import { GENERATOR_OWNERSHIP_MAP } from "../generator-ownership.ts";
import { collectPackageTestSignals } from "../test-signal.ts";
import {
  SITES_BUILD_CHECK_PIPELINE,
  SITES_BUILD_POST_PIPELINE,
  SITES_BUILD_PREPARE_PIPELINE,
  SITES_CHECK_AUTHOR_PIPELINE,
  SITES_CHECK_PIPELINE,
  SITES_CHECK_POSTBUILD_PIPELINE,
  PACKAGES_CHECK_PIPELINE,
  STANDARD_COMPASS_PIPELINE,
} from "../pipelines/index.ts";
import type { EcosystemManifest, PackageJson } from "./types.ts";
import {
  PNPM_WORKSPACE_PATH,
  DNA_REGISTRY_PATH,
  RFC_STATUS_KEYS,
  ALL_RFC_STATUS_KEYS,
  MAINTENANCE_DEBT_BASELINE_PATH,
  MAINTENANCE_DEBT_QUEUES_PATH,
  type MaintenanceDebtReport,
} from "./types.ts";
import { collectMaintenanceDebtItems, maintenanceDebtKey } from "./debt.ts";

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

const HASH_PREFIX = "sha" + "256:";

function digestHex(value: string): string {
  return byteHash(value).slice(HASH_PREFIX.length);
}

async function collectPackages(
  workspaceRoot: string,
  workspacePackages: WorkspacePackageInfo[],
): Promise<EcosystemManifest["packages"]> {
  const packages: EcosystemManifest["packages"] = [];
  const testSignalByDirectory = new Map(
    (await collectPackageTestSignals(workspaceRoot)).map((signal) => [signal.directory, signal]),
  );
  for (const pkg of workspacePackages) {
    const json = pkg.packageJson;
    if (!json.name) continue;
    const relativeDirectory = pkg.directory;
    const dependencies = [
      ...Object.keys(json.dependencies ?? {}),
      ...Object.keys(json.peerDependencies ?? {}),
    ].sort();
    packages.push({
      name: json.name,
      directory: relativeDirectory,
      workspacePattern: pkg.workspacePattern,
      kind: pkg.kind,
      dependencies,
      testSignal: testSignalByDirectory.get(relativeDirectory) ?? {
        packageName: json.name,
        directory: relativeDirectory,
        signal: "absent",
        evidence: "package was not classified by test.signal.validate",
        requiredAction: "Update collectPackageTestSignals to include this workspace package.",
      },
    });
  }
  return packages.sort((a, b) => a.directory.localeCompare(b.directory));
}

function groupedCommands(
  commands: Awaited<ReturnType<typeof listRegisteredKernelCommands>>,
): EcosystemManifest["commands"] {
  const groups = new Map<string, EcosystemManifest["commands"][number]>();
  for (const command of commands) {
    const key = command.name;
    const existing = groups.get(key);
    if (existing) {
      existing.providers.push(command.provider);
      existing.providers = [...new Set(existing.providers)].sort();
      existing.mutatesState = existing.mutatesState || command.mutatesState === true;
      existing.supportsAllSites = existing.supportsAllSites || command.supportsAllSites === true;
      if (!existing.gate && command.gate) existing.gate = command.gate;
      continue;
    }

    groups.set(key, {
      name: command.name,
      scope: command.scope,
      mutatesState: command.mutatesState === true,
      supportsAllSites: command.supportsAllSites === true,
      providers: [command.provider],
      ...(command.gate ? { gate: command.gate } : {}),
    });
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function collectPipelines(workspaceRoot: string): Promise<EcosystemManifest["pipelines"]> {
  const workspaceConfig = await loadWorkspaceConfig(workspaceRoot);
  const commandScopes = new Map(
    (await listRegisteredKernelCommands(workspaceRoot)).map((command) => [
      command.name,
      command.scope,
    ]),
  );
  const classifyScope = (commands: string[]): "app" | "workspace" =>
    commands.every((command) => commandScopes.get(command) === "workspace") ? "workspace" : "app";
  const toPipeline = (name: string, commands: string[]): EcosystemManifest["pipelines"][number] => {
    const scope = classifyScope(commands);
    return { name, scope, commands, executableFromRoot: scope === "workspace" };
  };
  const configured = Object.entries(workspaceConfig?.pipelines ?? {}).map(([name, steps]) => ({
    name,
    commands: steps.map((step) => step.command),
  }));
  const exported = [
    ["sites-check.run", SITES_CHECK_PIPELINE],
    ["sites-check.author", SITES_CHECK_AUTHOR_PIPELINE],
    ["sites-check.postbuild", SITES_CHECK_POSTBUILD_PIPELINE],
    ["build.prepare", SITES_BUILD_PREPARE_PIPELINE],
    ["build.check", SITES_BUILD_CHECK_PIPELINE],
    ["build.post", SITES_BUILD_POST_PIPELINE],
    ["packages-check.run", PACKAGES_CHECK_PIPELINE],
    ["compass.standard", STANDARD_COMPASS_PIPELINE],
  ].map(([name, steps]) => ({
    name: String(name),
    commands: (steps as typeof PACKAGES_CHECK_PIPELINE).map((step) => step.command),
  }));

  const byName = new Map<string, EcosystemManifest["pipelines"][number]>();
  for (const pipeline of [...configured, ...exported]) {
    byName.set(pipeline.name, toPipeline(pipeline.name, pipeline.commands));
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function collectMaintenanceDebtQueueSourcePaths(workspaceRoot: string): Promise<string[]> {
  const directory = join(workspaceRoot, "docs", "maintenance-debt", "queues");
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
    .map((entry) => toPosixPath(join("docs", "maintenance-debt", "queues", entry.name)))
    .sort((a, b) => a.localeCompare(b));
}

async function collectSourceHashes(
  workspaceRoot: string,
  packageDirectories: WorkspacePackageInfo[],
): Promise<Array<{ path: string; hash: string }>> {
  const queueSourcePaths = await collectMaintenanceDebtQueueSourcePaths(workspaceRoot);
  const sourcePaths = [
    "package.json",
    PNPM_WORKSPACE_PATH,
    "tools/kernel.config.ts",
    "packages/os/site-kernel/src/runtime.ts",
    "packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts",
    "packages/os/site-kernel-checks/src/ci-local.ts",
    "packages/os/site-kernel-checks/src/diagnostics/rules.ts",
    "packages/os/site-kernel-checks/src/diagnostics/rules/types.ts",
    "packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts",
    "packages/os/site-kernel-checks/src/diagnostics/rules/check-webgogol.ts",
    "packages/os/site-kernel-checks/src/diagnostics/rules/content-surface.ts",
    "packages/os/site-kernel-checks/src/diagnostics/rules/ops-fleet.ts",
    "packages/os/site-kernel-checks/src/diagnostics/rules/governance.ts",
    "packages/os/site-kernel-checks/src/diagnostics/rules/section-agent.ts",
    "packages/os/site-kernel-checks/src/ecosystem.ts",
    "packages/os/site-kernel-checks/src/maintenance-debt-baseline.ts",
    "packages/os/site-kernel-checks/src/maintenance-debt-queue.ts",
    "packages/os/site-kernel-checks/src/module.ts",
    "packages/os/site-kernel-checks/src/pipelines/packages-check.ts",
    "packages/os/site-kernel-checks/src/gate-catalog.ts",
    "packages/os/site-kernel-checks/src/test-signal.ts",
    MAINTENANCE_DEBT_BASELINE_PATH,
    MAINTENANCE_DEBT_QUEUES_PATH,
    DNA_REGISTRY_PATH,
    "docs/gate-catalog.generated.yaml",
    ...queueSourcePaths,
    ...packageDirectories.map(({ directory }) => toPosixPath(join(directory, "package.json"))),
  ];
  const uniquePaths = [...new Set(sourcePaths)].sort((a, b) => a.localeCompare(b));
  const sources: Array<{ path: string; hash: string }> = [];
  for (const sourcePath of uniquePaths) {
    const absolute = join(workspaceRoot, sourcePath);
    try {
      sources.push({ path: sourcePath, hash: digestHex(await readFile(absolute, "utf8")) });
    } catch {
      // Missing optional source files are ignored; required inputs fail elsewhere while reading.
    }
  }
  return sources;
}

function parseFrontmatterStatus(source: string): string | undefined {
  if (!source.startsWith("---\n")) return undefined;
  const end = source.indexOf("\n---", 4);
  if (end === -1) return undefined;
  const data = parse(source.slice(4, end)) as Record<string, unknown>;
  return typeof data.status === "string" ? data.status : undefined;
}

function parseFrontmatter(source: string): Record<string, unknown> | undefined {
  if (!source.startsWith("---\n")) return undefined;
  const end = source.indexOf("\n---", 4);
  if (end === -1) return undefined;
  return parse(source.slice(4, end)) as Record<string, unknown>;
}

function commandBucket(value: unknown, bucket: string): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const raw = (value as Record<string, unknown>)[bucket];
  return Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
}

async function collectCommandProvenance(
  workspaceRoot: string,
  commands: EcosystemManifest["commands"],
): Promise<EcosystemManifest["commandProvenance"]> {
  const liveCommands = new Set(commands.map((command) => command.name));
  const provenance = new Map<string, EcosystemManifest["commandProvenance"][number]>();
  const ensure = (command: string): EcosystemManifest["commandProvenance"][number] => {
    const existing = provenance.get(command);
    if (existing) return existing;
    const created = { command, proposedBy: [], addedBy: [], changedBy: [], removedBy: [] };
    provenance.set(command, created);
    return created;
  };

  const rfcDir = join(workspaceRoot, "docs", "rfcs");
  const entries = await readdir(rfcDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const fm = parseFrontmatter(await readFile(join(rfcDir, entry.name), "utf8"));
    if (!fm) continue;
    const rfcId = String(fm.id ?? "");
    if (!rfcId) continue;
    const commandsFm = fm.commands;
    for (const command of commandBucket(commandsFm, "proposed")) {
      if (liveCommands.has(command)) ensure(command).proposedBy.push(rfcId);
    }
    for (const command of commandBucket(commandsFm, "added")) {
      if (liveCommands.has(command)) ensure(command).addedBy.push(rfcId);
    }
    for (const command of commandBucket(commandsFm, "changed")) {
      if (liveCommands.has(command)) ensure(command).changedBy.push(rfcId);
    }
    for (const command of commandBucket(commandsFm, "removed")) {
      ensure(command).removedBy.push(rfcId);
    }
  }

  return [...provenance.values()]
    .map((entry) => ({
      command: entry.command,
      proposedBy: [...new Set(entry.proposedBy)].sort(),
      addedBy: [...new Set(entry.addedBy)].sort(),
      changedBy: [...new Set(entry.changedBy)].sort(),
      removedBy: [...new Set(entry.removedBy)].sort(),
    }))
    .sort((a, b) => a.command.localeCompare(b.command));
}

async function collectRfcCounts(workspaceRoot: string): Promise<EcosystemManifest["rfcs"]> {
  const counts: EcosystemManifest["rfcs"] = { accepted: 0, implemented: 0, draft: 0, reviewing: 0 };
  const rfcDir = join(workspaceRoot, "docs", "rfcs");
  let entries;
  try {
    entries = await readdir(rfcDir, { withFileTypes: true });
  } catch {
    return counts;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const status = parseFrontmatterStatus(await readFile(join(rfcDir, entry.name), "utf8"));
    if (RFC_STATUS_KEYS.includes(status as (typeof RFC_STATUS_KEYS)[number])) {
      counts[status as keyof typeof counts] += 1;
    }
  }
  return counts;
}

function extractDnaRefs(body: string): string[] {
  const refs = new Set<string>();
  for (const match of body.matchAll(/\bDNA-(\d+)\b/g)) {
    refs.add(`DNA-${match[1]}`);
  }
  return [...refs].sort((a, b) => {
    const na = parseInt(a.slice(4), 10);
    const nb = parseInt(b.slice(4), 10);
    return na - nb;
  });
}

async function collectDnaRegistry(
  workspaceRoot: string,
): Promise<EcosystemManifest["baseline"]["dnaRegistry"]> {
  let source: string;
  try {
    source = await readFile(join(workspaceRoot, DNA_REGISTRY_PATH), "utf8");
  } catch {
    return [];
  }
  const re = /^##\s+DNA-(\d+)\s*·?\s*(.*)$/gm;
  const matches = [...source.matchAll(re)];
  const registry: EcosystemManifest["baseline"]["dnaRegistry"] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : source.length;
    const body = source.slice(start, end);
    const cited = [...body.matchAll(/Established by (RFC-\d{4})/g)].map((x) => x[1]!);
    const foundational = /\bFoundational invariant\b/i.test(body);
    const reclassified = /\bReclassified to feature\b/i.test(body);
    const superseded = /\bSuperseded\b/i.test(body);
    registry.push({
      id: `DNA-${m[1]}`,
      title: (m[2] ?? "").trim(),
      provenance: foundational ? "foundational" : "rfc",
      establishingRfc: cited.length > 0 ? cited[0]! : null,
      status: superseded ? "superseded" : reclassified ? "reclassified" : "active",
    });
  }
  return registry.sort((a, b) => {
    const na = parseInt(a.id.slice(4), 10);
    const nb = parseInt(b.id.slice(4), 10);
    return na - nb;
  });
}

async function collectBaselineRfcs(workspaceRoot: string): Promise<EcosystemManifest["baseline"]> {
  const rfcDir = join(workspaceRoot, "docs", "rfcs");
  const entries = await readdir(rfcDir, { withFileTypes: true }).catch(() => []);
  const implementedRfcs: EcosystemManifest["baseline"]["implementedRfcs"] = [];
  const nonImplemented: Record<string, string[]> = {};
  for (const key of ALL_RFC_STATUS_KEYS) {
    if (key !== "implemented") nonImplemented[key] = [];
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const source = await readFile(join(rfcDir, entry.name), "utf8");
    const fm = parseFrontmatter(source);
    if (!fm) continue;
    const id = String(fm.id ?? "");
    if (!id.startsWith("RFC-")) continue;
    const status = String(fm.status ?? "");
    if (status === "implemented") {
      implementedRfcs.push({
        id,
        implementedAt: String(fm.implementedAt ?? ""),
        kind: String(fm.kind ?? ""),
        scope: String(fm.scope ?? ""),
        dnaRefs: extractDnaRefs(source),
      });
    } else if (nonImplemented[status]) {
      nonImplemented[status].push(id);
    }
  }

  implementedRfcs.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  for (const key of Object.keys(nonImplemented)) {
    nonImplemented[key]!.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  const dnaRegistry = await collectDnaRegistry(workspaceRoot);
  return { implementedRfcs, nonImplementedRfcs: nonImplemented, dnaRegistry };
}

async function collectMaintenanceDebtBaselineSummary(
  workspaceRoot: string,
  currentItems: MaintenanceDebtReport["items"],
): Promise<EcosystemManifest["quality"]["maintenanceDebtBaseline"]> {
  try {
    const parsed = yamlParse(
      await readFile(join(workspaceRoot, MAINTENANCE_DEBT_BASELINE_PATH), "utf8"),
    ) as {
      items?: Array<{ key?: string; reviewAfter?: string }>;
    };
    const baselineKeys = new Set((parsed.items ?? []).map((item) => item.key).filter(Boolean));
    const currentKeys = new Set(currentItems.map((item) => maintenanceDebtKey(item)));
    const expiredItems = (parsed.items ?? []).filter(
      (item) =>
        typeof item.reviewAfter === "string" &&
        new Date(`${item.reviewAfter}T00:00:00.000Z`).getTime() < Date.now(),
    ).length;
    return {
      exists: true,
      currentItems: currentItems.length,
      baselineItems: baselineKeys.size,
      newItems: [...currentKeys].filter((key) => !baselineKeys.has(key)).length,
      expiredItems,
    };
  } catch {
    return {
      exists: false,
      currentItems: currentItems.length,
      baselineItems: 0,
      newItems: currentItems.length,
      expiredItems: 0,
    };
  }
}

interface SystemsRegistry {
  schemaVersion: string;
  systems: Array<{
    id: string;
    currentMission?: string | null;
    registeredAt?: string | null;
  }>;
}

async function collectSternsystems(
  workspaceRoot: string,
): Promise<EcosystemManifest["sternsystems"]> {
  const registryPath = join(workspaceRoot, "systems/registry.yaml");
  try {
    const raw = await readFile(registryPath, "utf8");
    const parsed = yamlParse(raw) as SystemsRegistry;
    if (!parsed?.systems) return [];
    return parsed.systems
      .map((s) => ({
        id: s.id,
        currentMission: s.currentMission ?? null,
        registeredAt: s.registeredAt ?? null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}

async function collectMissions(workspaceRoot: string): Promise<EcosystemManifest["missions"]> {
  const missionsRoot = join(workspaceRoot, "missions");
  const results: EcosystemManifest["missions"] = [];
  try {
    const entries = await readdir(missionsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const missionDir = join(missionsRoot, entry.name);
      const statusPath = join(missionDir, "mission.yaml");
      let sternsystem = "";
      let status = "open";
      try {
        const raw = await readFile(statusPath, "utf8");
        const parsed = yamlParse(raw) as {
          sternsystem?: string;
          status?: string;
        };
        sternsystem = parsed?.sternsystem ?? "";
        status = parsed?.status ?? "open";
      } catch {
        continue;
      }
      const workpiecePath = join(missionDir, "workpiece");
      let workpieceRel: string | null = null;
      try {
        await readFile(join(workpiecePath, "package.json"), "utf8");
        workpieceRel = toPosixPath(relative(workspaceRoot, workpiecePath));
      } catch {
        // workpiece not materialized
      }
      results.push({
        id: entry.name,
        sternsystem,
        status,
        workpiecePath: workpieceRel,
      });
    }
  } catch {
    // missions dir doesn't exist
  }
  return results.sort((a, b) => a.id.localeCompare(b.id));
}

export async function buildEcosystemManifest(workspaceRoot: string): Promise<EcosystemManifest> {
  const rootPackage = await readJsonFile<PackageJson>(join(workspaceRoot, "package.json"));
  const workspacePackages = await discoverWorkspacePackages(workspaceRoot);
  const apps = (await listSiteWorkspaces(workspaceRoot)).sites
    .map((app) => ({
      name: app.name,
      directory: toPosixPath(relative(workspaceRoot, app.directory)),
      ...(app.packageName ? { packageName: app.packageName } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const packages = await collectPackages(workspaceRoot, workspacePackages.packages);
  const maintenanceDebtItems = await collectMaintenanceDebtItems(workspaceRoot);
  const baselineSummary = await collectMaintenanceDebtBaselineSummary(
    workspaceRoot,
    maintenanceDebtItems,
  );
  const commands = groupedCommands(await listRegisteredKernelCommands(workspaceRoot));
  const testSignals = { real: 0, noop: 0, absent: 0, skipped: 0 };
  let testSignalPolicyErrors = 0;
  let testSignalPolicyWarnings = 0;
  for (const pkg of packages) {
    testSignals[pkg.testSignal.signal] += 1;
    if (pkg.testSignal.signal === "real") continue;
    if (
      pkg.testSignal.signal === "skipped" &&
      pkg.testSignal.metadata?.owner &&
      pkg.testSignal.metadata.reviewAfter
    ) {
      continue;
    }
    testSignalPolicyErrors += 1;
  }

  const manifestWithoutMetaHash = {
    meta: {
      schemaVersion: 2 as const,
      deterministic: true as const,
      generatedAt: null,
      contentHash: "",
      sources: await collectSourceHashes(workspaceRoot, workspacePackages.packages),
    },
    workspace: {
      name: rootPackage.name ?? "workspace",
      version: rootPackage.version ?? "0.0.0",
      packageManager: rootPackage.packageManager ?? "",
      packageGlobs: workspacePackages.packageGlobs,
    },
    apps,
    sternsystems: await collectSternsystems(workspaceRoot),
    missions: await collectMissions(workspaceRoot),
    packages,
    quality: {
      testSignals,
      testSignalPolicy: {
        hasErrors: testSignalPolicyErrors > 0,
        errorCount: testSignalPolicyErrors,
        warningCount: testSignalPolicyWarnings,
      },
      maintenanceDebtBaseline: baselineSummary,
    },
    commands,
    commandProvenance: await collectCommandProvenance(workspaceRoot, commands),
    pipelines: await collectPipelines(workspaceRoot),
    generatedOwnership: [...GENERATOR_OWNERSHIP_MAP].sort((a, b) =>
      a.path === b.path ? a.command.localeCompare(b.command) : a.path.localeCompare(b.path),
    ),
    rfcs: await collectRfcCounts(workspaceRoot),
    baseline: await collectBaselineRfcs(workspaceRoot),
  };
  const contentHash = digestHex(JSON.stringify(manifestWithoutMetaHash));
  return {
    ...manifestWithoutMetaHash,
    meta: { ...manifestWithoutMetaHash.meta, contentHash },
  };
}

export function renderManifest(manifest: EcosystemManifest): string {
  return `${yamlStringify(manifest)}`;
}
