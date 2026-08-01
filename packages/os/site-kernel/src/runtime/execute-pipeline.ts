/*
<MODULE_CONTRACT>
<purpose>
Pipeline execution: run an ordered list of pipeline steps (app-scoped or workspace-scoped)
through executeRegisteredCommand, recording per-step timing/telemetry (RFC-0270) and
producing a KernelPipelineReport with a timing summary (slowest steps, timeout count).
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of runtime.ts (Phase 3 file-size split, hot-path file 8/8).</item>
  <item>RFC-0326: pass fileIntents from createDefaultIO() to step contexts; aggregate filesModified across step reports into KernelPipelineReport.</item>
  <item>Add stderr progress lines for every pipeline step (start + finish + duration) so operators see live progress even in --json mode.</item>
  <item>RFC-0390: integrate command-result cache — skip re-execution on cache hit, store only ok:true results, respect --force and --dry-run.</item>
  <item>RFC-0637: moduleHashCache key includes modulePaths; computeModuleHash receives command.modulePaths for granular per-command hashing.</item>
</CHANGE_SUMMARY>
*/

import { performance } from "node:perf_hooks";
import process from "node:process";
import { join } from "node:path";
import { createKernelLogger } from "../logger.ts";
import { loadWorkspaceConfig } from "../discovery.ts";
import type { KernelRegistry } from "../registry.ts";
import {
  appendStepTelemetry,
  loadPipelineBudgets,
  lookupExpectedDurationMs,
} from "../pipeline-budgets.ts";
import { createDefaultIO } from "../workspace-io.ts";
import { createCacheLayer } from "../cache/cache-layer.ts";
import {
  COMMAND_RESULT_CACHE_SCHEMA_VERSION,
  computeInputsHash,
  computeModuleHash,
  getCachedCommandResult,
  setCachedCommandResult,
  type CommandResultCacheKey,
} from "../cache/command-result-cache.ts";
import type { CacheLayer } from "../cache/cache-layer.ts";
import type {
  DiscoveredSiteWorkspace,
  ExecuteKernelPipelineOptions,
  KernelExecutionReport,
  KernelPipelineReport,
  KernelPipelineStep,
  KernelPipelineTimingSummary,
  KernelCommandDefinition,
  KernelRuntimeContext,
  PipelineStepTiming,
} from "../types.ts";
import { executeRegisteredCommand } from "./execute-command.ts";
import { assertKnownOptionKeys, summarizeLogs } from "./shared.ts";
import { buildRegistry, ensureTargetSites, loadAppRuntime } from "./registry.ts";

const PIPELINE_TIMING_SUMMARY_THRESHOLD_MS = 30_000;

function progressLine(message: string): void {
  process.stderr.write(`${message}\n`);
}

function stepStatusLabel(report: KernelExecutionReport): string {
  if (report.cached) return "SKIP (cached)";
  if (report.exitCode === 0 && report.summary?.startsWith("Skipped:")) return "SKIP";
  if (report.timing.exceededTimeout) return "TIMEOUT";
  if (!report.ok) return "FAIL";
  if ((report.logSummary?.warning ?? 0) > 0) return "WARN";
  return "OK";
}

function stepStatus(report: KernelExecutionReport): PipelineStepTiming["status"] {
  if (report.cached) return "skipped";
  if (report.exitCode === 0 && report.summary?.startsWith("Skipped:")) return "skipped";
  if (report.timing.exceededTimeout) return "timeout";
  if (!report.ok) return "fail";
  if ((report.logSummary?.warning ?? 0) > 0) return "warn";
  return "pass";
}

function skippedExecutionReport(
  command: KernelCommandDefinition,
  context: KernelRuntimeContext,
  reason?: string,
): KernelExecutionReport {
  return {
    siteName: context.site?.name,
    commandName: command.name,
    exitCode: 0,
    ok: true,
    summary: `Skipped: ${reason ?? "pipeline step marked skip"}`,
    metadata: command,
    logs: context.logger.getEvents(),
    logSummary: summarizeLogs(context.logger.getEvents()),
    timing: {
      durationMs: 0,
      exceededTimeout: false,
    },
    filesModified: [],
  };
}

