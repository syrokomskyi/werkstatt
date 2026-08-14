import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCssMobileLayoutLint } from "../css-mobile-layout-lint.ts";
import { makeTestSiteContext, testInput, unwrapData } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for css.mobile-layout.lint — scans .css files and
    .astro inline style blocks for six mobile layout anti-patterns
    (MOBILE-CSS-01..06).
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation: 13 fixture tests covering all 6 rules, @media suppression, warning mode, .astro extraction, and clean-pass scenarios.</item>
</CHANGE_SUMMARY>
*/

describe("css.mobile-layout.lint", () => {
  let workspaceRoot: string;
  let appDir: string;
  let stylesDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "css-mob-"));
    appDir = join(workspaceRoot, "apps", "test-app");
    stylesDir = join(appDir, "src", "styles");
    await mkdir(stylesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("passes when CSS has no violations", async () => {
    await writeFile(join(stylesDir, "global.css"), ".foo { color: red; }\n");

    const result = await runCssMobileLayoutLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    expect(unwrapData(result).violations).toBe(0);
  });

  it("detects MOBILE-CSS-01: height 100vh without 100dvh", async () => {
    await writeFile(join(stylesDir, "global.css"), ".hero { height: 100vh; }\n");

    const result = await runCssMobileLayoutLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const data = unwrapData(result);
    expect(data.violations).toBeGreaterThanOrEqual(1);
    expect(data.violationsByRule["MOBILE-CSS-01"]).toBeGreaterThanOrEqual(1);
  });

  it("passes MOBILE-CSS-01 when 100dvh fallback is present", async () => {
    await writeFile(
      join(stylesDir, "global.css"),
      ".hero { height: 100vh; height: 100dvh; }\n",
    );

    const result = await runCssMobileLayoutLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    expect(unwrapData(result).violations).toBe(0);
  });

  it("suppresses MOBILE-CSS-01 inside @media (min-width: 1024px)", async () => {
    await writeFile(
      join(stylesDir, "global.css"),
      "@media (min-width: 1024px) { .hero { height: 100vh; } }\n",
    );

    const result = await runCssMobileLayoutLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    expect(unwrapData(result).violations).toBe(0);
  });

  it("detects MOBILE-CSS-02: width 100vw with padding", async () => {
    await writeFile(
      join(stylesDir, "global.css"),
      ".full { width: 100vw; padding: 16px; }\n",
    );

    const result = await runCssMobileLayoutLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const data = unwrapData(result);
    expect(data.violationsByRule["MOBILE-CSS-02"]).toBeGreaterThanOrEqual(1);
  });

  it("detects MOBILE-CSS-03: fixed width >380px without max-width", async () => {
    await writeFile(join(stylesDir, "global.css"), ".card { width: 500px; }\n");

    const result = await runCssMobileLayoutLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const data = unwrapData(result);
    expect(data.violationsByRule["MOBILE-CSS-03"]).toBeGreaterThanOrEqual(1);
  });

  it("passes MOBILE-CSS-03 when max-width: 100% is present", async () => {
    await writeFile(
      join(stylesDir, "global.css"),
      ".card { width: 500px; max-width: 100%; }\n",
    );

    const result = await runCssMobileLayoutLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    expect(unwrapData(result).violations).toBe(0);
  });

  it("detects MOBILE-CSS-04: negative margin on body", async () => {
    await writeFile(join(stylesDir, "global.css"), "body { margin: -10px; }\n");

    const result = await runCssMobileLayoutLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const data = unwrapData(result);
    expect(data.violationsByRule["MOBILE-CSS-04"]).toBeGreaterThanOrEqual(1);
  });

  it("detects MOBILE-CSS-05: position fixed with width >430px", async () => {
    await writeFile(
      join(stylesDir, "global.css"),
      ".overlay { position: fixed; width: 500px; }\n",
    );

    const result = await runCssMobileLayoutLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const data = unwrapData(result);
    expect(data.violationsByRule["MOBILE-CSS-05"]).toBeGreaterThanOrEqual(1);
  });

  it("detects MOBILE-CSS-06: white-space nowrap without overflow-wrap (warning severity)", async () => {
    await writeFile(
      join(stylesDir, "global.css"),
      ".label { white-space: nowrap; }\n",
    );

    const result = await runCssMobileLayoutLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    const data = unwrapData(result);
    expect(data.violationsByRule["MOBILE-CSS-06"]).toBeGreaterThanOrEqual(1);
    expect(result.exitCode).toBe(0);
  });

  it("passes MOBILE-CSS-06 when overflow-wrap is present", async () => {
    await writeFile(
      join(stylesDir, "global.css"),
      ".label { white-space: nowrap; overflow-wrap: break-word; }\n",
    );

    const result = await runCssMobileLayoutLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    expect(unwrapData(result).violations).toBe(0);
  });

  it("detects violations inside .astro <style> blocks", async () => {
    const pagesDir = join(appDir, "src", "pages");
    await mkdir(pagesDir, { recursive: true });
    await writeFile(
      join(pagesDir, "index.astro"),
      '<style>.hero { height: 100vh; }</style>\n',
    );

    const result = await runCssMobileLayoutLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const data = unwrapData(result);
    expect(data.violationsByRule["MOBILE-CSS-01"]).toBeGreaterThanOrEqual(1);
  });

  it("exits 0 in warning mode even with error-severity violations", async () => {
    await writeFile(join(stylesDir, "global.css"), ".hero { height: 100vh; }\n");

    const result = await runCssMobileLayoutLint(
      { flags: { mode: "warning" }, argv: [] },
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    const data = unwrapData(result);
    expect(data.violations).toBeGreaterThanOrEqual(1);
  });

  it("passes when styles dir does not exist", async () => {
    await rm(stylesDir, { recursive: true, force: true });

    const result = await runCssMobileLayoutLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    expect(unwrapData(result).files).toBe(0);
  });
});
