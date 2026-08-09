import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CI_LOCAL_CHECKED_COMMANDS, runCiLocalValidate } from "../ci-local.ts";
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

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function setupWorkspace(workflow: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ci-local-"));
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await mkdir(join(root, "apps", "site"), { recursive: true });
  await writeJson(join(root, "package.json"), { packageManager: "pnpm@11.8.0" });
  await writeJson(join(root, "apps", "site", "package.json"), { name: "site" });
  await writeFile(join(root, ".github", "workflows", "ci.yml"), workflow, "utf8");
  return root;
}

function passingRunBlock(): string {
  return [
    "corepack enable",
    "pnpm exec site-kernel run ci.local.validate --json",
    ...CI_LOCAL_CHECKED_COMMANDS,
    "pnpm exec site-kernel run sites-check.author --site site --json",
  ].join("\n");
}

describe("ci.local.validate structured workflow parsing", () => {
  it("accepts required commands inside multiline run blocks", async () => {
    const root = await setupWorkspace(`
name: CI
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Everything
        run: |
${passingRunBlock()
  .split("\n")
  .map((line) => `          ${line}`)
  .join("\n")}
`);
    try {
      const result = await runCiLocalValidate(input, ctx(root));
      expect(result.exitCode).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not count commands mentioned only in comments or step names", async () => {
    const commentedCommand = CI_LOCAL_CHECKED_COMMANDS[0];
    const realCommands = passingRunBlock()
      .split("\n")
      .filter((line) => line !== commentedCommand)
      .join("\n");
    const root = await setupWorkspace(`
name: CI
# ${commentedCommand}
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: ${commentedCommand}
        run: |
${realCommands
  .split("\n")
  .map((line) => `          ${line}`)
  .join("\n")}
`);
    try {
      const result = await runCiLocalValidate(input, ctx(root));
      expect(result.exitCode).toBe(1);
      expect(result.data?.diagnostics.map((diagnostic) => diagnostic.ruleId)).toContain(
        "CI-LOCAL-06",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("detects pnpm/action-setup version mismatch from structured with.version", async () => {
    const root = await setupWorkspace(`
name: CI
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: pnpm/action-setup@v4
        with:
          version: 10.0.0
      - run: |
${passingRunBlock()
  .split("\n")
  .map((line) => `          ${line}`)
  .join("\n")}
`);
    try {
      const result = await runCiLocalValidate(input, ctx(root));
      expect(result.exitCode).toBe(1);
      expect(result.data?.diagnostics.map((diagnostic) => diagnostic.ruleId)).toContain(
        "CI-LOCAL-03",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
