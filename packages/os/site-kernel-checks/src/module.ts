/*
<MODULE_CONTRACT>
<purpose>Thin registration entry point and pipeline driver for the standard site validation module.</purpose>
<non-goals>
  <item>Do not define command descriptions or runners inline — those live in domain-specific command tables.</item>
  <item>Do not duplicate pipeline step arrays — those are the single source of truth in src/pipelines/.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Decomposed monolithic module.ts into pipelines/, validators/, and command-tables/.</item>
  <item>ALL_COMMANDS is now the single data-driven array consumed by createStandardCheckModule.</item>
  <item>Pipeline constants moved to src/pipelines/* for independent AI-agent navigation.</item>
  <item>RFC-0270: runCommandSequence appends step telemetry and prefers a generated budget's expectedDurationMs over the inline estimate.</item>
  <item>RFC-0348: updated header to v2 two-block contract.</item>
</CHANGE_SUMMARY>
*/

import type {
  CheckResult,
  Diagnostic,
  KernelCommandDefinition,
  KernelCommandInput,
  KernelCommandResult,
  KernelLogEvent,
  KernelModule,
  KernelPipelineTimingSummary,
  KernelPipelineStep,
  KernelRuntimeContext,
  PipelineStepTiming,
} from "@warpgogol/site-kernel";
import { performance } from "node:perf_hooks";
import {
  executeKernelCommand,
  appendStepTelemetry,
  loadPipelineBudgets,
  lookupExpectedDurationMs,
} from "@warpgogol/site-kernel";
import { access } from "node:fs/promises";
import { join } from "node:path";
import {
  SITES_CHECK_PIPELINE,
  SITES_CHECK_AUTHOR_PIPELINE,
  SITES_CHECK_POSTBUILD_PIPELINE,
  SITES_BUILD_PREPARE_PIPELINE,
  SITES_BUILD_CHECK_PIPELINE,
  SITES_BUILD_POST_PIPELINE,
  PACKAGES_CHECK_PIPELINE,
  STANDARD_COMPASS_PIPELINE,
  MISSION_PREFLIGHT_CRITICAL,
  MISSION_PREFLIGHT_WARNING,
} from "./pipelines/index.ts";

export {
  SITES_CHECK_PIPELINE,
  SITES_CHECK_AUTHOR_PIPELINE,
  SITES_CHECK_POSTBUILD_PIPELINE,
  SITES_BUILD_PREPARE_PIPELINE,
  SITES_BUILD_CHECK_PIPELINE,
  SITES_BUILD_POST_PIPELINE,
  PACKAGES_CHECK_PIPELINE,
  STANDARD_COMPASS_PIPELINE,
  MISSION_PREFLIGHT_CRITICAL,
  MISSION_PREFLIGHT_WARNING,
};

interface PipelineDriverData {
  command:
    | "sites-check.run"
    | "sites-check.author"
    | "sites-check.postbuild"
    | "packages-check.run"
    | "packages.check";
  app?: string;
  subResults: Array<{
    command: string;
    ok: boolean;
    exitCode: number;
    summary?: string;
    diagnosticSummary?: CheckResult["summary"];
    diagnosticsPreview?: Diagnostic[];
    logs?: KernelLogEvent[];
    logSummary?: {
      error: number;
      warning: number;
      notice: number;
      expectedFallback: number;
      suppressedDebug: number;
    };
    timing?: {
      durationMs: number;
      timeoutMs?: number;
      expectedDurationMs?: number;
      exceededTimeout: boolean;
    };
  }>;
  summary: { ok: number; fail: number; skipped: number };
  timing?: KernelPipelineTimingSummary;
}

function isCheckResult(data: unknown): data is CheckResult {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  return Array.isArray(record["diagnostics"]) && typeof record["summary"] === "object";
}

function pipelineSubResult(
  command: string,
  single:
    | {
        ok?: boolean;
        exitCode?: number;
        summary?: string;
        data?: unknown;
        logs?: KernelLogEvent[];
        logSummary?: PipelineDriverData["subResults"][number]["logSummary"];
        timing?: PipelineDriverData["subResults"][number]["timing"];
      }
    | undefined,
): PipelineDriverData["subResults"][number] {
  const data = single?.data;
  const checkResult = isCheckResult(data) ? data : undefined;
  const includeDiagnostics =
    checkResult && (!single?.ok || checkResult.summary.warning > 0 || checkResult.summary.info > 0);

  return {
    command,
    ok: single?.ok ?? false,
    exitCode: single?.exitCode ?? 1,
    summary: single?.summary,
    logs: single?.logs,
    logSummary: single?.logSummary,
    timing: single?.timing,
    ...(includeDiagnostics
      ? {
          diagnosticSummary: checkResult.summary,
          diagnosticsPreview: checkResult.diagnostics.slice(0, 10),
        }
      : {}),
  };
}

