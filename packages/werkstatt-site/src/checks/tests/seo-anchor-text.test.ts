/*
<MODULE_CONTRACT>
<purpose>
  Test coverage for seo.anchor-text.validate (RFC-0911) — proves the
  validator detects generic anchor text (SEO-ANCHOR-01), bare URL anchors
  (SEO-ANCHOR-02), skips noindex/redirect pages, and supports extraStopPhrases.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0911: initial test suite — SEO-ANCHOR-01, SEO-ANCHOR-02, skip cases, extraStopPhrases.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testLogger, makeTestSiteContext, testInput, unwrapData } from "./helpers.ts";
import { runSeoAnchorTextValidate } from "../audit/validators/seo-anchor-text.ts";
import type { KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

let tmpRoot: string;
let appDir: string;
let distDir: string;
let contentDir: string;

async function setupApp(): Promise<void> {
  tmpRoot = await mkdtemp(join(tmpdir(), "seo-anchor-"));
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
  const dir = name.includes("/") ? join(distDir, name.split("/").slice(0, -1).join("/")) : distDir;
  await mkdir(dir, { recursive: true });
  await writeFile(join(distDir, name), html, "utf8");
}

function ctx(): KernelRuntimeContext {
  return makeTestSiteContext(tmpRoot, appDir, "test-app");
}

const input = testInput();

interface AnchorResultData {
  command: string;
  status: string;
  findings: Array<{
    ruleId: string;
    severity: string;
    message: string;
  }>;
}

function getData(result: Awaited<ReturnType<typeof runSeoAnchorTextValidate>>): AnchorResultData {
  return unwrapData(result) as AnchorResultData;
}

function pageWithAnchor(anchorHtml: string, lang = "de"): string {
  return `<!DOCTYPE html><html lang="${lang}"><head><title>Test</title></head><body>${anchorHtml}</body></html>`;
}

function noindexPageWithAnchor(anchorHtml: string, lang = "de"): string {
  return `<!DOCTYPE html><html lang="${lang}"><head><title>Test</title><meta name="robots" content="noindex" /></head><body>${anchorHtml}</body></html>`;
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

describe("seo.anchor-text.validate", () => {
  it("skips when no dist HTML exists", async () => {
    await writeSystemMd(["de"], "de");
    const result = await runSeoAnchorTextValidate(input, ctx());
    expect(result.summary).toContain("skipped");
    expect(result.exitCode).toBe(0);
  });

  it("emits SEO-ANCHOR-01 for 'hier klicken' anchor text (de)", async () => {
    await writeSystemMd(["de"], "de");
    await writeHtml("index.html", pageWithAnchor('<a href="/about">hier klicken</a>'));
    const result = await runSeoAnchorTextValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "SEO-ANCHOR-01");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
    expect(result.exitCode).toBe(1);
  });

  it("emits SEO-ANCHOR-01 for 'тут' anchor text (uk)", async () => {
    await writeSystemMd(["uk"], "uk");
    await writeHtml("index.html", pageWithAnchor('<a href="/about">тут</a>', "uk"));
    const result = await runSeoAnchorTextValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "SEO-ANCHOR-01");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
    expect(result.exitCode).toBe(1);
  });

  it("does not emit SEO-ANCHOR-01 when descriptive text contains 'hier'", async () => {
    await writeSystemMd(["de"], "de");
    await writeHtml(
      "index.html",
      pageWithAnchor('<a href="/about">Mehr Informationen hier finden</a>'),
    );
    const result = await runSeoAnchorTextValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "SEO-ANCHOR-01");
    expect(errors).toHaveLength(0);
    expect(result.exitCode).toBe(0);
  });

  it("emits SEO-ANCHOR-02 for bare URL anchor text (warning)", async () => {
    await writeSystemMd(["de"], "de");
    await writeHtml("index.html", pageWithAnchor('<a href="/impressum">/impressum</a>'));
    const result = await runSeoAnchorTextValidate(input, ctx());
    const data = getData(result);
    const warnings = data.findings.filter((f) => f.ruleId === "SEO-ANCHOR-02");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe("warning");
    expect(result.exitCode).toBe(0);
  });

  it("excludes noindex pages from anchor-text check", async () => {
    await writeSystemMd(["de"], "de");
    await writeHtml("index.html", noindexPageWithAnchor('<a href="/about">hier klicken</a>'));
    const result = await runSeoAnchorTextValidate(input, ctx());
    const data = getData(result);
    expect(data.findings).toHaveLength(0);
    expect(result.exitCode).toBe(0);
  });

  it("excludes redirect pages from anchor-text check", async () => {
    await writeSystemMd(["de"], "de");
    await writeHtml("redirect.html", redirectPage());
    const result = await runSeoAnchorTextValidate(input, ctx());
    const data = getData(result);
    expect(data.findings).toHaveLength(0);
    expect(result.exitCode).toBe(0);
  });

  it("extends stop-list via system.md extraStopPhrases", async () => {
    await writeSystemMd(
      ["de"],
      "de",
      'seo:\n  anchorText:\n    extraStopPhrases:\n      de:\n        - "zum beitrag"',
    );
    await writeHtml("index.html", pageWithAnchor('<a href="/blog/post">Zum Beitrag</a>'));
    const result = await runSeoAnchorTextValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "SEO-ANCHOR-01");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
    expect(result.exitCode).toBe(1);
  });

  it("does not check external links", async () => {
    await writeSystemMd(["de"], "de");
    await writeHtml(
      "index.html",
      pageWithAnchor('<a href="https://external.com/page">hier klicken</a>'),
    );
    const result = await runSeoAnchorTextValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "SEO-ANCHOR-01");
    expect(errors).toHaveLength(0);
    expect(result.exitCode).toBe(0);
  });

  it("passes with descriptive anchor text", async () => {
    await writeSystemMd(["de"], "de");
    await writeHtml("index.html", pageWithAnchor('<a href="/about">Über uns</a>'));
    const result = await runSeoAnchorTextValidate(input, ctx());
    const data = getData(result);
    expect(data.findings).toHaveLength(0);
    expect(result.exitCode).toBe(0);
  });
});
