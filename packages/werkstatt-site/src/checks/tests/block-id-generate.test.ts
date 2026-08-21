/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0914: unit tests for block.id.generate migration command — backfill
    missing ids, deduplication, no-heading failure, no-content pass.
  </purpose>
</MODULE_CONTRACT>
*/

import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultIO } from "@warpgogol/werkstatt/kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";
import { runBlockIdGenerate } from "../block-id-generate.ts";

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

async function writeFixtureApp(pages: Array<{ name: string; blocks: string }>): Promise<{
  root: string;
  app: string;
  contentDir: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "block-id-generate-"));
  const app = join(root, "apps", "fixture-app");
  const contentDir = join(app, "src", "content");
  await mkdir(join(contentDir, "pages", "de"), { recursive: true });
  await writeFile(
    join(contentDir, "system.md"),
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
  for (const page of pages) {
    await writeFile(
      join(contentDir, "pages", "de", page.name),
      `---
pageId: home
title: Home
blocks:
${page.blocks}
---
Body
`,
      "utf8",
    );
  }
  return { root, app, contentDir };
}

describe("block.id.generate", () => {
  it("backfills missing block ids from heading", async () => {
    const { root, app } = await writeFixtureApp([
      {
        name: "home.md",
        blocks: `  - type: hero
    props:
      header:
        heading: Unser Ansatz`,
      },
    ]);
    try {
      const result = await runBlockIdGenerate(input, context(root, app));
      expect(result.exitCode ?? 0).toBe(0);
      expect(result.summary).toContain("1 block(s) backfilled");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("appends -2 suffix for duplicate headings within a page", async () => {
    const { root, app } = await writeFixtureApp([
      {
        name: "home.md",
        blocks: `  - type: hero
    props:
      header:
        heading: Fazit
  - type: hero
    props:
      header:
        heading: Fazit`,
      },
    ]);
    try {
      const result = await runBlockIdGenerate(input, context(root, app));
      expect(result.exitCode ?? 0).toBe(0);
      expect(result.summary).toContain("2 block(s) backfilled");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails when a block has no heading and no id", async () => {
    const { root, app } = await writeFixtureApp([
      {
        name: "home.md",
        blocks: `  - type: hero
    props:
      body: No heading here`,
      },
    ]);
    try {
      const result = await runBlockIdGenerate(input, context(root, app));
      expect(result.exitCode).toBe(1);
      const diags = (result.data as { diagnostics?: Array<{ message: string }> }).diagnostics ?? [];
      expect(diags.some((d) => d.message.includes("no heading"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("passes when all blocks already have valid ids", async () => {
    const { root, app } = await writeFixtureApp([
      {
        name: "home.md",
        blocks: `  - id: intro
    type: hero
    props:
      header:
        heading: Introduction`,
      },
    ]);
    try {
      const result = await runBlockIdGenerate(input, context(root, app));
      expect(result.exitCode ?? 0).toBe(0);
      expect(result.summary).toContain("0 block(s) backfilled");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("passes when page has no blocks", async () => {
    const { root, app } = await writeFixtureApp([
      {
        name: "home.md",
        blocks: `  - id: intro
    type: hero
    props:
      header:
        heading: Introduction`,
      },
    ]);
    try {
      const result = await runBlockIdGenerate(input, context(root, app));
      expect(result.exitCode ?? 0).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
