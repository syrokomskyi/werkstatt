/*
<MODULE_CONTRACT>
<purpose>Node.js check runner for the check-warpgogol ecosystem: captures site evidence graphs via Playwright and provides runner info.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Migrated to @warpgogol/fingerprint byteHash directly (prefixed format), removing the legacy sha256Hex wrapper.</item>
  <item>Extracted DOM evidence extraction into dom-extract.ts seam for testability.</item>
  <item>Deepened getCheckRunnerInfo: the const is now the single source of truth; the type is derived via typeof.</item>
</CHANGE_SUMMARY>
*/

import { mkdir } from "node:fs/promises";
import { join, posix } from "node:path";
import {
  finalizeEvidenceGraph,
  type CheckTarget,
  type PageEvidence,
  type SiteEvidenceGraph,
} from "@warpgogol/check-core";
import { byteHash } from "@warpgogol/fingerprint";
import { extractPageEvidenceFromDOM } from "./dom-extract.ts";

export const CHECK_RUNNER_INFO = {
  name: "@warpgogol/check-runner-node",
  artifactVersion: 1,
  capabilities: {
    targetValidation: true,
    safetyValidation: true,
    artifactLayout: true,
    evidenceCapture: true,
    deterministicReview: false,
    audienceReview: false,
  },
} as const;

export type CheckRunnerInfo = typeof CHECK_RUNNER_INFO;

export function getCheckRunnerInfo(): CheckRunnerInfo {
  return CHECK_RUNNER_INFO;
}

export interface CaptureEvidenceOptions {
  runDir: string;
  relativeRunDir: string;
}

const VIEWPORTS = [
  { name: "desktop" as const, width: 1440, height: 1100 },
  { name: "mobile" as const, width: 390, height: 844 },
];

export async function captureSiteEvidenceGraph(
  target: CheckTarget,
  options: CaptureEvidenceOptions,
): Promise<SiteEvidenceGraph> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const pages: PageEvidence[] = [];
  const startPaths = target.startPaths?.length ? target.startPaths : ["/"];
  const maxPages = target.maxPages ?? startPaths.length;
  const paths = startPaths.slice(0, maxPages);
  const screenshotDir = join(options.runDir, "screenshots");
  await mkdir(screenshotDir, { recursive: true });

  try {
    for (const path of paths) {
      const url = new URL(path, target.baseUrl).toString();
      const context = await browser.newContext({ viewport: VIEWPORTS[0] });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      const pageEvidence = await page.evaluate(extractPageEvidenceFromDOM);
      const viewports = [];
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const safeName = path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "index";
        const screenshotFile = `${safeName}-${viewport.name}.png`;
        const screenshotPath = join(screenshotDir, screenshotFile);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        viewports.push({
          ...viewport,
          screenshot: posix.join(options.relativeRunDir, "screenshots", screenshotFile),
        });
      }
      await context.close();
      pages.push({
        url,
        path,
        title: pageEvidence.title,
        lang: pageEvidence.lang,
        canonical: pageEvidence.canonical,
        metaDescription: pageEvidence.metaDescription,
        text: pageEvidence.text,
        contentHash: byteHash(pageEvidence.text),
        sections: pageEvidence.sections.map((section) => ({
          id: section.id,
          index: section.index,
          anchor: section.anchor,
          heading: section.heading,
          text: section.text,
          htmlHash: byteHash(section.html),
        })),
        viewports,
        links: pageEvidence.links,
      });
    }
  } finally {
    await browser.close();
  }

  return finalizeEvidenceGraph({
    schemaVersion: 1,
    targetId: target.id,
    baseUrl: target.baseUrl,
    capturedAt: new Date().toISOString(),
    pages,
  });
}
