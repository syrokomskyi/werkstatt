/*
<MODULE_CONTRACT>
<purpose>
RFC-0791: Regression tests for .well-known/ route auto-discovery in public.surface.lint.
Verifies that extensionless .well-known/ files (e.g. api-catalog) enter publicPaths
via the complementary glob and no longer trigger PUBTXT-07.
</purpose>
<keywords>RFC-0791, public.surface.lint, PUBTXT-07, well-known, api-catalog, extensionless</keywords>
<responsibilities>
  <item>Verify extensionless .well-known/ file (api-catalog) is discovered via complementary glob.</item>
  <item>Verify .well-known/agent.json (has extension) still works as regression guard.</item>
  <item>Verify missing .well-known/ directory does not cause errors.</item>
</responsibilities>
<non-goals>
  <item>Do not test isPublicTextArtifact directly — covered in shared.ts unit tests.</item>
  <item>Do not test sitemap or manifest route extraction — only .well-known/ auto-discovery.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="tests">Vitest integration cases for RFC-0791 .well-known/ route auto-discovery.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0791: Added regression tests for .well-known/ route auto-discovery via complementary glob.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultIO } from "@warpgogol/werkstatt/kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";
import { runPublicSurfaceLint } from "../public-surface/aggregate.ts";

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

const input = { argv: [], flags: {} } as unknown as KernelCommandInput;

function ctx(root: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    site: {
      name: "test-app",
      directory: root,
      toolsDirectory: join(root, "tools"),
    },
    siteExplicit: false,
    logger,
    dryRun: false,
    outputFormat: "json",
    io: createDefaultIO().io,
  } as unknown as KernelRuntimeContext;
}

const SYSTEM_MD = `---
app: test-app
identity:
  domain: example.com
i18n:
  default: de
  supported:
    de:
      name: Deutsch
      hreflang: de-DE
---
# Test System
`;

function errorMessages(result: { data?: unknown }): string[] {
  const data = result.data as { diagnostics?: Array<{ message: string }> } | undefined;
  return (data?.diagnostics ?? []).map((d) => d.message);
}

async function createFixture(
  root: string,
  options: { wellKnownFiles?: Record<string, string>; llmsLinks?: string } = {},
): Promise<void> {
  const contentDir = join(root, "src", "content");
  const publicDir = join(root, "public");
  await mkdir(contentDir, { recursive: true });
  await mkdir(publicDir, { recursive: true });
  await writeFile(join(contentDir, "system.md"), SYSTEM_MD, "utf8");

  const links =
    options.llmsLinks ??
    "[API Catalog](/.well-known/api-catalog)\n[Agent JSON](/.well-known/agent.json)";
  const llmsTxt = `# Test llms.txt\n\n${links}\n`;
  await writeFile(join(publicDir, "llms.txt"), llmsTxt, "utf8");

  if (options.wellKnownFiles) {
    const wellKnownDir = join(publicDir, ".well-known");
    await mkdir(wellKnownDir, { recursive: true });
    for (const [relPath, content] of Object.entries(options.wellKnownFiles)) {
      const filePath = join(wellKnownDir, relPath);
      const dir = join(filePath, "..");
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, content, "utf8");
    }
  }
}

describe("RFC-0791: .well-known/ route auto-discovery in public.surface.lint", () => {
  it("discovers extensionless .well-known/api-catalog and suppresses PUBTXT-07", async () => {
    const root = await mkdtemp(join(tmpdir(), "rfc-0791-ext-"));
    try {
      await createFixture(root, {
        wellKnownFiles: {
          "api-catalog": '{"openapi":"3.0.0"}',
          "agent.json": '{"name":"test"}',
        },
      });

      const result = await runPublicSurfaceLint(input, ctx(root));
      const errors = errorMessages(result);
      const pubtxt07 = errors.filter((e) => e.includes("PUBTXT-07"));
      expect(pubtxt07).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("discovers .well-known/agent.json (regression guard — already worked via isPublicTextArtifact)", async () => {
    const root = await mkdtemp(join(tmpdir(), "rfc-0791-json-"));
    try {
      await createFixture(root, {
        wellKnownFiles: {
          "agent.json": '{"name":"test"}',
        },
        llmsLinks: "[Agent JSON](/.well-known/agent.json)",
      });

      const result = await runPublicSurfaceLint(input, ctx(root));
      const errors = errorMessages(result);
      const pubtxt07 = errors.filter((e) => e.includes("PUBTXT-07"));
      expect(pubtxt07).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("handles missing .well-known/ directory without errors", async () => {
    const root = await mkdtemp(join(tmpdir(), "rfc-0791-missing-"));
    try {
      await createFixture(root);

      const result = await runPublicSurfaceLint(input, ctx(root));
      const errors = errorMessages(result);
      const pubtxt07 = errors.filter((e) => e.includes("PUBTXT-07"));
      // Links to .well-known/ routes will trigger PUBTXT-07 since the directory
      // doesn't exist — but this is expected behavior. The test verifies no
      // crash or unexpected errors (e.g. no PUBTXT-01, PUBTXT-02, etc.).
      const nonPubtxt07 = errors.filter((e) => !e.includes("PUBTXT-07"));
      expect(nonPubtxt07).toEqual([]);
      // PUBTXT-07 should fire for both links since .well-known/ doesn't exist
      expect(pubtxt07.length).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
