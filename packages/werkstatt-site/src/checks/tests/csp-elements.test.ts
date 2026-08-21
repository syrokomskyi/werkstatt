/*
<MODULE_CONTRACT>
<purpose>
  Test coverage for csp.elements.validate (RFC-0904) — proves the validator
  catches CSP directives blocking HTML elements (object, embed, iframe, audio,
  video, source), handles default-src fallback, same-origin resources, and
  correctly skips when _headers or dist/client/ are missing.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0904: initial test suite — runCspElementsValidate (skip cases, CSP-EL-01..03, default-src fallback, same-origin pass, source-in-picture no-fire).</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testLogger, makeTestSiteContext, testInput, unwrapData } from "./helpers.ts";
import { runCspElementsValidate } from "../csp-elements.ts";
import type { KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

let tmpRoot: string;
let appDir: string;
let publicDir: string;
let distDir: string;
let contentDir: string;

async function setupApp(): Promise<void> {
  tmpRoot = await mkdtemp(join(tmpdir(), "csp-elements-"));
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

async function writeHtml(name: string, html: string): Promise<void> {
  await writeFile(join(distDir, name), html, "utf8");
}

async function writeSystemMd(domain: string): Promise<void> {
  await writeFile(
    join(contentDir, "system.md"),
    `---\napp: test-app\nidentity:\n  domain: ${domain}\ni18n:\n  default: de\n  supported:\n    de: {}\n---\n\n# Test App\n`,
    "utf8",
  );
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

function getData(result: Awaited<ReturnType<typeof runCspElementsValidate>>): CheckResultData {
  return unwrapData(result) as CheckResultData;
}

beforeEach(async () => {
  await setupApp();
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

// ─── runCspElementsValidate (RFC-0904) ──────────────────────────────────────

describe("runCspElementsValidate (RFC-0904)", () => {
  it("skips with pass when public/_headers does not exist", async () => {
    await writeHtml("index.html", "<html></html>");
    const result = await runCspElementsValidate(input, ctx());
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("no public/_headers");
  });

  it("skips with pass when dist/client/ does not exist", async () => {
    await writeHeaders("Content-Security-Policy: object-src 'self'\n");
    await rm(distDir, { recursive: true, force: true });
    const result = await runCspElementsValidate(input, ctx());
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("no dist/client/");
  });

  it("skips with pass when CSP header is not found in _headers", async () => {
    await writeHeaders("Cache-Control: public\n");
    await writeHtml("index.html", "<html></html>");
    const result = await runCspElementsValidate(input, ctx());
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("no CSP header");
  });

  it("skips with pass when dist/client/ has no HTML files", async () => {
    await writeHeaders("Content-Security-Policy: object-src 'self'\n");
    await writeSystemMd("example.com");
    const result = await runCspElementsValidate(input, ctx());
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("no HTML files");
  });

  it("emits CSP-EL-01 error for object-src 'none' blocking <object>", async () => {
    await writeHeaders("Content-Security-Policy: object-src 'none'\n");
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><object data="/file.pdf" type="application/pdf"></object></body></html>`,
    );
    const result = await runCspElementsValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("fail");
    expect(result.exitCode).toBe(1);
    const errors = data.diagnostics.filter((d) => d.ruleId === "CSP-EL-01");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
    expect(errors[0].message).toContain("object-src");
    expect(errors[0].message).toContain("'none'");
  });

  it("emits CSP-EL-01 error for object-src 'none' blocking <embed>", async () => {
    await writeHeaders("Content-Security-Policy: object-src 'none'\n");
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><embed src="/file.swf" type="application/x-shockwave-flash"></body></html>`,
    );
    const result = await runCspElementsValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("fail");
    const errors = data.diagnostics.filter((d) => d.ruleId === "CSP-EL-01");
    expect(errors).toHaveLength(1);
  });

  it("emits CSP-EL-02 error for frame-src 'none' blocking <iframe>", async () => {
    await writeHeaders("Content-Security-Policy: frame-src 'none'\n");
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><iframe src="https://embed.example.com/video"></iframe></body></html>`,
    );
    const result = await runCspElementsValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("fail");
    const errors = data.diagnostics.filter((d) => d.ruleId === "CSP-EL-02");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
    expect(errors[0].message).toContain("frame-src");
  });

  it("emits CSP-EL-03 error for media-src 'none' blocking <video>", async () => {
    await writeHeaders("Content-Security-Policy: media-src 'none'\n");
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><video src="/clip.mp4"></video></body></html>`,
    );
    const result = await runCspElementsValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("fail");
    const errors = data.diagnostics.filter((d) => d.ruleId === "CSP-EL-03");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
    expect(errors[0].message).toContain("media-src");
  });

  it("emits CSP-EL-03 error for media-src 'none' blocking <audio>", async () => {
    await writeHeaders("Content-Security-Policy: media-src 'none'\n");
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><audio src="/song.mp3"></audio></body></html>`,
    );
    const result = await runCspElementsValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("fail");
    const errors = data.diagnostics.filter((d) => d.ruleId === "CSP-EL-03");
    expect(errors).toHaveLength(1);
  });

  it("emits CSP-EL-03 for <source> inside <video> when media-src 'none'", async () => {
    await writeHeaders("Content-Security-Policy: media-src 'none'\n");
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><video><source src="/clip.webm" type="video/webm"></video></body></html>`,
    );
    const result = await runCspElementsValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("fail");
    const errors = data.diagnostics.filter((d) => d.ruleId === "CSP-EL-03");
    expect(errors).toHaveLength(1);
  });

  it("passes when object-src 'self' and <object data='/path.pdf'> is same-origin", async () => {
    await writeHeaders("Content-Security-Policy: object-src 'self'\n");
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><object data="/path.pdf" type="application/pdf"></object></body></html>`,
    );
    const result = await runCspElementsValidate(input, ctx());
    expect(result.exitCode).toBe(0);
    const data = getData(result);
    expect(data.status).toBe("pass");
    expect(data.diagnostics).toHaveLength(0);
  });

  it("passes when default-src 'self' covers object-src (fallback)", async () => {
    await writeHeaders("Content-Security-Policy: default-src 'self'\n");
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><object data="/file.pdf"></object></body></html>`,
    );
    const result = await runCspElementsValidate(input, ctx());
    expect(result.exitCode).toBe(0);
    const data = getData(result);
    expect(data.status).toBe("pass");
  });

  it("emits error when default-src 'none' blocks <iframe> (fallback to default-src)", async () => {
    await writeHeaders("Content-Security-Policy: default-src 'none'\n");
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><iframe src="/page.html"></iframe></body></html>`,
    );
    const result = await runCspElementsValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("fail");
    const errors = data.diagnostics.filter((d) => d.ruleId === "CSP-EL-02");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("default-src");
  });

  it("emits error for external origin not in frame-src", async () => {
    await writeHeaders("Content-Security-Policy: frame-src 'self'\n");
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><iframe src="https://embed.example.com/video"></iframe></body></html>`,
    );
    const result = await runCspElementsValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("fail");
    const errors = data.diagnostics.filter((d) => d.ruleId === "CSP-EL-02");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("embed.example.com");
  });

  it("passes when external iframe origin is in frame-src", async () => {
    await writeHeaders(
      "Content-Security-Policy: frame-src 'self' embed.example.com\n",
    );
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><iframe src="https://embed.example.com/video"></iframe></body></html>`,
    );
    const result = await runCspElementsValidate(input, ctx());
    expect(result.exitCode).toBe(0);
    const data = getData(result);
    expect(data.status).toBe("pass");
  });

  it("does NOT emit CSP-EL-03 for <source> inside <picture>", async () => {
    await writeHeaders("Content-Security-Policy: media-src 'none'; img-src 'self'\n");
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><picture><source srcset="/img.webp" type="image/webp"><img src="/img.png"></picture></body></html>`,
    );
    const result = await runCspElementsValidate(input, ctx());
    const data = getData(result);
    const mediaErrors = data.diagnostics.filter((d) => d.ruleId === "CSP-EL-03");
    expect(mediaErrors).toHaveLength(0);
  });

  it("passes when no tracked elements are present in HTML", async () => {
    await writeHeaders("Content-Security-Policy: object-src 'none'; frame-src 'none'; media-src 'none'\n");
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><p>Just text</p><img src="/img.png"></body></html>`,
    );
    const result = await runCspElementsValidate(input, ctx());
    expect(result.exitCode).toBe(0);
    const data = getData(result);
    expect(data.status).toBe("pass");
  });
});
