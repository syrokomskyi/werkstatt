import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultIO } from "@warpgogol/site-kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import { runPageBlocksValidate } from "../page-blocks-validate.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Fixture tests for page.blocks.extract.validate, covering both a block id
    regression and a valid CMS page so CHECK-FIX-01 cannot regress silently.
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

async function writeFixtureApp(pageBlocksYaml: string): Promise<{ root: string; app: string }> {
  const root = await mkdtemp(join(tmpdir(), "page-blocks-validate-"));
  const app = join(root, "apps", "fixture-app");
  const content = join(app, "src", "content");
  await mkdir(join(content, "pages", "de"), { recursive: true });
  await writeFile(
    join(content, "system.md"),
    `---
app: fixture-app
version: 1.0.0
identity:
  systemStar: Vega
i18n:
  default: de
  supported:
    de:
      name: Deutsch
      hreflang: de-DE
      rtl: false
pages:
  - pageId: home
    semanticType: home
    routes:
      de: ""
    cosmicStar: Vega
    planets: []
---
`,
    "utf8",
  );
  await writeFile(
    join(content, "pages", "de", "home.md"),
    `---
pageId: home
title: Home
blocks:
${pageBlocksYaml}
---
Body
`,
    "utf8",
  );
  return { root, app };
}

describe("page.blocks.extract.validate fixtures", () => {
  it("fails when a page block has no id", async () => {
    const { root, app } = await writeFixtureApp(`  - type: markdown
    props:
      body: Missing id
`);
    try {
      const result = await runPageBlocksValidate(input, context(root, app));
      expect(result.exitCode).toBe(1);
      expect(result.summary).toContain("page.blocks.extract.validate");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("passes when every page block has an id and registered extractor", async () => {
    const { root, app } = await writeFixtureApp(`  - id: intro
    type: markdown
    props:
      body: Ready
`);
    try {
      const result = await runPageBlocksValidate(input, context(root, app));
      expect(result.exitCode ?? 0).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
