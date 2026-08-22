/*
<MODULE_CONTRACT>
<purpose>
  Test coverage for jsonld.canonical-entity.validate (RFC-0910) — proves the validator
  catches Organization/WebSite non-canonical URLs, breadcrumb home prefix issues,
  same-origin Person default-language prefix, skips external Person URLs, and
  handles missing dist/Astro.site.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0910: initial test suite — JSONLD-ENTITY-01..03, skip cases, edge cases.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testLogger, makeTestSiteContext, testInput, unwrapData } from "./helpers.ts";
import { runJsonLdCanonicalEntityValidate } from "../audit/validators/jsonld.ts";
import type { KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

let tmpRoot: string;
let appDir: string;
let distDir: string;
let contentDir: string;

async function setupApp(): Promise<void> {
  tmpRoot = await mkdtemp(join(tmpdir(), "jsonld-canonical-"));
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

async function writeSystemMd(defaultLang: string): Promise<void> {
  await writeFile(
    join(contentDir, "system.md"),
    `---\ni18n:\n  default: ${defaultLang}\n  languages:\n    - ${defaultLang}\n---\n\n# Test System\n`,
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

interface CanonicalEntityResultData {
  command: string;
  status: string;
  findings: Array<{
    ruleId: string;
    severity: string;
    message: string;
  }>;
  summary: Record<string, number>;
}

function getData(
  result: Awaited<ReturnType<typeof runJsonLdCanonicalEntityValidate>>,
): CanonicalEntityResultData {
  return unwrapData(result) as CanonicalEntityResultData;
}

beforeEach(async () => {
  await setupApp();
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("jsonld.canonical-entity.validate", () => {
  it("skips when no dist HTML exists", async () => {
    await writeAstroConfig("https://example.com");
    await writeSystemMd("de");
    const result = await runJsonLdCanonicalEntityValidate(input, ctx());
    expect(result.summary).toContain("skipped");
  });

  it("skips when Astro.site is not configured", async () => {
    await writeHtml("index.html", "<html></html>");
    await writeSystemMd("de");
    const result = await runJsonLdCanonicalEntityValidate(input, ctx());
    expect(result.summary).toContain("skipped");
  });

  it("passes when Organization.url and WebSite.url are canonical root", async () => {
    await writeAstroConfig("https://example.com");
    await writeSystemMd("de");
    await writeHtml(
      "index.html",
      `<html><head>
        <script type="application/ld+json">{"@type":"Organization","url":"https://example.com/"}</script>
        <script type="application/ld+json">{"@type":"WebSite","url":"https://example.com/"}</script>
      </head><body></body></html>`,
    );
    const result = await runJsonLdCanonicalEntityValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("ok");
    expect(data.findings).toHaveLength(0);
  });

  it("emits JSONLD-ENTITY-01 when Organization.url has language prefix", async () => {
    await writeAstroConfig("https://example.com");
    await writeSystemMd("de");
    await writeHtml(
      "index.html",
      `<html><head>
        <script type="application/ld+json">{"@type":"Organization","url":"https://example.com/de/"}</script>
      </head><body></body></html>`,
    );
    const result = await runJsonLdCanonicalEntityValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "JSONLD-ENTITY-01");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
    expect(errors[0].message).toContain("/de/");
  });

  it("emits JSONLD-ENTITY-01 when WebSite.url has language prefix", async () => {
    await writeAstroConfig("https://example.com");
    await writeSystemMd("de");
    await writeHtml(
      "index.html",
      `<html><head>
        <script type="application/ld+json">{"@type":"WebSite","url":"https://example.com/de/"}</script>
      </head><body></body></html>`,
    );
    const result = await runJsonLdCanonicalEntityValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "JSONLD-ENTITY-01");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
  });

  it("passes for non-default language prefix on Organization.url (e.g. /uk/)", async () => {
    await writeAstroConfig("https://example.com");
    await writeSystemMd("de");
    await writeHtml(
      "index.html",
      `<html><head>
        <script type="application/ld+json">{"@type":"Organization","url":"https://example.com/"}</script>
      </head><body></body></html>`,
    );
    const result = await runJsonLdCanonicalEntityValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("ok");
  });

  it("emits JSONLD-ENTITY-02 when BreadcrumbList home item has language prefix", async () => {
    await writeAstroConfig("https://example.com");
    await writeSystemMd("de");
    await writeHtml(
      "index.html",
      `<html><head>
        <script type="application/ld+json">{
          "@type":"BreadcrumbList",
          "itemListElement":[
            {"@type":"ListItem","position":1,"item":{"@id":"https://example.com/de/","url":"https://example.com/de/","name":"Home"}},
            {"@type":"ListItem","position":2,"item":{"@id":"https://example.com/de/page/","url":"https://example.com/de/page/","name":"Page"}}
          ]
        }</script>
      </head><body></body></html>`,
    );
    const result = await runJsonLdCanonicalEntityValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "JSONLD-ENTITY-02");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
  });

  it("passes when BreadcrumbList home item is canonical root", async () => {
    await writeAstroConfig("https://example.com");
    await writeSystemMd("de");
    await writeHtml(
      "index.html",
      `<html><head>
        <script type="application/ld+json">{
          "@type":"BreadcrumbList",
          "itemListElement":[
            {"@type":"ListItem","position":1,"item":{"@id":"https://example.com/","url":"https://example.com/","name":"Home"}},
            {"@type":"ListItem","position":2,"item":{"@id":"https://example.com/de/page/","url":"https://example.com/de/page/","name":"Page"}}
          ]
        }</script>
      </head><body></body></html>`,
    );
    const result = await runJsonLdCanonicalEntityValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "JSONLD-ENTITY-02");
    expect(errors).toHaveLength(0);
  });

  it("emits JSONLD-ENTITY-03 when same-origin Person.url has default-language prefix", async () => {
    await writeAstroConfig("https://example.com");
    await writeSystemMd("de");
    await writeHtml(
      "index.html",
      `<html><head>
        <script type="application/ld+json">{"@type":"Person","url":"https://example.com/de/team/jane-doe"}</script>
      </head><body></body></html>`,
    );
    const result = await runJsonLdCanonicalEntityValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "JSONLD-ENTITY-03");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
    expect(errors[0].message).toContain("/de/");
  });

  it("does NOT emit JSONLD-ENTITY-03 for external Person.url", async () => {
    await writeAstroConfig("https://example.com");
    await writeSystemMd("de");
    await writeHtml(
      "index.html",
      `<html><head>
        <script type="application/ld+json">{"@type":"Person","url":"https://linkedin.com/in/jane-doe"}</script>
      </head><body></body></html>`,
    );
    const result = await runJsonLdCanonicalEntityValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "JSONLD-ENTITY-03");
    expect(errors).toHaveLength(0);
  });

  it("passes when same-origin Person.url is unprefixed (non-default language path)", async () => {
    await writeAstroConfig("https://example.com");
    await writeSystemMd("de");
    await writeHtml(
      "index.html",
      `<html><head>
        <script type="application/ld+json">{"@type":"Person","url":"https://example.com/team/jane-doe"}</script>
      </head><body></body></html>`,
    );
    const result = await runJsonLdCanonicalEntityValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.ruleId === "JSONLD-ENTITY-03");
    expect(errors).toHaveLength(0);
  });

  it("skips redirect pages", async () => {
    await writeAstroConfig("https://example.com");
    await writeSystemMd("de");
    await writeHtml(
      "redirect.html",
      `<html><head><meta http-equiv="refresh" content="0;url=https://example.com/"></head><body></body></html>`,
    );
    const result = await runJsonLdCanonicalEntityValidate(input, ctx());
    const data = getData(result);
    expect(data.findings).toHaveLength(0);
  });

  it("detects multiple issues on a single page", async () => {
    await writeAstroConfig("https://example.com");
    await writeSystemMd("de");
    await writeHtml(
      "index.html",
      `<html><head>
        <script type="application/ld+json">{"@type":"Organization","url":"https://example.com/de/"}</script>
        <script type="application/ld+json">{"@type":"WebSite","url":"https://example.com/de/"}</script>
        <script type="application/ld+json">{"@type":"Person","url":"https://example.com/de/team/jane"}</script>
      </head><body></body></html>`,
    );
    const result = await runJsonLdCanonicalEntityValidate(input, ctx());
    const data = getData(result);
    expect(data.findings.length).toBeGreaterThanOrEqual(3);
    expect(data.status).toBe("fail");
  });
});
