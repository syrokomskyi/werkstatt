import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSectionCssImportValidate } from "../section-framework/css-import.ts";
import { makeTestContext, testInput, unwrapData } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for section.css.import.validate — CSS-IMPORT-01 and
    CSS-NAME-01 rules for colocated CSS import integrity.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0598: initial creation — 7 test cases covering both rules, cross-import exemption, and no-.astro exemption.</item>
</CHANGE_SUMMARY>
*/

describe("section.css.import.validate", () => {
  let workspaceRoot: string;
  let uiSrc: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "css-import-"));
    uiSrc = join(workspaceRoot, "packages", "ui", "src");
    await mkdir(join(uiSrc, "sections", "foo"), { recursive: true });
    await mkdir(join(uiSrc, "components", "bar"), { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("CSS-IMPORT-01 passes when .css is imported by colocated .astro", async () => {
    await writeFile(join(uiSrc, "sections", "foo", "foo-section.css"), ".x { color: red; }\n");
    await writeFile(
      join(uiSrc, "sections", "foo", "foo-section.astro"),
      `---\nimport "./foo-section.css";\n---\n<div>hello</div>\n`,
    );

    const result = await runSectionCssImportValidate(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(0);
    expect(unwrapData(result).violations).toHaveLength(0);
  });

  it("CSS-IMPORT-01 fails when .css is not imported by any .astro", async () => {
    await writeFile(join(uiSrc, "sections", "foo", "foo-section.css"), ".x { color: red; }\n");
    await writeFile(
      join(uiSrc, "sections", "foo", "foo-section.astro"),
      `---\n---\n<div>hello</div>\n`,
    );

    const result = await runSectionCssImportValidate(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(1);
    const violations = unwrapData(result).violations;
    expect(violations.some((v) => v.rule === "CSS-IMPORT-01")).toBe(true);
  });

  it("CSS-IMPORT-01 passes with cross-directory import", async () => {
    await mkdir(join(uiSrc, "components", "effects"), { recursive: true });
    await writeFile(
      join(uiSrc, "components", "effects", "effect-text.css"),
      ".x { color: red; }\n",
    );
    await writeFile(
      join(uiSrc, "components", "bar", "bar.astro"),
      `---\nimport "../effects/effect-text.css";\n---\n<div>hello</div>\n`,
    );

    const result = await runSectionCssImportValidate(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(0);
    expect(unwrapData(result).violations).toHaveLength(0);
  });

  it("CSS-NAME-01 passes when .css filename matches .astro filename", async () => {
    await writeFile(join(uiSrc, "sections", "foo", "foo-section.css"), ".x { color: red; }\n");
    await writeFile(
      join(uiSrc, "sections", "foo", "foo-section.astro"),
      `---\nimport "./foo-section.css";\n---\n<div>hello</div>\n`,
    );

    const result = await runSectionCssImportValidate(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(0);
  });

  it("CSS-NAME-01 fails when .css filename does not match .astro filename and is not imported by same-dir .astro", async () => {
    await writeFile(join(uiSrc, "sections", "foo", "bar.css"), ".x { color: red; }\n");
    await writeFile(
      join(uiSrc, "sections", "foo", "foo-section.astro"),
      `---\n---\n<div>hello</div>\n`,
    );
    await writeFile(
      join(uiSrc, "components", "bar", "bar.astro"),
      `---\nimport "../../sections/foo/bar.css";\n---\n<div>hello</div>\n`,
    );

    const result = await runSectionCssImportValidate(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(1);
    const violations = unwrapData(result).violations;
    expect(violations.some((v) => v.rule === "CSS-NAME-01")).toBe(true);
  });

  it("CSS-NAME-01 is skipped when no .astro exists in the same directory", async () => {
    await mkdir(join(uiSrc, "components", "standalone"), { recursive: true });
    await writeFile(
      join(uiSrc, "components", "standalone", "standalone.css"),
      ".x { color: red; }\n",
    );
    await writeFile(
      join(uiSrc, "components", "bar", "bar.astro"),
      `---\nimport "../standalone/standalone.css";\n---\n<div>hello</div>\n`,
    );

    const result = await runSectionCssImportValidate(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(0);
    expect(unwrapData(result).violations).toHaveLength(0);
  });

  it("CSS-NAME-01 handles multiple .css files in one directory with matching .astro", async () => {
    await mkdir(join(uiSrc, "components", "effects"), { recursive: true });
    await writeFile(
      join(uiSrc, "components", "effects", "effect-host.css"),
      ".x { color: red; }\n",
    );
    await writeFile(
      join(uiSrc, "components", "effects", "effect-text.css"),
      ".y { color: blue; }\n",
    );
    await writeFile(
      join(uiSrc, "components", "effects", "effect-host.astro"),
      `---\nimport "./effect-host.css";\nimport "./effect-text.css";\n---\n<div>hello</div>\n`,
    );

    const result = await runSectionCssImportValidate(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(0);
    expect(unwrapData(result).violations).toHaveLength(0);
  });
});