function pipelineTimingSummary(
  pipelineName: string,
  reports: KernelExecutionReport[],
  stepTimings: PipelineStepTiming[],
  siteName?: string,
): KernelPipelineTimingSummary {
  const totalDurationMs = stepTimings.reduce((sum, step) => sum + step.durationMs, 0);
  const failed = reports.find((report) => !report.ok);
  return {
    pipeline: pipelineName,
    ...(siteName ? { site: siteName } : {}),
    totalDurationMs,
    stepCount: stepTimings.length,
    slowestSteps: [...stepTimings].sort((a, b) => b.durationMs - a.durationMs).slice(0, 6),
    timeoutCount: stepTimings.filter((step) => step.exceededTimeout).length,
    warningCount: reports.reduce((sum, report) => sum + (report.logSummary?.warning ?? 0), 0),
    ...(failed ? { failedStep: failed.commandName } : {}),
  };
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

function printPipelineTimingSummary(
  logger: KernelRuntimeContext["logger"],
  summary: KernelPipelineTimingSummary,
): void {
  if (
    summary.totalDurationMs < PIPELINE_TIMING_SUMMARY_THRESHOLD_MS &&
    summary.timeoutCount === 0
  ) {
    return;
  }

  const target = summary.app
    ? `${summary.app}: ${summary.pipeline}`
    : `workspace: ${summary.pipeline}`;
  logger.section(`${target} timing`);
  logger.info(
    `[OK] total ${formatDuration(summary.totalDurationMs)}, ${summary.stepCount} step(s), ${summary.timeoutCount} timeout(s)`,
  );
  if (summary.slowestSteps.length > 0) {
    logger.info("slowest:");
    summary.slowestSteps.forEach((step, index) => {
      logger.info(`  ${index + 1}. ${step.command} ${formatDuration(step.durationMs)}`);
    });
  }
}

/**
 * RFC-0326: deduplicate and aggregate filesModified across all step reports.
 */
function aggregateFilesModified(reports: KernelExecutionReport[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const report of reports) {
    for (const path of report.filesModified ?? []) {
      if (!seen.has(path)) {
        seen.add(path);
        result.push(path);
      }
    }
  }
  return result;
}

/**
 * RFC-0390: Determine whether a command is eligible for caching.
 * A command is cacheable when `cacheable !== false` AND it has non-empty `reads`.
 * Commands with `cacheable: false` or without `reads` are always executed.
 */
function isCommandCacheable(command: KernelCommandDefinition): boolean {
  if (command.cacheable === false) return false;
  const reads = command.reads ?? [];
  return reads.length > 0;
}

/**
 * RFC-0637: Resolve the module hash from the per-pipeline-run cache, computing
 * it on miss. The cache key includes `command.modulePaths` so commands with
 * different `modulePaths` get independent cache entries.
 */
async function getOrComputeModuleHash(
  moduleSrcDir: string,
  command: KernelCommandDefinition,
  moduleHashCache: Map<string, string>,
): Promise<string> {
  const moduleHashCacheKey = `${moduleSrcDir}:${command.modulePaths?.join(",") ?? ""}`;
  let moduleHash = moduleHashCache.get(moduleHashCacheKey);
  if (!moduleHash) {
    moduleHash = await computeModuleHash(moduleSrcDir, command.modulePaths);
    moduleHashCache.set(moduleHashCacheKey, moduleHash);
  }
  return moduleHash;
}

/**
 * RFC-0390: Attempt to read a cached result for the given command.
 * Returns the cached report (with `cached: true`) or null on miss.
 * Skips cache when `dryRun` or `force` is set, or when cache is unavailable.
 */
async function tryCacheRead(
  cache: CacheLayer,
  command: KernelCommandDefinition,
  baseDir: string,
  workspaceRoot: string,
  siteName: string | null,
  moduleSrcDir: string,
  moduleHashCache: Map<string, string>,
  force: boolean,
  dryRun: boolean,
): Promise<KernelExecutionReport | null> {
  if (dryRun || force) return null;
  if (!isCommandCacheable(command)) return null;
  if (!cache.available) return null;

  const reads = command.reads ?? [];
  const inputsHash = await computeInputsHash(reads, baseDir, workspaceRoot);

  const moduleHash = await getOrComputeModuleHash(moduleSrcDir, command, moduleHashCache);

  const key: CommandResultCacheKey = {
    schemaVersion: COMMAND_RESULT_CACHE_SCHEMA_VERSION,
    commandName: command.name,
    siteName,
    inputsHash,
    moduleHash,
  };

  return getCachedCommandResult(cache, key);
}

/**
 * RFC-0390: Store a successful command result in the cache.
 * Only stores when `ok: true`, not `dryRun`, and the command is cacheable.
 * On `--force`, still stores (refreshing entries).
 */
async function tryCacheWrite(
  cache: CacheLayer,
  command: KernelCommandDefinition,
  report: KernelExecutionReport,
  baseDir: string,
  workspaceRoot: string,
  siteName: string | null,
  moduleSrcDir: string,
  moduleHashCache: Map<string, string>,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  if (!report.ok) return;
  if (!isCommandCacheable(command)) return;
  if (!cache.available) return;

  const reads = command.reads ?? [];
  const inputsHash = await computeInputsHash(reads, baseDir, workspaceRoot);

  const moduleHash = await getOrComputeModuleHash(moduleSrcDir, command, moduleHashCache);

  const key: CommandResultCacheKey = {
    schemaVersion: COMMAND_RESULT_CACHE_SCHEMA_VERSION,
    commandName: command.name,
    siteName,
    inputsHash,
    moduleHash,
  };

  await setCachedCommandResult(cache, key, report);
}

async function executePipelineForSite(
  site: DiscoveredSiteWorkspace,
  registry: KernelRegistry,
  options: ExecuteKernelPipelineOptions,
  steps: KernelPipelineStep[],
): Promise<KernelPipelineReport> {
  const reports: KernelExecutionReport[] = [];
  const stepTimings: PipelineStepTiming[] = [];
  // RFC-0270: a generated budget entry, when present, wins over the inline
  // expectedDurationMs — the inline value stays as the cold-start fallback.
  const budgets = await loadPipelineBudgets(options.workspaceRoot);
  const totalSteps = steps.length;
  // RFC-0390: create cache layer and module hash cache for this pipeline run.
  const cache = await createCacheLayer(options.workspaceRoot);
  const moduleHashCache = new Map<string, string>();
  progressLine(`[${site.name}] pipeline ${options.pipelineName} — ${totalSteps} step(s)`);

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex]!;
    const command = registry.getCommand(step.command);
    if (!command) {
      throw new Error(
        `Kernel pipeline step \`${step.command}\` is not registered for site \`${site.name}\`.`,
      );
    }

    const logger = createKernelLogger(options.outputFormat ?? "pretty");
    const { io, intents } = createDefaultIO();
    const context: KernelRuntimeContext = {
      workspaceRoot: options.workspaceRoot,
      site,
      siteExplicit: false,
      logger,
      dryRun: options.dryRun ?? false,
      outputFormat: options.outputFormat ?? "pretty",
      io,
      fileIntents: intents,
    };

    const stepLabel = `[${stepIndex + 1}/${totalSteps}]`;
    if (options.outputFormat !== "json") {
      logger.section(`${site.name}: ${options.pipelineName} -> ${step.command}`);
    }
    progressLine(`${stepLabel} ${step.command} …`);

    const budgetedExpectedDurationMs = lookupExpectedDurationMs(
      budgets,
      options.pipelineName,
      step.command,
      site.name,
    );
    const startedAtMonotonicMs = Math.round(performance.now());
    let report: KernelExecutionReport;
    if (step.skip) {
      report = skippedExecutionReport(command, context, step.skipReason);
    } else {
      // RFC-0390: try cache read before executing.
      const moduleSrcDir = join(
        options.workspaceRoot,
        "packages",
        "os",
        "site-kernel-checks",
        "src",
      );
      const cached = await tryCacheRead(
        cache,
        command,
        site.directory,
        options.workspaceRoot,
        site.name,
        moduleSrcDir,
        moduleHashCache,
        options.force ?? false,
        options.dryRun ?? false,
      );
      if (cached) {
        report = cached;
      } else {
        // Inject --site for workspace-scoped commands so they receive the site
        // name from the pipeline context (mirrors executeKernelCommand logic).
        const stepArgs = [...(step.args ?? [])];
        if (command.scope === "workspace" && !stepArgs.includes("--site") && site.name) {
          stepArgs.push("--site", site.name);
        }
        report = await executeRegisteredCommand(command, context, stepArgs, {
          timeoutMs: step.timeoutMs,
          expectedDurationMs: budgetedExpectedDurationMs ?? step.expectedDurationMs,
        });
        // RFC-0390: store successful results in cache.
        await tryCacheWrite(
          cache,
          command,
          report,
          site.directory,
          options.workspaceRoot,
          site.name,
          moduleSrcDir,
          moduleHashCache,
          options.dryRun ?? false,
        );
      }
    }
    const endedAtMonotonicMs = Math.round(performance.now());
    progressLine(
      `${stepLabel} ${step.command} — ${stepStatusLabel(report)} ${formatDuration(report.timing.durationMs)}`,
    );
    if (!step.skip && !report.cached) {
      await appendStepTelemetry(options.workspaceRoot, {
        pipeline: options.pipelineName,
        command: step.command,
        app: site.name,
        durationMs: report.timing.durationMs,
        timedOut: report.timing.exceededTimeout,
        recordedAt: new Date().toISOString(),
      });
    }
    reports.push(report);
    stepTimings.push({
      pipeline: options.pipelineName,
      command: step.command,
      app: site.name,
      packageName: site.packageName,
      status: stepStatus(report),
      startedAtMonotonicMs,
      endedAtMonotonicMs,
      durationMs: report.timing.durationMs,
      ...(report.timing.timeoutMs !== undefined ? { timeoutMs: report.timing.timeoutMs } : {}),
      ...(report.timing.expectedDurationMs !== undefined
        ? { expectedDurationMs: report.timing.expectedDurationMs }
        : {}),
      exceededTimeout: report.timing.exceededTimeout,
    });

    if (!report.ok) {
      const timing = pipelineTimingSummary(options.pipelineName, reports, stepTimings, site.name);
      if (options.outputFormat !== "json") printPipelineTimingSummary(context.logger, timing);
      progressLine(
        `[${site.name}] pipeline ${options.pipelineName} — FAILED at step ${step.command} (${formatDuration(timing.totalDurationMs)})`,
      );
      return {
        siteName: site.name,
        pipelineName: options.pipelineName,
        exitCode: report.exitCode,
        ok: false,
        steps: reports,
        timing,
        filesModified: aggregateFilesModified(reports),
      };
    }
  }

  const timing = pipelineTimingSummary(options.pipelineName, reports, stepTimings, site.name);
  if (options.outputFormat !== "json") {
    const logger = createKernelLogger(options.outputFormat ?? "pretty");
    printPipelineTimingSummary(logger, timing);
  }
  progressLine(
    `[${site.name}] pipeline ${options.pipelineName} — DONE ${formatDuration(timing.totalDurationMs)} (${timing.stepCount} step(s), ${timing.timeoutCount} timeout(s))`,
  );

  return {
    siteName: site.name,
    pipelineName: options.pipelineName,
    exitCode: 0,
    ok: true,
    steps: reports,
    timing,
    filesModified: aggregateFilesModified(reports),
  };
}

