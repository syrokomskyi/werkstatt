import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNeedMarkersValidate } from "../need-markers.ts";
import type { KernelCommandInput } from "@warpgogol/site-kernel";
import { makeTestSiteContext } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for need.markers.validate — scans built HTML in dist/
    for residual NEED_THIS_<FIELD> placeholders.
  </purpose>
</MODULE_CONTRACT>
*/

describe("need.markers.validate", () => {
  let workspaceRoot: string;
  let appDir: string;
  let distDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "need-markers-"));
    appDir = join(workspaceRoot, "apps", "test-app");
    distDir = join(appDir, "dist");
    await mkdir(distDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("passes when no NEED_THIS_ markers in HTML", async () => {
    await writeFile(join(distDir, "index.html"), "<html><body>Hello</body></html>");

    const input: KernelCommandInput = { flags: {}, argv: [],  };
    const result = await runNeedMarkersValidate(input, makeTestSiteContext(workspaceRoot, appDir));

    expect(result.exitCode).toBe(0);
  });

  it("fails when NEED_THIS_ markers found in HTML", async () => {
    await writeFile(
      join(distDir, "index.html"),
      "<html><body>NEED_THIS_TITLE placeholder</body></html>",
    );

    const input: KernelCommandInput = { flags: {}, argv: [],  };
    const result = await runNeedMarkersValidate(input, makeTestSiteContext(workspaceRoot, appDir));

    expect(result.exitCode).toBe(1);
  });

  it("passes when dist/ does not exist", async () => {
    await rm(distDir, { recursive: true, force: true });

    const input: KernelCommandInput = { flags: {}, argv: [],  };
    const result = await runNeedMarkersValidate(input, makeTestSiteContext(workspaceRoot, appDir));

    expect(result.exitCode).toBe(0);
  });

  it("detects multiple markers in a single file", async () => {
    await writeFile(
      join(distDir, "page.html"),
      "<html><body>NEED_THIS_TITLE and NEED_THIS_HEADING</body></html>",
    );

    const input: KernelCommandInput = { flags: {}, argv: [],  };
    const result = await runNeedMarkersValidate(input, makeTestSiteContext(workspaceRoot, appDir));

    expect(result.exitCode).toBe(1);
    const violations = (result.data as { violations?: string[] }).violations;
    expect(violations).toBeDefined();
    expect(violations!.length).toBeGreaterThanOrEqual(2);
  });

  it("ignores _astro directory", async () => {
    await mkdir(join(distDir, "_astro"), { recursive: true });
    await writeFile(join(distDir, "_astro", "bundle.html"), "<html>NEED_THIS_TITLE</html>");
    await writeFile(join(distDir, "index.html"), "<html>clean</html>");

    const input: KernelCommandInput = { flags: {}, argv: [],  };
    const result = await runNeedMarkersValidate(input, makeTestSiteContext(workspaceRoot, appDir));

    expect(result.exitCode).toBe(0);
  });
});
