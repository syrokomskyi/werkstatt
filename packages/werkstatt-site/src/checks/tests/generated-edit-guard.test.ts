/*
<MODULE_CONTRACT>
<purpose>
  RFC-0336: fixture coverage for generated.edit.guard over a temp git repo —
  proves GEN-EDIT-01 (hand-edited generated file, owner untouched) and
  GEN-EDIT-02 (marker removed) both fail, and that editing the file's own
  declared "Edit instead:" owner in the same change set passes.
</purpose>
<keywords>RFC-0336, generated.edit.guard, GEN-EDIT-01, GEN-EDIT-02, fixtures</keywords>
<responsibilities>
  <item>Red: generated file changed alone -> GEN-EDIT-01.</item>
  <item>Red: marker removed -> GEN-EDIT-02.</item>
  <item>Green: generated file + its declared template both change -> pass.</item>
</responsibilities>
<non-goals>
  <item>Do not cover the packages/os|ui fallback path for pre-advisory-block files — the
  advisory-header path is the primary, RFC-0336-introduced mechanism.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="tests">Vitest red/red/green cases for runGeneratedEditGuard.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0336: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultIO, buildGeneratedHeader } from "@warpgogol/site-kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import { runGeneratedEditGuard } from "../generated-edit-guard.ts";

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

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "pipe" });
}

async function initRepoWithGeneratedFile(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "gen-edit-guard-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);

  const header = buildGeneratedHeader({
    filePath: "generated.ts",
    ownerCommand: "fixture.generate",
    templatePath: "template.txt",
  });
  await writeFile(join(root, "generated.ts"), `${header}export const value = 1;\n`, "utf8");
  await writeFile(join(root, "template.txt"), "template v1\n", "utf8");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "chore: seed fixture"]);
  return root;
}

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

describe("RFC-0336 generated.edit.guard fixtures", () => {
  it("GEN-EDIT-01: hand-editing the generated file alone fails", async () => {
    const root = await initRepoWithGeneratedFile();
    roots.push(root);

    await writeFile(
      join(root, "generated.ts"),
      (await readGenerated(root)) + "// tampered\n",
      "utf8",
    );

    const result = await runGeneratedEditGuard(input, ctx(root));
    expect(result.exitCode).toBe(1);
    const diags = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics;
    expect(diags.some((d) => d.ruleId === "GEN-EDIT-01")).toBe(true);
  });

  it("passes when the generated file and its declared template both change", async () => {
    const root = await initRepoWithGeneratedFile();
    roots.push(root);

    await writeFile(
      join(root, "generated.ts"),
      (await readGenerated(root)) + "// regenerated\n",
      "utf8",
    );
    await writeFile(join(root, "template.txt"), "template v2\n", "utf8");

    const result = await runGeneratedEditGuard(input, ctx(root));
    expect(result.exitCode ?? 0).toBe(0);
    const diags = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics;
    expect(diags.some((d) => d.ruleId === "GEN-EDIT-01")).toBe(false);
  });

  it("GEN-EDIT-02: removing the marker without an exemption fails", async () => {
    const root = await initRepoWithGeneratedFile();
    roots.push(root);

    await writeFile(join(root, "generated.ts"), "export const value = 1;\n", "utf8");

    const result = await runGeneratedEditGuard(input, ctx(root));
    expect(result.exitCode).toBe(1);
    const diags = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics;
    expect(diags.some((d) => d.ruleId === "GEN-EDIT-02")).toBe(true);
  });

  it("passes with zero diagnostics when nothing changed", async () => {
    const root = await initRepoWithGeneratedFile();
    roots.push(root);

    const result = await runGeneratedEditGuard(input, ctx(root));
    expect(result.exitCode ?? 0).toBe(0);
    const diags = (result.data as { diagnostics: unknown[] }).diagnostics;
    expect(diags).toEqual([]);
  });
});

async function readGenerated(root: string): Promise<string> {
  return createDefaultIO().io.readFile(join(root, "generated.ts"));
}
