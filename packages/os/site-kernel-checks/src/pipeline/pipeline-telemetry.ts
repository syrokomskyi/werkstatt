/*
<MODULE_CONTRACT>
<purpose>RFC-0255 pipeline timing metadata report and timeout metadata validation commands.</purpose>
<non-goals>
  <item>Do not persist per-run timing snapshots.</item>
  <item>Do not optimize or tune build performance.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0255: Add pipeline timing report and timeout metadata validation commands.</item>
  <item>RFC-0270: Add TIME-01 (stale inline expectedDurationMs vs. generated budget) and TIME-02 (long step with observed p95 but no inline estimate) to pipeline.timeout.validate.</item>
</CHANGE_SUMMARY>
*/

import {
  loadPipelineBudgets,
  type CheckResult,
  type Diagnostic,
  type KernelCommandDefinition,
  type KernelCommandInput,
  type KernelCommandResult,
  type KernelPipelineStep,
  type KernelRuntimeContext,
  type PipelineBudgetsFile,
} from "@warpgogol/site-kernel";
import { ALL_COMMANDS } from "../command-tables/index.ts";
import { diagnosticsResult } from "../result-helpers.ts";
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

const COMMAND = {
  timingReport: "pipeline.timing.report",
  timeoutValidate: "pipeline.timeout.validate",
} as const;

const LONG_RUNNING_EXPECTED_DURATION_MS = 30_000;

interface PipelineDescriptor {
  name: string;
  scope: "app" | "workspace";
  steps: KernelPipelineStep[];
}

function standardPipelines(): PipelineDescriptor[] {
  return [
    { name: "sites-check.run", scope: "app", steps: SITES_CHECK_PIPELINE },
    { name: "sites-check.author", scope: "app", steps: SITES_CHECK_AUTHOR_PIPELINE },
    { name: "sites-check.postbuild", scope: "app", steps: SITES_CHECK_POSTBUILD_PIPELINE },
    { name: "build.prepare", scope: "app", steps: SITES_BUILD_PREPARE_PIPELINE },
    { name: "build.check", scope: "app", steps: SITES_BUILD_CHECK_PIPELINE },
    { name: "build.post", scope: "app", steps: SITES_BUILD_POST_PIPELINE },
    { name: "packages-check.run", scope: "workspace", steps: PACKAGES_CHECK_PIPELINE },
    { name: "packages.check", scope: "workspace", steps: PACKAGES_CHECK_PIPELINE },
    { name: "standard-compass", scope: "workspace", steps: STANDARD_COMPASS_PIPELINE },
  ];
}

function standardCommands(): KernelCommandDefinition[] {
  return [
    ...ALL_COMMANDS,
    {
      name: "sites-check.run",
      description: "Composite app validation pipeline runner.",
      scope: "app",
      supportsAllSites: true,
      longRunning: true,
      expectedDurationMs: 300_000,
      timeoutMs: 1_800_000,
      execute: () => undefined,
    },
    {
      name: "sites-check.author",
      description: "Composite authored-surface app validation pipeline runner.",
      scope: "app",
      supportsAllSites: true,
      longRunning: true,
      expectedDurationMs: 180_000,
      timeoutMs: 1_200_000,
      execute: () => undefined,
    },
    {
      name: "sites-check.postbuild",
      description: "Composite postbuild app validation pipeline runner.",
      scope: "app",
      supportsAllSites: true,
      longRunning: true,
      expectedDurationMs: 120_000,
      timeoutMs: 900_000,
      execute: () => undefined,
    },
    {
      name: "packages-check.run",
      description: "Composite workspace package validation pipeline runner.",
      scope: "workspace",
      longRunning: true,
      expectedDurationMs: 180_000,
      timeoutMs: 1_200_000,
      execute: () => undefined,
    },
    {
      name: "packages.check",
      description: "Alias for packages-check.run.",
      scope: "workspace",
      longRunning: true,
      expectedDurationMs: 180_000,
      timeoutMs: 1_200_000,
      execute: () => undefined,
    },
  ];
}

