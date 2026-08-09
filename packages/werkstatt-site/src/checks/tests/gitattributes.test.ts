/*
<MODULE_CONTRACT>
<purpose>
  RFC-0336: fixture coverage for gitattributes.generate/validate — proves a
  missing/stale managed block fails (GITATTR-01/red) and a freshly generated
  block passes (green), against a minimal fixture workspace with one fake
  generated-output command.
</purpose>
<keywords>RFC-0336, gitattributes, GITATTR-01, fixtures</keywords>
<responsibilities>
  <item>Red: no .gitattributes / no managed block -> fail.</item>
  <item>Green: gitattributes.generate then gitattributes.validate -> pass, idempotent.</item>
</responsibilities>
<non-goals>
  <item>Do not exercise the real workspace's live command registry — the fixture is intentionally minimal.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="tests">Vitest red/green cases for runGitattributesGenerate/runGitattributesValidate.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0336: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultIO } from "@warpgogol/site-kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import { runGitattributesGenerate, runGitattributesValidate } from "../gitattributes.ts";

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
    io: createDefaultIO().io,
  } as unknown as KernelRuntimeContext;
}

async function fixtureWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "gitattributes-"));
  const toolsRoot = join(root, "tools");
  await mkdir(toolsRoot, { recursive: true });
  await mkdir(join(root, "apps"), { recursive: true });
  await writeFile(join(root, "package.json"), "{}\n", "utf8");
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
  await writeFile(join(root, ".gitignore"), "node_modules/\n", "utf8");
  await writeFile(
    join(toolsRoot, "kernel.config.mjs"),
    `
export default {
  modules: [{
    name: "fixture",
    version: "0.0.0",
    register(registry) {
      registry.registerCommand({
        name: "fixture.generate",
        description: "fixture generator",
        scope: "workspace",
        mutatesState: true,
        writes: ["docs/fixture.generated.yaml", "<app>/public/fixture.txt"],
        execute() { return { exitCode: 0 }; },
      });
    },
  }],
  pipelines: {},
};
`,
    "utf8",
  );
  return root;
}

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

describe("RFC-0336 gitattributes fixtures", () => {
  it("red: missing .gitattributes fails GITATTR-01", async () => {
    const root = await fixtureWorkspace();
    roots.push(root);

    const result = await runGitattributesValidate(input, ctx(root));
    expect(result.exitCode).toBe(1);
    expect(result.data?.status).toBe("fail");
    expect(result.data?.diagnostics.some((d) => d.ruleId === "GITATTR-01")).toBe(true);
  });

  it("green: generate then validate passes and is idempotent", async () => {
    const root = await fixtureWorkspace();
    roots.push(root);

    const first = await runGitattributesGenerate(input, ctx(root));
    expect(first.exitCode).toBe(0);
    expect(first.data?.written).toBe(true);
    expect(first.data?.patternCount).toBeGreaterThan(0);

    const validated = await runGitattributesValidate(input, ctx(root));
    expect(validated.exitCode).toBe(0);
    expect(validated.data?.status).toBe("pass");

    const second = await runGitattributesGenerate(input, ctx(root));
    expect(second.exitCode).toBe(0);
    expect(second.data?.written).toBe(false);
  });

  it("derives both a direct and app-scoped pattern from the fixture command's writes", async () => {
    const root = await fixtureWorkspace();
    roots.push(root);

    await runGitattributesGenerate(input, ctx(root));
    const content = await createDefaultIO().io.readFile(join(root, ".gitattributes"));
    expect(content).toContain("docs/fixture.generated.yaml");
    expect(content).toContain("apps/*/public/fixture.txt");
    expect(content).toContain("linguist-generated=true");
    expect(content).not.toContain(".gitattributes                "); // never self-marks
  });

  it("GITATTR-02: same patterns in a different order warns instead of failing", async () => {
    const root = await fixtureWorkspace();
    roots.push(root);

    await runGitattributesGenerate(input, ctx(root));
    const path = join(root, ".gitattributes");
    const content = await createDefaultIO().io.readFile(path);
    const beginIdx = content.indexOf("# BEGIN generated-artifacts");
    const endIdx =
      content.indexOf("# END generated-artifacts") + "# END generated-artifacts".length;
    const before = content.slice(0, beginIdx);
    const block = content.slice(beginIdx, endIdx);
    const after = content.slice(endIdx);
    const lines = block.split("\n");
    const header = lines.slice(0, 2);
    const patternLines = lines.slice(2, -1);
    const footer = lines.slice(-1);
    const shuffled = [...patternLines].reverse();
    const reordered = [...header, ...shuffled, ...footer].join("\n");
    await createDefaultIO().io.writeFile(path, `${before}${reordered}${after}`);

    const result = await runGitattributesValidate(input, ctx(root));
    expect(result.exitCode ?? 0).toBe(0);
    expect(result.data?.status).toBe("warn");
    expect(result.data?.diagnostics.some((d) => d.ruleId === "GITATTR-02")).toBe(true);
  });

  it("GITATTR-03: a tracked marker-carrying file with no covering pattern warns", async () => {
    const root = await fixtureWorkspace();
    roots.push(root);
    await runGitattributesGenerate(input, ctx(root));

    // GENERATOR_OWNERSHIP_MAP is a static import (not fixture-injectable), so it always
    // contributes the real workspace's patterns too. Use a path no real pattern covers
    // (astro route pages are only registered by literal name, never a wildcard).
    const pagesDir = join(root, "apps", "fixture-app", "src", "pages");
    await mkdir(pagesDir, { recursive: true });
    await writeFile(
      join(pagesDir, "custom-generated.astro"),
      "---\n// GENERATED. Do not change this line unless the file contains project specific changes.\n---\n<p>Fixture</p>\n",
      "utf8",
    );

    const result = await runGitattributesValidate(input, ctx(root));
    expect(
      result.data?.diagnostics.some(
        (d) => d.ruleId === "GITATTR-03" && d.file?.includes("fixture-app"),
      ),
    ).toBe(true);
  });
});
