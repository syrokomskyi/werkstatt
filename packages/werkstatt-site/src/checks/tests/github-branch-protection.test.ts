import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGithubBranchProtectionValidate } from "../github-branch-protection.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

const logger = {
  section() {},
  info() {},
  warn() {},
  error() {},
  success() {},
  getEvents() {
    return [];
  },
};

const input = { argv: [], flags: {} } as unknown as KernelCommandInput;

function ctx(root: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    siteExplicit: false,
    logger,
    dryRun: false,
    outputFormat: "json",
  } as unknown as KernelRuntimeContext;
}

const VALID_POLICY = `protectedBranch:
  name: main
requiredCheck:
  name: "Package quality and author checks"
requiredWorkflowSteps:
  - "pnpm exec site-kernel run rfc.validate"
`;

const VALID_WORKFLOW = `name: Autonomous quality gate
on:
  pull_request:
jobs:
  autonomous-quality:
    runs-on: ubuntu-latest
    name: Package quality and author checks
    steps:
      - name: RFC validation
        run: pnpm exec site-kernel run rfc.validate
`;

async function setupWorkspace(policy: string, workflow: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "branch-prot-"));
  await mkdir(join(root, "docs", "policies"), { recursive: true });
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, "docs", "policies", "github-branch-protection.yaml"), policy, "utf8");
  await writeFile(join(root, ".github", "workflows", "ci.yml"), workflow, "utf8");
  return root;
}

describe("github.branch-protection.validate", () => {
  it("passes when policy and workflow match", async () => {
    const root = await setupWorkspace(VALID_POLICY, VALID_WORKFLOW);
    try {
      const result = await runGithubBranchProtectionValidate(input, ctx(root));
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("pass");
      expect(result.data?.diagnostics).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails when policy file is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "branch-prot-"));
    await mkdir(join(root, ".github", "workflows"), { recursive: true });
    await writeFile(join(root, ".github", "workflows", "ci.yml"), VALID_WORKFLOW, "utf8");
    try {
      const result = await runGithubBranchProtectionValidate(input, ctx(root));
      expect(result.exitCode).toBe(1);
      expect(result.data?.status).toBe("fail");
      expect(result.data?.diagnostics[0]?.ruleId).toBe("BRANCH-PROT-01");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails when CI workflow is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "branch-prot-"));
    await mkdir(join(root, "docs", "policies"), { recursive: true });
    await writeFile(
      join(root, "docs", "policies", "github-branch-protection.yaml"),
      VALID_POLICY,
      "utf8",
    );
    try {
      const result = await runGithubBranchProtectionValidate(input, ctx(root));
      expect(result.exitCode).toBe(1);
      expect(result.data?.status).toBe("fail");
      expect(result.data?.diagnostics[0]?.ruleId).toBe("BRANCH-PROT-02");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails when job name does not match required check name", async () => {
    const workflow = VALID_WORKFLOW.replace("Package quality and author checks", "Some other name");
    const root = await setupWorkspace(VALID_POLICY, workflow);
    try {
      const result = await runGithubBranchProtectionValidate(input, ctx(root));
      expect(result.exitCode).toBe(1);
      expect(result.data?.status).toBe("fail");
      const rules = result.data?.diagnostics.map((d) => d.ruleId);
      expect(rules).toContain("BRANCH-PROT-03");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails when required workflow step is missing", async () => {
    const workflow = `name: Autonomous quality gate
on:
  pull_request:
jobs:
  autonomous-quality:
    runs-on: ubuntu-latest
    name: Package quality and author checks
    steps:
      - name: Some other step
        run: echo hello
`;
    const root = await setupWorkspace(VALID_POLICY, workflow);
    try {
      const result = await runGithubBranchProtectionValidate(input, ctx(root));
      expect(result.exitCode).toBe(1);
      expect(result.data?.status).toBe("fail");
      const rules = result.data?.diagnostics.map((d) => d.ruleId);
      expect(rules).toContain("BRANCH-PROT-04");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails when policy is malformed", async () => {
    const malformedPolicy = `protectedBranch:
  name: main
# missing requiredCheck and requiredWorkflowSteps
`;
    const root = await setupWorkspace(malformedPolicy, VALID_WORKFLOW);
    try {
      const result = await runGithubBranchProtectionValidate(input, ctx(root));
      expect(result.exitCode).toBe(1);
      expect(result.data?.status).toBe("fail");
      expect(result.data?.diagnostics[0]?.ruleId).toBe("BRANCH-PROT-01");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
