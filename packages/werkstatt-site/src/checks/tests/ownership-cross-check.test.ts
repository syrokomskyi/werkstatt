/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0810: fixture coverage for ownership.generator.cross-check — proves
    OWN-XCHECK-01 fires for uncovered app-scoped .generate commands,
    OWN-XCHECK-02 fires for phantom command references,
    OWN-XCHECK-03 fires for missing or non-existent module paths,
    workspace-scoped commands are skipped, and clean pass works.
  </purpose>
  <keywords>RFC-0810, ownership.generator.cross-check, OWN-XCHECK-01, OWN-XCHECK-02, OWN-XCHECK-03</keywords>
  <responsibilities>
    <item>Red: app-scoped .generate command not in ownership map -> OWN-XCHECK-01, exitCode 1.</item>
    <item>Red: ownership entry references unregistered command -> OWN-XCHECK-02, exitCode 1.</item>
    <item>Red: ownership entry with empty module -> OWN-XCHECK-03 error, exitCode 1.</item>
    <item>Red: ownership entry with non-existent module path -> OWN-XCHECK-03 warning.</item>
    <item>Green: all commands covered, all modules exist -> clean pass, exitCode 0.</item>
    <item>Green: workspace-scoped .generate command with no entry -> no OWN-XCHECK-01.</item>
  </responsibilities>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0810: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultIO } from "@warpgogol/werkstatt/kernel";
import type {
  KernelCommandInput,
  KernelRuntimeContext,
  KernelRegisteredCommandInfo,
} from "@warpgogol/werkstatt/kernel";

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

let mockCommands: KernelRegisteredCommandInfo[] = [];

vi.mock("@warpgogol/werkstatt/kernel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@warpgogol/werkstatt/kernel")>();
  return {
    ...actual,
    listRegisteredKernelCommands: vi.fn(async () => mockCommands),
  };
});

vi.mock("../generator-ownership.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../generator-ownership.ts")>();
  return {
    ...actual,
    GENERATOR_OWNERSHIP_MAP: [] as Array<{
      path: string;
      command: string;
      module: string;
      markerPolicy?: "embedded" | "registry-only";
      conditional?: boolean;
    }>,
  };
});

import { runOwnershipGeneratorCrossCheck } from "../ownership-cross-check.ts";
import { GENERATOR_OWNERSHIP_MAP } from "../generator-ownership.ts";
import { listRegisteredKernelCommands } from "@warpgogol/werkstatt/kernel";

