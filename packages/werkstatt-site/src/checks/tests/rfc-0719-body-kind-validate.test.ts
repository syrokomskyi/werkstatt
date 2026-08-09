import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultIO } from "@warpgogol/werkstatt/kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";
import { runPageBlockValidate } from "../page-block.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0719: Unit tests for B-07 body.kind mismatch check in page.block.validate.
    Tests the full integration path: fixture manifest YAML → composed schema → B-07 check.
    Covers: kind match, kind mismatch, composite skip, missing body.
  </purpose>
  <CHANGE_SUMMARY>
    <item>RFC-0719: Initial creation — 4 test cases for B-07 body.kind validation.</item>
  </CHANGE_SUMMARY>
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

const SYSTEM_MD = `---
app: fixture-app
version: 1.0.0
identity:
  systemStar: Vega
  biome: default
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
    planets:
      - cosmicPlanet: Tethys
        pin: latest
      - cosmicPlanet: Europa
        pin: latest
---
`;

const LIST_MANIFEST = `id: test-list-section
uniName: test-list-section
layer: section
semanticId: test-list
archetype: test-list
cosmicName: Tethys
role: test-list
version: 1.0.0
intent:
  - signal-transparency
industryFit: []
contentSchemaKey: null

propsSchemaCompose:
  - section-visual
  - section-header
  - body-list

propsSchema:
  type: object
  additionalProperties: false
`;

const COMPOSITE_MANIFEST = `id: test-composite-section
uniName: test-composite-section
layer: section
semanticId: test-composite
archetype: test-composite
cosmicName: Europa
role: test-composite
version: 1.0.0
intent:
  - convert-visitor
industryFit: []
contentSchemaKey: null

propsSchemaCompose:
  - section-visual
  - section-header

propsSchema:
  type: object
  additionalProperties: false
`;

function pageMarkdown(blocksYaml: string): string {
  return `---
kind: page
pageId: home
cosmicStar: Vega
title: Home
description: Test page
lang: de
blocks:
${blocksYaml}
---
`;
}

function hasB07Violation(result: { data?: unknown }): boolean {
  const diagnostics =
    (result.data as { diagnostics?: Array<{ message: string }> } | undefined)?.diagnostics ?? [];
  return diagnostics.some((d) => d.message.includes("B-07"));
}

function findB07Violation(result: { data?: unknown }): { message: string } | undefined {
  const diagnostics =
    (result.data as { diagnostics?: Array<{ message: string }> } | undefined)?.diagnostics ?? [];
  return diagnostics.find((d) => d.message.includes("B-07"));
}

async function createFixture(): Promise<{ root: string; app: string }> {
  const root = await mkdtemp(join(tmpdir(), "rfc-0719-body-kind-"));
  const app = join(root, "apps", "fixture-app");
  const content = join(app, "src", "content");
  const packagesUiSrc = join(root, "packages", "werkstatt-site", "src", "domain", "ui", "src");

  await mkdir(join(content, "pages", "de"), { recursive: true });
  await mkdir(join(packagesUiSrc, "sections", "test-list"), { recursive: true });
  await mkdir(join(packagesUiSrc, "sections", "test-composite"), { recursive: true });

  await writeFile(join(content, "system.md"), SYSTEM_MD, "utf8");
  await writeFile(
    join(packagesUiSrc, "sections", "test-list", "test-list-section.manifest.yaml"),
    LIST_MANIFEST,
    "utf8",
  );
  await writeFile(
    join(packagesUiSrc, "sections", "test-composite", "test-composite-section.manifest.yaml"),
    COMPOSITE_MANIFEST,
    "utf8",
  );

  return { root, app };
}

describe("RFC-0719: B-07 body.kind validation", () => {
  it("does not fire when body.kind matches expected bodyKind from manifest", async () => {
    const { root, app } = await createFixture();
    try {
      await writeFile(
        join(app, "src", "content", "pages", "de", "home.md"),
        pageMarkdown(`  - id: test-block
    type: Tethys
    props:
      body:
        kind: list
        items:
          - text: Test item
`),
        "utf8",
      );

      const result = await runPageBlockValidate(input, context(root, app));
      expect(hasB07Violation(result)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fires B-07 when body.kind does not match expected bodyKind from manifest", async () => {
    const { root, app } = await createFixture();
    try {
      await writeFile(
        join(app, "src", "content", "pages", "de", "home.md"),
        pageMarkdown(`  - id: test-block
    type: Tethys
    props:
      body:
        kind: paragraphs
`),
        "utf8",
      );

      const result = await runPageBlockValidate(input, context(root, app));
      expect(hasB07Violation(result)).toBe(true);
      const b07 = findB07Violation(result);
      expect(b07?.message).toContain('body.kind="paragraphs"');
      expect(b07?.message).toContain('bodyKind="list"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not fire B-07 for composite archetype (no body fragment in schema)", async () => {
    const { root, app } = await createFixture();
    try {
      await writeFile(
        join(app, "src", "content", "pages", "de", "home.md"),
        pageMarkdown(`  - id: test-block
    type: Europa
    props:
      header:
        heading: Test
`),
        "utf8",
      );

      const result = await runPageBlockValidate(input, context(root, app));
      expect(hasB07Violation(result)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not fire B-07 when body field is missing (B-03 handles required check)", async () => {
    const { root, app } = await createFixture();
    try {
      await writeFile(
        join(app, "src", "content", "pages", "de", "home.md"),
        pageMarkdown(`  - id: test-block
    type: Tethys
    props: {}
`),
        "utf8",
      );

      const result = await runPageBlockValidate(input, context(root, app));
      expect(hasB07Violation(result)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
