/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0600: fixture coverage for generated.stale.validate — proves
    STALE-01 fires for orphaned files in public/, exemptions work for
    static assets and content-resolved preview images, and clean-pass
    when no orphaned files exist.
  </purpose>
  <keywords>RFC-0600, generated.stale.validate, STALE-01, fixtures</keywords>
  <responsibilities>
    <item>Red: orphaned file in public/ -> STALE-01, exitCode 1.</item>
    <item>Green: static asset in public/textures/ -> no STALE-01.</item>
    <item>Green: preview image for existing content page -> no STALE-01.</item>
    <item>Red: preview image for deleted content page -> STALE-01.</item>
    <item>Green: opt-out preview file (leading -) -> no STALE-01.</item>
    <item>Green: empty public/ -> exitCode 0.</item>
    <item>Red: old app-name file -> STALE-01.</item>
  </responsibilities>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0600: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultIO } from "@warpgogol/site-kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import { runGeneratedStaleValidate } from "../generated-stale-validate.ts";

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

describe("generated.stale.validate (RFC-0600)", () => {
  it("red: reports STALE-01 for orphaned file in public/", async () => {
    const root = await mkdtemp(join(tmpdir(), "gen-stale-red-"));
    try {
      const appDir = await createAppDir(root);
      await writeFile(join(appDir, "public", "orphaned-file.txt"), "stale", "utf8");

      const result = await runGeneratedStaleValidate(input, ctx(root));
      expect(result.exitCode).toBe(1);
      expect(result.data?.diagnostics).toBeDefined();
      const staleDiags = result.data!.diagnostics.filter((d) => d.ruleId === "STALE-01");
      expect(staleDiags.length).toBeGreaterThanOrEqual(1);
      expect(staleDiags.some((d) => d.file === "public/orphaned-file.txt")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("green: static asset in public/textures/ is not flagged", async () => {
    const root = await mkdtemp(join(tmpdir(), "gen-stale-textures-"));
    try {
      const appDir = await createAppDir(root);
      await mkdir(join(appDir, "public", "textures"), { recursive: true });
      await writeFile(join(appDir, "public", "textures", "noise.svg"), "<svg/>", "utf8");

      const result = await runGeneratedStaleValidate(input, ctx(root));
      expect(result.exitCode).toBe(0);
      const staleDiags = result.data?.diagnostics.filter((d) => d.ruleId === "STALE-01") ?? [];
      expect(staleDiags.length).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("green: preview image for existing content page is not flagged", async () => {
    const root = await mkdtemp(join(tmpdir(), "gen-stale-preview-existing-"));
    try {
      const appDir = await createAppDir(root);
      await mkdir(join(appDir, "public", "preview", "de"), { recursive: true });
      await mkdir(join(appDir, "src", "content", "pages", "de"), { recursive: true });
      await writeFile(join(appDir, "public", "preview", "de", "founder.png"), "png", "utf8");
      await writeFile(join(appDir, "src", "content", "pages", "de", "founder.md"), "# Founder", "utf8");

      const result = await runGeneratedStaleValidate(input, ctx(root));
      const staleDiags = result.data?.diagnostics.filter(
        (d) => d.ruleId === "STALE-01" && d.file === "public/preview/de/founder.png",
      ) ?? [];
      expect(staleDiags.length).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("red: preview image for deleted content page is flagged as stale", async () => {
    const root = await mkdtemp(join(tmpdir(), "gen-stale-preview-deleted-"));
    try {
      const appDir = await createAppDir(root);
      await mkdir(join(appDir, "public", "preview", "de"), { recursive: true });
      await writeFile(join(appDir, "public", "preview", "de", "founder.png"), "png", "utf8");
      // No src/content/pages/de/founder.md

      const result = await runGeneratedStaleValidate(input, ctx(root));
      expect(result.exitCode).toBe(1);
      const staleDiags = result.data!.diagnostics.filter(
        (d) => d.ruleId === "STALE-01" && d.file === "public/preview/de/founder.png",
      );
      expect(staleDiags.length).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("green: opt-out preview file (leading -) is not flagged", async () => {
    const root = await mkdtemp(join(tmpdir(), "gen-stale-preview-optout-"));
    try {
      const appDir = await createAppDir(root);
      await mkdir(join(appDir, "public", "preview", "de"), { recursive: true });
      await writeFile(join(appDir, "public", "preview", "de", "-founder.png"), "png", "utf8");

      const result = await runGeneratedStaleValidate(input, ctx(root));
      const staleDiags = result.data?.diagnostics.filter(
        (d) => d.ruleId === "STALE-01" && d.file === "public/preview/de/-founder.png",
      ) ?? [];
      expect(staleDiags.length).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("green: empty public/ passes with exitCode 0", async () => {
    const root = await mkdtemp(join(tmpdir(), "gen-stale-empty-"));
    try {
      await createAppDir(root);

      const result = await runGeneratedStaleValidate(input, ctx(root));
      expect(result.exitCode).toBe(0);
      expect(result.data?.diagnostics.length).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("red: old app-name file is flagged as stale", async () => {
    const root = await mkdtemp(join(tmpdir(), "gen-stale-oldname-"));
    try {
      const appDir = await createAppDir(root);
      await writeFile(join(appDir, "public", "webgogol-com-indexnow.txt"), "key", "utf8");

      const result = await runGeneratedStaleValidate(input, ctx(root));
      expect(result.exitCode).toBe(1);
      const staleDiags = result.data!.diagnostics.filter(
        (d) => d.ruleId === "STALE-01" && d.file === "public/webgogol-com-indexnow.txt",
      );
      expect(staleDiags.length).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
