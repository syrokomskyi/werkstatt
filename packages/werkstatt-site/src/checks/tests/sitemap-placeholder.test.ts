import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

/*
<MODULE_CONTRACT>
  <purpose>RFC-0907: red/green fixture coverage for sitemap.placeholder.validate (SITEMAP-PH-01).</purpose>
</MODULE_CONTRACT>
*/

vi.mock("@warpgogol/werkstatt-site/paths", () => ({
  requireAstroSitePaths: (context: KernelRuntimeContext) => ({
    appDirectory: (context.site as { directory: string }).directory,
    publicDirectory: join((context.site as { directory: string }).directory, "public"),
    distDirectory: join((context.site as { directory: string }).directory, "dist"),
  }),
}));

const { runSitemapPlaceholderValidate } = await import("../sitemap-placeholder.ts");

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

async function createFixture(
  sitemapFiles: Array<{ path: string; content: string }>,
): Promise<{ root: string; context: KernelRuntimeContext }> {
  const root = await mkdtemp(join(tmpdir(), "sitemap-ph-"));
  const appDir = join(root, "apps", "demo");
  const distClientDir = join(appDir, "dist", "client");

  for (const file of sitemapFiles) {
    const fullPath = join(distClientDir, file.path);
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, file.content, "utf8");
  }

  const context = {
    workspaceRoot: root,
    site: { name: "demo", directory: appDir, toolsDirectory: join(appDir, "tools") },
    siteExplicit: true,
    logger,
    dryRun: false,
    outputFormat: "json",
  } as unknown as KernelRuntimeContext;

  return { root, context };
}

function sitemapXml(urls: string[]): string {
  const urlEntries = urls
    .map((url) => `  <url><loc>${url}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>`;
}

describe("sitemap.placeholder.validate (RFC-0907)", () => {
  let root: string | undefined;

  beforeEach(() => {
    root = undefined;
  });

  afterEach(async () => {
    if (root) {
      await rm(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  it("SITEMAP-PH-01: URL with [slug] placeholder → error", async () => {
    const fixture = await createFixture([
      {
        path: "sitemap-0.xml",
        content: sitemapXml([
          "https://example.com/",
          "https://example.com/leistungen/[slug]/",
        ]),
      },
    ]);
    root = fixture.root;
    const result = await runSitemapPlaceholderValidate(input, fixture.context);
    expect(result.exitCode).toBe(1);
    const diagnostics = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics;
    expect(diagnostics.some((d) => d.ruleId === "SITEMAP-PH-01")).toBe(true);
  });

  it("SITEMAP-PH-01: URL with [version] placeholder → error", async () => {
    const fixture = await createFixture([
      {
        path: "sitemap-0.xml",
        content: sitemapXml([
          "https://example.com/download/[version]/",
        ]),
      },
    ]);
    root = fixture.root;
    const result = await runSitemapPlaceholderValidate(input, fixture.context);
    expect(result.exitCode).toBe(1);
    const diagnostics = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics;
    expect(diagnostics.some((d) => d.ruleId === "SITEMAP-PH-01")).toBe(true);
  });

  it("SITEMAP-PH-01: fully expanded URLs → pass, no diagnostics", async () => {
    const fixture = await createFixture([
      {
        path: "sitemap-0.xml",
        content: sitemapXml([
          "https://example.com/",
          "https://example.com/leistungen/",
          "https://example.com/leistungen/beratung/",
        ]),
      },
    ]);
    root = fixture.root;
    const result = await runSitemapPlaceholderValidate(input, fixture.context);
    expect(result.exitCode).toBe(0);
    const diagnostics = (result.data as { diagnostics: unknown[] }).diagnostics;
    expect(diagnostics).toHaveLength(0);
  });

  it("no sitemap files → skip with info", async () => {
    const fixture = await createFixture([]);
    root = fixture.root;
    const result = await runSitemapPlaceholderValidate(input, fixture.context);
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("skipped");
  });

  it("empty sitemap (no URLs) → skip with info", async () => {
    const fixture = await createFixture([
      {
        path: "sitemap-0.xml",
        content: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>`,
      },
    ]);
    root = fixture.root;
    const result = await runSitemapPlaceholderValidate(input, fixture.context);
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("skipped");
  });
});
