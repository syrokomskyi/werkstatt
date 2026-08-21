/*
<MODULE_CONTRACT>
<purpose>
  Test coverage for headers.coverage.validate (RFC-0904) — proves the validator
  catches orphan _headers path patterns (HDR-COV-01) and uncovered typed files
  (HDR-COV-02), and correctly skips when _headers or dist/client/ are missing.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0904: initial test suite — runHeadersCoverageValidate (skip cases, HDR-COV-01, HDR-COV-02, pass case).</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testLogger, makeTestSiteContext, testInput, unwrapData } from "./helpers.ts";
import { runHeadersCoverageValidate } from "../headers-coverage.ts";
import type { KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

let tmpRoot: string;
let appDir: string;
let publicDir: string;
let distDir: string;
let contentDir: string;

async function setupApp(): Promise<void> {
  tmpRoot = await mkdtemp(join(tmpdir(), "headers-coverage-"));
  appDir = join(tmpRoot, "test-app");
  publicDir = join(appDir, "public");
  distDir = join(appDir, "dist", "client");
  contentDir = join(appDir, "src", "content");
  await mkdir(publicDir, { recursive: true });
  await mkdir(distDir, { recursive: true });
  await mkdir(contentDir, { recursive: true });
}

async function writeHeaders(content: string): Promise<void> {
  await writeFile(join(publicDir, "_headers"), content, "utf8");
}

async function writeDistFile(relativePath: string, content: string): Promise<void> {
  const fullPath = join(distDir, relativePath);
  const dir = join(fullPath, "..");
  await mkdir(dir, { recursive: true });
  await writeFile(fullPath, content, "utf8");
}

function ctx(): KernelRuntimeContext {
  return makeTestSiteContext(tmpRoot, appDir, "test-app");
}

const input = testInput();

interface CheckResultData {
  command: string;
  status: string;
  diagnostics: Array<{
    ruleId: string;
    severity: string;
    message: string;
    file: string;
    line: number;
  }>;
  summary: { error: number; warning: number; info: number };
}

function getData(result: Awaited<ReturnType<typeof runHeadersCoverageValidate>>): CheckResultData {
  return unwrapData(result) as CheckResultData;
}

beforeEach(async () => {
  await setupApp();
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

// ─── runHeadersCoverageValidate (RFC-0904) ──────────────────────────────────

describe("runHeadersCoverageValidate (RFC-0904)", () => {
  it("skips with pass when public/_headers does not exist", async () => {
    await writeDistFile("index.html", "<html></html>");
    const result = await runHeadersCoverageValidate(input, ctx());
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("no public/_headers");
  });

  it("skips with pass when dist/client/ does not exist", async () => {
    await writeHeaders("/\n  Cache-Control: public\n");
    await rm(distDir, { recursive: true, force: true });
    const result = await runHeadersCoverageValidate(input, ctx());
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("no dist/client/");
  });

  it("skips with pass when _headers has no path patterns", async () => {
    await writeHeaders("Content-Security-Policy: default-src 'self'\n");
    await writeDistFile("index.html", "<html></html>");
    const result = await runHeadersCoverageValidate(input, ctx());
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("no path patterns");
  });

  it("emits HDR-COV-01 warning for orphan path pattern", async () => {
    await writeHeaders(
      ["/", "  Cache-Control: public", "/orphan-pattern/*", "  Cache-Control: public"].join("\n"),
    );
    await writeDistFile("index.html", "<html></html>");
    const result = await runHeadersCoverageValidate(input, ctx());
    const data = getData(result);
    const warnings = data.diagnostics.filter((d) => d.ruleId === "HDR-COV-01");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe("warning");
    expect(warnings[0].message).toContain("/orphan-pattern/*");
  });

  it("emits HDR-COV-02 error for uncovered .pdf file", async () => {
    await writeHeaders(
      ["/", "  Cache-Control: public", "/*.html", "  Cache-Control: public"].join("\n"),
    );
    await writeDistFile("index.html", "<html></html>");
    await writeDistFile("docs/report.pdf", "%PDF-1.4");
    const result = await runHeadersCoverageValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("fail");
    expect(result.exitCode).toBe(1);
    const errors = data.diagnostics.filter((d) => d.ruleId === "HDR-COV-02");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
    expect(errors[0].message).toContain(".pdf");
  });

  it("emits HDR-COV-02 error for uncovered .mp4 file", async () => {
    await writeHeaders(["/", "  Cache-Control: public"].join("\n"));
    await writeDistFile("index.html", "<html></html>");
    await writeDistFile("videos/clip.mp4", "fake mp4");
    const result = await runHeadersCoverageValidate(input, ctx());
    const data = getData(result);
    const errors = data.diagnostics.filter((d) => d.ruleId === "HDR-COV-02");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain(".mp4");
  });

  it("emits HDR-COV-02 error for uncovered .svg file", async () => {
    await writeHeaders(["/", "  Cache-Control: public"].join("\n"));
    await writeDistFile("index.html", "<html></html>");
    await writeDistFile("icons/logo.svg", "<svg></svg>");
    const result = await runHeadersCoverageValidate(input, ctx());
    const data = getData(result);
    const errors = data.diagnostics.filter((d) => d.ruleId === "HDR-COV-02");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain(".svg");
  });

  it("passes when all tracked file types have matching patterns", async () => {
    await writeHeaders(
      [
        "/",
        "  Cache-Control: public",
        "/*.html",
        "  Cache-Control: public",
        "/**/*.pdf",
        "  Cache-Control: public",
        "/**/*.mp4",
        "  Cache-Control: public",
        "/**/*.webm",
        "  Cache-Control: public",
        "/**/*.svg",
        "  Cache-Control: public",
      ].join("\n"),
    );
    await writeDistFile("index.html", "<html></html>");
    await writeDistFile("docs/report.pdf", "%PDF-1.4");
    await writeDistFile("videos/clip.mp4", "fake mp4");
    await writeDistFile("videos/clip.webm", "fake webm");
    await writeDistFile("icons/logo.svg", "<svg></svg>");
    const result = await runHeadersCoverageValidate(input, ctx());
    expect(result.exitCode).toBe(0);
    const data = getData(result);
    expect(data.status).toBe("pass");
    expect(data.diagnostics).toHaveLength(0);
  });

  it("does not emit HDR-COV-02 for non-tracked file types (.html, .css, .js)", async () => {
    await writeHeaders(
      ["/", "  Cache-Control: public", "/*.html", "  Cache-Control: public"].join("\n"),
    );
    await writeDistFile("index.html", "<html></html>");
    await writeDistFile("style.css", "body {}");
    await writeDistFile("app.js", "console.log(1)");
    const result = await runHeadersCoverageValidate(input, ctx());
    const data = getData(result);
    const errors = data.diagnostics.filter((d) => d.ruleId === "HDR-COV-02");
    expect(errors).toHaveLength(0);
  });

  it("matches wildcard pattern /**/*.pdf to nested .pdf files", async () => {
    await writeHeaders(
      ["/", "  Cache-Control: public", "/**/*.pdf", "  Cache-Control: public"].join("\n"),
    );
    await writeDistFile("index.html", "<html></html>");
    await writeDistFile("docs/report.pdf", "%PDF-1.4");
    const result = await runHeadersCoverageValidate(input, ctx());
    const data = getData(result);
    const errors = data.diagnostics.filter((d) => d.ruleId === "HDR-COV-02");
    expect(errors).toHaveLength(0);
  });

  it("matches /* pattern to all files recursively", async () => {
    await writeHeaders(["/*", "  Cache-Control: public"].join("\n"));
    await writeDistFile("index.html", "<html></html>");
    await writeDistFile("docs/report.pdf", "%PDF-1.4");
    await writeDistFile("videos/clip.mp4", "fake mp4");
    const result = await runHeadersCoverageValidate(input, ctx());
    const data = getData(result);
    const errors = data.diagnostics.filter((d) => d.ruleId === "HDR-COV-02");
    expect(errors).toHaveLength(0);
  });
});
