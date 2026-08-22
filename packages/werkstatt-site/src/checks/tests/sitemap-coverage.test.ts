import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

/*
<MODULE_CONTRACT>
  <purpose>RFC-0907: red/green fixture coverage for sitemap.coverage.validate (SITEMAP-COV-01, SITEMAP-COV-02).</purpose>
</MODULE_CONTRACT>
*/

vi.mock("@warpgogol/werkstatt-site/paths", () => ({
  requireAstroSitePaths: (context: KernelRuntimeContext) => ({
    appDirectory: (context.site as { directory: string }).directory,
    publicDirectory: join((context.site as { directory: string }).directory, "public"),
    distDirectory: join((context.site as { directory: string }).directory, "dist"),
  }),
}));

vi.mock("@warpgogol/werkstatt-site/share/astro/canonical-url", () => ({
  canonicalPageUrl: (
    input: { lang: string; route: string; kind: string },
    opts: { baseUrl: string },
  ) => {
    const base = opts.baseUrl.replace(/\/+$/, "");
    if (input.route === "" || input.route === "/") return `${base}/`;
    return `${base}/${input.route}/`;
  },
}));

vi.mock("../lib/astro-site-url.ts", () => ({
  readAstroSiteUrl: async () => "https://example.com",
}));

vi.mock("../lib/i18n.ts", () => ({
  defaultLanguageFromManifest: () => "de",
}));

const { runSitemapCoverageValidate } = await import("../sitemap-coverage.ts");

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
  systemMd: string | null,
  sitemapFiles: Array<{ path: string; content: string }>,
): Promise<{ root: string; context: KernelRuntimeContext }> {
  const root = await mkdtemp(join(tmpdir(), "sitemap-cov-"));
  const appDir = join(root, "apps", "demo");
  const distClientDir = join(appDir, "dist", "client");
  const contentDir = join(appDir, "src", "content");

  if (systemMd !== null) {
    await mkdir(contentDir, { recursive: true });
    await writeFile(join(contentDir, "system.md"), systemMd, "utf8");
  }

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

function systemMdWithPages(
  pages: Array<{
    pageId: string;
    route: string;
    sitemapExcluded?: boolean;
    sitemapIncludeFalse?: boolean;
  }>,
): string {
  const pagesYaml = pages
    .map((p) => {
      let block = `  - pageId: ${p.pageId}\n    routes:\n      de: ${p.route === "" ? '""' : p.route}\n    cosmicStar: sun\n    planets: []`;
      if (p.sitemapExcluded) {
        block += `\n    output:\n      sitemap: false`;
      }
      if (p.sitemapIncludeFalse) {
        block += `\n    output:\n      sitemap:\n        include: false`;
      }
      return block;
    })
    .join("\n");

  return `---
i18n:
  default: de
  supported:
    de: true
identity:
  name: Demo
  biome: test
  tagline: Test
constellations: []
clientEditable: []
growth:
  vendor:
    adapter: none
    options: {}
  funnels: []
  experiments: []
release:
  passport:
    enabled: false
    indexable: false
    keyVersion: "1"
    heartbeatUrl: ""
pages:
${pagesYaml}
---

# System
`;
}

describe("sitemap.coverage.validate (RFC-0907)", () => {
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

  it("SITEMAP-COV-01: indexable page missing from sitemap → error", async () => {
    const fixture = await createFixture(
      systemMdWithPages([
        { pageId: "home", route: "" },
        { pageId: "leistungen", route: "leistungen" },
      ]),
      [
        {
          path: "sitemap-0.xml",
          content: sitemapXml(["https://example.com/"]),
        },
      ],
    );
    root = fixture.root;
    const result = await runSitemapCoverageValidate(input, fixture.context);
    expect(result.exitCode).toBe(1);
    const diagnostics = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics;
    expect(diagnostics.some((d) => d.ruleId === "SITEMAP-COV-01")).toBe(true);
  });

  it("SITEMAP-COV-02: sitemap URL not in expected set → warning", async () => {
    const fixture = await createFixture(
      systemMdWithPages([
        { pageId: "home", route: "" },
        { pageId: "leistungen", route: "leistungen" },
      ]),
      [
        {
          path: "sitemap-0.xml",
          content: sitemapXml([
            "https://example.com/",
            "https://example.com/leistungen/",
            "https://example.com/special-page/",
          ]),
        },
      ],
    );
    root = fixture.root;
    const result = await runSitemapCoverageValidate(input, fixture.context);
    const diagnostics = (result.data as { diagnostics: Array<{ ruleId: string; severity: string }> }).diagnostics;
    expect(diagnostics.some((d) => d.ruleId === "SITEMAP-COV-02")).toBe(true);
    const cov02 = diagnostics.filter((d) => d.ruleId === "SITEMAP-COV-02");
    expect(cov02.every((d) => d.severity === "warning")).toBe(true);
  });

  it("all expected pages in sitemap, no extra URLs → pass", async () => {
    const fixture = await createFixture(
      systemMdWithPages([
        { pageId: "home", route: "" },
        { pageId: "leistungen", route: "leistungen" },
      ]),
      [
        {
          path: "sitemap-0.xml",
          content: sitemapXml([
            "https://example.com/",
            "https://example.com/leistungen/",
          ]),
        },
      ],
    );
    root = fixture.root;
    const result = await runSitemapCoverageValidate(input, fixture.context);
    expect(result.exitCode).toBe(0);
    const diagnostics = (result.data as { diagnostics: unknown[] }).diagnostics;
    expect(diagnostics).toHaveLength(0);
  });

  it("page excluded via output.sitemap: false → not in expected set, no COV-01", async () => {
    const fixture = await createFixture(
      systemMdWithPages([
        { pageId: "home", route: "" },
        { pageId: "leistungen", route: "leistungen", sitemapExcluded: true },
      ]),
      [
        {
          path: "sitemap-0.xml",
          content: sitemapXml(["https://example.com/"]),
        },
      ],
    );
    root = fixture.root;
    const result = await runSitemapCoverageValidate(input, fixture.context);
    const diagnostics = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics;
    expect(diagnostics.some((d) => d.ruleId === "SITEMAP-COV-01")).toBe(false);
  });

  it("page excluded via output.sitemap: { include: false } → not in expected set, no COV-01", async () => {
    const fixture = await createFixture(
      systemMdWithPages([
        { pageId: "home", route: "" },
        { pageId: "leistungen", route: "leistungen", sitemapIncludeFalse: true },
      ]),
      [
        {
          path: "sitemap-0.xml",
          content: sitemapXml(["https://example.com/"]),
        },
      ],
    );
    root = fixture.root;
    const result = await runSitemapCoverageValidate(input, fixture.context);
    const diagnostics = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics;
    expect(diagnostics.some((d) => d.ruleId === "SITEMAP-COV-01")).toBe(false);
  });

  it("no sitemap files → skip with info", async () => {
    const fixture = await createFixture(
      systemMdWithPages([{ pageId: "home", route: "" }]),
      [],
    );
    root = fixture.root;
    const result = await runSitemapCoverageValidate(input, fixture.context);
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("skipped");
  });

  it("missing system.md → skip with info", async () => {
    const fixture = await createFixture(null, [
      {
        path: "sitemap-0.xml",
        content: sitemapXml(["https://example.com/"]),
      },
    ]);
    root = fixture.root;
    const result = await runSitemapCoverageValidate(input, fixture.context);
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("skipped");
  });
});