async function executePipelineForWorkspace(
  registry: KernelRegistry,
  options: ExecuteKernelPipelineOptions,
  steps: KernelPipelineStep[],
): Promise<KernelPipelineReport> {
  const reports: KernelExecutionReport[] = [];
  const stepTimings: PipelineStepTiming[] = [];
  // RFC-0270: a generated budget entry, when present, wins over the inline
  // expectedDurationMs — the inline value stays as the cold-start fallback.
  const budgets = await loadPipelineBudgets(options.workspaceRoot);
  const totalSteps = steps.length;
  // RFC-0390: create cache layer and module hash cache for this pipeline run.
  const cache = await createCacheLayer(options.workspaceRoot);
  const moduleHashCache = new Map<string, string>();
  progressLine(`[workspace] pipeline ${options.pipelineName} — ${totalSteps} step(s)`);

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex]!;
    const command = registry.getCommand(step.command);
    if (!command) {
      throw new Error(
        `Kernel pipeline step \`${step.command}\` is not registered for workspace pipeline \`${options.pipelineName}\`.`,
      );
    }
    if (command.scope !== "workspace") {
      throw new Error(
        `Workspace pipeline \`${options.pipelineName}\` cannot execute app-scoped step \`${step.command}\` without an app target.`,
      );
    }

    const logger = createKernelLogger(options.outputFormat ?? "pretty");
    const { io, intents } = createDefaultIO();
    const context: KernelRuntimeContext = {
      workspaceRoot: options.workspaceRoot,
      site: undefined,
      siteExplicit: false,
      logger,
      dryRun: options.dryRun ?? false,
      outputFormat: options.outputFormat ?? "pretty",
      io,
      fileIntents: intents,
    };

    const stepLabel = `[${stepIndex + 1}/${totalSteps}]`;
    if (options.outputFormat !== "json") {
      logger.section(`workspace: ${options.pipelineName} -> ${step.command}`);
    }
    progressLine(`${stepLabel} ${step.command} …`);

    const budgetedExpectedDurationMs = lookupExpectedDurationMs(
      budgets,
      options.pipelineName,
      step.command,
      null,
    );
    const startedAtMonotonicMs = Math.round(performance.now());
    let report: KernelExecutionReport;
    if (step.skip) {
      report = skippedExecutionReport(command, context, step.skipReason);
    } else {
      // RFC-0390: try cache read before executing.
      const moduleSrcDir = join(
        options.workspaceRoot,
        "packages",
        "os",
        "site-kernel-checks",
        "src",
      );
      const cached = await tryCacheRead(
        cache,
        command,
        options.workspaceRoot,
        options.workspaceRoot,
        null,
        moduleSrcDir,
        moduleHashCache,
        options.force ?? false,
        options.dryRun ?? false,
      );
      if (cached) {
        report = cached;
      } else {
        report = await executeRegisteredCommand(command, context, step.args ?? [], {
          timeoutMs: step.timeoutMs,
          expectedDurationMs: budgetedExpectedDurationMs ?? step.expectedDurationMs,
        });
        // RFC-0390: store successful results in cache.
        await tryCacheWrite(
          cache,
          command,
          report,
          options.workspaceRoot,
          options.workspaceRoot,
          null,
          moduleSrcDir,
          moduleHashCache,
          options.dryRun ?? false,
        );
      }
    }
    const endedAtMonotonicMs = Math.round(performance.now());
    progressLine(
      `${stepLabel} ${step.command} — ${stepStatusLabel(report)} ${formatDuration(report.timing.durationMs)}`,
    );
    if (!step.skip && !report.cached) {
      await appendStepTelemetry(options.workspaceRoot, {
        pipeline: options.pipelineName,
        command: step.command,
        app: null,
        durationMs: report.timing.durationMs,
        timedOut: report.timing.exceededTimeout,
        recordedAt: new Date().toISOString(),
      });
    }
    reports.push(report);
    stepTimings.push({
      pipeline: options.pipelineName,
      command: step.command,
      status: stepStatus(report),
      startedAtMonotonicMs,
      endedAtMonotonicMs,
      durationMs: report.timing.durationMs,
      ...(report.timing.timeoutMs !== undefined ? { timeoutMs: report.timing.timeoutMs } : {}),
      ...(report.timing.expectedDurationMs !== undefined
        ? { expectedDurationMs: report.timing.expectedDurationMs }
        : {}),
      exceededTimeout: report.timing.exceededTimeout,
    });

    if (!report.ok) {
      const timing = pipelineTimingSummary(options.pipelineName, reports, stepTimings);
      if (options.outputFormat !== "json") printPipelineTimingSummary(context.logger, timing);
      progressLine(
        `[workspace] pipeline ${options.pipelineName} — FAILED at step ${step.command} (${formatDuration(timing.totalDurationMs)})`,
      );
      return {
        pipelineName: options.pipelineName,
        exitCode: report.exitCode,
        ok: false,
        steps: reports,
        timing,
        filesModified: aggregateFilesModified(reports),
      };
    }
  }

  const timing = pipelineTimingSummary(options.pipelineName, reports, stepTimings);
  if (options.outputFormat !== "json") {
    const logger = createKernelLogger(options.outputFormat ?? "pretty");
    printPipelineTimingSummary(logger, timing);
  }
  progressLine(
    `[workspace] pipeline ${options.pipelineName} — DONE ${formatDuration(timing.totalDurationMs)} (${timing.stepCount} step(s), ${timing.timeoutCount} timeout(s))`,
  );

  return {
    pipelineName: options.pipelineName,
    exitCode: 0,
    ok: true,
    steps: reports,
    timing,
    filesModified: aggregateFilesModified(reports),
  };
}

