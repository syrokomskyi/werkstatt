/*
<MODULE_CONTRACT>
<purpose>
  Test coverage for seo.meta-uniqueness.validate (RFC-0911) — proves the
  validator detects duplicate titles and descriptions within the same language,
  skips noindex/redirect pages, and handles cross-language non-collisions.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0911: initial test suite — SEO-UNIQ-01, SEO-UNIQ-02, skip cases, cross-language.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testLogger, makeTestSiteContext, testInput, unwrapData } from "./helpers.ts";
import { runSeoMetaUniquenessValidate } from "../audit/validators/seo-meta-uniqueness.ts";
import type { KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

let tmpRoot: string;
let appDir: string;
let distDir: string;
let contentDir: string;

async function setupApp(): Promise<void> {
  tmpRoot = await mkdtemp(join(tmpdir(), "seo-uniq-"));
  appDir = join(tmpRoot, "test-app");
  distDir = join(appDir, "dist", "client");
  contentDir = join(appDir, "src", "content");
  await mkdir(distDir, { recursive: true });
  await mkdir(contentDir, { recursive: true });
}

async function writeSystemMd(
  languages: string[],
  defaultLang: string,
  extra?: string,
): Promise<void> {
  const langEntries = languages.map((l) => `    ${l}: {}`).join("\n");
  const extraBlock = extra ? `\n${extra}` : "";
  await writeFile(
    join(contentDir, "system.md"),
    `---\napp: test-app\nidentity:\n  domain: example.com\ni18n:\n  default: ${defaultLang}\n  supported:\n${langEntries}${extraBlock}\n---\n\n# Test App\n`,
    "utf8",
  );
}

async function writeHtml(name: string, html: string): Promise<void> {
  const dir = name.includes("/")
    ? join(distDir, name.split("/").slice(0, -1).join("/"))
    : distDir;
  await mkdir(dir, { recursive: true });
  await writeFile(join(distDir, name), html, "utf8");
}

function ctx(): KernelRuntimeContext {
  return makeTestSiteContext(tmpRoot, appDir, "test-app");
}

const input = testInput();

interface UniqResultData {
  command: string;
  status: string;
  findings: Array<{
    ruleId: string;
    severity: string;
    message: string;
  }>;
}

function getData(
  result: Awaited<ReturnType<typeof runSeoMetaUniquenessValidate>>,
): UniqResultData {
  return unwrapData(result) as UniqResultData;
}

function pageHtml(
  title: string,
  description: string,
  lang: string,
  extra = "",
): string {
  return `<!DOCTYPE html><html lang="${lang}"><head><title>${title}</title><meta name="description" content="${description}" />${extra}</head><body><h1>Test</h1></body></html>`;
}

function noindexPage(
  title: string,
  description: string,
  lang: string,
): string {
  return pageHtml(title, description, lang, '<meta name="robots" content="noindex" />');
}

function redirectPage(): string {
  return `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/de/" /></head><body></body></html>`;
}

beforeEach(async () => {
  await setupApp();
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("seo.meta-uniqueness.validate", () => {
  it("skips when no dist HTML exists", async () => {
    await writeSystemMd(["de"], "de");
    const result = await runSeoMetaUniquenessValidate(input, ctx());
    expect(result.summary).toContain("skipped");
    expect(result.exitCode).toBe(0);
  });

  it("passes with a single page (trivially satisfied)", async () => {
    await writeSystemMd(["de"], "de");
    await writeHtml("index.html", pageHtml("Home", "Welcome home", "de"));
    const result = await runSeoMetaUniquenessValidate(input, ctx());
    const data = getData(result);
    expect(data.findings).toHaveLength(0);
    expect(result.exitCode).toBe(0);
  });

  it("emits SEO-UNIQ-01 when two de pages share the same title", async () => {
    await writeSystemMd(["de"], "de");
    await writeHtml("index.html", pageHtml("Same Title", "Desc A", "de"));
    await writeHtml("about.html", pageHtml("Same Title", "Desc B", "de"));
    const result = await runSeoMetaUniquenessValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "SEO-UNIQ-01");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
    expect(result.exitCode).toBe(1);
  });

  it("emits SEO-UNIQ-02 when two de pages share the same meta description", async () => {
    await writeSystemMd(["de"], "de");
    await writeHtml("index.html", pageHtml("Title A", "Same Description", "de"));
    await writeHtml("about.html", pageHtml("Title B", "Same Description", "de"));
    const result = await runSeoMetaUniquenessValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "SEO-UNIQ-02");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
    expect(result.exitCode).toBe(1);
  });

  it("does not collide across languages (de vs uk)", async () => {
    await writeSystemMd(["de", "uk"], "de");
    await writeHtml("de/index.html", pageHtml("Same Title", "Same Description", "de"));
    await writeHtml("uk/index.html", pageHtml("Same Title", "Same Description", "uk"));
    const result = await runSeoMetaUniquenessValidate(input, ctx());
    const data = getData(result);
    expect(data.findings).toHaveLength(0);
    expect(result.exitCode).toBe(0);
  });

  it("excludes noindex pages from uniqueness check", async () => {
    await writeSystemMd(["de"], "de");
    await writeHtml("index.html", pageHtml("Same Title", "Desc A", "de"));
    await writeHtml(
      "noindex.html",
      noindexPage("Same Title", "Desc A", "de"),
    );
    const result = await runSeoMetaUniquenessValidate(input, ctx());
    const data = getData(result);
    expect(data.findings).toHaveLength(0);
    expect(result.exitCode).toBe(0);
  });

  it("excludes redirect pages from uniqueness check", async () => {
    await writeSystemMd(["de"], "de");
    await writeHtml("index.html", pageHtml("Same Title", "Desc A", "de"));
    await writeHtml("redirect.html", redirectPage());
    const result = await runSeoMetaUniquenessValidate(input, ctx());
    const data = getData(result);
    expect(data.findings).toHaveLength(0);
    expect(result.exitCode).toBe(0);
  });

  it("excludes .well-known pages from uniqueness check", async () => {
    await writeSystemMd(["de"], "de");
    await writeHtml("index.html", pageHtml("Same Title", "Desc A", "de"));
    await writeHtml(
      ".well-known/security.txt/index.html",
      pageHtml("Same Title", "Desc A", "de"),
    );
    const result = await runSeoMetaUniquenessValidate(input, ctx());
    const data = getData(result);
    expect(data.findings).toHaveLength(0);
    expect(result.exitCode).toBe(0);
  });

  it("falls back to route prefix lang when <html lang> is absent", async () => {
    await writeSystemMd(["de", "uk"], "de");
    const htmlNoLang =
      `<!DOCTYPE html><html><head><title>Test</title><meta name="description" content="Desc" /></head><body></body></html>`;
    await writeHtml("de/page.html", htmlNoLang);
    await writeHtml("uk/page.html", htmlNoLang);
    const result = await runSeoMetaUniquenessValidate(input, ctx());
    const data = getData(result);
    expect(data.findings).toHaveLength(0);
    expect(result.exitCode).toBe(0);
  });
});
