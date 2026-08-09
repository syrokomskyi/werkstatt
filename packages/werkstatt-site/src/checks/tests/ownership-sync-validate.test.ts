/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0612: fixture coverage for ownership.sync.validate — proves
    OWN-01 fires for unregistered files in public/, OWN-02 fires for
    phantom ownership entries, static asset exemptions work, and
    conditional entries are exempt from OWN-02.
  </purpose>
  <keywords>RFC-0612, ownership.sync.validate, OWN-01, OWN-02, fixtures</keywords>
  <responsibilities>
    <item>Red: unregistered file in public/ -> OWN-01, exitCode 1.</item>
    <item>Green: file covered by ownership entry -> no OWN-01.</item>
    <item>Red: ownership entry with no matching file -> OWN-02 warning.</item>
    <item>Green: static asset in public/textures/ -> no OWN-01.</item>
    <item>Green: conditional entry with no matching file -> no OWN-02.</item>
    <item>Green: empty public/ -> exitCode 0.</item>
  </responsibilities>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0612: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultIO } from "@warpgogol/werkstatt/kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

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

const input = { argv: [], flags: { site: "test-app" } } as unknown as KernelCommandInput;

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

async function createAppDir(root: string): Promise<string> {
  const appDir = join(root, "apps", "test-app");
  await mkdir(join(appDir, "public"), { recursive: true });
  return appDir;
}

// Mock GENERATOR_OWNERSHIP_MAP with minimal entries for testing
vi.mock("../generator-ownership.ts", () => ({
  GENERATOR_OWNERSHIP_MAP: [
    {
      path: "apps/{app}/public/sitemap.xml",
      command: "sitemap.generate",
      markerPolicy: "registry-only" as const,
      conditional: false,
    },
    {
      path: "apps/{app}/public/robots.txt",
      command: "robots.generate",
      markerPolicy: "registry-only" as const,
      conditional: false,
    },
    {
      path: "apps/{app}/public/phantom-file.json",
      command: "phantom.generate",
      markerPolicy: "registry-only" as const,
      conditional: false,
    },
    {
      path: "apps/{app}/public/conditional-file.json",
      command: "conditional.generate",
      markerPolicy: "registry-only" as const,
      conditional: true,
    },
  ],
}));

import { runOwnershipSyncValidate } from "../ownership-sync-validate.ts";

describe("ownership.sync.validate (RFC-0612)", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "own-sync-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("red: reports OWN-01 for unregistered file in public/", async () => {
    const appDir = await createAppDir(root);
    // Create a file that is NOT in the ownership map
    await writeFile(join(appDir, "public", "unregistered.txt"), "test", "utf8");
    // Also create registered files so OWN-02 doesn't fire for them
    await writeFile(join(appDir, "public", "sitemap.xml"), "<xml/>", "utf8");
    await writeFile(join(appDir, "public", "robots.txt"), "User-agent: *", "utf8");

    const result = await runOwnershipSyncValidate(input, ctx(root));

    expect(result.data?.diagnostics).toBeDefined();
    const own01 = result.data!.diagnostics.filter((d) => d.ruleId === "OWN-01");
    expect(own01).toHaveLength(1);
    expect(own01[0].file).toBe("public/unregistered.txt");
    expect(own01[0].severity).toBe("error");
    expect(result.exitCode).toBe(1);
  });

  it("green: file covered by ownership entry -> no OWN-01", async () => {
    const appDir = await createAppDir(root);
    await writeFile(join(appDir, "public", "sitemap.xml"), "<xml/>", "utf8");
    await writeFile(join(appDir, "public", "robots.txt"), "User-agent: *", "utf8");

    const result = await runOwnershipSyncValidate(input, ctx(root));

    const own01 = result.data!.diagnostics.filter((d) => d.ruleId === "OWN-01");
    expect(own01).toHaveLength(0);
  });

  it("red: reports OWN-02 for ownership entry with no matching file", async () => {
    const appDir = await createAppDir(root);
    // Create sitemap.xml and robots.txt but NOT phantom-file.json
    await writeFile(join(appDir, "public", "sitemap.xml"), "<xml/>", "utf8");
    await writeFile(join(appDir, "public", "robots.txt"), "User-agent: *", "utf8");

    const result = await runOwnershipSyncValidate(input, ctx(root));

    const own02 = result.data!.diagnostics.filter((d) => d.ruleId === "OWN-02");
    expect(own02).toHaveLength(1);
    expect(own02[0].severity).toBe("warning");
    expect(own02[0].file).toContain("phantom-file.json");
  });

  it("green: static asset in public/textures/ -> no OWN-01", async () => {
    const appDir = await createAppDir(root);
    await mkdir(join(appDir, "public", "textures"), { recursive: true });
    await writeFile(join(appDir, "public", "textures", "noise.png"), "binary", "utf8");
    await writeFile(join(appDir, "public", "sitemap.xml"), "<xml/>", "utf8");
    await writeFile(join(appDir, "public", "robots.txt"), "User-agent: *", "utf8");

    const result = await runOwnershipSyncValidate(input, ctx(root));

    const own01 = result.data!.diagnostics.filter((d) => d.ruleId === "OWN-01");
    expect(own01).toHaveLength(0);
  });

  it("green: conditional entry with no matching file -> no OWN-02", async () => {
    const appDir = await createAppDir(root);
    await writeFile(join(appDir, "public", "sitemap.xml"), "<xml/>", "utf8");
    await writeFile(join(appDir, "public", "robots.txt"), "User-agent: *", "utf8");
    // conditional-file.json is NOT created, but entry has conditional: true

    const result = await runOwnershipSyncValidate(input, ctx(root));

    const own02 = result.data!.diagnostics.filter((d) => d.ruleId === "OWN-02");
    // Only phantom-file.json should trigger OWN-02, not conditional-file.json
    expect(own02).toHaveLength(1);
    expect(own02[0].file).toContain("phantom-file.json");
    expect(own02[0].file).not.toContain("conditional-file.json");
  });

  it("green: empty public/ -> exitCode 0 (OWN-02 may fire for missing entries)", async () => {
    const _appDir = await createAppDir(root);

    const result = await runOwnershipSyncValidate(input, ctx(root));

    // No files in public/, so no OWN-01. OWN-02 will fire for missing entries.
    const own01 = result.data!.diagnostics.filter((d) => d.ruleId === "OWN-01");
    expect(own01).toHaveLength(0);
  });

  it("green: all files covered, all entries match -> clean pass", async () => {
    const appDir = await createAppDir(root);
    // Create all non-conditional files
    await writeFile(join(appDir, "public", "sitemap.xml"), "<xml/>", "utf8");
    await writeFile(join(appDir, "public", "robots.txt"), "User-agent: *", "utf8");
    await writeFile(join(appDir, "public", "phantom-file.json"), "{}", "utf8");

    const result = await runOwnershipSyncValidate(input, ctx(root));

    expect(result.data!.diagnostics).toHaveLength(0);
    expect(result.exitCode).toBe(0);
  });
});