const EXECUTE_KERNEL_PIPELINE_OPTION_KEYS = [
  "workspaceRoot",
  "pipelineName",
  "siteName",
  "allSites",
  "dryRun",
  "force",
  "outputFormat",
  "siteWorkspace",
];

export async function executeKernelPipeline(
  options: ExecuteKernelPipelineOptions,
): Promise<KernelPipelineReport | KernelPipelineReport[]> {
  assertKnownOptionKeys(
    options,
    EXECUTE_KERNEL_PIPELINE_OPTION_KEYS,
    "executeKernelPipeline options",
  );
  progressLine(`pipeline ${options.pipelineName} — resolving target …`);

  // Pre-resolved site workspace bypasses discovery (e.g. closed-mission workpieces
  // where registry.currentMission is null and discovery can't find the workpiece).
  if (options.siteWorkspace) {
    const site = options.siteWorkspace;
    progressLine(`pipeline ${options.pipelineName} — 1 site(s): ${site.name}`);
    progressLine(`[${site.name}] loading app runtime …`);
    const { registry } = await loadAppRuntime(options.workspaceRoot, site);
    progressLine(`[${site.name}] app runtime ready`);
    const steps = registry.getPipeline(options.pipelineName);
    if (!steps) {
      throw new Error(
        `Kernel pipeline \`${options.pipelineName}\` is not registered for site \`${site.name}\`.`,
      );
    }
    return executePipelineForSite(site, registry, options, steps);
  }

  if (!options.siteName && !(options.allSites ?? false)) {
    const workspaceConfig = await loadWorkspaceConfig(options.workspaceRoot);
    if (workspaceConfig) {
      progressLine(`pipeline ${options.pipelineName} — loading workspace registry …`);
      const wsRegistry = await buildRegistry(workspaceConfig);
      const wsSteps = wsRegistry.getPipeline(options.pipelineName);
      if (wsSteps) {
        progressLine(`pipeline ${options.pipelineName} — workspace registry ready`);
        return executePipelineForWorkspace(wsRegistry, options, wsSteps);
      }
    }
  }

  const targetSites = await ensureTargetSites(
    options.workspaceRoot,
    options.allSites ?? false,
    options.siteName,
  );

  if (targetSites.length === 0) {
    throw new Error("No target site with a kernel config could be resolved.");
  }

  progressLine(
    `pipeline ${options.pipelineName} — ${targetSites.length} site(s): ${targetSites.map((s) => s.name).join(", ")}`,
  );

  const reports: KernelPipelineReport[] = [];

  for (const site of targetSites) {
    progressLine(`[${site.name}] loading app runtime …`);
    const { registry } = await loadAppRuntime(options.workspaceRoot, site);
    progressLine(`[${site.name}] app runtime ready`);
    const steps = registry.getPipeline(options.pipelineName);
    if (!steps) {
      throw new Error(
        `Kernel pipeline \`${options.pipelineName}\` is not registered for site \`${site.name}\`.`,
      );
    }

    reports.push(await executePipelineForSite(site, registry, options, steps));
  }

  return options.allSites ? reports : reports[0]!;
}
