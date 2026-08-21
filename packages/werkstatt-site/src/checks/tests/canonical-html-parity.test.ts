import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

/*
<MODULE_CONTRACT>
  <purpose>RFC-0906: red/green fixture coverage for canonical.html-parity.validate (CANON-HTML-01..03).</purpose>
</MODULE_CONTRACT>
*/

vi.mock("@warpgogol/werkstatt-site/paths", () => ({
  requireAstroSitePaths: (context: KernelRuntimeContext) => ({
    appDirectory: (context.site as { directory: string }).directory,
    publicDirectory: join((context.site as { directory: string }).directory, "public"),
    distDirectory: join((context.site as { directory: string }).directory, "dist"),
  }),
}));

vi.mock("@warpgogol/werkstatt-site/content", () => ({
  loadSystemManifest: async (contentDir: string) => {
    const { readFile } = await import("node:fs/promises");
    try {
      const raw = await readFile(join(contentDir, "system.md"), "utf8");
      const frontmatter = raw.match(/i18n:\s*\n\s+default:\s*(\w+)/);
      const defaultLang = frontmatter?.[1] ?? "de";
      return {
        manifest: {
          i18n: { supported: { [defaultLang]: true } },
          pages: [
            {
              pageId: "home",
              routes: { [defaultLang]: "" },
            },
            {
              pageId: "leistungen",
              routes: { [defaultLang]: "leistungen" },
            },
          ],
        },
      };
    } catch {
      return { manifest: { i18n: { supported: { de: true } }, pages: [] } };
    }
  },
}));

vi.mock("@warpgogol/werkstatt-site/share/astro/canonical-url", () => ({
  canonicalPageUrl: (
    input: { lang: string; route: string; kind: string },
    opts: { baseUrl: string },
  ) => {
    const base = opts.baseUrl.replace(/\/+$/, "");
    const path = input.route === "" ? "/" : `/${input.route}`;
    return path === "/" ? `${base}/` : `${base}${path}/`;
  },
  CanonicalUrlOptions: {},
}));

vi.mock("../lib/astro-site-url.ts", () => ({
  readAstroSiteUrl: async () => "https://example.com",
}));

vi.mock("../lib/i18n.ts", () => ({
  defaultLanguageFromManifest: () => "de",
}));

const { runCanonicalHtmlParityValidate } = await import("../canonical-html-parity.ts");

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
  htmlFiles: Array<{ path: string; content: string }>,
): Promise<{ root: string; context: KernelRuntimeContext }> {
  const root = await mkdtemp(join(tmpdir(), "canon-html-parity-"));
  const appDir = join(root, "apps", "demo");
  const distClientDir = join(appDir, "dist", "client");
  const contentDir = join(appDir, "src", "content");

  await mkdir(contentDir, { recursive: true });
  await writeFile(
    join(contentDir, "system.md"),
    "---\ni18n:\n  default: de\n---\n\n# System\n",
    "utf8",
  );

  for (const file of htmlFiles) {
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

function htmlWithCanonical(canonicalHref: string, ogUrl?: string): string {
  const ogTag = ogUrl ? `<meta property="og:url" content="${ogUrl}" />` : "";
  return `<!DOCTYPE html><html><head><link rel="canonical" href="${canonicalHref}" />${ogTag}</head><body><h1>Test</h1></body></html>`;
}

function htmlRedirect(): string {
  return `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/de/" /></head><body></body></html>`;
}

describe("canonical.html-parity.validate (RFC-0906)", () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root) {
      await rm(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  it("CANON-HTML-01: canonical href without trailing slash → error", async () => {
    const fixture = await createFixture([
      {
        path: "leistungen/index.html",
        content: htmlWithCanonical("https://example.com/leistungen"),
      },
    ]);
    root = fixture.root;
    const result = await runCanonicalHtmlParityValidate(input, fixture.context);
    expect(result.exitCode).toBe(1);
    const diagnostics = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics;
    expect(diagnostics.some((d) => d.ruleId === "CANON-HTML-01")).toBe(true);
  });

  it("CANON-HTML-02: og:url without trailing slash → error", async () => {
    const fixture = await createFixture([
      {
        path: "leistungen/index.html",
        content: htmlWithCanonical(
          "https://example.com/leistungen/",
          "https://example.com/leistungen",
        ),
      },
    ]);
    root = fixture.root;
    const result = await runCanonicalHtmlParityValidate(input, fixture.context);
    expect(result.exitCode).toBe(1);
    const diagnostics = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics;
    expect(diagnostics.some((d) => d.ruleId === "CANON-HTML-02")).toBe(true);
  });

  it("CANON-HTML-03: canonical href diverges from og:url → error", async () => {
    const fixture = await createFixture([
      {
        path: "leistungen/index.html",
        content: htmlWithCanonical(
          "https://example.com/leistungen/",
          "https://example.com/leistungen/other",
        ),
      },
    ]);
    root = fixture.root;
    const result = await runCanonicalHtmlParityValidate(input, fixture.context);
    expect(result.exitCode).toBe(1);
    const diagnostics = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics;
    expect(diagnostics.some((d) => d.ruleId === "CANON-HTML-03")).toBe(true);
  });

  it("passes when canonical and og:url both match expected", async () => {
    const fixture = await createFixture([
      {
        path: "leistungen/index.html",
        content: htmlWithCanonical(
          "https://example.com/leistungen/",
          "https://example.com/leistungen/",
        ),
      },
    ]);
    root = fixture.root;
    const result = await runCanonicalHtmlParityValidate(input, fixture.context);
    expect(result.exitCode).toBe(0);
  });

  it("passes when home page canonical matches expected", async () => {
    const fixture = await createFixture([
      {
        path: "index.html",
        content: htmlWithCanonical("https://example.com/", "https://example.com/"),
      },
    ]);
    root = fixture.root;
    const result = await runCanonicalHtmlParityValidate(input, fixture.context);
    expect(result.exitCode).toBe(0);
  });

  it("skips redirect pages", async () => {
    const fixture = await createFixture([
      {
        path: "leistungen/index.html",
        content: htmlRedirect(),
      },
    ]);
    root = fixture.root;
    const result = await runCanonicalHtmlParityValidate(input, fixture.context);
    expect(result.exitCode).toBe(0);
  });

  it("skips files with no canonical tag and no og:url", async () => {
    const fixture = await createFixture([
      {
        path: "leistungen/index.html",
        content: `<!DOCTYPE html><html><head></head><body><h1>No canonical</h1></body></html>`,
      },
    ]);
    root = fixture.root;
    const result = await runCanonicalHtmlParityValidate(input, fixture.context);
    expect(result.exitCode).toBe(0);
  });

  it("skips when dist/client/ is missing", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "canon-html-parity-empty-"));
    root = rootDir;
    const appDir = join(rootDir, "apps", "demo");
    await mkdir(join(appDir, "src", "content"), { recursive: true });
    await writeFile(
      join(appDir, "src", "content", "system.md"),
      "---\ni18n:\n  default: de\n---\n\n# System\n",
      "utf8",
    );
    const context = {
      workspaceRoot: rootDir,
      site: { name: "demo", directory: appDir, toolsDirectory: join(appDir, "tools") },
      siteExplicit: true,
      logger,
      dryRun: false,
      outputFormat: "json",
    } as unknown as KernelRuntimeContext;
    const result = await runCanonicalHtmlParityValidate(input, context);
    expect(result.exitCode).toBe(0);
  });
});
