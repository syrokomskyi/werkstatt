/*
<MODULE_CONTRACT>
<purpose>RFC-0012: One-shot Axiom accessibility check for a mission. Builds workpiece, starts static server, captures evidence via Playwright + axe-core, runs runAccessibilityInstrument, writes findings.yaml + evidence-capsule.yaml, stops server.</purpose>
<non-goals>
  <item>Does not implement --mode dev (MVP: only preview).</item>
  <item>Does not support mobile viewport (MVP: desktop only).</item>
  <item>Does not integrate with Observatory runtime (local-dev only).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0012: initial implementation of mission.check command.</item>
</CHANGE_SUMMARY>
*/

import { createServer, type Server } from "node:http";
import { stat, readFile as fsReadFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { spawnSync } from "node:child_process";
import { stringify as stringifyYaml } from "yaml";

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";

import { resolveMissionDir } from "@warpgogol/site-kernel-handoff/mission";
import {
  runAccessibilityInstrument,
  toDeterministicContext,
  type AxeEvidenceState,
  type LocalInstrumentContext,
} from "@syrokomskyi/axiom-study";
import { PlaywrightCaptureAdapter } from "@syrokomskyi/axiom-capture";

import { convertObservationsToFindings } from "./mission-check-converter.ts";

export interface MissionCheckResult {
  command: "mission.check";
  status: "pass" | "fail";
  missionId: string;
  methodology: string;
  findings: {
    errors: number;
    warnings: number;
    total: number;
  };
  evidenceDir: string;
  serverPort?: number;
  durationMs: number;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

function createStaticServer(rootDir: string): Server {
  return createServer(async (req, res) => {
    try {
      let urlPath = req.url ?? "/";
      const queryIdx = urlPath.indexOf("?");
      if (queryIdx !== -1) urlPath = urlPath.slice(0, queryIdx);

      let filePath = normalize(join(rootDir, urlPath));
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      try {
        const s = await stat(filePath);
        if (s.isDirectory()) {
          filePath = join(filePath, "index.html");
        }
      } catch {
        filePath = join(rootDir, urlPath, "index.html");
      }

      const content = await fsReadFile(filePath);
      const mime = MIME_TYPES[extname(filePath)] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      res.end(content);
    } catch {
      try {
        const fallback = join(rootDir, "404.html");
        const content = await fsReadFile(fallback);
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end("Not Found");
      }
    }
  });
}

interface DiscoveredPage {
  url: string;
  path: string;
}

function extractPathFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.pathname + parsed.search || "/";
  } catch {
    return rawUrl;
  }
}

async function fetchSitemapXml(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(`SITEMAP_MISSING: Could not fetch ${url}`);
  }
  if (!response.ok) {
    throw new Error(`SITEMAP_MISSING: ${url} returned ${response.status}`);
  }
  return response.text();
}

async function discoverPagesFromSitemap(baseUrl: string): Promise<DiscoveredPage[]> {
  const xml = await fetchSitemapXml(`${baseUrl}/sitemap.xml`);
  const urls: DiscoveredPage[] = [];
  const seenPaths = new Set<string>();
  const urlRegex = /<loc>([^<]+)<\/loc>/g;
  const isSitemapIndex = /<sitemapindex/i.test(xml);

  if (isSitemapIndex) {
    const subSitemapPaths: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = urlRegex.exec(xml)) !== null) {
      const subPath = extractPathFromUrl(match[1]!.trim());
      subSitemapPaths.push(subPath);
    }
    for (const subPath of subSitemapPaths) {
      try {
        const subXml = await fetchSitemapXml(`${baseUrl}${subPath}`);
        let subMatch: RegExpExecArray | null;
        const subRegex = /<loc>([^<]+)<\/loc>/g;
        while ((subMatch = subRegex.exec(subXml)) !== null) {
          const pagePath = extractPathFromUrl(subMatch[1]!.trim());
          if (seenPaths.has(pagePath)) continue;
          seenPaths.add(pagePath);
          urls.push({ url: `${baseUrl}${pagePath}`, path: pagePath });
        }
      } catch {
        // skip sub-sitemaps that fail to fetch
      }
    }
  } else {
    let match: RegExpExecArray | null;
    while ((match = urlRegex.exec(xml)) !== null) {
      const pagePath = extractPathFromUrl(match[1]!.trim());
      if (seenPaths.has(pagePath)) continue;
      seenPaths.add(pagePath);
      urls.push({ url: `${baseUrl}${pagePath}`, path: pagePath });
    }
  }

  if (urls.length === 0) {
    throw new Error("SITEMAP_MISSING: sitemap.xml contains no URLs");
  }

  return urls;
}

async function healthCheck(baseUrl: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  const interval = 500;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(interval) });
      if (response.ok || response.status === 404) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`HEALTH_CHECK_TIMEOUT: server did not respond within ${timeoutMs}ms`);
}

function safeNameFromPath(pagePath: string): string {
  return pagePath.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "index";
}