function subResultStatus(
  result: PipelineDriverData["subResults"][number],
): PipelineStepTiming["status"] {
  if (result.timing?.exceededTimeout) return "timeout";
  if (!result.ok) return "fail";
  if ((result.logSummary?.warning ?? 0) > 0) return "warn";
  return "pass";
}

function summarizePipelineTiming(
  command: PipelineDriverData["command"],
  subResults: PipelineDriverData["subResults"],
  stepTimings: PipelineStepTiming[],
  app?: string,
): KernelPipelineTimingSummary {
  const failed = subResults.find((result) => !result.ok);
  return {
    pipeline: command,
    ...(app ? { app } : {}),
    totalDurationMs: stepTimings.reduce((sum, step) => sum + step.durationMs, 0),
    stepCount: stepTimings.length,
    slowestSteps: [...stepTimings].sort((a, b) => b.durationMs - a.durationMs).slice(0, 6),
    timeoutCount: stepTimings.filter((step) => step.exceededTimeout).length,
    warningCount: subResults.reduce((sum, result) => sum + (result.logSummary?.warning ?? 0), 0),
    ...(failed ? { failedStep: failed.command } : {}),
  };
}

async function runCommandSequence(
  command:
    | "sites-check.run"
    | "sites-check.author"
    | "sites-check.postbuild"
    | "packages-check.run"
    | "packages.check",
  steps: KernelPipelineStep[],
  input: KernelCommandInput,
  context: KernelRuntimeContext,
  app?: string,
): Promise<KernelCommandResult<PipelineDriverData>> {
  const strict = input.flags.strict === true;
  const subResults: PipelineDriverData["subResults"] = [];
  const stepTimings: PipelineStepTiming[] = [];
  // RFC-0270: this driver executes steps via executeKernelCommand (a separate
  // path from @warpgogol/site-kernel's executePipelineForApp/executePipelineForWorkspace),
  // so it needs its own telemetry-append + budget-preference wiring.
  const budgets = await loadPipelineBudgets(context.workspaceRoot);

  for (const step of steps) {
    const startedAtMonotonicMs = Math.round(performance.now());
    try {
      const report = await executeKernelCommand({
        workspaceRoot: context.workspaceRoot,
        commandName: step.command,
        siteName: app,
        siteExplicit: Boolean(app),
        outputFormat: context.outputFormat,
        dryRun: context.dryRun,
        argv: step.args ?? [],
      });
      const single = Array.isArray(report) ? report[0] : report;
      const subResult = pipelineSubResult(step.command, single);
      subResults.push(subResult);
      const endedAtMonotonicMs = Math.round(performance.now());
      const durationMs =
        subResult.timing?.durationMs ?? Math.max(0, endedAtMonotonicMs - startedAtMonotonicMs);
      await appendStepTelemetry(context.workspaceRoot, {
        pipeline: command,
        command: step.command,
        app: app ?? null,
        durationMs,
        timedOut: subResult.timing?.exceededTimeout ?? false,
        recordedAt: new Date().toISOString(),
      });
      const budgetedExpectedDurationMs = lookupExpectedDurationMs(
        budgets,
        command,
        step.command,
        app ?? null,
      );
      const expectedDurationMs = budgetedExpectedDurationMs ?? subResult.timing?.expectedDurationMs;
      stepTimings.push({
        pipeline: command,
        command: step.command,
        ...(app ? { app } : {}),
        status: subResultStatus(subResult),
        startedAtMonotonicMs,
        endedAtMonotonicMs,
        durationMs,
        ...(subResult.timing?.timeoutMs !== undefined
          ? { timeoutMs: subResult.timing.timeoutMs }
          : {}),
        ...(expectedDurationMs !== undefined ? { expectedDurationMs } : {}),
        exceededTimeout: subResult.timing?.exceededTimeout ?? false,
      });
      if (!single?.ok && strict) break;
    } catch (error) {
      const endedAtMonotonicMs = Math.round(performance.now());
      subResults.push({
        command: step.command,
        ok: false,
        exitCode: 1,
        summary: error instanceof Error ? error.message : String(error),
      });
      stepTimings.push({
        pipeline: command,
        command: step.command,
        ...(app ? { app } : {}),
        status: "fail",
        startedAtMonotonicMs,
        endedAtMonotonicMs,
        durationMs: Math.max(0, endedAtMonotonicMs - startedAtMonotonicMs),
        exceededTimeout: false,
      });
      if (strict) break;
    }
  }

  const ok = subResults.filter((result) => result.ok).length;
  const fail = subResults.length - ok;

  return {
    data: {
      command,
      app,
      subResults,
      summary: { ok, fail, skipped: 0 },
      timing: summarizePipelineTiming(command, subResults, stepTimings, app),
    },
    exitCode: fail > 0 ? 1 : 0,
    summary:
      fail > 0 ? `${command}: ${fail} step(s) failed` : `${command}: all ${ok} step(s) passed`,
  };
}