describe("ownership.generator.cross-check (RFC-0810)", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "own-xcheck-"));
    mockCommands = [];
    (GENERATOR_OWNERSHIP_MAP as unknown[]).length = 0;
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("red: OWN-XCHECK-01 — app-scoped .generate command with no ownership entry", async () => {
    mockCommands = [
      {
        name: "uncovered.generate",
        description: "test",
        scope: "app",
        provider: "workspace",
        writes: ["<app>/src/content/pages/uncovered.md"],
      },
    ];

    const result = await runOwnershipGeneratorCrossCheck(input, ctx(root));

    const xcheck01 = result.data!.diagnostics.filter((d) => d.ruleId === "OWN-XCHECK-01");
    expect(xcheck01).toHaveLength(1);
    expect(xcheck01[0].severity).toBe("error");
    expect(xcheck01[0].message).toContain("uncovered.generate");
    expect(result.exitCode).toBe(1);
  });

  it("red: OWN-XCHECK-02 — ownership entry references unregistered command", async () => {
    mockCommands = [];
    GENERATOR_OWNERSHIP_MAP.push({
      path: "apps/test-app/public/foo.json",
      command: "phantom.generate",
      module: "packages/test/foo.ts",
    });

    const result = await runOwnershipGeneratorCrossCheck(input, ctx(root));

    const xcheck02 = result.data!.diagnostics.filter((d) => d.ruleId === "OWN-XCHECK-02");
    expect(xcheck02).toHaveLength(1);
    expect(xcheck02[0].severity).toBe("error");
    expect(xcheck02[0].message).toContain("phantom.generate");
    expect(result.exitCode).toBe(1);
  });

  it("red: OWN-XCHECK-03 (error) — ownership entry with empty module", async () => {
    mockCommands = [
      {
        name: "test.generate",
        description: "test",
        scope: "app",
        provider: "workspace",
      },
    ];
    GENERATOR_OWNERSHIP_MAP.push({
      path: "apps/test-app/public/foo.json",
      command: "test.generate",
      module: "",
    });

    const result = await runOwnershipGeneratorCrossCheck(input, ctx(root));

    const xcheck03 = result.data!.diagnostics.filter((d) => d.ruleId === "OWN-XCHECK-03");
    expect(xcheck03).toHaveLength(1);
    expect(xcheck03[0].severity).toBe("error");
    expect(xcheck03[0].message).toContain("no module path");
    expect(result.exitCode).toBe(1);
  });

  it("red: OWN-XCHECK-03 (warning) — ownership entry with non-existent module path", async () => {
    mockCommands = [
      {
        name: "test.generate",
        description: "test",
        scope: "app",
        provider: "workspace",
      },
    ];
    GENERATOR_OWNERSHIP_MAP.push({
      path: "apps/test-app/public/foo.json",
      command: "test.generate",
      module: "packages/nonexistent/foo.ts",
    });

    const result = await runOwnershipGeneratorCrossCheck(input, ctx(root));

    const xcheck03 = result.data!.diagnostics.filter((d) => d.ruleId === "OWN-XCHECK-03");
    expect(xcheck03).toHaveLength(1);
    expect(xcheck03[0].severity).toBe("warning");
    expect(xcheck03[0].message).toContain("non-existent module");
  });

  it("green: clean pass — all commands covered, all modules exist", async () => {
    const modulePath = join(root, "packages", "test");
    await mkdir(modulePath, { recursive: true });
    await writeFile(join(modulePath, "foo.ts"), "// test", "utf8");

    mockCommands = [
      {
        name: "test.generate",
        description: "test",
        scope: "app",
        provider: "workspace",
      },
    ];
    GENERATOR_OWNERSHIP_MAP.push({
      path: "apps/test-app/public/foo.json",
      command: "test.generate",
      module: "packages/test/foo.ts",
    });

    const result = await runOwnershipGeneratorCrossCheck(input, ctx(root));

    expect(result.data!.diagnostics).toHaveLength(0);
    expect(result.exitCode).toBe(0);
  });

  it("green: workspace-scoped .generate command with no entry -> no OWN-XCHECK-01", async () => {
    mockCommands = [
      {
        name: "workspace-only.generate",
        description: "test",
        scope: "workspace",
        provider: "workspace",
      },
    ];

    const result = await runOwnershipGeneratorCrossCheck(input, ctx(root));

    const xcheck01 = result.data!.diagnostics.filter((d) => d.ruleId === "OWN-XCHECK-01");
    expect(xcheck01).toHaveLength(0);
  });

  it("green: app-scoped .generate with no writes (delegation boundary) -> no OWN-XCHECK-01", async () => {
    mockCommands = [
      {
        name: "delegation.generate",
        description: "delegation boundary",
        scope: "app",
        provider: "workspace",
      },
    ];

    const result = await runOwnershipGeneratorCrossCheck(input, ctx(root));

    const xcheck01 = result.data!.diagnostics.filter((d) => d.ruleId === "OWN-XCHECK-01");
    expect(xcheck01).toHaveLength(0);
  });

  it("green: app-scoped .generate whose writes are already covered -> no OWN-XCHECK-01", async () => {
    mockCommands = [
      {
        name: "covered.generate",
        description: "writes already owned by another command",
        scope: "app",
        provider: "workspace",
        writes: ["<app>/public/robots.txt"],
      },
    ];
    GENERATOR_OWNERSHIP_MAP.push({
      path: "public/robots.txt",
      command: "robots.generate",
      module: "packages/werkstatt-site/src/checks/robots.ts",
    });

    const result = await runOwnershipGeneratorCrossCheck(input, ctx(root));

    const xcheck01 = result.data!.diagnostics.filter((d) => d.ruleId === "OWN-XCHECK-01");
    expect(xcheck01).toHaveLength(0);
  });

  it("green: app-scoped .generate with only non-app writes -> no OWN-XCHECK-01", async () => {
    mockCommands = [
      {
        name: "external.generate",
        description: "writes outside app",
        scope: "app",
        provider: "workspace",
        writes: ["systems-cache/test/dns-records.yaml"],
      },
    ];

    const result = await runOwnershipGeneratorCrossCheck(input, ctx(root));

    const xcheck01 = result.data!.diagnostics.filter((d) => d.ruleId === "OWN-XCHECK-01");
    expect(xcheck01).toHaveLength(0);
  });
});
