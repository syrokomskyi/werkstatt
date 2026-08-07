import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runContentReferencesValidate } from "../content-references.ts";
import { makeTestSiteContext, testInput } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for content.references.validate — covers RFC-0723:
    REF-04 promotion to error for known collections in mixed strings,
    and isInsideFormula skip for refs inside =(…) formulas.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation: RFC-0723 tests for REF-04 promotion and isInsideFormula skip.</item>
</CHANGE_SUMMARY>
*/

describe("content.references.validate — RFC-0723", () => {
  let workspaceRoot: string;
  let appDir: string;
  let pagesDir: string;
  let contentDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "content-refs-"));
    appDir = join(workspaceRoot, "apps", "test-app");
    contentDir = join(appDir, "src", "content");
    pagesDir = join(contentDir, "pages");
    await mkdir(join(pagesDir, "de"), { recursive: true });
    await writeFile(
      join(contentDir, "system.md"),
      "---\ni18n:\n  default: de\n  supported:\n    de:\n      name: Deutsch\n      hreflang: de\n---\n# Test\n",
    );
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  async function writeIndex(collections: string[]) {
    const indexPath = join(appDir, "src", "content-ref-index.generated.yaml");
    const entriesYaml = collections
      .map(
        (c) =>
          `  ${c}:\n    test-file:\n      de:\n        tagline: Test\n        price:\n          setup: "200"\n          monthly: "70"`,
      )
      .join("\n");
    await writeFile(
      indexPath,
      `version: 1\ngeneratedAt: "2026-01-01"\ncollections: ${JSON.stringify(collections)}\nentries:\n${entriesYaml}\n`,
      "utf8",
    );
  }

  it("RFC-0723: REF-04 is an error (not warning) for known collection in mixed string", async () => {
    await writeIndex(["business-profile"]);
    await writeFile(
      join(pagesDir, "de", "test.md"),
      "---\npageId: test\ntitle: Test\n---\nAb business-profile.test-file.tagline\n",
    );

    const result = await runContentReferencesValidate(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const data = result.data as { diagnostics?: Array<{ message: string }> };
    const ref04 = (data.diagnostics ?? []).find((d) => d.message.includes("REF-04"));
    expect(ref04).toBeDefined();
  });

  it("RFC-0723: skips REF-04 for refs inside =(…) formula expressions", async () => {
    await writeIndex(["business-profile"]);
    await writeFile(
      join(pagesDir, "de", "test.md"),
      "---\npageId: test\ntitle: Test\n---\nAb =(business-profile.test-file.tagline)\n",
    );

    const result = await runContentReferencesValidate(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    const data = result.data as { diagnostics?: Array<{ message: string }> };
    const ref04 = (data.diagnostics ?? []).find((d) => d.message.includes("REF-04"));
    expect(ref04).toBeUndefined();
  });

  it("RFC-0730: skips REF-04 for refs inside =(… | pipe) formula expressions", async () => {
    await writeIndex(["business-profile"]);
    await writeFile(
      join(pagesDir, "de", "test.md"),
      "---\npageId: test\ntitle: Test\n---\nAb =(business-profile.test-file.tagline | money) monatlich\n",
    );

    const result = await runContentReferencesValidate(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    const data = result.data as { diagnostics?: Array<{ message: string }> };
    const ref04 = (data.diagnostics ?? []).find((d) => d.message.includes("REF-04"));
    expect(ref04).toBeUndefined();
  });

  it("RFC-0723: pure refs (entire line is the reference) do not trigger REF-04", async () => {
    await writeIndex(["business-profile"]);
    await writeFile(
      join(pagesDir, "de", "test.md"),
      "---\npageId: test\ntitle: Test\n---\nbusiness-profile.test-file.tagline\n",
    );

    const result = await runContentReferencesValidate(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    const data = result.data as { diagnostics?: Array<{ message: string }> };
    const ref04 = (data.diagnostics ?? []).find((d) => d.message.includes("REF-04"));
    expect(ref04).toBeUndefined();
  });
});
