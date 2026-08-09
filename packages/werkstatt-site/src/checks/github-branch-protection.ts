/*
<MODULE_CONTRACT>
<purpose>
RFC-0476: offline GitHub branch-protection policy validator. Reads the authored
policy at docs/policies/github-branch-protection.yaml and validates it against
the CI workflow's job name and required steps. Never calls the GitHub API.
</purpose>
<non-goals>
  <item>Do not call the GitHub API or require a token.</item>
  <item>Do not modify GitHub repository settings.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0476: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { parse as yamlParse } from "yaml";
import { diagnosticsResult } from "./result-helpers.ts";

const POLICY_PATH = "docs/policies/github-branch-protection.yaml";
const CI_WORKFLOW_PATH = ".github/workflows/ci.yml";

interface BranchProtectionPolicy {
  protectedBranch: { name: string };
  requiredCheck: { name: string };
  requiredWorkflowSteps: string[];
}

interface CiWorkflowJob {
  name?: string;
  steps: Array<{ name?: string; run?: string }>;
}

interface CiWorkflow {
  jobs: Record<string, CiWorkflowJob>;
}

export async function runGithubBranchProtectionValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];
  const { workspaceRoot } = context;

  // ── Read and parse the policy ──────────────────────────────────────────────
  const policyAbsPath = join(workspaceRoot, POLICY_PATH);
  let policy: BranchProtectionPolicy;
  try {
    const policyContent = await readFile(policyAbsPath, "utf-8");
    const parsed = yamlParse(policyContent) as BranchProtectionPolicy;
    if (
      !parsed ||
      !parsed.protectedBranch?.name ||
      !parsed.requiredCheck?.name ||
      !Array.isArray(parsed.requiredWorkflowSteps)
    ) {
      diagnostics.push({
        ruleId: "BRANCH-PROT-01",
        severity: "error",
        file: POLICY_PATH,
        message: `Policy is malformed — expected protectedBranch.name, requiredCheck.name, and requiredWorkflowSteps[].`,
        fixHint: "Ensure docs/policies/github-branch-protection.yaml has all required fields.",
      });
      return diagnosticsResult("github.branch-protection.validate", diagnostics);
    }
    policy = parsed;
  } catch {
    diagnostics.push({
      ruleId: "BRANCH-PROT-01",
      severity: "error",
      file: POLICY_PATH,
      message: `Policy file not found or unparseable at ${POLICY_PATH}.`,
      fixHint: "Create docs/policies/github-branch-protection.yaml (RFC-0476).",
    });
    return diagnosticsResult("github.branch-protection.validate", diagnostics);
  }

  // ── Read and parse the CI workflow ──────────────────────────────────────────
  const workflowAbsPath = join(workspaceRoot, CI_WORKFLOW_PATH);
  let workflow: CiWorkflow;
  try {
    const workflowContent = await readFile(workflowAbsPath, "utf-8");
    const parsed = yamlParse(workflowContent) as CiWorkflow;
    if (!parsed || !parsed.jobs || typeof parsed.jobs !== "object") {
      diagnostics.push({
        ruleId: "BRANCH-PROT-02",
        severity: "error",
        file: CI_WORKFLOW_PATH,
        message: `CI workflow is malformed — expected a jobs mapping.`,
        fixHint: "Fix .github/workflows/ci.yml so it has valid jobs.",
      });
      return diagnosticsResult("github.branch-protection.validate", diagnostics);
    }
    workflow = parsed;
  } catch {
    diagnostics.push({
      ruleId: "BRANCH-PROT-02",
      severity: "error",
      file: CI_WORKFLOW_PATH,
      message: `CI workflow not found or unparseable at ${CI_WORKFLOW_PATH}.`,
      fixHint: "Create .github/workflows/ci.yml with the autonomous quality gate.",
    });
    return diagnosticsResult("github.branch-protection.validate", diagnostics);
  }

  // ── Validate the required check name matches a job name ─────────────────────
  const requiredCheckName = policy.requiredCheck.name;
  const jobNames = Object.values(workflow.jobs)
    .map((job) => job.name)
    .filter(Boolean);
  if (!jobNames.includes(requiredCheckName)) {
    diagnostics.push({
      ruleId: "BRANCH-PROT-03",
      severity: "error",
      file: CI_WORKFLOW_PATH,
      message: `Required check name "${requiredCheckName}" does not match any job name in ${CI_WORKFLOW_PATH}. Found job names: ${jobNames.join(", ") || "(none)"}.`,
      fixHint: `Update the job's "name:" field in ci.yml to match "${requiredCheckName}", or update the policy.`,
    });
  }

  // ── Validate required workflow steps are present as run: commands ───────────
  const allRunCommands = Object.values(workflow.jobs).flatMap((job) =>
    job.steps
      .filter((step) => typeof step.run === "string")
      .flatMap((step) => step.run!.split(/\r?\n/).map((line) => line.trim()))
      .filter(Boolean),
  );

  for (const requiredStep of policy.requiredWorkflowSteps) {
    if (!allRunCommands.some((cmd) => cmd === requiredStep)) {
      diagnostics.push({
        ruleId: "BRANCH-PROT-04",
        severity: "error",
        file: CI_WORKFLOW_PATH,
        message: `Required workflow step "${requiredStep}" is not present as a run: command in ${CI_WORKFLOW_PATH}.`,
        fixHint: `Add "${requiredStep}" as a run: step in the CI workflow.`,
      });
    }
  }

  return diagnosticsResult("github.branch-protection.validate", diagnostics);
}
