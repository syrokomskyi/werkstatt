/*
<MODULE_CONTRACT>
<purpose>
  Port interface for browser-based evidence capture. Decouples the
  capture orchestration from the Playwright implementation, enabling
  testing with a fake browser and future swap-out (e.g. Puppeteer).
</purpose>
<non-goals>
  <item>Do not implement Playwright-specific logic here — that lives in playwright-adapter.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review 2026-07-14: extract BrowserCapturePort seam from captureSiteEvidenceGraph.</item>
</CHANGE_SUMMARY>
*/

import type { RawSectionEvidence } from "./dom-extract.ts";

export interface CapturedPage {
  url: string;
  path: string;
  title?: string;
  lang?: string;
  canonical?: string;
  metaDescription?: string;
  text: string;
  sections: readonly RawSectionEvidence[];
  links: readonly string[];
  screenshots: ReadonlyArray<{ name: string; width: number; height: number; path: string }>;
}

export interface BrowserCapturePort {
  capturePage(
    url: string,
    path: string,
    screenshotDir: string,
    relativeScreenshotDir: string,
  ): Promise<CapturedPage>;
  close(): Promise<void>;
}
