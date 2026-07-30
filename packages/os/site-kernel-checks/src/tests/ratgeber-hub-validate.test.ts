/*
<MODULE_CONTRACT>
<purpose>
RFC-0500: tests for ratgeber-hub-validate — tests RG-HUB-01..08 rules
with in-memory filesystem fixtures and synthetic surface artifacts.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0500: initial hub validator tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runRatgeberHubValidate } from "../ratgeber-hub-validate.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

async function writeFile(dir: string, rel: string, content: string): Promise<void> {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf-8");
}

function makeContext(workspaceRoot: string, appDir: string): KernelRuntimeContext {
  return {
    workspaceRoot,
    site: { name: "test-site", directory: appDir },
    commandName: "ratgeber.hub.validate",
    flags: {},
  } as unknown as KernelRuntimeContext;
}

const EMPTY_INPUT: KernelCommandInput = { flags: {} } as unknown as KernelCommandInput;

const SYSTEM_MD = `---
cosmicStar: Vega
i18n:
  default: de
  supported:
    de:
      name: Deutsch
      hreflang: de-DE
    uk:
      name: Ukraїnska
      hreflang: uk-UA
---
`;

function hubEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    surfaceId: "ratgeber",
    pageId: "ratgeber:hub",
    depth: 0,
    indexable: true,
    noindex: false,
    semanticType: "collection",
    axes: {},
    routes: { de: "ratgeber", uk: "porady" },
    recordCount: 1,
    page: {
      kind: "page",
      cosmicStar: "Vega",
      title: "Ratgeber",
      description: "Test hub",
      lang: "de",
      blocks: [
        { type: "hero", props: { lead: "Welcome" } },
        { type: "audience-cards", props: { cards: [] } },
        { type: "markdown", props: { content: "Redaktion info" } },
        { type: "final-cta", props: {} },
      ],
    },
    ...overrides,
  };
}

function articleEntry(
  pageId: string,
  articleSlug: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    surfaceId: "ratgeber",
    pageId,
    depth: 1,
    indexable: true,
    noindex: false,
    semanticType: "article",
    axes: { article: articleSlug },
    routes: { de: `ratgeber/${articleSlug}` },
    recordCount: 1,
    article: { publishedAt: "2026-01-01", author: "test-author", tags: ["test"] },
    page: {
      kind: "page",
      cosmicStar: "Vega",
      title: "Test Article",
      description: "A summary",
      lang: "de",
      blocks: [],
    },
    ...overrides,
  };
}

function artifactYaml(entries: Record<string, unknown>[]): string {
  return `generatedAt: "2026-07-23T00:00:00Z"\nentries:\n${entries
    .map((e) => `  - ${JSON.stringify(e)}`)
    .join("\n")}\n`;
}

let tmpDir: string;
let appDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rg-hub-test-"));
  appDir = path.join(tmpDir, "test-site");
  await fs.mkdir(appDir, { recursive: true });
  await writeFile(appDir, "src/content/system.md", SYSTEM_MD);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("no surface artifact → pass (skipped)", async () => {
  const result = await runRatgeberHubValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(0);
});

test("RG-HUB-01: hub semanticType not collection → error", async () => {
  await writeFile(
    appDir,
    "src/surface.generated.yaml",
    artifactYaml([hubEntry({ semanticType: "content" })]),
  );
  const result = await runRatgeberHubValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const hub01 = diags.filter((d) => d.ruleId === "RG-HUB-01");
  expect(hub01.length).toBe(1);
  expect(hub01[0]!.severity).toBe("error");
  expect(hub01[0]!.message).toContain("collection");
});

test("RG-HUB-02: hub missing required blocks → error", async () => {
  await writeFile(
    appDir,
    "src/surface.generated.yaml",
    artifactYaml([
      hubEntry({
        page: {
          kind: "page",
          cosmicStar: "Vega",
          title: "Ratgeber",
          description: "Test hub",
          lang: "de",
          blocks: [{ type: "hero", props: {} }],
        },
      }),
    ]),
  );
  const result = await runRatgeberHubValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const hub02 = diags.filter((d) => d.ruleId === "RG-HUB-02");
  expect(hub02.length).toBeGreaterThanOrEqual(1);
  expect(hub02[0]!.severity).toBe("error");
});

test("RG-HUB-02: hub with unexpected block type → error", async () => {
  await writeFile(
    appDir,
    "src/surface.generated.yaml",
    artifactYaml([
      hubEntry({
        page: {
          kind: "page",
          cosmicStar: "Vega",
          title: "Ratgeber",
          description: "Test hub",
          lang: "de",
          blocks: [
            { type: "hero", props: {} },
            { type: "audience-cards", props: {} },
            { type: "markdown", props: {} },
            { type: "final-cta", props: {} },
            { type: "unknown-block", props: {} },
          ],
        },
      }),
    ]),
  );
  const result = await runRatgeberHubValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const hub02 = diags.filter(
    (d) => d.ruleId === "RG-HUB-02" && d.message.includes("unexpected"),
  );
  expect(hub02.length).toBe(1);
  expect(hub02[0]!.severity).toBe("error");
  expect(hub02[0]!.message).toContain("unknown-block");
});

test("RG-HUB-03: article missing title or summary → error", async () => {
  await writeFile(
    appDir,
    "src/surface.generated.yaml",
    artifactYaml([
      hubEntry(),
      articleEntry("ratgeber:test", "test", {
        page: {
          kind: "page",
          cosmicStar: "Vega",
          title: "",
          description: "",
          lang: "de",
          blocks: [],
        },
      }),
    ]),
  );
  const result = await runRatgeberHubValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const hub03 = diags.filter((d) => d.ruleId === "RG-HUB-03");
  expect(hub03.length).toBe(1);
  expect(hub03[0]!.severity).toBe("error");
});

test("RG-HUB-05: article slug matches reserved slug → error", async () => {
  await writeFile(
    appDir,
    "src/surface.generated.yaml",
    artifactYaml([hubEntry(), articleEntry("ratgeber:redaktion", "redaktion")]),
  );
  const result = await runRatgeberHubValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const hub05 = diags.filter((d) => d.ruleId === "RG-HUB-05");
  expect(hub05.length).toBe(1);
  expect(hub05[0]!.severity).toBe("error");
  expect(hub05[0]!.message).toContain("redaktion");
});

test("RG-HUB-07: article with prohibited commercial claim → error", async () => {
  await writeFile(
    appDir,
    "src/surface.generated.yaml",
    artifactYaml([
      hubEntry(),
      articleEntry("ratgeber:test", "test", {
        page: {
          kind: "page",
          cosmicStar: "Vega",
          title: "Best Price Guaranteed",
          description: "We are the leading provider",
          lang: "de",
          blocks: [],
        },
      }),
    ]),
  );
  const result = await runRatgeberHubValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const hub07 = diags.filter((d) => d.ruleId === "RG-HUB-07");
  expect(hub07.length).toBeGreaterThanOrEqual(1);
  expect(hub07[0]!.severity).toBe("error");
});

test("RG-HUB-08: article missing article metadata → error", async () => {
  await writeFile(
    appDir,
    "src/surface.generated.yaml",
    artifactYaml([
      hubEntry(),
      articleEntry("ratgeber:test", "test", { article: undefined }),
    ]),
  );
  const result = await runRatgeberHubValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const hub08 = diags.filter((d) => d.ruleId === "RG-HUB-08");
  expect(hub08.length).toBeGreaterThanOrEqual(1);
  expect(hub08[0]!.severity).toBe("error");
});

test("clean hub with valid articles → pass", async () => {
  await writeFile(
    appDir,
    "src/surface.generated.yaml",
    artifactYaml([hubEntry(), articleEntry("ratgeber:test", "test")]),
  );
  const result = await runRatgeberHubValidate(EMPTY_INPUT, makeContext(tmpDir, appDir));
  const diags = result.data?.diagnostics ?? [];
  const errors = diags.filter((d) => d.severity === "error");
  expect(errors.map((e) => e.ruleId + ": " + e.message)).toEqual([]);
});
