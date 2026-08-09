import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runTextNormalizeApply,
  runTextNormalizeValidate,
  runTextNormalizeRulesList,
} from "../text-normalize.ts";
import type { KernelCommandInput } from "@warpgogol/site-kernel";
import { makeTestContext, makeTestSiteContext } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture-based tests for text.normalize commands — apply (dist mutator),
    validate (warn-only residual), and rules.list (registry enumeration).
  </purpose>
</MODULE_CONTRACT>
*/

const SYSTEM_MD = `---
title: Test Site
i18n:
  default: de
  supported:
    de: true
    en: true
textNormalize:
  enabled: true
---
# Test
`;

describe("text.normalize.apply", () => {
  let workspaceRoot: string;
  let appDir: string;
  let distClient: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "text-norm-"));
    appDir = join(workspaceRoot, "apps", "test-app");
    const contentDir = join(appDir, "src", "content");
    distClient = join(appDir, "dist", "client");
    await mkdir(contentDir, { recursive: true });
    await mkdir(distClient, { recursive: true });
    await writeFile(join(contentDir, "system.md"), SYSTEM_MD);
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("fails when dist/client does not exist and no app specified", async () => {
    const ctx = makeTestSiteContext(workspaceRoot, appDir);
    // Override site to undefined to test the no-app path
    ctx.site = undefined;
    const input: KernelCommandInput = { flags: {}, argv: [] };
    const result = await runTextNormalizeApply(input, ctx);
    expect(result.exitCode).toBe(1);
  });

  it("passes and scans files when dist/client exists", async () => {
    await writeFile(join(distClient, "index.html"), "<html><body>Hello World</body></html>");

    const input: KernelCommandInput = { flags: {}, argv: [] };
    const result = await runTextNormalizeApply(input, makeTestSiteContext(workspaceRoot, appDir));

    expect(result.exitCode).toBe(0);
    expect((result.data as { filesScanned: number }).filesScanned).toBeGreaterThan(0);
  });

  it("skips _astro and cosmic-passport files", async () => {
    await mkdir(join(distClient, "_astro"), { recursive: true });
    await mkdir(join(distClient, ".well-known"), { recursive: true });
    await writeFile(join(distClient, "_astro", "bundle.js"), "console.log('test');");
    await writeFile(join(distClient, ".well-known", "cosmic-passport.json"), '{"key":"value"}');
    await writeFile(join(distClient, "index.html"), "<html>clean</html>");

    const input: KernelCommandInput = { flags: {}, argv: [] };
    const result = await runTextNormalizeApply(input, makeTestSiteContext(workspaceRoot, appDir));

    expect(result.exitCode).toBe(0);
    expect((result.data as { filesScanned: number }).filesScanned).toBe(1);
  });
});

describe("text.normalize.validate", () => {
  let workspaceRoot: string;
  let appDir: string;
  let distClient: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "text-norm-v-"));
    appDir = join(workspaceRoot, "apps", "test-app");
    const contentDir = join(appDir, "src", "content");
    distClient = join(appDir, "dist", "client");
    await mkdir(contentDir, { recursive: true });
    await mkdir(distClient, { recursive: true });
    await writeFile(join(contentDir, "system.md"), SYSTEM_MD);
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("always exits 0 (warn-only, never gates)", async () => {
    await writeFile(join(distClient, "index.html"), "<html><body>Hello</body></html>");

    const input: KernelCommandInput = { flags: {}, argv: [] };
    const result = await runTextNormalizeValidate(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
  });

  it("warns when dist/client is missing", async () => {
    await rm(distClient, { recursive: true, force: true });

    const input: KernelCommandInput = { flags: {}, argv: [] };
    const result = await runTextNormalizeValidate(
      input,
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    const data = result.data as { diagnostics: Array<{ message: string }> };
    expect(data.diagnostics.some((d) => d.message.includes("dist/client missing"))).toBe(true);
  });
});

describe("text.normalize.rules.list", () => {
  it("enumerates the signal registry and exits 0", async () => {
    const input: KernelCommandInput = { flags: {}, argv: [] };
    const ctx = makeTestContext("/tmp");

    const result = await runTextNormalizeRulesList(input, ctx);

    expect(result.exitCode).toBe(0);
    const data = result.data as { diagnostics: unknown[] };
    expect(data.diagnostics.length).toBeGreaterThan(0);
  });
});
