import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultIO } from "@gogol/site-kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@gogol/site-kernel";
import { runServicesProjectionValidate } from "../services-projection.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture tests for services.projection.validate, covering missing service
    names and a valid service catalog so CHECK-FIX-01 cannot regress silently.
  </purpose>
</MODULE_CONTRACT>
*/

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

const input = { argv: [], args: [], flags: {} } as unknown as KernelCommandInput;

function context(root: string, appDirectory: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    site: { name: "fixture-app", directory: appDirectory },
    siteExplicit: true,
    logger,
    dryRun: false,
    outputFormat: "json",
    io: createDefaultIO().io,
  } as unknown as KernelRuntimeContext;
}

async function writeFixtureApp(serviceFrontmatter: string): Promise<{ root: string; app: string }> {
  const root = await mkdtemp(join(tmpdir(), "services-projection-"));
  const app = join(root, "apps", "fixture-app");
  const content = join(app, "src", "content");
  await mkdir(join(content, "business", "de", "services"), { recursive: true });
  await writeFile(
    join(content, "system.md"),
    `---
app: fixture-app
version: 1.0.0
i18n:
  default: de
  supported:
    de:
      name: Deutsch
      hreflang: de-DE
      rtl: false
pages: []
---
`,
    "utf8",
  );
  await writeFile(
    join(content, "business", "de", "services", "website.md"),
    `---
slug: website
${serviceFrontmatter}
---
`,
    "utf8",
  );
  return { root, app };
}

describe("services.projection.validate fixtures", () => {
  it("SERVICES-PROJ-01: fails when a service has no name", async () => {
    const { root, app } = await writeFixtureApp("");
    try {
      const result = await runServicesProjectionValidate(input, context(root, app));
      expect(result.exitCode).toBe(1);
      const diagnostics = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics;
      expect(diagnostics.map((d) => d.ruleId)).toContain("SERVICES-PROJ-01");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("passes for a valid service catalog", async () => {
    const { root, app } = await writeFixtureApp("name: Website\n");
    try {
      const result = await runServicesProjectionValidate(input, context(root, app));
      expect(result.exitCode ?? 0).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
