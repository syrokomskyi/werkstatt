import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBarrelSizeLint, countExportLines } from "../barrel-size-lint.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0264: fixture tests for barrel.size.lint — BARREL-01 (root barrel
    export-line threshold) and BARREL-02 (a completed-wave symbol
    re-appearing in the root barrel).
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

async function fixtureWorkspace(): Promise<{ root: string; pkgDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "barrel-size-lint-"));
  const pkgDir = join(root, "packages", "share");
  await mkdir(join(pkgDir, "src"), { recursive: true });
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf8");
  return { root, pkgDir };
}

describe("barrel.size.lint (RFC-0264)", () => {
  it("BARREL-01: fails (error) when @warpgogol/share's root barrel exceeds the threshold", async () => {
    const { root, pkgDir } = await fixtureWorkspace();
    await writeFile(
      join(pkgDir, "package.json"),
      JSON.stringify({ name: "@warpgogol/share" }),
      "utf8",
    );
    const lines = Array.from({ length: 130 }, (_, i) => `export const sym${i} = ${i};`).join("\n");
    await writeFile(join(pkgDir, "src", "index.ts"), lines, "utf8");
    const result = await runBarrelSizeLint(input, ctx(root));
    expect(result.exitCode).toBe(1);
    const diags = (result.data as { diagnostics: Array<{ ruleId: string; severity: string }> })
      .diagnostics;
    expect(diags.some((d) => d.ruleId === "BARREL-01" && d.severity === "error")).toBe(true);
    await rm(root, { recursive: true, force: true });
  });

  it("BARREL-02: fails when a page.ts symbol reappears in the root barrel", async () => {
    const { root, pkgDir } = await fixtureWorkspace();
    await writeFile(
      join(pkgDir, "package.json"),
      JSON.stringify({ name: "@warpgogol/share" }),
      "utf8",
    );
    await writeFile(join(pkgDir, "src", "page.ts"), "export function buildPage() {}\n", "utf8");
    await writeFile(
      join(pkgDir, "src", "index.ts"),
      'export { buildPage } from "./page.ts";\n',
      "utf8",
    );
    const result = await runBarrelSizeLint(input, ctx(root));
    expect(result.exitCode).toBe(1);
    const ruleIds = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.map(
      (d) => d.ruleId,
    );
    expect(ruleIds).toContain("BARREL-02");
    await rm(root, { recursive: true, force: true });
  });

  it("passes when the root barrel is small and has no completed-wave duplicates", async () => {
    const { root, pkgDir } = await fixtureWorkspace();
    await writeFile(
      join(pkgDir, "package.json"),
      JSON.stringify({ name: "@warpgogol/share" }),
      "utf8",
    );
    await writeFile(join(pkgDir, "src", "page.ts"), "export function buildPage() {}\n", "utf8");
    await writeFile(
      join(pkgDir, "src", "index.ts"),
      'export * from "./content/index.ts";\n',
      "utf8",
    );
    const result = await runBarrelSizeLint(input, ctx(root));
    expect(result.exitCode ?? 0).toBe(0);
    await rm(root, { recursive: true, force: true });
  });
});

describe("countExportLines (RFC-0264)", () => {
  it("counts a single-line export as one line", () => {
    expect(countExportLines("export const x = 1;\n")).toBe(1);
  });

  it("counts every line of a multi-line export block", () => {
    const text = ["export {", "  a,", "  b,", '} from "./x.ts";'].join("\n");
    expect(countExportLines(text)).toBe(4);
  });

  it("ignores comments and blank lines", () => {
    const text = ["// export const ghost = 1;", "", "export const x = 1;"].join("\n");
    expect(countExportLines(text)).toBe(1);
  });
});
