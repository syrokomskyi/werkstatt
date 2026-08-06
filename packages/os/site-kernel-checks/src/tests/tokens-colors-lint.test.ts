import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TOKEN_NAME_SET } from "@warpgogol/tokens";
import { runHardcodedColorLint } from "../checks/tokens.ts";
import { makeTestSiteContext, testInput } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for tokens.colors.lint — scans app-level and packages-level
    CSS for raw colors and undefined --ds-* custom properties (RFC-0725).
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation: 6 fixture tests covering undefined token detection, defined token pass, packages-level scan, missing packages/ui/src, raw color checks, and return data shape.</item>
</CHANGE_SUMMARY>
*/

describe("tokens.colors.lint (RFC-0725)", () => {
  let workspaceRoot: string;
  let appDir: string;
  let stylesDir: string;
  let packagesUiSrc: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "tokens-colors-"));
    appDir = join(workspaceRoot, "apps", "test-app");
    stylesDir = join(appDir, "src", "styles");
    packagesUiSrc = join(workspaceRoot, "packages", "ui", "src");
    await mkdir(stylesDir, { recursive: true });
    await mkdir(packagesUiSrc, { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("detects undefined --ds-* token in packages/ui CSS", async () => {
    const sectionsDir = join(packagesUiSrc, "sections", "test");
    await mkdir(sectionsDir, { recursive: true });
    await writeFile(
      join(sectionsDir, "test.css"),
      ".foo { color: var(--ds-nonexistent-token); }\n",
    );

    const result = await runHardcodedColorLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const violations = result.data!.violations;
    const undefinedFinding = violations.find((v) => v.reason === "undefined-token");
    expect(undefinedFinding).toBeDefined();
    expect(undefinedFinding!.token).toBe("--ds-nonexistent-token");
  });

  it("passes when --ds-* token is defined in TOKEN_NAME_SET", async () => {
    const definedToken = [...TOKEN_NAME_SET][0];
    const sectionsDir = join(packagesUiSrc, "sections", "test");
    await mkdir(sectionsDir, { recursive: true });
    await writeFile(
      join(sectionsDir, "test.css"),
      `.foo { color: var(${definedToken}); }\n`,
    );

    const result = await runHardcodedColorLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    const undefinedFinding = result.data!.violations.find(
      (v) => v.reason === "undefined-token",
    );
    expect(undefinedFinding).toBeUndefined();
  });

  it("scans packages/ui/src/sections CSS for undefined tokens", async () => {
    const sectionsDir = join(packagesUiSrc, "sections", "transparency");
    await mkdir(sectionsDir, { recursive: true });
    await writeFile(
      join(sectionsDir, "transparency-section.css"),
      ".bar { color: var(--ds-color-text-on-accent); }\n",
    );

    const result = await runHardcodedColorLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const undefinedFinding = result.data!.violations.find(
      (v) => v.reason === "undefined-token" && v.token === "--ds-color-text-on-accent",
    );
    expect(undefinedFinding).toBeDefined();
  });

  it("handles missing packages/ui/src with warning, not error", async () => {
    await rm(packagesUiSrc, { recursive: true, force: true });
    await writeFile(join(stylesDir, "test.css"), ".foo { color: var(--ds-color-primary-500); }\n");

    const result = await runHardcodedColorLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    expect(result.data!.findings).toBe(0);
  });

  it("detects raw hex and rgba colors in app styles", async () => {
    await writeFile(
      join(stylesDir, "test.css"),
      ".a { color: #ff0000; }\n.b { background: rgba(255, 0, 0, 0.5); }\n",
    );

    const result = await runHardcodedColorLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const violations = result.data!.violations;
    const hexFinding = violations.find((v) => v.reason === "raw-hex" && v.token === "#ff0000");
    const rgbaFinding = violations.find((v) => v.reason === "raw-rgba");
    expect(hexFinding).toBeDefined();
    expect(rgbaFinding).toBeDefined();
  });

  it("returns data with findings count and violations array", async () => {
    const sectionsDir = join(packagesUiSrc, "sections", "test");
    await mkdir(sectionsDir, { recursive: true });
    await writeFile(
      join(sectionsDir, "test.css"),
      ".foo { color: var(--ds-nonexistent); }\n",
    );
    await writeFile(join(stylesDir, "test.css"), ".bar { color: #abc; }\n");

    const result = await runHardcodedColorLint(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.data).toBeDefined();
    expect(typeof result.data!.findings).toBe("number");
    expect(Array.isArray(result.data!.violations)).toBe(true);
    expect(result.data!.findings).toBe(result.data!.violations.length);
    expect(result.data!.findings).toBeGreaterThanOrEqual(2);
  });
});
