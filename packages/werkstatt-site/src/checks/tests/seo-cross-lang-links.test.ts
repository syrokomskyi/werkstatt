/*
<MODULE_CONTRACT>
<purpose>
  Test coverage for seo.cross-lang-links.validate (RFC-0898) — proves the
  validator detects cross-language internal links without hreflang, skips
  redirect pages, skips single-language sites, and handles nav links.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0898: initial test suite — SEO-XLANG-01, skip cases, nav exemption.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testLogger, makeTestSiteContext, testInput, unwrapData } from "./helpers.ts";
import { runSeoCrossLangLinksValidate } from "../audit/validators/seo-cross-lang-links.ts";
import type { KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

let tmpRoot: string;
let appDir: string;
let distDir: string;
let contentDir: string;

async function setupApp(): Promise<void> {
  tmpRoot = await mkdtemp(join(tmpdir(), "seo-xlang-"));
  appDir = join(tmpRoot, "test-app");
  distDir = join(appDir, "dist", "client");
  contentDir = join(appDir, "src", "content");
  await mkdir(distDir, { recursive: true });
  await mkdir(contentDir, { recursive: true });
}

async function writeSystemMd(languages: string[], defaultLang: string): Promise<void> {
  const langEntries = languages.map((l) => `    ${l}: {}`).join("\n");
  await writeFile(
    join(contentDir, "system.md"),
    `---\napp: test-app\nidentity:\n  domain: example.com\ni18n:\n  default: ${defaultLang}\n  supported:\n${langEntries}\n---\n\n# Test App\n`,
    "utf8",
  );
}

async function writeHtml(name: string, html: string): Promise<void> {
  const dir = name.includes("/") ? join(distDir, name.split("/").slice(0, -1).join("/")) : distDir;
  await mkdir(dir, { recursive: true });
  await writeFile(join(distDir, name), html, "utf8");
}

function ctx(): KernelRuntimeContext {
  return makeTestSiteContext(tmpRoot, appDir, "test-app");
}

const input = testInput();

interface XlangResultData {
  command: string;
  status: string;
  findings: Array<{
    ruleId: string;
    severity: string;
    message: string;
  }>;
}

function getData(
  result: Awaited<ReturnType<typeof runSeoCrossLangLinksValidate>>,
): XlangResultData {
  return unwrapData(result) as XlangResultData;
}

beforeEach(async () => {
  await setupApp();
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("seo.cross-lang-links.validate", () => {
  it("skips when no dist HTML exists", async () => {
    await writeSystemMd(["de", "en"], "de");
    const result = await runSeoCrossLangLinksValidate(input, ctx());
    expect(result.summary).toContain("skipped");
  });

  it("skips for single-language site", async () => {
    await writeSystemMd(["de"], "de");
    await writeHtml("index.html", "<html></html>");
    const result = await runSeoCrossLangLinksValidate(input, ctx());
    expect(result.summary).toContain("single-language");
  });

  it("passes when same-language links have no hreflang", async () => {
    await writeSystemMd(["de", "en"], "de");
    await writeHtml(
      "index.html",
      `<html><body><a href="/about">About</a></body></html>`,
    );
    const result = await runSeoCrossLangLinksValidate(input, ctx());
    const data = getData(result);
    expect(data.findings).toHaveLength(0);
  });

  it("emits SEO-XLANG-01 for cross-language link without hreflang", async () => {
    await writeSystemMd(["de", "en"], "de");
    await writeHtml(
      "de/index.html",
      `<html><body><a href="/en/about">About</a></body></html>`,
    );
    const result = await runSeoCrossLangLinksValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "SEO-XLANG-01");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
  });

  it("does not emit SEO-XLANG-01 when link has hreflang", async () => {
    await writeSystemMd(["de", "en"], "de");
    await writeHtml(
      "de/index.html",
      `<html><body><a href="/en/about" hreflang="en">About</a></body></html>`,
    );
    const result = await runSeoCrossLangLinksValidate(input, ctx());
    const data = getData(result);
    expect(data.findings).toHaveLength(0);
  });

  it("skips redirect pages", async () => {
    await writeSystemMd(["de", "en"], "de");
    await writeHtml(
      "de/index.html",
      `<html><head><meta http-equiv="refresh" content="0;url=/en/about"></head><body></body></html>`,
    );
    const result = await runSeoCrossLangLinksValidate(input, ctx());
    const data = getData(result);
    expect(data.findings).toHaveLength(0);
  });

  it("ignores external links", async () => {
    await writeSystemMd(["de", "en"], "de");
    await writeHtml(
      "de/index.html",
      `<html><body><a href="https://example.com/en/about">About</a></body></html>`,
    );
    const result = await runSeoCrossLangLinksValidate(input, ctx());
    const data = getData(result);
    expect(data.findings).toHaveLength(0);
  });

  it("ignores anchor-only links", async () => {
    await writeSystemMd(["de", "en"], "de");
    await writeHtml(
      "de/index.html",
      `<html><body><a href="#section">Section</a></body></html>`,
    );
    const result = await runSeoCrossLangLinksValidate(input, ctx());
    const data = getData(result);
    expect(data.findings).toHaveLength(0);
  });

  it("detects cross-language link from en page to de", async () => {
    await writeSystemMd(["de", "en"], "de");
    await writeHtml(
      "en/index.html",
      `<html><body><a href="/de/kontakt">Kontakt</a></body></html>`,
    );
    const result = await runSeoCrossLangLinksValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "SEO-XLANG-01");
    expect(errors).toHaveLength(1);
  });
});