function failResult(
  missionId: string,
  evidenceDir: string,
  serverPort: number | undefined,
  startTime: number,
  exitCode: number,
  summary: string,
): KernelCommandResult<MissionCheckResult> {
  return {
    data: {
      command: "mission.check",
      status: "fail",
      missionId,
      methodology: "web-accessibility",
      findings: { errors: 0, warnings: 0, total: 0 },
      evidenceDir,
      serverPort,
      durationMs: Date.now() - startTime,
    },
    exitCode,
    summary,
  };
}

async function runAxeInBrowser(
  pageUrl: string,
  pagePath: string,
  screenshotDir: string,
  relativeScreenshotDir: string,
): Promise<{ axeState: AxeEvidenceState; html: string }> {
  const captureAdapter = new PlaywrightCaptureAdapter();
  try {
    const captured = await captureAdapter.capturePage(
      pageUrl,
      pagePath,
      screenshotDir,
      relativeScreenshotDir,
    );

    // Run axe-core in the browser via Playwright
    let chromium: (typeof import("playwright"))["chromium"];
    try {
      const pw = await import("playwright");
      chromium = pw.chromium;
    } catch {
      throw new Error("PLAYWRIGHT_MISSING: pnpm exec playwright install chromium");
    }

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

      // Inject and run axe-core from CDN (requires network access)
      await page.addScriptTag({
        url: "https://unpkg.com/axe-core@4.12.1/axe.min.js",
      });

      const axeResults = await page.evaluate(() => {
        interface AxeGlobal {
          run: (
            context: Document,
            options: { runOnly: { type: string; values: string[] } },
          ) => Promise<unknown>;
        }
        const axe = (window as unknown as { axe: AxeGlobal }).axe;
        return axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
        });
      });

      const html = await page.content();
      const safeName = safeNameFromPath(pagePath);
      const locale = captured.lang ?? "en";

      return {
        axeState: {
          url: pageUrl,
          locale,
          profileId: "desktop",
          logicalPath: `raw/axe-${locale}-${safeName}-desktop.json`,
          result: axeResults as AxeEvidenceState["result"],
        },
        html,
      };
    } finally {
      await browser.close();
    }
  } finally {
    await captureAdapter.close();
  }
}

