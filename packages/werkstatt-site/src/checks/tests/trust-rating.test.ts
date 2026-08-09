import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTrustRatingValidate } from "../trust-rating.ts";
import type { KernelCommandInput } from "@warpgogol/site-kernel";
import { makeTestSiteContext } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for trust.rating.validate — Bodenstation forbids
    aggregateRating; Sternsystem requires provenance-backed CKL claims.
  </purpose>
</MODULE_CONTRACT>
*/

const BODENSTATION_SYSTEM = `---
mode: bodenstation
title: Test
---
# Test
`;

const STERNSYSTEM_SYSTEM = `---
mode: sternsystem
title: Test
---
# Test
`;

describe("trust.rating.validate", () => {
  let workspaceRoot: string;
  let appDir: string;
  let businessDir: string;
  let contentDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "trust-rating-"));
    appDir = join(workspaceRoot, "apps", "test-app");
    contentDir = join(appDir, "src", "content");
    businessDir = join(contentDir, "business", "de");
    await mkdir(businessDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("fails when context has no site", async () => {
    const ctx = makeTestSiteContext(workspaceRoot, appDir);
    ctx.site = undefined;

    const input: KernelCommandInput = { flags: {}, argv: [] };
    const result = await runTrustRatingValidate(input, ctx);

    expect(result.exitCode).toBe(1);
  });

  it("passes in Bodenstation mode when no aggregateRating", async () => {
    await writeFile(join(businessDir, "company.md"), BODENSTATION_SYSTEM);
    await writeFile(join(contentDir, "page.md"), "---\ntitle: Page\n---\n# Page\n");

    const input: KernelCommandInput = { flags: {}, argv: [] };
    const result = await runTrustRatingValidate(input, makeTestSiteContext(workspaceRoot, appDir));

    expect(result.exitCode).toBe(0);
  });

  it("fails in Bodenstation mode when aggregateRating is present", async () => {
    await writeFile(join(businessDir, "company.md"), BODENSTATION_SYSTEM);
    await writeFile(
      join(contentDir, "page.md"),
      "---\ntitle: Page\naggregateRating: { ratingValue: 4.5 }\n---\n# Page\n",
    );

    const input: KernelCommandInput = { flags: {}, argv: [] };
    const result = await runTrustRatingValidate(input, makeTestSiteContext(workspaceRoot, appDir));

    expect(result.exitCode).toBe(1);
  });

  it("passes in Sternsystem mode when aggregateRating has provenance claim", async () => {
    await writeFile(join(businessDir, "company.md"), STERNSYSTEM_SYSTEM);
    const pageFile = join(contentDir, "page.md");
    await writeFile(
      pageFile,
      "---\ntitle: Page\naggregateRating: { ratingValue: 4.5 }\n---\n# Page\n",
    );
    await writeFile(
      pageFile.replace(/\.md$/, ".claims.yaml"),
      "rating:\n  provenance: external\n  validity:\n    asOf: '2026-01-01'\n",
    );

    const input: KernelCommandInput = { flags: {}, argv: [] };
    const result = await runTrustRatingValidate(input, makeTestSiteContext(workspaceRoot, appDir));

    expect(result.exitCode).toBe(0);
  });

  it("fails in Sternsystem mode when aggregateRating lacks provenance claim", async () => {
    await writeFile(join(businessDir, "company.md"), STERNSYSTEM_SYSTEM);
    await writeFile(
      join(contentDir, "page.md"),
      "---\ntitle: Page\naggregateRating: { ratingValue: 4.5 }\n---\n# Page\n",
    );

    const input: KernelCommandInput = { flags: {}, argv: [] };
    const result = await runTrustRatingValidate(input, makeTestSiteContext(workspaceRoot, appDir));

    expect(result.exitCode).toBe(1);
  });

  it("passes in Sternsystem mode when no aggregateRating present", async () => {
    await writeFile(join(businessDir, "company.md"), STERNSYSTEM_SYSTEM);
    await writeFile(join(contentDir, "page.md"), "---\ntitle: Page\n---\n# Page\n");

    const input: KernelCommandInput = { flags: {}, argv: [] };
    const result = await runTrustRatingValidate(input, makeTestSiteContext(workspaceRoot, appDir));

    expect(result.exitCode).toBe(0);
  });
});
