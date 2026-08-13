/*
<MODULE_CONTRACT>
<purpose>
  Test coverage for RFC-0833 Lighthouse validators — LH-13 (forced reflow),
  LH-11 (render-blocking CSS), LH-12 (unreferenced JS bundles).
  Tests the exported helper functions directly with fixture content.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0833: initial test suite — detectForcedReflow, detectRenderBlockingCss, buildJsReferenceGraph.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectForcedReflow,
  detectRenderBlockingCss,
  buildJsReferenceGraph,
} from "../lighthouse.ts";

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "lighthouse-rfc0833-"));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

// ─── LH-13: detectForcedReflow ──────────────────────────────────────────────

describe("detectForcedReflow (LH-13)", () => {
  it("detects write-then-read without rAF separator", () => {
    const content = `const el = document.getElementById("test");
el.appendChild(child);
const w = el.offsetWidth;`;
    const findings = detectForcedReflow(content);
    expect(findings.length).toBe(1);
    expect(findings[0].readProp).toBe("offsetWidth");
    expect(findings[0].writeStmt).toBe("appendChild");
  });

  it("does not flag when requestAnimationFrame separates write and read", () => {
    const content = `el.appendChild(child);
requestAnimationFrame(() => {
  const w = el.offsetWidth;
});`;
    const findings = detectForcedReflow(content);
    expect(findings.length).toBe(0);
  });

  it("does not flag read-only without preceding write", () => {
    const content = `const w = el.offsetWidth;
console.log(w);`;
    const findings = detectForcedReflow(content);
    expect(findings.length).toBe(0);
  });

  it("detects innerHTML write followed by getBoundingClientRect", () => {
    const content = `el.innerHTML = "<p>hello</p>";
const rect = el.getBoundingClientRect();`;
    const findings = detectForcedReflow(content);
    expect(findings.length).toBe(1);
    expect(findings[0].readProp).toBe("getBoundingClientRect");
  });

  it("detects classList.add followed by offsetHeight", () => {
    const content = `el.classList.add("active");
const h = el.offsetHeight;`;
    const findings = detectForcedReflow(content);
    expect(findings.length).toBe(1);
    expect(findings[0].readProp).toBe("offsetHeight");
  });
});

// ─── LH-11: detectRenderBlockingCss ─────────────────────────────────────────

describe("detectRenderBlockingCss (LH-11)", () => {
  it("flags large stylesheet as error", async () => {
    const distClientDir = join(tmpRoot, "dist", "client");
    await mkdir(distClientDir, { recursive: true });
    const largeCss = "x".repeat(5 * 1024);
    await writeFile(join(distClientDir, "large.css"), largeCss, "utf8");

    const html = `<html><head>
<link rel="stylesheet" href="/large.css">
</head><body></body></html>`;
    const findings = await detectRenderBlockingCss(html, distClientDir, undefined);
    expect(findings.length).toBe(1);
    expect(findings[0].href).toBe("/large.css");
    expect(findings[0].severity).toBe("error");
  });

  it("exempts small stylesheet when inlineStylesheets is auto", async () => {
    const distClientDir = join(tmpRoot, "dist", "client");
    await mkdir(distClientDir, { recursive: true });
    const smallCss = "x".repeat(2 * 1024);
    await writeFile(join(distClientDir, "small.css"), smallCss, "utf8");

    const html = `<html><head>
<link rel="stylesheet" href="/small.css">
</head><body></body></html>`;
    const findings = await detectRenderBlockingCss(html, distClientDir, "auto");
    expect(findings.length).toBe(0);
  });

  it("flags small stylesheet as warning when inlineStylesheets is not set", async () => {
    const distClientDir = join(tmpRoot, "dist", "client");
    await mkdir(distClientDir, { recursive: true });
    const smallCss = "x".repeat(2 * 1024);
    await writeFile(join(distClientDir, "small.css"), smallCss, "utf8");

    const html = `<html><head>
<link rel="stylesheet" href="/small.css">
</head><body></body></html>`;
    const findings = await detectRenderBlockingCss(html, distClientDir, undefined);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe("warning");
  });

  it("skips preload and print stylesheets", async () => {
    const distClientDir = join(tmpRoot, "dist", "client");
    await mkdir(distClientDir, { recursive: true });

    const html = `<html><head>
<link rel="preload" as="style" href="/preload.css">
<link rel="stylesheet" href="/print.css" media="print">
</head><body></body></html>`;
    const findings = await detectRenderBlockingCss(html, distClientDir, undefined);
    expect(findings.length).toBe(0);
  });

  it("does not flag stylesheet inside noscript fallback", async () => {
    const distClientDir = join(tmpRoot, "dist", "client");
    await mkdir(distClientDir, { recursive: true });
    const largeCss = "x".repeat(5 * 1024);
    await writeFile(join(distClientDir, "large.css"), largeCss, "utf8");

    const html = `<html><head>
<link rel="preload" as="style" href="/large.css" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/large.css"></noscript>
</head><body></body></html>`;
    const findings = await detectRenderBlockingCss(html, distClientDir, undefined);
    expect(findings.length).toBe(0);
  });
});

// ─── LH-12: buildJsReferenceGraph ───────────────────────────────────────────

describe("buildJsReferenceGraph (LH-12)", () => {
  it("flags unreferenced JS bundle in _astro/", async () => {
    const distClientDir = join(tmpRoot, "dist", "client");
    const astroDir = join(distClientDir, "_astro");
    await mkdir(astroDir, { recursive: true });

    await writeFile(join(astroDir, "referenced.js"), 'console.log("ok");', "utf8");
    await writeFile(join(astroDir, "orphan.js"), 'console.log("orphan");', "utf8");

    const htmlPath = join(distClientDir, "index.html");
    await writeFile(
      htmlPath,
      `<html><head><script type="module" src="/_astro/referenced.js"></script></head><body></body></html>`,
      "utf8",
    );

    const { unreferenced } = await buildJsReferenceGraph([htmlPath], distClientDir);
    const orphanFound = unreferenced.some((f) => f.includes("orphan.js"));
    expect(orphanFound).toBe(true);
    const referencedFound = unreferenced.some((f) => f.includes("referenced.js"));
    expect(referencedFound).toBe(false);
  });

  it("does not flag when all JS files are referenced", async () => {
    const distClientDir = join(tmpRoot, "dist", "client");
    const astroDir = join(distClientDir, "_astro");
    await mkdir(astroDir, { recursive: true });

    await writeFile(join(astroDir, "main.js"), 'import "./helper.js";', "utf8");
    await writeFile(join(astroDir, "helper.js"), "export const x = 1;", "utf8");

    const htmlPath = join(distClientDir, "index.html");
    await writeFile(
      htmlPath,
      `<html><head><script type="module" src="/_astro/main.js"></script></head><body></body></html>`,
      "utf8",
    );

    const { unreferenced } = await buildJsReferenceGraph([htmlPath], distClientDir);
    expect(unreferenced.length).toBe(0);
  });

  it("handles missing _astro directory gracefully", async () => {
    const distClientDir = join(tmpRoot, "dist", "client");
    await mkdir(distClientDir, { recursive: true });

    const htmlPath = join(distClientDir, "index.html");
    await writeFile(htmlPath, `<html><body></body></html>`, "utf8");

    const { unreferenced } = await buildJsReferenceGraph([htmlPath], distClientDir);
    expect(unreferenced.length).toBe(0);
  });
});
