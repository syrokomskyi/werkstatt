/*
<MODULE_CONTRACT>
  <purpose>RFC-0499: unit tests for surface.media-leakage.validate — prohibited string
  detection (exact, whole-word, context-aware), AI-generated image label and link checks.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0499: initial tests for surface.media-leakage.validate.</item>
</CHANGE_SUMMARY>
*/

import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { runSurfaceMediaLeakageValidate } from "../surface-media-leakage-validate.ts";
import { makeTestSiteContext, testInput, unwrapData } from "./helpers.ts";
import { ARTIFACT_FILE } from "../surface/shared.ts";

async function withTempApp(
  fn: (
    root: string,
    appDir: string,
    context: ReturnType<typeof makeTestSiteContext>,
  ) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "media-leakage-"));
  const appDir = join(root, "apps", "test-app");
  await mkdir(join(appDir, "src"), { recursive: true });
  const context = makeTestSiteContext(root, appDir);
  try {
    await fn(root, appDir, context);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const SURFACE_ARTIFACT = stringifyYaml({
  generatedAt: null,
  entries: [
    {
      surfaceId: "website-local",
      pageId: "website-local:friseur:stuttgart",
      routes: { de: "/website/friseur/stuttgart" },
      axes: { industry: "friseur", city: "stuttgart" },
      depth: 4,
      recordCount: 1,
      indexable: true,
      noindex: false,
    },
  ],
});

async function writeHtmlFile(
  distClientDir: string,
  routePath: string,
  html: string,
): Promise<void> {
  const dir = join(distClientDir, routePath);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), html, "utf8");
}

const CLEAN_HTML = `<!DOCTYPE html>
<html><head><title>Friseur Stuttgart</title></head>
<body><h1>Friseur in Stuttgart</h1><p>Willkommen auf unserer Seite.</p></body></html>`;