function isLongRunning(command: KernelCommandDefinition): boolean {
  return (
    command.longRunning === true ||
    (command.expectedDurationMs ?? 0) >= LONG_RUNNING_EXPECTED_DURATION_MS
  );
}

function invalidNumber(value: number | undefined): boolean {
  return value !== undefined && (!Number.isFinite(value) || value < 0);
}

function stepLabel(pipeline: PipelineDescriptor, index: number, step: KernelPipelineStep): string {
  return `${pipeline.name}[${index + 1}] ${step.command}`;
}

export async function runPipelineTimingReport(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  // RFC-0270: prefer the telemetry-derived budget over the inline estimate when reporting.
  const budgets = await loadPipelineBudgets(context.workspaceRoot);
  const pipelines = standardPipelines().map((pipeline) => ({
    name: pipeline.name,
    scope: pipeline.scope,
    stepCount: pipeline.steps.length,
    steps: pipeline.steps.map((step) => {
      const budgetEntry = findBudgetEntry(budgets, pipeline.name, step.command);
      return {
        command: step.command,
        timeoutMs: step.timeoutMs,
        expectedDurationMs: budgetEntry?.expectedDurationMs ?? step.expectedDurationMs,
        expectedDurationSource: budgetEntry ? ("budget" as const) : ("inline" as const),
      };
    }),
  }));

  return {
    data: {
      command: COMMAND.timingReport,
      telemetry: {
        commandTiming: true,
        pipelineTimingSummary: true,
        humanSummaryThresholdMs: 30_000,
        persistence: "local-ndjson-plus-generated-budget",
      },
      pipelines,
    },
    exitCode: 0,
    summary: `${COMMAND.timingReport}: ${pipelines.length} standard pipeline descriptor(s) reported`,
  };
}

function findBudgetEntry(
  budgets: PipelineBudgetsFile | null,
  pipeline: string,
  command: string,
): PipelineBudgetsFile["budgets"][number] | undefined {
  if (!budgets) return undefined;
  return (
    budgets.budgets.find(
      (b) => b.pipeline === pipeline && b.command === command && b.app === null,
    ) ?? budgets.budgets.find((b) => b.pipeline === pipeline && b.command === command)
  );
}

