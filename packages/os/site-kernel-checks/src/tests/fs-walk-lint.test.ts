import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findUnsuppressedWalkDeclarations, runFsWalkLint } from "../fs-walk-lint.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

/*
<MODULE_CONTRACT>
  <purpose>RFC-0303: fixture tests for fs.walk.lint (WALK-01).</purpose>
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
  const root = await mkdtemp(join(tmpdir(), "fs-walk-lint-"));
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
  return { argv: [], flags: {} } as unknown as KernelCommandInput;
}

describe("findUnsuppressedWalkDeclarations (RFC-0303)", () => {
  it("red fixture: flags a local `function walk(` declaration", () => {
    const source = "async function walk(dir: string) {\n  await readdir(dir);\n}\n";
    expect(findUnsuppressedWalkDeclarations(source).length).toBe(1);
  });

  it("green fixture: an import of collectFiles has no walk declaration", () => {
    const source = 'import { collectFiles } from "@warpgogol/share/fs";\n';
    expect(findUnsuppressedWalkDeclarations(source)).toEqual([]);
  });

  it("green fixture: a suppressed walk declaration is not flagged", () => {
    const source =
      "// fs.walk.lint: allow — genuinely different contract\n" +
      "async function walk(dir: string) {}\n";
    expect(findUnsuppressedWalkDeclarations(source)).toEqual([]);
  });
});

describe("runFsWalkLint (RFC-0303, command-level)", () => {
  it("WALK-01: fails when a package source declares a local walk() function", async () => {
    const { root, context } = await fixtureWorkspace();
    await writeFile(
      join(root, "packages", "some-pkg", "src", "offender.ts"),
      "async function walk(dir: string): Promise<void> {\n  await Promise.resolve(dir);\n}\n",
      "utf8",
    );
    const result = await runFsWalkLint(input(), context);
    expect(result.exitCode).toBe(1);
    const ruleIds = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.map(
      (d) => d.ruleId,
    );
    expect(ruleIds).toContain("WALK-01");
    await rm(root, { recursive: true, force: true });
  });

  it("passes when every source imports the canonical collectFiles helper", async () => {
    const { root, context } = await fixtureWorkspace();
    await writeFile(
      join(root, "packages", "some-pkg", "src", "clean.ts"),
      'import { collectFiles } from "@warpgogol/share/fs";\nexport async function run() { return collectFiles("."); }\n',
      "utf8",
    );
    const result = await runFsWalkLint(input(), context);
    expect(result.exitCode ?? 0).toBe(0);
    await rm(root, { recursive: true, force: true });
  });
});