describe("surface.media-leakage.validate", () => {
  it("skips when no surface artifact exists", async () => {
    await withTempApp(async (_root, _appDir, context) => {
      const result = await runSurfaceMediaLeakageValidate(testInput(), context);
      expect(result.exitCode).toBe(0);
      const data = unwrapData(result);
      expect(data.status).toBe("pass");
    });
  });

  it("skips when no dist/client directory exists", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeFile(join(appDir, ARTIFACT_FILE), SURFACE_ARTIFACT, "utf8");
      const result = await runSurfaceMediaLeakageValidate(testInput(), context);
      expect(result.exitCode).toBe(0);
      const data = unwrapData(result);
      expect(data.status).toBe("pass");
    });
  });

  it("passes when HTML contains no prohibited strings", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeFile(join(appDir, ARTIFACT_FILE), SURFACE_ARTIFACT, "utf8");
      const distDir = join(appDir, "dist", "client");
      await writeHtmlFile(distDir, "website/friseur/stuttgart", CLEAN_HTML);
      const result = await runSurfaceMediaLeakageValidate(testInput(), context);
      const data = unwrapData(result);
      expect(data.status).toBe("pass");
    });
  });

  it("detects whole-word prohibited string AIPlatform in visible HTML", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeFile(join(appDir, ARTIFACT_FILE), SURFACE_ARTIFACT, "utf8");
      const distDir = join(appDir, "dist", "client");
      const html = CLEAN_HTML.replace(
        "</body>",
        "<p>The AIPlatform generated this image.</p></body>",
      );
      await writeHtmlFile(distDir, "website/friseur/stuttgart", html);
      const result = await runSurfaceMediaLeakageValidate(testInput(), context);
      const data = unwrapData(result);
      const leakDiags = data.diagnostics.filter(
        (d: { ruleId: string; message: string }) =>
          d.ruleId === "surface.media-leakage.validate" && d.message.includes("AIPlatform"),
      );
      expect(leakDiags.length).toBeGreaterThan(0);
    });
  });

  it("detects exact prohibited string Copyright boilerplate outside footer", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeFile(join(appDir, ARTIFACT_FILE), SURFACE_ARTIFACT, "utf8");
      const distDir = join(appDir, "dist", "client");
      const html = CLEAN_HTML.replace(
        "</body>",
        "<div>Copyright © 2026 Webgogol. Alle Rechte vorbehalten.</div></body>",
      );
      await writeHtmlFile(distDir, "website/friseur/stuttgart", html);
      const result = await runSurfaceMediaLeakageValidate(testInput(), context);
      const data = unwrapData(result);
      const leakDiags = data.diagnostics.filter(
        (d: { ruleId: string; message: string }) =>
          d.ruleId === "surface.media-leakage.validate" && d.message.includes("Copyright"),
      );
      expect(leakDiags.length).toBeGreaterThan(0);
    });
  });

  it("does not flag Copyright boilerplate inside footer", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeFile(join(appDir, ARTIFACT_FILE), SURFACE_ARTIFACT, "utf8");
      const distDir = join(appDir, "dist", "client");
      const html = `<!DOCTYPE html>
<html><head><title>Friseur Stuttgart</title></head>
<body><h1>Friseur in Stuttgart</h1>
<footer><p>Copyright © 2026 Webgogol. Alle Rechte vorbehalten.</p></footer>
</body></html>`;
      await writeHtmlFile(distDir, "website/friseur/stuttgart", html);
      const result = await runSurfaceMediaLeakageValidate(testInput(), context);
      const data = unwrapData(result);
      const copyrightDiags = data.diagnostics.filter(
        (d: { ruleId: string; message: string }) =>
          d.ruleId === "surface.media-leakage.validate" && d.message.includes("Copyright"),
      );
      expect(copyrightDiags).toHaveLength(0);
    });
  });

  it("does not flag context-aware prohibited string inside figcaption (credit context)", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeFile(join(appDir, ARTIFACT_FILE), SURFACE_ARTIFACT, "utf8");
      const distDir = join(appDir, "dist", "client");
      const html = `<!DOCTYPE html>
<html><head><title>Friseur Stuttgart</title></head>
<body><h1>Friseur in Stuttgart</h1>
<figcaption>Bild generiert mit Gemini AI-Modell.</figcaption>
</body></html>`;
      await writeHtmlFile(distDir, "website/friseur/stuttgart", html);
      const result = await runSurfaceMediaLeakageValidate(testInput(), context);
      const data = unwrapData(result);
      const geminiDiags = data.diagnostics.filter(
        (d: { ruleId: string; message: string }) =>
          d.ruleId === "surface.media-leakage.validate" && d.message.includes("Gemini"),
      );
      expect(geminiDiags).toHaveLength(0);
    });
  });

  it("detects context-aware prohibited string outside credit context", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeFile(join(appDir, ARTIFACT_FILE), SURFACE_ARTIFACT, "utf8");
      const distDir = join(appDir, "dist", "client");
      const html = `<!DOCTYPE html>
<html><head><title>Friseur Stuttgart</title></head>
<body><h1>Friseur in Stuttgart</h1>
<p>Bild generiert mit Gemini AI-Modell.</p>
</body></html>`;
      await writeHtmlFile(distDir, "website/friseur/stuttgart", html);
      const result = await runSurfaceMediaLeakageValidate(testInput(), context);
      const data = unwrapData(result);
      const geminiDiags = data.diagnostics.filter(
        (d: { ruleId: string; message: string }) =>
          d.ruleId === "surface.media-leakage.validate" && d.message.includes("Gemini"),
      );
      expect(geminiDiags.length).toBeGreaterThan(0);
    });
  });

  it("detects AI-generated image missing required label", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeFile(join(appDir, ARTIFACT_FILE), SURFACE_ARTIFACT, "utf8");
      const distDir = join(appDir, "dist", "client");
      const html = CLEAN_HTML.replace(
        "</body>",
        '<img src="/img/ai-art.webp" data-ai-generated alt="AI art" /></body>',
      );
      await writeHtmlFile(distDir, "website/friseur/stuttgart", html);
      const result = await runSurfaceMediaLeakageValidate(testInput(), context);
      const data = unwrapData(result);
      const labelDiags = data.diagnostics.filter(
        (d: { ruleId: string; message: string }) =>
          d.ruleId === "surface.media-leakage.validate" &&
          d.message.includes("MEDIA-LEAK-AI-LABEL"),
      );
      expect(labelDiags.length).toBeGreaterThan(0);
    });
  });

  it("detects AI-generated image missing /bildnachweise/ link", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeFile(join(appDir, ARTIFACT_FILE), SURFACE_ARTIFACT, "utf8");
      const distDir = join(appDir, "dist", "client");
      const html = CLEAN_HTML.replace(
        "</body>",
        '<img src="/img/ai-art.webp" data-ai-generated alt="Konzeptillustration" /></body>',
      );
      await writeHtmlFile(distDir, "website/friseur/stuttgart", html);
      const result = await runSurfaceMediaLeakageValidate(testInput(), context);
      const data = unwrapData(result);
      const linkDiags = data.diagnostics.filter(
        (d: { ruleId: string; message: string }) =>
          d.ruleId === "surface.media-leakage.validate" && d.message.includes("MEDIA-LEAK-AI-LINK"),
      );
      expect(linkDiags.length).toBeGreaterThan(0);
    });
  });

  it("passes when AI-generated image has label and bildnachweise link", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeFile(join(appDir, ARTIFACT_FILE), SURFACE_ARTIFACT, "utf8");
      const distDir = join(appDir, "dist", "client");
      const html = CLEAN_HTML.replace(
        "</body>",
        '<img src="/img/ai-art.webp" data-ai-generated alt="Konzeptillustration" /><a href="/bildnachweise/#art-001">Bildnachweise</a></body>',
      );
      await writeHtmlFile(distDir, "website/friseur/stuttgart", html);
      const result = await runSurfaceMediaLeakageValidate(testInput(), context);
      const data = unwrapData(result);
      const aiDiags = data.diagnostics.filter(
        (d: { ruleId: string; message: string }) =>
          d.ruleId === "surface.media-leakage.validate" &&
          (d.message.includes("MEDIA-LEAK-AI-LABEL") || d.message.includes("MEDIA-LEAK-AI-LINK")),
      );
      expect(aiDiags).toHaveLength(0);
    });
  });

  it("does not flag prohibited strings inside JSON-LD script blocks", async () => {
    await withTempApp(async (_root, appDir, context) => {
      await writeFile(join(appDir, ARTIFACT_FILE), SURFACE_ARTIFACT, "utf8");
      const distDir = join(appDir, "dist", "client");
      const html = `<!DOCTYPE html>
<html><head><title>Friseur Stuttgart</title>
<script type="application/ld+json">{"@type":"ImageObject","creator":{"@type":"Organization","name":"AIPlatform"}}</script>
</head><body><h1>Friseur in Stuttgart</h1></body></html>`;
      await writeHtmlFile(distDir, "website/friseur/stuttgart", html);
      const result = await runSurfaceMediaLeakageValidate(testInput(), context);
      const data = unwrapData(result);
      const leakDiags = data.diagnostics.filter(
        (d: { ruleId: string; message: string }) =>
          d.ruleId === "surface.media-leakage.validate" && d.message.includes("AIPlatform"),
      );
      expect(leakDiags).toHaveLength(0);
    });
  });
});
