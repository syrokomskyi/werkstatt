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

import { join, posix } from "node:path";
import {
  finalizeEvidenceGraph,
  type CheckTarget,
  type PageEvidence,
  type SiteEvidenceGraph,
} from "@warpgogol/check-core";
import { byteHash } from "@warpgogol/fingerprint";
import type { BrowserCapturePort, CapturedPage } from "./browser-capture-port.ts";
import { PlaywrightCaptureAdapter } from "./playwright-adapter.ts";

export type { BrowserCapturePort, CapturedPage } from "./browser-capture-port.ts";
export { PlaywrightCaptureAdapter } from "./playwright-adapter.ts";

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

export async function captureSiteEvidenceGraph(
  target: CheckTarget,
  options: CaptureEvidenceOptions,
  capturePort: BrowserCapturePort = new PlaywrightCaptureAdapter(),
): Promise<SiteEvidenceGraph> {
  const pages: PageEvidence[] = [];
  const startPaths = target.startPaths?.length ? target.startPaths : ["/"];
  const maxPages = target.maxPages ?? startPaths.length;
  const paths = startPaths.slice(0, maxPages);
  const screenshotDir = join(options.runDir, "screenshots");
  const relativeScreenshotDir = posix.join(options.relativeRunDir, "screenshots");

  try {
    for (const path of paths) {
      const url = new URL(path, target.baseUrl).toString();
      const captured = await capturePort.capturePage(
        url,
        path,
        screenshotDir,
        relativeScreenshotDir,
      );
      pages.push(capturedPageToEvidence(captured));
    }
  } finally {
    await capturePort.close();
  }

  return finalizeEvidenceGraph({
    schemaVersion: 1,
    targetId: target.id,
    baseUrl: target.baseUrl,
    capturedAt: new Date().toISOString(),
    pages,
  });
}

function capturedPageToEvidence(captured: CapturedPage): PageEvidence {
  return {
    url: captured.url,
    path: captured.path,
    title: captured.title,
    lang: captured.lang,
    canonical: captured.canonical,
    metaDescription: captured.metaDescription,
    text: captured.text,
    contentHash: byteHash(captured.text),
    sections: captured.sections.map((section) => ({
      id: section.id,
      index: section.index,
      anchor: section.anchor,
      heading: section.heading,
      text: section.text,
      htmlHash: byteHash(section.html),
    })),
    viewports: captured.screenshots.map((s) => ({
      name: s.name as "desktop" | "mobile",
      width: s.width,
      height: s.height,
      screenshot: s.path,
    })),
    links: [...captured.links],
  };
}
