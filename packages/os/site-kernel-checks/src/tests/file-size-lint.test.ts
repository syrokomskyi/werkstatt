import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countLines, runFileSizeLint } from "../file-size-lint.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

/*
<MODULE_CONTRACT>
  <purpose>RFC-0303: fixture tests for file.size.lint (SIZE-01).</purpose>
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
  const root = await mkdtemp(join(tmpdir(), "file-size-lint-"));
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

function input(flags: Record<string, unknown> = {}): KernelCommandInput {
  return { argv: [], args: [], flags } as unknown as KernelCommandInput;
}

describe("countLines (RFC-0303)", () => {
  it("counts physical lines including a trailing newline", () => {
    expect(countLines("a\nb\nc\n")).toBe(4);
  });

  it("returns 0 for an empty source", () => {
    expect(countLines("")).toBe(0);
  });
});

describe("runFileSizeLint (RFC-0303, command-level)", () => {
  it("SIZE-01 (warning): flags a 700-line file as warning (601-1200 tier)", async () => {
    const { root, context } = await fixtureWorkspace();
    const big = Array.from({ length: 700 }, (_, i) => `const x${i} = ${i};`).join("\n");
    await writeFile(join(root, "packages", "some-pkg", "src", "big.ts"), big, "utf8");
    const result = await runFileSizeLint(input(), context);
    expect(result.exitCode ?? 0).toBe(0);
    const diagnostics = (
      result.data as {
        diagnostics: Array<{ ruleId: string; severity: string; file: string }>;
      }
    ).diagnostics;
    const hit = diagnostics.find((d) => d.ruleId === "SIZE-01" && d.file.endsWith("big.ts"));
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("warning");
    await rm(root, { recursive: true, force: true });
  });

  it("SIZE-01 (error): flags a 1300-line file as error (1200+ tier)", async () => {
    const { root, context } = await fixtureWorkspace();
    const huge = Array.from({ length: 1300 }, (_, i) => `const x${i} = ${i};`).join("\n");
    await writeFile(join(root, "packages", "some-pkg", "src", "huge.ts"), huge, "utf8");
    const result = await runFileSizeLint(input(), context);
    expect(result.exitCode ?? 0).toBe(1);
    const diagnostics = (
      result.data as {
        diagnostics: Array<{ ruleId: string; severity: string; file: string }>;
      }
    ).diagnostics;
    const hit = diagnostics.find((d) => d.ruleId === "SIZE-01" && d.file.endsWith("huge.ts"));
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("error");
    await rm(root, { recursive: true, force: true });
  });

  it("passes without diagnostics when every file is under the threshold", async () => {
    const { root, context } = await fixtureWorkspace();
    await writeFile(
      join(root, "packages", "some-pkg", "src", "small.ts"),
      "export const x = 1;\n",
      "utf8",
    );
    const result = await runFileSizeLint(input(), context);
    expect(result.exitCode ?? 0).toBe(0);
    const diagnostics = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics;
    expect(diagnostics.length).toBe(0);
    await rm(root, { recursive: true, force: true });
  });
});
