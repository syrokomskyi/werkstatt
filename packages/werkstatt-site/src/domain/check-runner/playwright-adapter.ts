/*
<MODULE_CONTRACT>
<purpose>
  Playwright implementation of BrowserCapturePort. Handles browser launch,
  page navigation, DOM extraction, and multi-viewport screenshot capture.
</purpose>
<non-goals>
  <item>Do not assemble SiteEvidenceGraph — that is the orchestrator's job.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review 2026-07-14: extract Playwright-specific capture into adapter behind BrowserCapturePort.</item>
</CHANGE_SUMMARY>
*/

import { mkdir } from "node:fs/promises";
import { join, posix } from "node:path";
import { extractPageEvidenceFromDOM } from "./dom-extract.ts";
import type { BrowserCapturePort, CapturedPage } from "./browser-capture-port.ts";

const VIEWPORTS = [
  { name: "desktop" as const, width: 1440, height: 1100 },
  { name: "mobile" as const, width: 390, height: 844 },
];

export class PlaywrightCaptureAdapter implements BrowserCapturePort {
  private browser: Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>> | null =
    null;

  private async ensureBrowser() {
    if (!this.browser) {
      const { chromium } = await import("playwright");
      this.browser = await chromium.launch();
    }
    return this.browser;
  }

  async capturePage(
    url: string,
    path: string,
    screenshotDir: string,
    relativeScreenshotDir: string,
  ): Promise<CapturedPage> {
    const browser = await this.ensureBrowser();
    await mkdir(screenshotDir, { recursive: true });
    const context = await browser.newContext({ viewport: VIEWPORTS[0] });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const pageEvidence = await page.evaluate(extractPageEvidenceFromDOM);
    const screenshots: { name: string; width: number; height: number; path: string }[] = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const safeName = path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "index";
      const screenshotFile = `${safeName}-${viewport.name}.png`;
      const screenshotPath = join(screenshotDir, screenshotFile);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      screenshots.push({
        name: viewport.name,
        width: viewport.width,
        height: viewport.height,
        path: posix.join(relativeScreenshotDir, screenshotFile),
      });
    }
    await context.close();
    return {
      url,
      path,
      title: pageEvidence.title,
      lang: pageEvidence.lang,
      canonical: pageEvidence.canonical,
      metaDescription: pageEvidence.metaDescription,
      text: pageEvidence.text,
      sections: pageEvidence.sections,
      links: pageEvidence.links,
      agentFeatures: pageEvidence.agentFeatures,
      screenshots,
    };
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
