/*
<MODULE_CONTRACT>
  <purpose>
    ADR-0011: Regression test for preview image glob leak in
    generated-stale-validate.ts. PREVIEW_DIR entries from
    GENERATOR_OWNERSHIP_MAP were included in expectedPaths,
    bypassing the content-aware preview resolver. This caused
    orphaned preview images (whose content page was deleted) to
    be considered "expected" and never flagged as stale.
  </purpose>
  <keywords>ADR-0011, preview glob leak, PREVIEW_DIR, STALE-01, content-aware resolver</keywords>
  <responsibilities>
    <item>Verify orphaned preview image matching ownership map glob is flagged as STALE-01.</item>
    <item>Verify preview image for existing content page is NOT flagged (content-aware resolver works).</item>
    <item>Verify nested preview path (cosmic/) for deleted content page is flagged as STALE-01.</item>
  </responsibilities>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>ADR-0011: add regression test for preview image glob leak in generated-stale-validate.</item>
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

describe("ADR-0011: preview image glob leak — PREVIEW_DIR entries excluded from expectedPaths", () => {
  it("STALE-01: orphaned preview image matching ownership glob is flagged (not leaked into expectedPaths)", async () => {
    const root = await mkdtemp(join(tmpdir(), "adr-0011-glob-leak-orphan-"));
    try {
      const appDir = await createAppDir(root);
      // Create a preview image that matches the ownership map glob pattern
      // public/preview/{lang}/{slug}.png — but no content page exists.
      // Before the fix: the PREVIEW_DIR entry from GENERATOR_OWNERSHIP_MAP
      // would add public/preview/*/*.png to expectedPaths, causing this
      // file to be considered "expected" and NOT flagged as stale.
      // After the fix: PREVIEW_DIR entries are skipped, so the content-aware
      // resolver checks if the content page exists — it doesn't → STALE-01.
      await mkdir(join(appDir, "public", "preview", "de"), { recursive: true });
      await writeFile(join(appDir, "public", "preview", "de", "orphaned.png"), "png", "utf8");

      const result = await runGeneratedStaleValidate(input, ctx(root));
      expect(result.exitCode).toBe(1);
      const data = result.data as { diagnostics?: Array<{ file?: string; ruleId?: string }> };
      const staleDiags = (data?.diagnostics ?? []).filter(
        (d) => d.ruleId === "STALE-01" && d.file === "public/preview/de/orphaned.png",
      );
      expect(staleDiags.length).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("STALE-01: preview image for existing content page is NOT flagged (content-aware resolver works)", async () => {
    const root = await mkdtemp(join(tmpdir(), "adr-0011-glob-leak-existing-"));
    try {
      const appDir = await createAppDir(root);
      await mkdir(join(appDir, "public", "preview", "de"), { recursive: true });
      await mkdir(join(appDir, "src", "content", "pages", "de"), { recursive: true });
      await writeFile(join(appDir, "public", "preview", "de", "founder.png"), "png", "utf8");
      await writeFile(
        join(appDir, "src", "content", "pages", "de", "founder.md"),
        "# Founder",
        "utf8",
      );

      const result = await runGeneratedStaleValidate(input, ctx(root));
      const data = result.data as { diagnostics?: Array<{ file?: string; ruleId?: string }> };
      const staleDiags = (data?.diagnostics ?? []).filter(
        (d) => d.ruleId === "STALE-01" && d.file === "public/preview/de/founder.png",
      );
      expect(staleDiags.length).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("STALE-01: nested preview path (cosmic/) for deleted content page is flagged", async () => {
    const root = await mkdtemp(join(tmpdir(), "adr-0011-glob-leak-nested-"));
    try {
      const appDir = await createAppDir(root);
      // Create a nested preview image: public/preview/de/cosmic/passport.png
      // The ownership map glob public/preview/{lang}/{slug}.png would NOT match
      // this path (extra directory segment), but the content-aware resolver
      // should still check if src/content/pages/de/cosmic/passport.md exists.
      await mkdir(join(appDir, "public", "preview", "de", "cosmic"), { recursive: true });
      await writeFile(
        join(appDir, "public", "preview", "de", "cosmic", "passport.png"),
        "png",
        "utf8",
      );
      // No content page at src/content/pages/de/cosmic/passport.md

      const result = await runGeneratedStaleValidate(input, ctx(root));
      expect(result.exitCode).toBe(1);
      const data = result.data as { diagnostics?: Array<{ file?: string; ruleId?: string }> };
      const staleDiags = (data?.diagnostics ?? []).filter(
        (d) => d.ruleId === "STALE-01" && d.file === "public/preview/de/cosmic/passport.png",
      );
      expect(staleDiags.length).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
