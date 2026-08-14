/*
<MODULE_CONTRACT>
  <purpose>
    Test coverage for image.delivery.validate (RFC-0830) — proves the validator
    catches missing srcset, oversize images, missing LCP attributes, and handles
    config overrides and edge cases (SVG, small icons, lazy images, missing dist).
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0830: initial test suite — IMG-DELIVERY-01, IMG-DELIVERY-02, IMG-DELIVERY-04, config, skip-on-missing-dist.</item>
  <item>RFC-0841: add IMG-DELIVERY-CONFIG-02 location diagnostic tests (root only, src only, both, neither).</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testLogger, makeTestSiteContext, testInput, unwrapData } from "./helpers.ts";
import { runImageDeliveryValidate } from "../image-delivery.ts";
import type { KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

let tmpRoot: string;
let appDir: string;
let distDir: string;
let srcDir: string;

async function setupApp(): Promise<void> {
  tmpRoot = await mkdtemp(join(tmpdir(), "img-delivery-"));
  appDir = join(tmpRoot, "test-app");
  srcDir = join(appDir, "src");
  distDir = join(appDir, "dist", "client");
  await mkdir(srcDir, { recursive: true });
  await mkdir(distDir, { recursive: true });
}

async function writeHtml(name: string, html: string): Promise<void> {
  await writeFile(join(distDir, name), html, "utf8");
}

async function writeImage(name: string, width: number, height: number): Promise<void> {
  const sharp = (await import("sharp")).default;
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .webp({ quality: 1 })
    .toBuffer();
  await writeFile(join(distDir, name), buffer);
}

async function writeConfig(yaml: string): Promise<void> {
  await writeFile(join(srcDir, "image-delivery.config.yaml"), yaml, "utf8");
}

async function writeRootConfig(yaml: string): Promise<void> {
  await writeFile(join(appDir, "image-delivery.config.yaml"), yaml, "utf8");
}

function ctx(): KernelRuntimeContext {
  return makeTestSiteContext(tmpRoot, appDir, "test-app");
}

const input = testInput();

interface DeliveryResultData {
  command: string;
  status: string;
  findings: Array<{ rule: string; severity: string; message: string }>;
  checkedImages: number;
}

function getData(result: Awaited<ReturnType<typeof runImageDeliveryValidate>>): DeliveryResultData {
  return unwrapData(result) as DeliveryResultData;
}

function getFindings(
  data: DeliveryResultData,
): Array<{ rule: string; severity: string; message: string }> {
  return data.findings ?? [];
}

beforeEach(async () => {
  await setupApp();
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("image.delivery.validate (RFC-0830)", () => {
  it("skips with pass when dist/client does not exist", async () => {
    await rm(distDir, { recursive: true, force: true });
    const result = await runImageDeliveryValidate(input, ctx());
    expect(result.exitCode).toBe(0);
    const data = getData(result);
    expect(data.status).toBe("pass");
    expect(data.checkedImages).toBe(0);
  });

  it("passes when no HTML files exist", async () => {
    const result = await runImageDeliveryValidate(input, ctx());
    expect(result.exitCode).toBe(0);
    const data = getData(result);
    expect(data.status).toBe("pass");
    expect(data.checkedImages).toBe(0);
  });

  // --- IMG-DELIVERY-01 ---

  it("IMG-DELIVERY-01: errors when <img> lacks srcset", async () => {
    await writeImage("hero.webp", 800, 600);
    await writeHtml(
      "index.html",
      `<html><body><img src="/hero.webp" width="800" height="600" loading="eager" fetchpriority="high" decoding="async" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const srcsetFindings = getFindings(data).filter((f) => f.rule === "IMG-DELIVERY-01");
    expect(srcsetFindings).toHaveLength(1);
    expect(srcsetFindings[0]!.severity).toBe("error");
  });

  it("IMG-DELIVERY-01: passes when <img> has srcset with >=2 width descriptors", async () => {
    await writeImage("hero.webp", 800, 600);
    await writeHtml(
      "index.html",
      `<html><body><img src="/hero.webp" srcset="/hero.webp 320w, /hero.webp 640w, /hero.webp 800w" sizes="100vw" width="800" height="600" loading="eager" fetchpriority="high" decoding="async" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const srcsetFindings = getFindings(data).filter((f) => f.rule === "IMG-DELIVERY-01");
    expect(srcsetFindings).toHaveLength(0);
  });

  it("IMG-DELIVERY-01: passes for SVG src (no srcset needed)", async () => {
    await writeHtml(
      "index.html",
      `<html><body><img src="/icon.svg" loading="eager" fetchpriority="high" decoding="async" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const srcsetFindings = getFindings(data).filter((f) => f.rule === "IMG-DELIVERY-01");
    expect(srcsetFindings).toHaveLength(0);
  });

  it("IMG-DELIVERY-01: passes for small icon (width <= 64)", async () => {
    await writeImage("icon.webp", 32, 32);
    await writeHtml(
      "index.html",
      `<html><body><img src="/icon.webp" width="32" height="32" loading="eager" fetchpriority="high" decoding="async" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const srcsetFindings = getFindings(data).filter((f) => f.rule === "IMG-DELIVERY-01");
    expect(srcsetFindings).toHaveLength(0);
  });

  it("IMG-DELIVERY-01: passes for lazy+async image (no srcset needed)", async () => {
    await writeImage("below.webp", 800, 600);
    await writeHtml(
      "index.html",
      `<html><body><img src="/hero.webp" srcset="/hero.webp 320w, /hero.webp 800w" sizes="100vw" width="800" height="600" loading="eager" fetchpriority="high" decoding="async" /><img src="/below.webp" width="800" height="600" loading="lazy" decoding="async" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const srcsetFindings = getFindings(data).filter((f) => f.rule === "IMG-DELIVERY-01");
    expect(srcsetFindings).toHaveLength(0);
  });

  // --- IMG-DELIVERY-02 ---

  it("IMG-DELIVERY-02: passes when image is within budget", async () => {
    await writeImage("hero.webp", 100, 100);
    await writeHtml(
      "index.html",
      `<html><body><img src="/hero.webp" srcset="/hero.webp 100w, /hero.webp 50w" sizes="100vw" width="100" height="100" loading="eager" fetchpriority="high" decoding="async" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const budgetFindings = getFindings(data).filter((f) => f.rule === "IMG-DELIVERY-02");
    expect(budgetFindings).toHaveLength(0);
  });

  it("IMG-DELIVERY-02: errors when image exceeds 2x budget", async () => {
    const sharp = (await import("sharp")).default;
    const buffer = await sharp({
      create: { width: 2000, height: 2000, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .png({ quality: 100, compressionLevel: 0 })
      .toBuffer();
    await writeFile(join(distDir, "big.png"), buffer);
    await writeHtml(
      "index.html",
      `<html><body><img src="/big.png" srcset="/big.png 100w, /big.png 200w" sizes="100vw" width="2000" height="2000" loading="eager" fetchpriority="high" decoding="async" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const budgetFindings = getFindings(data).filter(
      (f) => f.rule === "IMG-DELIVERY-02" && f.severity === "error",
    );
    expect(budgetFindings.length).toBeGreaterThanOrEqual(1);
  });

  // --- IMG-DELIVERY-04 ---

  it("IMG-DELIVERY-04: passes when fetchpriority=high + loading=eager + decoding=async", async () => {
    await writeImage("hero.webp", 800, 600);
    await writeHtml(
      "index.html",
      `<html><body><img src="/hero.webp" srcset="/hero.webp 320w, /hero.webp 800w" sizes="100vw" width="800" height="600" loading="eager" fetchpriority="high" decoding="async" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const lcpFindings = getFindings(data).filter((f) => f.rule === "IMG-DELIVERY-04");
    expect(lcpFindings).toHaveLength(0);
  });

  it("IMG-DELIVERY-04: errors when fetchpriority=high but missing decoding=async", async () => {
    await writeImage("hero.webp", 800, 600);
    await writeHtml(
      "index.html",
      `<html><body><img src="/hero.webp" srcset="/hero.webp 320w, /hero.webp 800w" sizes="100vw" width="800" height="600" loading="eager" fetchpriority="high" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const lcpFindings = getFindings(data).filter(
      (f) => f.rule === "IMG-DELIVERY-04" && f.severity === "error",
    );
    expect(lcpFindings.length).toBeGreaterThanOrEqual(1);
  });

  it("IMG-DELIVERY-04: errors when no fetchpriority=high image on page", async () => {
    await writeImage("hero.webp", 800, 600);
    await writeHtml(
      "index.html",
      `<html><body><img src="/hero.webp" srcset="/hero.webp 320w, /hero.webp 800w" sizes="100vw" width="800" height="600" loading="lazy" decoding="async" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const lcpFindings = getFindings(data).filter(
      (f) => f.rule === "IMG-DELIVERY-04" && f.message.includes("No <img> with fetchpriority"),
    );
    expect(lcpFindings).toHaveLength(1);
    expect(lcpFindings[0]!.severity).toBe("error");
  });

  it("IMG-DELIVERY-04: 404.html is exempt from page-level LCP check (ADR-0046)", async () => {
    await writeImage("logo.webp", 100, 100);
    await writeHtml(
      "404.html",
      `<html><body><img src="/logo.webp" width="100" height="100" loading="lazy" decoding="async" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const pageLevelFindings = getFindings(data).filter(
      (f) => f.rule === "IMG-DELIVERY-04" && f.message.includes("No <img> with fetchpriority"),
    );
    expect(pageLevelFindings).toHaveLength(0);
  });

  it("IMG-DELIVERY-04: per-image attribute check still runs on 404.html (ADR-0046)", async () => {
    await writeImage("hero.webp", 800, 600);
    await writeHtml(
      "404.html",
      `<html><body><img src="/hero.webp" srcset="/hero.webp 320w, /hero.webp 800w" sizes="100vw" width="800" height="600" loading="eager" fetchpriority="high" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const perImageFindings = getFindings(data).filter(
      (f) =>
        f.rule === "IMG-DELIVERY-04" && f.severity === "error" && f.message.includes("decoding"),
    );
    expect(perImageFindings.length).toBeGreaterThanOrEqual(1);
  });

  // --- Config ---

  it("config: valid override skips IMG-DELIVERY-01 for matching src", async () => {
    await writeImage("hero.webp", 800, 600);
    await writeConfig(`
overrides:
  - srcPattern: "/hero.webp"
    rules:
      - IMG-DELIVERY-01
    reason: "intentionally no srcset for this image"
`);
    await writeHtml(
      "index.html",
      `<html><body><img src="/hero.webp" width="800" height="600" loading="eager" fetchpriority="high" decoding="async" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const srcsetFindings = getFindings(data).filter((f) => f.rule === "IMG-DELIVERY-01");
    expect(srcsetFindings).toHaveLength(0);
  });

  it("config: malformed config emits IMG-DELIVERY-CONFIG-01 warning", async () => {
    await writeConfig(`invalid: yaml: content: here`);
    await writeHtml(
      "index.html",
      `<html><body><img src="/hero.webp" srcset="/hero.webp 320w, /hero.webp 800w" sizes="100vw" width="800" height="600" loading="eager" fetchpriority="high" decoding="async" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const configFindings = getFindings(data).filter((f) => f.rule === "IMG-DELIVERY-CONFIG-01");
    expect(configFindings.length).toBeGreaterThanOrEqual(1);
    expect(configFindings[0]!.severity).toBe("warning");
  });

  it("config: missing config file means no overrides (no warning)", async () => {
    await writeImage("hero.webp", 800, 600);
    await writeHtml(
      "index.html",
      `<html><body><img src="/hero.webp" srcset="/hero.webp 320w, /hero.webp 800w" sizes="100vw" width="800" height="600" loading="eager" fetchpriority="high" decoding="async" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const configFindings = getFindings(data).filter((f) => f.rule === "IMG-DELIVERY-CONFIG-01");
    expect(configFindings).toHaveLength(0);
  });

  // --- IMG-DELIVERY-CONFIG-02 (RFC-0841: location diagnostic) ---

  it("IMG-DELIVERY-CONFIG-02: warns when config is in root but not in src/", async () => {
    await writeRootConfig(`overrides: []`);
    await writeHtml(
      "index.html",
      `<html><body><img src="/hero.webp" srcset="/hero.webp 320w, /hero.webp 800w" sizes="100vw" width="800" height="600" loading="eager" fetchpriority="high" decoding="async" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const locationFindings = getFindings(data).filter((f) => f.rule === "IMG-DELIVERY-CONFIG-02");
    expect(locationFindings).toHaveLength(1);
    expect(locationFindings[0]!.severity).toBe("warning");
    expect(locationFindings[0]!.message).toContain("workpiece root");
  });

  it("IMG-DELIVERY-CONFIG-02: no warning when config is in src/ only", async () => {
    await writeConfig(`overrides: []`);
    await writeHtml(
      "index.html",
      `<html><body><img src="/hero.webp" srcset="/hero.webp 320w, /hero.webp 800w" sizes="100vw" width="800" height="600" loading="eager" fetchpriority="high" decoding="async" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const locationFindings = getFindings(data).filter((f) => f.rule === "IMG-DELIVERY-CONFIG-02");
    expect(locationFindings).toHaveLength(0);
  });

  it("IMG-DELIVERY-CONFIG-02: no warning when config is in both root and src/", async () => {
    await writeRootConfig(`overrides: []`);
    await writeConfig(`overrides: []`);
    await writeHtml(
      "index.html",
      `<html><body><img src="/hero.webp" srcset="/hero.webp 320w, /hero.webp 800w" sizes="100vw" width="800" height="600" loading="eager" fetchpriority="high" decoding="async" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const locationFindings = getFindings(data).filter((f) => f.rule === "IMG-DELIVERY-CONFIG-02");
    expect(locationFindings).toHaveLength(0);
  });

  it("IMG-DELIVERY-CONFIG-02: no warning when config is in neither location", async () => {
    await writeHtml(
      "index.html",
      `<html><body><img src="/hero.webp" srcset="/hero.webp 320w, /hero.webp 800w" sizes="100vw" width="800" height="600" loading="eager" fetchpriority="high" decoding="async" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    const locationFindings = getFindings(data).filter((f) => f.rule === "IMG-DELIVERY-CONFIG-02");
    expect(locationFindings).toHaveLength(0);
  });

  // --- JSON output shape ---

  it("result has command, status, findings, checkedImages fields", async () => {
    await writeImage("hero.webp", 800, 600);
    await writeHtml(
      "index.html",
      `<html><body><img src="/hero.webp" srcset="/hero.webp 320w, /hero.webp 800w" sizes="100vw" width="800" height="600" loading="eager" fetchpriority="high" decoding="async" /></body></html>`,
    );
    const result = await runImageDeliveryValidate(input, ctx());
    const data = getData(result);
    expect(data).toHaveProperty("command", "image.delivery.validate");
    expect(data).toHaveProperty("status");
    expect(data).toHaveProperty("findings");
    expect(data).toHaveProperty("checkedImages");
    expect(Array.isArray(data.findings)).toBe(true);
    expect(typeof data.checkedImages).toBe("number");
  });
});