async function runAppsCheckImpl(
  command: "sites-check.run" | "sites-check.author" | "sites-check.postbuild",
  pipeline: KernelPipelineStep[],
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<PipelineDriverData>> {
  const app = context.site?.name ?? (input.flags.site as string | undefined);
  if (!app) {
    return {
      data: { command, subResults: [], summary: { ok: 0, fail: 1, skipped: 0 } },
      exitCode: 1,
      summary: `${command}: app not resolved (use --site <name>)`,
    };
  }

  try {
    await access(join(context.workspaceRoot, "onboarding", ".input", "00-brief.md"));
    const report = await executeKernelCommand({
      workspaceRoot: context.workspaceRoot,
      commandName: "brief.validate",
      outputFormat: context.outputFormat,
      dryRun: context.dryRun,
      argv: [],
    });
    const single = Array.isArray(report) ? report[0] : report;
    if (!single?.ok) {
      return {
        data: {
          command,
          app,
          subResults: [
            {
              command: "brief.validate",
              ok: single?.ok ?? false,
              exitCode: single?.exitCode ?? 1,
              summary: single?.summary,
            },
          ],
          summary: { ok: 0, fail: 1, skipped: 0 },
        },
        exitCode: 1,
        summary: `${command}: brief.validate failed`,
      };
    }
  } catch {
    // No onboarding/.input/00-brief.md present — noop per RFC-0070.
  }

  // RFC-0085: postbuild guard — fail fast with a helpful message when dist/ is missing.
  if (command === "sites-check.postbuild") {
    const distPath = join(
      context.site?.directory ?? join(context.workspaceRoot, "apps", app),
      "dist",
    );
    try {
      await access(distPath);
    } catch {
      return {
        data: { command, app, subResults: [], summary: { ok: 0, fail: 1, skipped: 0 } },
        exitCode: 1,
        summary: `${command}: requires dist/. Run: pnpm --filter ${app} build`,
      };
    }
  }

  return runCommandSequence(command, pipeline, input, context, app);
}

export function runAppsCheck(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<PipelineDriverData>> {
  return runAppsCheckImpl("sites-check.run", SITES_CHECK_PIPELINE, input, context);
}

export function runAppsCheckAuthor(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<PipelineDriverData>> {
  return runAppsCheckImpl("sites-check.author", SITES_CHECK_AUTHOR_PIPELINE, input, context);
}

export function runAppsCheckPostbuild(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<PipelineDriverData>> {
  return runAppsCheckImpl("sites-check.postbuild", SITES_CHECK_POSTBUILD_PIPELINE, input, context);
}

export async function runPackagesCheck(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<PipelineDriverData>> {
  return runCommandSequence("packages-check.run", PACKAGES_CHECK_PIPELINE, input, context);
}

export async function runPackagesCheckAlias(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<PipelineDriverData>> {
  return runCommandSequence("packages.check", PACKAGES_CHECK_PIPELINE, input, context);
}

export interface StandardCheckModuleOptions {
  /** App-specific or codegen commands appended after all standard commands. */
  extraCommands?: KernelCommandDefinition[];
  /**
   * The default language code for this app (e.g. "de").
   * When set, missing pages in non-default languages are reported as warnings;
   * missing pages in the default language are reported as errors.
   */
  defaultLang?: string;
}

/**
 * Factory that creates a complete "check" KernelModule pre-registered with every
 * standard validation command provided by @warpgogol/site-kernel-checks.
 *
 * **IMPORTANT:** Do NOT add commands to extraCommands that are already registered
 * by this factory (e.g., content.validate, tokens.ds.lint, tokens.colors.lint).
 * Doing so will throw "Kernel command already registered". See package AGENTS.md.
 *
 * Usage:
 *   export const checkModule = createStandardCheckModule({
 *     extraCommands: [
 *       // Only TRULY app-specific commands that are NOT in the standard set
 *       { name: "funding.validate", scope: "app", execute: runFundingFreshnessValidation, description: "..." },
 *     ],
 *   });
 */
export function createStandardCheckModule(options?: StandardCheckModuleOptions): KernelModule {
  return {
    name: "check",
    version: "0.1.0",
    async register(registry) {
      const { ALL_COMMANDS } = await import("./command-tables/index.ts");
      const { runMirroringValidation } = await import("./checks/mirroring.ts");
      // @ai-invariant ALL_COMMANDS is the single data-driven array consumed by createStandardCheckModule.
      // If you add a new standard command, add its entry to the appropriate
      // src/command-tables/*.ts file and it will be picked up automatically.
      for (const entry of ALL_COMMANDS) {
        registry.registerCommand(entry);
      }

      // mirroring.validate needs the per-app defaultLang closure.
      registry.registerCommand({
        name: "mirroring.validate",
        description: "Validate that content pages are mirrored across all language directories.",
        scope: "app",
        supportsAllSites: true,
        flags: {},
        reads: ["<app>/src/content/pages/**/*.md"],
        execute: (input, context) => runMirroringValidation(input, context, options?.defaultLang),
      });

      // Pipeline composites are registered here because their runners reference
      // the pipeline driver functions defined in this module.
      registry.registerCommand({
        name: "sites-check.run",
        description:
          "Validate one app against SITES_CHECK_PIPELINE (RFC-0075). Alias for sites-check.author followed by sites-check.postbuild (RFC-0085).",
        scope: "app",
        supportsAllSites: true,
        longRunning: true,
        expectedDurationMs: 300_000,
        timeoutMs: 1_800_000,
        cacheable: false,
        flags: {
          strict: {
            kind: "boolean",
            description: "Stop pipeline execution after the first failed step.",
          },
        },
        execute: runAppsCheck,
      });
      registry.registerCommand({
        name: "sites-check.author",
        description:
          "Validate one app's authored surface (content, manifests, configs, onboarding outputs). Does NOT read apps/<id>/dist/. Gate for 04-author and 05-audit (RFC-0085).",
        scope: "app",
        supportsAllSites: true,
        longRunning: true,
        expectedDurationMs: 180_000,
        timeoutMs: 1_200_000,
        cacheable: false,
        flags: {
          strict: {
            kind: "boolean",
            description: "Stop pipeline execution after the first failed step.",
          },
        },
        execute: runAppsCheckAuthor,
      });
      registry.registerCommand({
        name: "sites-check.postbuild",
        description:
          "Validate one app's built artifact (apps/<id>/dist/). Fails fast with a build hint when dist/ is missing. Gate for 06-handoff after pnpm --filter <id> build (RFC-0085).",
        scope: "app",
        supportsAllSites: true,
        longRunning: true,
        expectedDurationMs: 120_000,
        timeoutMs: 900_000,
        cacheable: false,
        flags: {
          strict: {
            kind: "boolean",
            description: "Stop pipeline execution after the first failed step.",
          },
        },
        execute: runAppsCheckPostbuild,
      });
      registry.registerCommand({
        name: "packages-check.run",
        description: "Validate workspace packages against PACKAGES_CHECK_PIPELINE (RFC-0075).",
        scope: "workspace",
        supportsAllSites: true,
        longRunning: true,
        expectedDurationMs: 180_000,
        timeoutMs: 1_200_000,
        cacheable: false,
        flags: {
          strict: {
            kind: "boolean",
            description: "Stop pipeline execution after the first failed step.",
          },
        },
        execute: runPackagesCheck,
      });
      registry.registerCommand({
        name: "packages.check",
        description:
          "Alias for packages-check.run; validates workspace packages against the same PACKAGES_CHECK_PIPELINE step list (RFC-0246).",
        scope: "workspace",
        supportsAllSites: true,
        longRunning: true,
        expectedDurationMs: 180_000,
        timeoutMs: 1_200_000,
        cacheable: false,
        flags: {
          strict: {
            kind: "boolean",
            description: "Stop pipeline execution after the first failed step.",
          },
        },
        execute: runPackagesCheckAlias,
      });

      // App-specific and codegen commands
      for (const cmd of options?.extraCommands ?? []) {
        registry.registerCommand(cmd);
      }
    },
  };
}