export async function runMissionCheck(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<MissionCheckResult>> {
  const { workspaceRoot, logger } = context;
  const startTime = Date.now();

  const missionId = input.flags["mission"] as string | undefined;
  if (!missionId) {
    throw new Error("mission.check requires --mission <mission-id>");
  }

  const externalPreview =
    input.flags["external-preview"] === true || input.flags["external-preview"] === "true";
  const baseUrlFlag = input.flags["base-url"] as string | undefined;

  const missionDir = resolveMissionDir(workspaceRoot, missionId);
  const evidenceDir = join(missionDir, "evidence", "axiom");
  const rawDir = join(evidenceDir, "raw");
  const screenshotsDir = join(evidenceDir, "screenshots");
  const relativeScreenshotsDir = "screenshots";

  let baseUrl: string;
  let server: Server | null = null;
  let serverPort: number | undefined;

  try {
    if (externalPreview) {
      if (!baseUrlFlag) {
        throw new Error("mission.check --external-preview requires --base-url");
      }
      baseUrl = baseUrlFlag.replace(/\/$/, "");
      logger.info(`  External preview mode: ${baseUrl}`);
    } else {
      // Build the workpiece
      const workpieceDir = join(missionDir, "workpiece");
      const distDir = join(workpieceDir, "dist", "client");

      if (!existsSync(workpieceDir)) {
        throw new Error(
          `mission.check: workpiece not found for mission '${missionId}' — run mission.materialize first`,
        );
      }

      logger.info(`  Building workpiece...`);
      const buildResult = spawnSync("pnpm", ["exec", "astro", "build"], {
        cwd: workpieceDir,
        stdio: "pipe",
        timeout: 120_000,
      });

      if (buildResult.status !== 0) {
        const stderr = buildResult.stderr?.toString() ?? "unknown error";
        return failResult(
          missionId,
          evidenceDir,
          undefined,
          startTime,
          6,
          `mission.check: build failure — ${stderr.slice(0, 200)}`,
        );
      }

      if (!existsSync(distDir)) {
        return failResult(
          missionId,
          evidenceDir,
          undefined,
          startTime,
          6,
          `mission.check: build produced no dist/client at ${distDir}`,
        );
      }

      // Start static server with auto-discovered port
      server = createStaticServer(distDir);
      await new Promise<void>((resolve) => {
        server!.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      serverPort = typeof address === "object" && address ? address.port : 0;
      baseUrl = `http://127.0.0.1:${serverPort}`;

      logger.info(`  Server started on port ${serverPort}`);

      // Health check
      try {
        await healthCheck(baseUrl);
      } catch (err) {
        return failResult(
          missionId,
          evidenceDir,
          serverPort,
          startTime,
          3,
          `mission.check: health check failed — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Discover pages from sitemap
    let pages: DiscoveredPage[];
    try {
      pages = await discoverPagesFromSitemap(baseUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("SITEMAP_MISSING")) {
        return failResult(
          missionId,
          evidenceDir,
          serverPort,
          startTime,
          7,
          `mission.check: no sitemap.xml found at ${baseUrl}/sitemap.xml — generate sitemap or use --external-preview with manual page list`,
        );
      }
      throw err;
    }

    logger.info(`  Discovered ${pages.length} page(s) from sitemap`);

    // Prepare evidence directories
    await mkdir(rawDir, { recursive: true });
    await mkdir(screenshotsDir, { recursive: true });

    // Capture and run axe for each page
    const axeStates: AxeEvidenceState[] = [];
    const rawEvidence: Array<{ filename: string; data: unknown }> = [];
    const htmlFiles: Array<{ filename: string; content: string }> = [];

    for (const page of pages) {
      logger.info(`  Checking: ${page.path}`);
      try {
        const { axeState, html } = await runAxeInBrowser(
          page.url,
          page.path,
          screenshotsDir,
          relativeScreenshotsDir,
        );
        axeStates.push(axeState);

        const safeName = safeNameFromPath(page.path);
        const axeFilename = `axe-${axeState.locale}-${safeName}-desktop.json`;
        rawEvidence.push({ filename: axeFilename, data: axeState.result });
        htmlFiles.push({ filename: `html-${safeName}.html`, content: html });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.startsWith("PLAYWRIGHT_MISSING")) {
          return failResult(
            missionId,
            evidenceDir,
            serverPort,
            startTime,
            4,
            `mission.check: Playwright not available — run 'pnpm exec playwright install chromium'`,
          );
        }
        logger.warn(`  Capture failed for ${page.path}: ${message}`);
      }
    }

    if (axeStates.length === 0) {
      return failResult(
        missionId,
        evidenceDir,
        serverPort,
        startTime,
        2,
        `mission.check: no pages could be captured`,
      );
    }

    // Build instrument context
    const recordedAt = new Date().toISOString();
    const localContext: LocalInstrumentContext = {
      origin: baseUrl,
      recordedAt,
      missionId,
      environment: {
        platform: process.platform,
        nodeVersion: process.version,
        mode: externalPreview ? "external-preview" : "preview",
      },
    };
    const deterministicContext = toDeterministicContext(localContext);

    // Run accessibility instrument
    const instrumentResult = runAccessibilityInstrument({
      context: deterministicContext,
      states: axeStates,
    });

    // Convert observations to findings
    const localeMap = new Map(axeStates.map((s) => [s.url, s.locale]));
    const findings = convertObservationsToFindings(instrumentResult, localeMap);
    const errors = findings.filter((f) => f.severity === "error").length;
    const warnings = findings.filter((f) => f.severity === "warning").length;

    // Write evidence-capsule.yaml
    const capsuleYaml = stringifyYaml({
      schema: "local-evidence-capsule@1",
      missionId,
      origin: baseUrl,
      recordedAt,
      mode: externalPreview ? "external-preview" : "preview",
      locales: ["en"],
      profiles: ["desktop"],
      pages: axeStates.map((s) => ({
        url: s.url,
        path: new URL(s.url).pathname,
        locale: s.locale,
        profileId: s.profileId,
        logicalPath: s.logicalPath,
        htmlPath: `raw/html-${safeNameFromPath(new URL(s.url).pathname)}.html`,
        screenshotPath: `screenshots/`,
      })),
      classification: "local-dev",
    });
    await writeFile(join(evidenceDir, "evidence-capsule.yaml"), capsuleYaml + "\n", "utf-8");

    // Write findings.yaml
    const findingsYaml = stringifyYaml({
      schema: "axiom-findings@1",
      capsuleRef: `missions/${missionId}/evidence/axiom/evidence-capsule.yaml`,
      recordedAt,
      methodology: "web-accessibility",
      findings,
      summary: {
        totalFindings: findings.length,
        errors,
        warnings,
      },
    });
    await writeFile(join(evidenceDir, "findings.yaml"), findingsYaml + "\n", "utf-8");

    // Write raw evidence JSON files
    for (const { filename, data } of rawEvidence) {
      await writeFile(join(rawDir, filename), JSON.stringify(data, null, 2) + "\n", "utf-8");
    }

    // Write HTML files
    for (const { filename, content } of htmlFiles) {
      await writeFile(join(rawDir, filename), content, "utf-8");
    }

    const status: "pass" | "fail" = errors > 0 ? "fail" : "pass";
    const exitCode = errors > 0 ? 1 : 0;
    const durationMs = Date.now() - startTime;

    const result: MissionCheckResult = {
      command: "mission.check",
      status,
      missionId,
      methodology: "web-accessibility",
      findings: { errors, warnings, total: findings.length },
      evidenceDir,
      serverPort,
      durationMs,
    };

    logger.info(`  Findings: ${findings.length} (${errors} errors, ${warnings} warnings)`);
    logger.info(`  Evidence: ${evidenceDir}`);
    logger.info(`  Duration: ${durationMs}ms`);

    return {
      data: result,
      exitCode,
      summary: `mission.check: ${status} — ${findings.length} finding(s), ${errors} error(s), ${warnings} warning(s)`,
    };
  } finally {
    if (server) {
      server.close();
      logger.info(`  Server stopped`);
    }
  }
}
