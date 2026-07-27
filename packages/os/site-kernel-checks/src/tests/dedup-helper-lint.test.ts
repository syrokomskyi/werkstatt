import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findLocalReservedDeclarations, runDedupHelperLint } from "../dedup-helper-lint.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@gogol/site-kernel";

/*
<MODULE_CONTRACT>
  <purpose>RFC-0303: fixture tests for dedup.helper.lint (DEDUP-01).</purpose>
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

async function fixtureWorkspace(): Promise<{ root: string; context: KernelRuntimeContext }> {
  const root = await mkdtemp(join(tmpdir(), "dedup-helper-lint-"));
  await mkdir(join(root, "packages", "some-pkg", "src"), { recursive: true });
  const context = {
    workspaceRoot: root,
    siteExplicit: false,
    logger,
    dryRun: false,
    outputFormat: "json",
  } as unknown as KernelRuntimeContext;
  return { root, context };
}

function input(): KernelCommandInput {
  return { argv: [], args: [], flags: {} } as unknown as KernelCommandInput;
}

describe("findLocalReservedDeclarations (RFC-0303)", () => {
  it("red fixture: flags a local fileExists declaration", () => {
    const source = "async function fileExists(p: string): Promise<boolean> {\n  return true;\n}\n";
    expect(findLocalReservedDeclarations(source)).toContain("fileExists");
  });

  it("red fixture: flags a local getLineColumn declaration", () => {
    const source =
      "function getLineColumn(text: string, index: number) { return { line: 1, column: 1 }; }\n";
    expect(findLocalReservedDeclarations(source)).toContain("getLineColumn");
  });

  it("green fixture: importing the canonical helper is not flagged", () => {
    const source = 'import { fileExists, collectFiles } from "@gogol/share/fs";\n';
    expect(findLocalReservedDeclarations(source)).toEqual([]);
  });

  it("green fixture: a differently-named local wrapper is not flagged", () => {
    const source =
      'import { fileExists as pathExists } from "@gogol/share/fs";\n' +
      "async function checkPath(p: string) { return pathExists(p); }\n";
    expect(findLocalReservedDeclarations(source)).toEqual([]);
  });
});

describe("runDedupHelperLint (RFC-0303, command-level)", () => {
  it("DEDUP-01: fails when a source re-declares the reserved fileExists identifier", async () => {
    const { root, context } = await fixtureWorkspace();
    await writeFile(
      join(root, "packages", "some-pkg", "src", "offender.ts"),
      "async function fileExists(p: string): Promise<boolean> {\n  return Boolean(p);\n}\n",
      "utf8",
    );
    const result = await runDedupHelperLint(input(), context);
    expect(result.exitCode).toBe(1);
    const ruleIds = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.map(
      (d) => d.ruleId,
    );
    expect(ruleIds).toContain("DEDUP-01");
    await rm(root, { recursive: true, force: true });
  });

  it("passes when every source imports the canonical helper", async () => {
    const { root, context } = await fixtureWorkspace();
    await writeFile(
      join(root, "packages", "some-pkg", "src", "clean.ts"),
      'import { fileExists } from "@gogol/share/fs";\nexport async function run() { return fileExists("."); }\n',
      "utf8",
    );
    const result = await runDedupHelperLint(input(), context);
    expect(result.exitCode ?? 0).toBe(0);
    await rm(root, { recursive: true, force: true });
  });
});
