import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findForbiddenIoImports, runKernelIoLint } from "../kernel-io-lint.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0267: fixture tests for kernel.io.lint. Pure-function fixtures cover
    findForbiddenIoImports; command-level fixtures run runKernelIoLint end to
    end against a fixture workspace root (mirrors the package's real
    packages/os/site-kernel-checks/src layout) to prove the exitCode-level
    red/green behavior CHECK-FIX-01/02 requires, not just the scanner.
  </purpose>
</MODULE_CONTRACT>
*/

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

const SCAN_DIR = join("packages", "os", "site-kernel-checks", "src");

async function fixtureWorkspace(): Promise<{ root: string; context: KernelRuntimeContext }> {
  const root = await mkdtemp(join(tmpdir(), "kernel-io-lint-"));
  await mkdir(join(root, SCAN_DIR), { recursive: true });
  const context = {
    workspaceRoot: root,
    siteExplicit: false,
    logger,
    dryRun: false,
    outputFormat: "json",
  } as unknown as KernelRuntimeContext;
  return { root, context };
}

function input(flags: Record<string, unknown> = {}): KernelCommandInput {
  return { argv: [], args: [], flags } as unknown as KernelCommandInput;
}

describe("findForbiddenIoImports (RFC-0267)", () => {
  it("red fixture: flags a direct node:fs/promises import", () => {
    const source = 'import { readFile } from "node:fs/promises";\nexport function run() {}\n';
    expect(findForbiddenIoImports(source)).toContain("node:fs/promises");
  });

  it("red fixture: flags a direct node:child_process import", () => {
    const source = 'import { spawn } from "node:child_process";\n';
    expect(findForbiddenIoImports(source)).toContain("node:child_process");
  });

  it("green fixture: a module using context.io only has no forbidden imports", () => {
    const source = `
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
export async function run(_input: KernelCommandInput, context: KernelRuntimeContext) {
  const content = await context.io.readFile("some/path");
  return { exitCode: 0, data: { content } };
}
`;
    expect(findForbiddenIoImports(source)).toEqual([]);
  });

  it("green fixture: node:path is not forbidden", () => {
    const source = 'import { join } from "node:path";\n';
    expect(findForbiddenIoImports(source)).toEqual([]);
  });
});

describe("runKernelIoLint (RFC-0267, command-level)", () => {
  it("IO-01: fails when an unbaselined module imports node:fs/promises directly", async () => {
    const { root, context } = await fixtureWorkspace();
    await writeFile(
      join(root, SCAN_DIR, "offender.ts"),
      'import { readFile } from "node:fs/promises";\nexport async function run() { return readFile("x", "utf8"); }\n',
      "utf8",
    );
    const result = await runKernelIoLint(input(), context);
    expect(result.exitCode).toBe(1);
    const ruleIds = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.map(
      (d) => d.ruleId,
    );
    expect(ruleIds).toContain("IO-01");
    await rm(root, { recursive: true, force: true });
  });

  it("passes when every module receives IO from context.io instead of ambient node:fs", async () => {
    const { root, context } = await fixtureWorkspace();
    await writeFile(
      join(root, SCAN_DIR, "clean.ts"),
      'import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";\nexport async function run(_i: KernelCommandInput, context: KernelRuntimeContext) { return context.io.readFile("x"); }\n',
      "utf8",
    );
    const result = await runKernelIoLint(input(), context);
    expect(result.exitCode ?? 0).toBe(0);
    await rm(root, { recursive: true, force: true });
  });
});
