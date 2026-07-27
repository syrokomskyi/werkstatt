import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runVisibilityExprValidate } from "../visibility-expr.ts";
import type { KernelCommandInput } from "@warpgogol/site-kernel";
import { makeTestSiteContext } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for visibility.expr.validate — scans page content
    and feature-graph YAML for invalid VisibilityExpr usages.
  </purpose>
</MODULE_CONTRACT>
*/

describe("visibility.expr.validate", () => {
  let workspaceRoot: string;
  let appDir: string;
  let pagesDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "vis-expr-"));
    appDir = join(workspaceRoot, "apps", "test-app");
    pagesDir = join(appDir, "src", "content", "pages");
    await mkdir(join(pagesDir, "de"), { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("passes when no visibility fields are present", async () => {
    await writeFile(join(pagesDir, "de", "home.md"), "---\ntitle: Home\n---\n# Home\n");

    const input: KernelCommandInput = { flags: {}, argv: [], args: [] };
    const result = await runVisibilityExprValidate(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
  });

  it("passes with a valid visibility expression (object)", async () => {
    await writeFile(
      join(pagesDir, "de", "home.md"),
      "---\ntitle: Home\nvisibility:\n  feature: blog\n---\n# Home\n",
    );

    const input: KernelCommandInput = { flags: {}, argv: [], args: [] };
    const result = await runVisibilityExprValidate(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
  });

  it("fails with an invalid visibility expression (number)", async () => {
    await writeFile(
      join(pagesDir, "de", "home.md"),
      "---\ntitle: Home\nvisibility: 123\n---\n# Home\n",
    );

    const input: KernelCommandInput = { flags: {}, argv: [], args: [] };
    const result = await runVisibilityExprValidate(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
  });

  it("passes when pages dir does not exist", async () => {
    await rm(join(appDir, "src", "content", "pages"), { recursive: true, force: true });

    const input: KernelCommandInput = { flags: {}, argv: [], args: [] };
    const result = await runVisibilityExprValidate(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
  });

  it("fails when context has no site", async () => {
    const ctx = makeTestSiteContext(workspaceRoot, appDir);
    ctx.site = undefined;

    const input: KernelCommandInput = { flags: {}, argv: [], args: [] };
    const result = await runVisibilityExprValidate(input, ctx);

    expect(result.exitCode).toBe(1);
  });
});
