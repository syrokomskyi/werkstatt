/*
<MODULE_CONTRACT>
<purpose>
RFC-0838: Playwright mobile layout stability checks. Verifies horizontal overflow,
layout stability after portrait→landscape rotation, and Cumulative Layout Shift (CLS)
on every built HTML route in mobile emulation. Operates without baselines — asserts
geometric invariants directly.
</purpose>
<non-goals>
  <item>No visual regression or screenshot diffing — explicitly excluded by RFC-0838.</item>
  <item>No baseline-based comparison — all checks are direct invariant assertions.</item>
  <item>No source code analysis — reads only dist/client HTML output.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0838: initial implementation with four geometric rules (MOBILE-GEO-01..04).</item>
  <item>RFC-0843: refactor to shared playwright-utils (blockExternalRequests, evaluateInPage), fix result.timeout to only flag real timeouts.</item>
  <item>ADR-0049: parallelize route processing (concurrency=4), reduce settle wait from 2s to 500ms, reuse browser contexts — reduces 124-page check from 11+ min to under 3 min.</item>
</CHANGE_SUMMARY>
*/

import { createServer, type Server } from "node:http";
import { stat, readFile as fsReadFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";

import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import { ensureChromium } from "./playwright-chromium-ensure.ts";
import { blockExternalRequests, evaluateInPage } from "./playwright-utils.ts";
import type { BrowserContext } from "playwright";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RouteResult {
  route: string;
  orientation: "portrait" | "landscape";
  passed: boolean;
  overflow: { scrollWidth: number; clientWidth: number } | null;
  clsScore: number | null;
  stabilityDelta: { element: string; deltaPx: number } | null;
  timeout: boolean;
}

export interface MobileLayoutCheckResult {
  command: "mobile.layout.check";
  status: "pass" | "fail";
  site: string;
  routesChecked: number;
  routesPassed: number;
  routesFailed: number;
  routeResults: RouteResult[];
  diagnostics: Diagnostic[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PORTRAIT_WIDTH = 390;
const PORTRAIT_HEIGHT = 844;
const LANDSCAPE_WIDTH = 844;
const LANDSCAPE_HEIGHT = 390;
const DEFAULT_ROUTE_TIMEOUT_MS = 30_000;
const DEFAULT_STABILITY_DELTA_PX = 5;
const CLS_THRESHOLD = 0.1;
const DEFAULT_SETTLE_WAIT_MS = 500;
const DEFAULT_CONCURRENCY = 4;

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

// ─── Static server ───────────────────────────────────────────────────────────

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

// ─── Route discovery ─────────────────────────────────────────────────────────

async function discoverHtmlRoutes(distClientPath: string): Promise<string[]> {
  const allFiles = await collectFiles(distClientPath, {
    extensions: [".html"],
    ignore: (name) => name === "node_modules" || name === ".astro" || name.startsWith("."),
  });

  const routes: string[] = [];
  for (const absPath of allFiles) {
    const relativePath = absPath.slice(distClientPath.length).replace(/\\/g, "/");
    let route = relativePath.replace(/\/index\.html$/, "/");
    if (route === "/index.html") route = "/";
    else if (route.endsWith(".html")) route = route.slice(0, -5);
    routes.push(route);
  }
  return routes.sort();
}

// ─── CLS init script ─────────────────────────────────────────────────────────

const CLS_INIT_SCRIPT = `
(() => {
  window.__clsEntries = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue;
      window.__clsEntries.push({
        startTime: entry.startTime,
        value: entry.value,
      });
    }
  });
  observer.observe({ type: "layout-shift", buffered: true });
  window.__clsObserver = observer;
})();
`;

function computeCls(entries: Array<{ startTime: number; value: number }>): number {
  if (entries.length === 0) return 0;
  const sorted = [...entries].sort((a, b) => a.startTime - b.startTime);
  let maxSessionValue = 0;
  let currentSessionValue = 0;
  let lastStartTime = -Infinity;
  const SESSION_GAP_MS = 1000;
  for (const entry of sorted) {
    if (entry.startTime - lastStartTime > SESSION_GAP_MS) {
      currentSessionValue = 0;
    }
    currentSessionValue += entry.value;
    if (currentSessionValue > maxSessionValue) {
      maxSessionValue = currentSessionValue;
    }
    lastStartTime = entry.startTime;
  }
  return maxSessionValue;
}

// ─── Geometry measurement ────────────────────────────────────────────────────

interface ElementGeometry {
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function measureGeometry(): ElementGeometry[] {
  const results: ElementGeometry[] = [];
  const tags = ["header", "main", "footer"];
  for (const tag of tags) {
    const el = document.querySelector(tag);
    if (el) {
      const rect = el.getBoundingClientRect();
      results.push({ tag, x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    }
  }
  const section = document.querySelector("[data-section]");
  if (section) {
    const rect = section.getBoundingClientRect();
    results.push({
      tag: "[data-section]",
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
  }
  return results;
}

function computeMaxDelta(
  portrait: ElementGeometry[],
  landscape: ElementGeometry[],
): { element: string; deltaPx: number } | null {
  let maxDelta = 0;
  let maxElement = "";
  for (const p of portrait) {
    const l = landscape.find((g) => g.tag === p.tag);
    if (!l) continue;
    const dx = Math.abs(p.x - l.x);
    const dy = Math.abs(p.y - l.y);
    const dw = Math.abs(p.width - l.width);
    const dh = Math.abs(p.height - l.height);
    const delta = Math.max(dx, dy, dw, dh);
    if (delta > maxDelta) {
      maxDelta = delta;
      maxElement = p.tag;
    }
  }
  if (maxDelta === 0) return null;
  return { element: maxElement, deltaPx: maxDelta };
}

// ─── Per-route check (extracted for parallelization) ────────────────────────

async function checkRoute(
  route: string,
  portraitCtx: BrowserContext,
  landscapeCtx: BrowserContext,
  baseUrl: string,
  routeTimeoutMs: number,
  settleWaitMs: number,
  stabilityDeltaThreshold: number,
  siteName: string,
): Promise<{ results: RouteResult[]; diagnostics: Diagnostic[]; timedOut: boolean }> {
  const results: RouteResult[] = [];
  const diagnostics: Diagnostic[] = [];
  let portraitGeometry: ElementGeometry[] = [];
  let timedOut = false;

  for (const orientation of ["portrait", "landscape"] as const) {
    const ctx = orientation === "portrait" ? portraitCtx : landscapeCtx;
    const page = await ctx.newPage();
    await page.addInitScript(CLS_INIT_SCRIPT);

    const result: RouteResult = {
      route,
      orientation,
      passed: true,
      overflow: null,
      clsScore: null,
      stabilityDelta: null,
      timeout: false,
    };

    try {
      await page.goto(`${baseUrl}${route}`, {
        waitUntil: "load",
        timeout: routeTimeoutMs,
      });

      await page.waitForTimeout(settleWaitMs);

      // MOBILE-GEO-01: horizontal overflow
      const dims = await evaluateInPage(page, () => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      result.overflow = { scrollWidth: dims.scrollWidth, clientWidth: dims.clientWidth };
      if (dims.scrollWidth > dims.clientWidth) {
        result.passed = false;
        diagnostics.push({
          ruleId: "MOBILE-GEO-01",
          severity: "error",
          file: `apps/${siteName}/dist/client${route}`,
          message: `Route has horizontal overflow in ${orientation}: scrollWidth=${dims.scrollWidth}px > clientWidth=${dims.clientWidth}px.`,
        });
      }

      // MOBILE-GEO-03: CLS
      const clsEntries = await evaluateInPage(
        page,
        () =>
          (
            window as unknown as {
              __clsEntries?: Array<{ startTime: number; value: number }>;
            }
          ).__clsEntries ?? [],
      );
      const clsScore = computeCls(clsEntries);
      result.clsScore = clsScore;
      if (clsScore >= CLS_THRESHOLD) {
        result.passed = false;
        diagnostics.push({
          ruleId: "MOBILE-GEO-03",
          severity: "error",
          file: `apps/${siteName}/dist/client${route}`,
          message: `CLS score ${clsScore.toFixed(4)} exceeds threshold ${CLS_THRESHOLD} in ${orientation}.`,
        });
      }

      // Geometry measurement for MOBILE-GEO-02
      const geometry = await evaluateInPage<ElementGeometry[]>(page, measureGeometry);
      if (orientation === "portrait") {
        portraitGeometry = geometry;
      } else {
        const delta = computeMaxDelta(portraitGeometry, geometry);
        if (delta && delta.deltaPx > stabilityDeltaThreshold) {
          result.passed = false;
          result.stabilityDelta = delta;
          diagnostics.push({
            ruleId: "MOBILE-GEO-02",
            severity: "error",
            file: `apps/${siteName}/dist/client${route}`,
            message: `Key element "${delta.element}" shifted ${delta.deltaPx}px after portrait→landscape rotation (threshold: ${stabilityDeltaThreshold}px).`,
          });
        } else if (delta) {
          result.stabilityDelta = delta;
        }
      }
    } catch (err) {
      result.passed = false;
      const errMsg = err instanceof Error ? err.message : String(err);
      const isTimeout = errMsg.toLowerCase().includes("timeout");
      result.timeout = isTimeout;
      timedOut = isTimeout;
      diagnostics.push({
        ruleId: "MOBILE-GEO-04",
        severity: "error",
        file: `apps/${siteName}/dist/client${route}`,
        message: isTimeout
          ? `Route timed out in ${orientation} after ${routeTimeoutMs}ms: ${errMsg}`
          : `Route failed in ${orientation}: ${errMsg}`,
      });
    }

    results.push(result);
    await page.close();
  }

  return { results, diagnostics, timedOut };
}

// ─── Command handler ─────────────────────────────────────────────────────────

export async function runMobileLayoutCheck(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<MobileLayoutCheckResult>> {
  const { workspaceRoot, site, logger, outputFormat } = context;
  const mode = typeof input.flags["mode"] === "string" ? input.flags["mode"] : "error";
  const routeTimeoutMs =
    typeof input.flags["route-timeout"] === "string"
      ? parseInt(input.flags["route-timeout"], 10) || DEFAULT_ROUTE_TIMEOUT_MS
      : DEFAULT_ROUTE_TIMEOUT_MS;
  const stabilityDeltaThreshold =
    typeof input.flags["stability-delta"] === "string"
      ? parseInt(input.flags["stability-delta"], 10) || DEFAULT_STABILITY_DELTA_PX
      : DEFAULT_STABILITY_DELTA_PX;
  const concurrency =
    typeof input.flags["concurrency"] === "string"
      ? Math.max(1, parseInt(input.flags["concurrency"], 10) || DEFAULT_CONCURRENCY)
      : DEFAULT_CONCURRENCY;
  const settleWaitMs =
    typeof input.flags["settle-wait"] === "string"
      ? Math.max(0, parseInt(input.flags["settle-wait"], 10) || DEFAULT_SETTLE_WAIT_MS)
      : DEFAULT_SETTLE_WAIT_MS;

  const siteName = site?.name;
  if (!siteName) {
    throw new Error("mobile.layout.check requires --site <app-name> (or --all).");
  }

  const distClientPath = join(
    site?.directory ?? join(workspaceRoot, "apps", siteName),
    "dist",
    "client",
  );

  // Skip if no dist/client
  try {
    await stat(distClientPath);
  } catch {
    return {
      data: {
        command: "mobile.layout.check",
        status: "pass",
        site: siteName,
        routesChecked: 0,
        routesPassed: 0,
        routesFailed: 0,
        routeResults: [],
        diagnostics: [],
      },
      exitCode: 0,
      summary: `mobile.layout.check: skipped — no dist/client for ${siteName} (run build first)`,
    };
  }

  // Chromium pre-flight
  await ensureChromium(workspaceRoot, logger);

  // Route discovery
  const routes = await discoverHtmlRoutes(distClientPath);
  if (routes.length === 0) {
    return {
      data: {
        command: "mobile.layout.check",
        status: "pass",
        site: siteName,
        routesChecked: 0,
        routesPassed: 0,
        routesFailed: 0,
        routeResults: [],
        diagnostics: [],
      },
      exitCode: 0,
      summary: `mobile.layout.check: 0 routes found for ${siteName}`,
    };
  }

  // Start static server
  const server = createStaticServer(distClientPath);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Launch Playwright
    let chromium: (typeof import("playwright"))["chromium"];
    try {
      const pw = await import("playwright");
      chromium = pw.chromium;
    } catch {
      const diagnostics: Diagnostic[] = [
        {
          ruleId: "MOBILE-GEO-05",
          severity: "error",
          file: `apps/${siteName}`,
          message:
            "Playwright not available. Run `npx playwright install chromium` to enable mobile layout checks.",
        },
      ];
      return {
        data: {
          command: "mobile.layout.check",
          status: "fail",
          site: siteName,
          routesChecked: 0,
          routesPassed: 0,
          routesFailed: 0,
          routeResults: [],
          diagnostics,
        },
        exitCode: 2,
        summary: `mobile.layout.check: Playwright not available`,
      };
    }

    const browser = await chromium.launch({ headless: true });
    const routeResults: RouteResult[] = [];
    const diagnostics: Diagnostic[] = [];

    try {
      // ADR-0049: Create two reusable contexts — one per orientation.
      // Context creation is expensive; reusing them across all routes avoids
      // 248 context creations (124 routes × 2 orientations). External request
      // blocking is set up once per context.
      const portraitCtx = await browser.newContext({
        viewport: { width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT },
        isMobile: true,
        hasTouch: true,
      });
      await blockExternalRequests(portraitCtx, baseUrl);

      const landscapeCtx = await browser.newContext({
        viewport: { width: LANDSCAPE_WIDTH, height: LANDSCAPE_HEIGHT },
        isMobile: true,
        hasTouch: true,
      });
      await blockExternalRequests(landscapeCtx, baseUrl);

      try {
        // ADR-0049: Process routes in parallel batches. Within each route,
        // portrait and landscape are sequential (MOBILE-GEO-02 requires portrait
        // geometry before landscape). Across routes, batches run concurrently.
        for (let i = 0; i < routes.length; i += concurrency) {
          const batch = routes.slice(i, i + concurrency);
          const batchOutputs = await Promise.all(
            batch.map((route) =>
              checkRoute(
                route,
                portraitCtx,
                landscapeCtx,
                baseUrl,
                routeTimeoutMs,
                settleWaitMs,
                stabilityDeltaThreshold,
                siteName,
              ),
            ),
          );
          for (const { results, diagnostics: diags, timedOut } of batchOutputs) {
            routeResults.push(...results);
            diagnostics.push(...diags);
            if (outputFormat === "pretty") {
              const tag = timedOut ? "[TIMEOUT]" : "[ok]";
              logger.info(`${tag} ${results[0]?.route ?? ""}`);
            }
          }
        }
      } finally {
        await portraitCtx.close();
        await landscapeCtx.close();
      }
    } finally {
      await browser.close();
    }

    const routesFailed = routeResults.filter((r) => !r.passed).length;
    const routesPassed = routeResults.length - routesFailed;
    const hasErrors = diagnostics.length > 0;
    const status: MobileLayoutCheckResult["status"] = hasErrors ? "fail" : "pass";

    if (outputFormat === "pretty") {
      for (const d of diagnostics) {
        if (d.severity === "error") {
          logger.error(`  [${d.ruleId}] ${d.message}`);
        } else {
          logger.warn(`  [${d.ruleId}] ${d.message}`);
        }
      }
    }

    const exitCode = hasErrors ? (mode === "warning" ? 0 : 1) : 0;

    return {
      data: {
        command: "mobile.layout.check",
        status,
        site: siteName,
        routesChecked: routes.length,
        routesPassed,
        routesFailed,
        routeResults,
        diagnostics,
      },
      exitCode,
      summary: `mobile.layout.check: ${routes.length} routes, ${routesFailed} failed${mode === "warning" ? " (warning mode)" : ""}`,
    };
  } finally {
    server.close();
  }
}