export async function runPipelineTimeoutValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];
  const commandsByName = new Map(standardCommands().map((command) => [command.name, command]));
  // RFC-0270: compare authored expectedDurationMs metadata against telemetry-derived budgets.
  const budgets = await loadPipelineBudgets(context.workspaceRoot);

  for (const command of commandsByName.values()) {
    if (invalidNumber(command.timeoutMs) || invalidNumber(command.expectedDurationMs)) {
      diagnostics.push({
        ruleId: "PIPELINE-TIMEOUT-04",
        severity: "error",
        message: `Command ${command.name} declares an impossible timeout or expected-duration value.`,
        fixHint: "Use non-negative finite millisecond values for timeoutMs and expectedDurationMs.",
      });
    }

    if (
      command.timeoutMs !== undefined &&
      command.expectedDurationMs !== undefined &&
      command.timeoutMs < command.expectedDurationMs
    ) {
      diagnostics.push({
        ruleId: "PIPELINE-TIMEOUT-02",
        severity: "error",
        message: `Command ${command.name} timeoutMs is lower than expectedDurationMs.`,
        fixHint:
          "Raise timeoutMs above the expected duration or lower the expectedDurationMs estimate.",
      });
    }

    if (isLongRunning(command) && command.timeoutMs === undefined) {
      diagnostics.push({
        ruleId: "PIPELINE-TIMEOUT-01",
        severity: "warning",
        message: `Long-running command ${command.name} has no timeoutMs metadata.`,
        fixHint: "Declare timeoutMs on the command registration or its pipeline step descriptor.",
      });
    }
  }

  for (const pipeline of standardPipelines()) {
    const criticalExpectedSum = pipeline.steps.reduce(
      (sum, step) => sum + (step.expectedDurationMs ?? 0),
      0,
    );
    for (const [index, step] of pipeline.steps.entries()) {
      const command = commandsByName.get(step.command);
      const expectedDurationMs = step.expectedDurationMs ?? command?.expectedDurationMs;
      const timeoutMs = step.timeoutMs ?? command?.timeoutMs;

      if (invalidNumber(step.timeoutMs) || invalidNumber(step.expectedDurationMs)) {
        diagnostics.push({
          ruleId: "PIPELINE-TIMEOUT-04",
          severity: "error",
          message: `Pipeline step ${stepLabel(pipeline, index, step)} declares an impossible timeout or expected-duration value.`,
          fixHint:
            "Use non-negative finite millisecond values for timeoutMs and expectedDurationMs.",
        });
      }

      if (
        timeoutMs !== undefined &&
        expectedDurationMs !== undefined &&
        timeoutMs < expectedDurationMs
      ) {
        diagnostics.push({
          ruleId: "PIPELINE-TIMEOUT-02",
          severity: "error",
          message: `Pipeline step ${stepLabel(pipeline, index, step)} has timeoutMs lower than expectedDurationMs.`,
          fixHint: "Raise the step timeout budget above the expected step duration.",
        });
      }

      if (
        (expectedDurationMs ?? 0) >= LONG_RUNNING_EXPECTED_DURATION_MS &&
        timeoutMs === undefined
      ) {
        diagnostics.push({
          ruleId: "PIPELINE-TIMEOUT-01",
          severity: "warning",
          message: `Long-running pipeline step ${stepLabel(pipeline, index, step)} has no timeoutMs metadata.`,
          fixHint: "Declare timeoutMs on the command registration or this pipeline step.",
        });
      }

      // RFC-0270: TIME-01/TIME-02 — hand-guessed expectedDurationMs vs. observed telemetry.
      const budgetEntry = findBudgetEntry(budgets, pipeline.name, step.command);
      if (budgetEntry) {
        if (expectedDurationMs !== undefined && expectedDurationMs > 0) {
          const ratio = budgetEntry.expectedDurationMs / expectedDurationMs;
          if (ratio > 4 || ratio < 0.25) {
            diagnostics.push({
              ruleId: "TIME-01",
              severity: "warning",
              message: `Pipeline step ${stepLabel(pipeline, index, step)} declares expectedDurationMs=${expectedDurationMs}ms, but the generated budget (from ${budgetEntry.sampleCount} sample(s)) is ${budgetEntry.expectedDurationMs}ms — a stale guess.`,
              fixHint:
                "Re-run pipeline.budget.generate after a representative build, or update the inline estimate if the step's workload genuinely changed class.",
              data: {
                pipeline: pipeline.name,
                command: step.command,
                expectedDurationMs,
                budgetExpectedDurationMs: budgetEntry.expectedDurationMs,
              },
            });
          }
        }
        if (
          budgetEntry.p95Ms > LONG_RUNNING_EXPECTED_DURATION_MS &&
          expectedDurationMs === undefined
        ) {
          diagnostics.push({
            ruleId: "TIME-02",
            severity: "warning",
            message: `Pipeline step ${stepLabel(pipeline, index, step)} has an observed p95 of ${budgetEntry.p95Ms}ms but no inline expectedDurationMs — cold-start clones (no budget file yet) see no estimate at all.`,
            fixHint:
              "Add expectedDurationMs to the step or command registration as a cold-start fallback.",
            data: { pipeline: pipeline.name, command: step.command, p95Ms: budgetEntry.p95Ms },
          });
        }
      }
    }

    const wrapper = commandsByName.get(pipeline.name);
    if (
      wrapper?.timeoutMs !== undefined &&
      criticalExpectedSum > 0 &&
      wrapper.timeoutMs < criticalExpectedSum
    ) {
      diagnostics.push({
        ruleId: "PIPELINE-TIMEOUT-03",
        severity: "error",
        message: `Pipeline wrapper ${pipeline.name} timeoutMs is lower than the sum of configured critical step durations.`,
        fixHint:
          "Raise the wrapper timeout budget or revisit the configured critical step estimates.",
      });
    }
  }

  return diagnosticsResult(COMMAND.timeoutValidate, diagnostics);
}
