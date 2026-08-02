/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0653: Tests for print.pdf.copy command — copies PDFs from .cache/pdf/ to dist/client/_print/
    based on manifest.json. Tests cover: no manifest, empty manifest, successful copy, missing source files.
  </purpose>
  <keywords>RFC-0653, print, pdf, copy, cache, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0653: Initial creation — print.pdf.copy unit tests.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runPrintPdfCopy } from "../print-pdf.ts";
import type { KernelRuntimeContext } from "@warpgogol/site-kernel";

function makeContext(appDir: string): KernelRuntimeContext {
  return {
    workspaceRoot: appDir,
    site: { directory: appDir, id: "test-app" },
    logger: {
      info: () => {},
      success: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    flags: {},
    env: {},
  } as unknown as KernelRuntimeContext;
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), "tmp-print-pdf-copy-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("print.pdf.copy (RFC-0653)", () => {
  it("returns pass with 0 copied when manifest.json does not exist", async () => {
    const result = await runPrintPdfCopy({}, makeContext(tmpDir));
    expect(result.exitCode).toBe(0);
    const data = result.data as Record<string, unknown>;
    expect(data?.copied).toBe(0);
  });

  it("returns pass with 0 copied when manifest entries is empty", async () => {
    const cacheBaseDir = join(tmpDir, ".cache", "pdf");
    mkdirSync(cacheBaseDir, { recursive: true });
    writeFileSync(join(cacheBaseDir, "manifest.json"), JSON.stringify({ entries: [] }) + "\n");

    const result = await runPrintPdfCopy({}, makeContext(tmpDir));
    expect(result.exitCode).toBe(0);
    const data = result.data as Record<string, unknown>;
    expect(data?.copied).toBe(0);
  });

  it("copies PDFs from cache to dist/client/_print/", async () => {
    const cacheBaseDir = join(tmpDir, ".cache", "pdf");
    const hashDir = join(cacheBaseDir, "abc123");
    mkdirSync(join(hashDir, "de"), { recursive: true });
    writeFileSync(join(hashDir, "de", "impressum.pdf"), "fake-pdf-content-de");
    writeFileSync(join(hashDir, "de", "datenschutz.pdf"), "fake-pdf-content-de2");

    mkdirSync(join(hashDir, "en"), { recursive: true });
    writeFileSync(join(hashDir, "en", "imprint.pdf"), "fake-pdf-content-en");

    writeFileSync(
      join(cacheBaseDir, "manifest.json"),
      JSON.stringify({
        entries: [
          { lang: "de", routeSlug: "impressum", cacheDir: ".cache/pdf/abc123", pdfFile: "impressum.pdf" },
          { lang: "de", routeSlug: "datenschutz", cacheDir: ".cache/pdf/abc123", pdfFile: "datenschutz.pdf" },
          { lang: "en", routeSlug: "imprint", cacheDir: ".cache/pdf/abc123", pdfFile: "imprint.pdf" },
        ],
      }) + "\n",
    );

    const result = await runPrintPdfCopy({}, makeContext(tmpDir));
    expect(result.exitCode).toBe(0);
    const data = result.data as Record<string, unknown>;
    expect(data?.copied).toBe(3);

    expect(existsSync(join(tmpDir, "dist", "client", "_print", "de", "impressum.pdf"))).toBe(true);
    expect(existsSync(join(tmpDir, "dist", "client", "_print", "de", "datenschutz.pdf"))).toBe(true);
    expect(existsSync(join(tmpDir, "dist", "client", "_print", "en", "imprint.pdf"))).toBe(true);

    const copiedContent = readFileSync(
      join(tmpDir, "dist", "client", "_print", "de", "impressum.pdf"),
      "utf-8",
    );
    expect(copiedContent).toBe("fake-pdf-content-de");
  });

  it("returns fail when source PDF is missing in cache", async () => {
    const cacheBaseDir = join(tmpDir, ".cache", "pdf");
    const hashDir = join(cacheBaseDir, "abc123");
    mkdirSync(join(hashDir, "de"), { recursive: true });
    writeFileSync(join(hashDir, "de", "impressum.pdf"), "fake-pdf-content");

    writeFileSync(
      join(cacheBaseDir, "manifest.json"),
      JSON.stringify({
        entries: [
          { lang: "de", routeSlug: "impressum", cacheDir: ".cache/pdf/abc123", pdfFile: "impressum.pdf" },
          { lang: "de", routeSlug: "datenschutz", cacheDir: ".cache/pdf/abc123", pdfFile: "datenschutz.pdf" },
        ],
      }) + "\n",
    );

    const result = await runPrintPdfCopy({}, makeContext(tmpDir));
    expect(result.exitCode).toBe(1);
    const data = result.data as Record<string, unknown>;
    expect(data?.copied).toBe(1);
    expect(Array.isArray(data?.missing)).toBe(true);
    expect((data?.missing as string[]).length).toBe(1);
  });
});
