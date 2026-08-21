/*
<MODULE_CONTRACT>
<purpose>
  Test coverage for seo.domain.validate (RFC-0898) — proves the validator
  catches canonical/og:url/hreflang/JSON-LD origin mismatches, dev/staging
  hostname leakage, skips redirect pages, and handles missing Astro.site.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0898: initial test suite — SEO-DOMAIN-01..05, skip cases, config warning.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testLogger, makeTestSiteContext, testInput, unwrapData } from "./helpers.ts";
import { runSeoDomainValidate } from "../audit/validators/seo-domain.ts";
import type { KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

let tmpRoot: string;
let appDir: string;
let distDir: string;
let contentDir: string;

async function setupApp(): Promise<void> {
  tmpRoot = await mkdtemp(join(tmpdir(), "seo-domain-"));
  appDir = join(tmpRoot, "test-app");
  distDir = join(appDir, "dist", "client");
  contentDir = join(appDir, "src", "content");
  await mkdir(distDir, { recursive: true });
  await mkdir(contentDir, { recursive: true });
}

async function writeAstroConfig(site: string): Promise<void> {
  await writeFile(
    join(appDir, "astro.config.mjs"),
    `export default { site: "${site}" };\n`,
    "utf8",
  );
}

async function writeHtml(name: string, html: string): Promise<void> {
  await writeFile(join(distDir, name), html, "utf8");
}

function ctx(): KernelRuntimeContext {
  return makeTestSiteContext(tmpRoot, appDir, "test-app");
}

const input = testInput();

interface SeoDomainResultData {
  command: string;
  status: string;
  findings: Array<{
    ruleId: string;
    severity: string;
    message: string;
  }>;
  summary: Record<string, number>;
}

function getData(result: Awaited<ReturnType<typeof runSeoDomainValidate>>): SeoDomainResultData {
  return unwrapData(result) as SeoDomainResultData;
}

beforeEach(async () => {
  await setupApp();
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("seo.domain.validate", () => {
  it("skips when no dist HTML exists", async () => {
    await writeAstroConfig("https://example.com");
    const result = await runSeoDomainValidate(input, ctx());
    expect(result.summary).toContain("skipped");
  });

  it("emits SEO-DOMAIN-CONFIG-01 warning when Astro.site is not configured", async () => {
    await writeHtml("index.html", "<html></html>");
    const result = await runSeoDomainValidate(input, ctx());
    const data = getData(result);
    const configWarnings = data.findings.filter((f) => f.ruleId === "SEO-DOMAIN-CONFIG-01");
    expect(configWarnings).toHaveLength(1);
    expect(configWarnings[0].severity).toBe("warning");
  });

  it("passes when all URLs match Astro.site origin", async () => {
    await writeAstroConfig("https://example.com");
    await writeHtml(
      "index.html",
      `<html><head>
        <link rel="canonical" href="https://example.com/">
        <meta property="og:url" content="https://example.com/">
        <link rel="alternate" hreflang="de" href="https://example.com/">
        <script type="application/ld+json">{"@type":"WebPage","url":"https://example.com/"}</script>
      </head><body></body></html>`,
    );
    const result = await runSeoDomainValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("ok");
    expect(data.findings).toHaveLength(0);
  });

  it("emits SEO-DOMAIN-01 for canonical origin mismatch", async () => {
    await writeAstroConfig("https://example.com");
    await writeHtml(
      "index.html",
      `<html><head><link rel="canonical" href="https://wrong.com/"></head><body></body></html>`,
    );
    const result = await runSeoDomainValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "SEO-DOMAIN-01");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
  });

  it("emits SEO-DOMAIN-02 for og:url origin mismatch", async () => {
    await writeAstroConfig("https://example.com");
    await writeHtml(
      "index.html",
      `<html><head><meta property="og:url" content="https://wrong.com/page"></head><body></body></html>`,
    );
    const result = await runSeoDomainValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "SEO-DOMAIN-02");
    expect(errors).toHaveLength(1);
  });

  it("emits SEO-DOMAIN-03 for hreflang origin mismatch", async () => {
    await writeAstroConfig("https://example.com");
    await writeHtml(
      "index.html",
      `<html><head><link rel="alternate" hreflang="de" href="https://wrong.com/de/"></head><body></body></html>`,
    );
    const result = await runSeoDomainValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "SEO-DOMAIN-03");
    expect(errors).toHaveLength(1);
  });

  it("emits SEO-DOMAIN-04 for JSON-LD url origin mismatch", async () => {
    await writeAstroConfig("https://example.com");
    await writeHtml(
      "index.html",
      `<html><head><script type="application/ld+json">{"@type":"WebPage","url":"https://wrong.com/"}</script></head><body></body></html>`,
    );
    const result = await runSeoDomainValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "SEO-DOMAIN-04");
    expect(errors).toHaveLength(1);
  });

  it("emits SEO-DOMAIN-05 for dev/staging hostname in canonical", async () => {
    await writeAstroConfig("https://example.com");
    await writeHtml(
      "index.html",
      `<html><head><link rel="canonical" href="https://dev.example.com/"></head><body></body></html>`,
    );
    const result = await runSeoDomainValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "SEO-DOMAIN-05");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
  });

  it("emits SEO-DOMAIN-05 for localhost in og:url", async () => {
    await writeAstroConfig("https://example.com");
    await writeHtml(
      "index.html",
      `<html><head><meta property="og:url" content="http://localhost:4321/"></head><body></body></html>`,
    );
    const result = await runSeoDomainValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "SEO-DOMAIN-05");
    expect(errors).toHaveLength(1);
  });

  it("skips redirect pages", async () => {
    await writeAstroConfig("https://example.com");
    await writeHtml(
      "redirect.html",
      `<html><head><meta http-equiv="refresh" content="0;url=https://wrong.com/"></head><body></body></html>`,
    );
    const result = await runSeoDomainValidate(input, ctx());
    const data = getData(result);
    expect(data.findings).toHaveLength(0);
  });

  it("detects multiple issues on a single page", async () => {
    await writeAstroConfig("https://example.com");
    await writeHtml(
      "index.html",
      `<html><head>
        <link rel="canonical" href="https://wrong.com/">
        <meta property="og:url" content="https://staging.example.com/">
      </head><body></body></html>`,
    );
    const result = await runSeoDomainValidate(input, ctx());
    const data = getData(result);
    expect(data.findings.length).toBeGreaterThanOrEqual(2);
  });
});
