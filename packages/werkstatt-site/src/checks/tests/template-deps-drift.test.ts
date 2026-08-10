/*
<MODULE_CONTRACT>
<purpose>
RFC-0800: unit tests for template.deps.drift. Tests version mismatch detection,
missing deps, in-sync pass, and missing file scenarios.
</purpose>
<non-goals>
  <item>Does not test mission.close integration — tested via integration tests.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0800: initial test suite.</item>
</CHANGE_SUMMARY>
*/

import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultIO } from "@warpgogol/werkstatt/kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

const mockTemplateDir = join(tmpdir(), "template-deps-drift-test-" + process.pid);

vi.mock("../../onboarding/templates.ts", () => ({
  TEMPLATES_DIR: mockTemplateDir,
  RUNTIME_TEMPLATES_DIR: join(mockTemplateDir, "runtime"),
  readTemplate: () => "",
  readRuntimeTemplate: () => "",
  applyTokens: (t: string) => t,
}));

const { runTemplateDepsDrift } = await import("../template-deps-drift.ts");

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

function makeContext(workspaceRoot: string): KernelRuntimeContext {
  const { io } = createDefaultIO();
  return {
    workspaceRoot,
    io,
    logger,
    site: undefined,
    fileIntents: io,
  } as unknown as KernelRuntimeContext;
}

function makeInput(flags: Record<string, unknown> = {}): KernelCommandInput {
  return { flags } as unknown as KernelCommandInput;
}

const templatePkg = {
  name: "test-template",
  dependencies: {
    astro: "^7.0.0",
    react: "19.0.0",
  },
  devDependencies: {
    typescript: "^6.0.0",
    wrangler: "^4.0.0",
  },
};

describe("template.deps.drift", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "wps-root-"));
    await mkdir(mockTemplateDir, { recursive: true });
    await writeFile(
      join(mockTemplateDir, "package.template.json"),
      JSON.stringify(templatePkg, null, 2),
    );
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(mockTemplateDir, { recursive: true, force: true });
  });

  it("detects version mismatch in dependencies", async () => {
    const workpieceDir = join(workspaceRoot, "workpiece");
    await mkdir(workpieceDir, { recursive: true });
    await writeFile(
      join(workpieceDir, "package.json"),
      JSON.stringify({
        dependencies: { astro: "^7.1.0", react: "19.0.0" },
        devDependencies: { typescript: "^6.0.0", wrangler: "^4.0.0" },
      }),
    );

    const result = await runTemplateDepsDrift(
      makeInput({ "workpiece-dir": "workpiece", site: "test-site" }),
      makeContext(workspaceRoot),
    );

    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics).toHaveLength(1);
    expect(result.data?.diagnostics[0]?.ruleId).toBe("TEMPLATE-DEPS-DRIFT-01");
    expect(result.data?.diagnostics[0]?.severity).toBe("error");
    expect(result.data?.diagnostics[0]?.message).toContain("astro");
  });

  it("detects version mismatch in devDependencies", async () => {
    const workpieceDir = join(workspaceRoot, "workpiece");
    await mkdir(workpieceDir, { recursive: true });
    await writeFile(
      join(workpieceDir, "package.json"),
      JSON.stringify({
        dependencies: { astro: "^7.0.0", react: "19.0.0" },
        devDependencies: { typescript: "^5.0.0", wrangler: "^4.0.0" },
      }),
    );

    const result = await runTemplateDepsDrift(
      makeInput({ "workpiece-dir": "workpiece", site: "test-site" }),
      makeContext(workspaceRoot),
    );

    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics).toHaveLength(1);
    expect(result.data?.diagnostics[0]?.ruleId).toBe("TEMPLATE-DEPS-DRIFT-01");
    expect(result.data?.diagnostics[0]?.message).toContain("typescript");
  });

  it("detects missing dep in workpiece", async () => {
    const workpieceDir = join(workspaceRoot, "workpiece");
    await mkdir(workpieceDir, { recursive: true });
    await writeFile(
      join(workpieceDir, "package.json"),
      JSON.stringify({
        dependencies: { react: "19.0.0" },
        devDependencies: { typescript: "^6.0.0", wrangler: "^4.0.0" },
      }),
    );

    const result = await runTemplateDepsDrift(
      makeInput({ "workpiece-dir": "workpiece", site: "test-site" }),
      makeContext(workspaceRoot),
    );

    expect(result.exitCode).toBe(1);
    const errorDiags = result.data?.diagnostics.filter(
      (d) => d.ruleId === "TEMPLATE-DEPS-DRIFT-01",
    );
    expect(errorDiags).toHaveLength(1);
    expect(errorDiags?.[0]?.message).toContain("astro");
  });

  it("detects extra dep in workpiece not in template", async () => {
    const workpieceDir = join(workspaceRoot, "workpiece");
    await mkdir(workpieceDir, { recursive: true });
    await writeFile(
      join(workpieceDir, "package.json"),
      JSON.stringify({
        dependencies: { astro: "^7.0.0", react: "19.0.0", "extra-pkg": "^1.0.0" },
        devDependencies: { typescript: "^6.0.0", wrangler: "^4.0.0" },
      }),
    );

    const result = await runTemplateDepsDrift(
      makeInput({ "workpiece-dir": "workpiece", site: "test-site" }),
      makeContext(workspaceRoot),
    );

    expect(result.exitCode).toBe(1);
    const errorDiags = result.data?.diagnostics.filter(
      (d) => d.ruleId === "TEMPLATE-DEPS-DRIFT-01",
    );
    expect(errorDiags).toHaveLength(1);
    expect(errorDiags?.[0]?.message).toContain("extra-pkg");
  });

  it("passes when workpiece and template are in sync", async () => {
    const workpieceDir = join(workspaceRoot, "workpiece");
    await mkdir(workpieceDir, { recursive: true });
    await writeFile(
      join(workpieceDir, "package.json"),
      JSON.stringify({
        dependencies: { astro: "^7.0.0", react: "19.0.0" },
        devDependencies: { typescript: "^6.0.0", wrangler: "^4.0.0" },
      }),
    );

    const result = await runTemplateDepsDrift(
      makeInput({ "workpiece-dir": "workpiece", site: "test-site" }),
      makeContext(workspaceRoot),
    );

    expect(result.exitCode).toBe(0);
    expect(result.data?.diagnostics).toHaveLength(0);
    expect(result.data?.status).toBe("pass");
  });

  it("emits TEMPLATE-DEPS-DRIFT-02 when workpiece package.json is missing", async () => {
    const workpieceDir = join(workspaceRoot, "workpiece");
    await mkdir(workpieceDir, { recursive: true });

    const result = await runTemplateDepsDrift(
      makeInput({ "workpiece-dir": "workpiece", site: "test-site" }),
      makeContext(workspaceRoot),
    );

    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics[0]?.ruleId).toBe("TEMPLATE-DEPS-DRIFT-02");
  });

  it("emits TEMPLATE-DEPS-DRIFT-02 when --site is not provided", async () => {
    const result = await runTemplateDepsDrift(makeInput({}), makeContext(workspaceRoot));

    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics[0]?.ruleId).toBe("TEMPLATE-DEPS-DRIFT-02");
    expect(result.data?.diagnostics[0]?.message).toContain("--site");
  });
});
