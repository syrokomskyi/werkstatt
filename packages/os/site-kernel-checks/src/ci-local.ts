/*
<MODULE_CONTRACT>
<purpose>RFC-0249 local CI mirror validator for autonomous package quality gates.</purpose>
<non-goals>
  <item>Do not execute the full CI suite recursively; commands are run explicitly by CI and acceptance checks.</item>
  <item>Do not validate deployment-only secrets or production environments.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0249: add a deterministic command-set and pnpm-version drift validator for general PR CI.</item>
  <item>RFC-0251: include test signal policy and maintenance debt baseline validation in the local/CI gate.</item>
  <item>RFC-0478: add platform.consistency.validate --check to CI local checked commands.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { listSiteWorkspaces } from "@gogol/site-kernel";
import { parse } from "yaml";
import { diagnosticsResult } from "./result-helpers.ts";

export const CI_LOCAL_CHECKED_COMMANDS = [
  "pnpm lint:packages",
  "pnpm exec site-kernel run packages-check.run --json",
  "pnpm exec site-kernel run rfc.validate",
  "pnpm exec site-kernel run rfc.command-lifecycle.validate --json",
  "pnpm test",
  "pnpm exec site-kernel run test.signal.validate --json",
  "pnpm exec site-kernel run test.signal.policy.validate --json",
  "pnpm exec site-kernel run maintenance.debt.baseline.validate --json",
  "pnpm exec site-kernel run github.branch-protection.validate --json",
  "pnpm exec site-kernel run platform.consistency.validate --check --json",
] as const;

const GENERAL_CI_WORKFLOW = ".github/workflows/ci.yml";

interface RootPackageJson {
  packageManager?: string;
}

interface CiLocalValidateData extends CheckResult {
  command: "ci.local.validate";
  checkedCommands: string[];
}

interface GithubWorkflow {
  path: string;
  name?: string;
  on?: unknown;
  jobs: Record<string, GithubWorkflowJob>;
  source: string;
}

interface GithubWorkflowJob {
  name?: string;
  steps: GithubWorkflowStep[];
}

interface GithubWorkflowStep {
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
}

interface WorkflowCommandOccurrence {
  workflowPath: string;
  jobId: string;
  stepIndex: number;
  stepName?: string;
  command: string;
}

function pnpmMajor(packageManager: string): string | undefined {
  const match = /^pnpm@(\d+)\./.exec(packageManager);
  return match?.[1];
}

function workflowUsesCorepack(workflow: GithubWorkflow): boolean {
  return workflowRunSteps(workflow).some((occurrence) =>
    /\bcorepack enable\b/.test(occurrence.command),
  );
}

function workflowUsesPnpmAction(workflow: GithubWorkflow): boolean {
  return workflowStepList(workflow).some((step) => step.uses?.startsWith("pnpm/action-setup@"));
}

function explicitPnpmActionVersions(workflow: GithubWorkflow): string[] {
  return workflowStepList(workflow)
    .filter((step) => step.uses?.startsWith("pnpm/action-setup@"))
    .map((step) => step.with?.version)
    .filter(
      (version): version is string | number =>
        typeof version === "string" || typeof version === "number",
    )
    .map(String);
}

function workflowStepList(workflow: GithubWorkflow): GithubWorkflowStep[] {
  return Object.values(workflow.jobs).flatMap((job) => job.steps);
}

function workflowRunSteps(workflow: GithubWorkflow): WorkflowCommandOccurrence[] {
  const occurrences: WorkflowCommandOccurrence[] = [];
  for (const [jobId, job] of Object.entries(workflow.jobs)) {
    job.steps.forEach((step, stepIndex) => {
      if (!step.run) return;
      occurrences.push({
        workflowPath: workflow.path,
        jobId,
        stepIndex,
        ...(step.name ? { stepName: step.name } : {}),
        command: step.run,
      });
    });
  }
  return occurrences;
}

function workflowRunsCommand(workflow: GithubWorkflow, command: string): boolean {
  return workflowRunSteps(workflow).some((occurrence) =>
    occurrence.command
      .split(/\r?\n/)
      .map((line) => line.trim())
      .some((line) => line === command),
  );
}

function workflowSourceMentionsCommand(workflow: GithubWorkflow, command: string): boolean {
  return workflow.source.includes(command);
}

function parseWorkflow(path: string, source: string): GithubWorkflow | Diagnostic {
  let parsed: unknown;
  try {
    parsed = parse(source);
  } catch (error) {
    return {
      ruleId: "CI-LOCAL-05",
      severity: "error",
      file: path,
      message: `Workflow YAML is malformed: ${error instanceof Error ? error.message : String(error)}.`,
      fixHint: "Fix the workflow YAML so ci.local.validate can inspect structured jobs and steps.",
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ruleId: "CI-LOCAL-05",
      severity: "error",
      file: path,
      message: "Workflow YAML must be an object with jobs.",
      fixHint: "Define GitHub Actions jobs with steps.",
    };
  }

  const record = parsed as Record<string, unknown>;
  const rawJobs = record.jobs;
  if (!rawJobs || typeof rawJobs !== "object" || Array.isArray(rawJobs)) {
    return {
      ruleId: "CI-LOCAL-05",
      severity: "error",
      file: path,
      message: "Workflow is missing required jobs.",
      fixHint: "Define jobs.<jobId>.steps so ci.local.validate can verify real commands.",
    };
  }

  const jobs: Record<string, GithubWorkflowJob> = {};
  for (const [jobId, rawJob] of Object.entries(rawJobs as Record<string, unknown>)) {
    if (!rawJob || typeof rawJob !== "object" || Array.isArray(rawJob)) continue;
    const jobRecord = rawJob as Record<string, unknown>;
    const rawSteps = jobRecord.steps;
    if (!Array.isArray(rawSteps)) {
      return {
        ruleId: "CI-LOCAL-05",
        severity: "error",
        file: path,
        message: `Workflow job ${jobId} is missing steps.`,
        fixHint: "Define jobs.<jobId>.steps as an array.",
      };
    }
    jobs[jobId] = {
      ...(typeof jobRecord.name === "string" ? { name: jobRecord.name } : {}),
      steps: rawSteps
        .filter(
          (step): step is Record<string, unknown> =>
            Boolean(step) && typeof step === "object" && !Array.isArray(step),
        )
        .map((step) => ({
          ...(typeof step.name === "string" ? { name: step.name } : {}),
          ...(typeof step.run === "string" ? { run: step.run } : {}),
          ...(typeof step.uses === "string" ? { uses: step.uses } : {}),
          ...(step.with && typeof step.with === "object" && !Array.isArray(step.with)
            ? { with: step.with as Record<string, unknown> }
            : {}),
        })),
    };
  }

  return {
    path,
    source,
    ...(typeof record.name === "string" ? { name: record.name } : {}),
    on: record.on,
    jobs,
  };
}

async function readWorkflows(
  workspaceRoot: string,
): Promise<{ workflows: GithubWorkflow[]; diagnostics: Diagnostic[] }> {
  const workflowDir = join(workspaceRoot, ".github", "workflows");
  const entries = await readdir(workflowDir, { withFileTypes: true });
  const workflows: GithubWorkflow[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
    const path = `.github/workflows/${entry.name}`;
    const parsed = parseWorkflow(path, await readFile(join(workflowDir, entry.name), "utf8"));
    if ("ruleId" in parsed) diagnostics.push(parsed);
    else workflows.push(parsed);
  }
  return {
    workflows: workflows.sort((a, b) => a.path.localeCompare(b.path)),
    diagnostics,
  };
}

export async function runCiLocalValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CiLocalValidateData>> {
  const diagnostics: Diagnostic[] = [];
  const rootPackage = JSON.parse(
    await readFile(join(context.workspaceRoot, "package.json"), "utf8"),
  ) as RootPackageJson;
  const rootPnpmMajor = rootPackage.packageManager
    ? pnpmMajor(rootPackage.packageManager)
    : undefined;
  const workflowRead = await readWorkflows(context.workspaceRoot);
  diagnostics.push(...workflowRead.diagnostics);
  const workflows = workflowRead.workflows;
  const ciWorkflow = workflows.find((workflow) => workflow.path === GENERAL_CI_WORKFLOW);

  if (!ciWorkflow) {
    diagnostics.push({
      ruleId: "ci.local.validate",
      severity: "error",
      file: GENERAL_CI_WORKFLOW,
      message: "General PR CI workflow is missing.",
      fixHint: "Add .github/workflows/ci.yml with the autonomous package quality gate commands.",
    });
  } else {
    for (const command of CI_LOCAL_CHECKED_COMMANDS) {
      if (!workflowRunsCommand(ciWorkflow, command)) {
        diagnostics.push({
          ruleId: workflowSourceMentionsCommand(ciWorkflow, command)
            ? "CI-LOCAL-06"
            : "CI-LOCAL-01",
          severity: "error",
          file: GENERAL_CI_WORKFLOW,
          message: workflowSourceMentionsCommand(ciWorkflow, command)
            ? `General PR CI workflow mentions ${command} outside real run steps.`
            : `General PR CI workflow does not run ${command}.`,
          fixHint: "Keep ci.local.validate and the general CI workflow command set aligned.",
        });
      }
    }

    const apps = (await listSiteWorkspaces(context.workspaceRoot)).sites
      .map((app) => app.name)
      .sort((a, b) => a.localeCompare(b));
    for (const app of apps) {
      const command = `pnpm exec site-kernel run sites-check.author --site ${app} --json`;
      if (!workflowRunsCommand(ciWorkflow, command)) {
        diagnostics.push({
          ruleId: workflowSourceMentionsCommand(ciWorkflow, command)
            ? "CI-LOCAL-06"
            : "CI-LOCAL-02",
          severity: "error",
          file: GENERAL_CI_WORKFLOW,
          message: workflowSourceMentionsCommand(ciWorkflow, command)
            ? `General PR CI workflow mentions app author checks for ${app} outside real run steps.`
            : `General PR CI workflow does not run app author checks for ${app}.`,
          fixHint: `Add ${command} to the general PR CI workflow.`,
        });
      }
    }
  }

  if (!rootPnpmMajor) {
    diagnostics.push({
      ruleId: "ci.local.validate",
      severity: "error",
      file: "package.json",
      message: "Root packageManager does not declare a pnpm major version.",
      fixHint: "Set packageManager to pnpm@<major>.<minor>.<patch>.",
    });
  }

  for (const workflow of workflows) {
    const versions = explicitPnpmActionVersions(workflow);
    if (
      workflowUsesPnpmAction(workflow) &&
      versions.length === 0 &&
      !workflowUsesCorepack(workflow)
    ) {
      diagnostics.push({
        ruleId: "CI-LOCAL-04",
        severity: "error",
        file: workflow.path,
        message: "Workflow uses pnpm/action-setup without a pinned version or Corepack.",
        fixHint: "Use Corepack or pin pnpm/action-setup to the root packageManager major.",
      });
    }

    for (const version of versions) {
      if (rootPnpmMajor && pnpmMajor(`pnpm@${version}`) !== rootPnpmMajor) {
        diagnostics.push({
          ruleId: "CI-LOCAL-03",
          severity: "error",
          file: workflow.path,
          message: `Workflow pins pnpm ${version}, but root packageManager is ${rootPackage.packageManager}.`,
          fixHint:
            "Remove the hardcoded pnpm version and use Corepack, or pin the same pnpm major.",
        });
      }
    }
  }

  const result = diagnosticsResult("ci.local.validate", diagnostics);
  return {
    ...result,
    data: {
      status: result.data?.status ?? "pass",
      diagnostics: result.data?.diagnostics ?? [],
      summary: result.data?.summary ?? { error: 0, warning: 0, info: 0 },
      command: "ci.local.validate",
      checkedCommands: [
        ...CI_LOCAL_CHECKED_COMMANDS,
        ...(ciWorkflow
          ? (await listSiteWorkspaces(context.workspaceRoot)).sites
              .map(
                (app) => `pnpm exec site-kernel run sites-check.author --site ${app.name} --json`,
              )
              .sort((a, b) => a.localeCompare(b))
          : []),
      ],
    },
  };
}
