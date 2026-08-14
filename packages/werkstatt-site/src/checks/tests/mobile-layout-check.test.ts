import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeTestSiteContext, testInput, unwrapData } from "./helpers.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    Unit tests for mobile.layout.check (RFC-0838) — Playwright mobile layout
    stability checks. Tests cover skip path, route discovery, and mode behavior.
    Playwright is mocked since CI may not have Chromium.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation: tests for skip path, route discovery, mode behavior, and CLS computation.</item>
</CHANGE_SUMMARY>
*/

// Mock ensureChromium to avoid actual browser installation
vi.mock("../playwright-chromium-ensure.ts", () => ({
  ensureChromium: vi.fn().mockResolvedValue(undefined),
}));

// Mutable mock for playwright — tests override mockChromium.launch before calling handler
const mockChromium = {
  launch: vi.fn(),
};

vi.mock("playwright", () => ({ chromium: mockChromium }));

// Import after mocks are set up
const { runMobileLayoutCheck } = await import("../mobile-layout-check.ts");

/**
 * Create a mock page that returns predetermined values for each evaluate call.
 * The handler calls evaluate in this order per orientation:
 *   1. CLS entries (function) → array of { startTime, value }
 *   2. Geometry (string) → array of ElementGeometry
 *   3. Dimensions (function) → { scrollWidth, clientWidth }
 *
 * We use a call counter to return the right value.
 */
function makeMockPage(opts: {
  scrollWidth?: number;
  clientWidth?: number;
  clsEntries?: Array<{ startTime: number; value: number }>;
  geometry?: Array<{ tag: string; x: number; y: number; width: number; height: number }>;
  gotoReject?: Error;
}) {
  const clientWidth = opts.clientWidth ?? 390;
  const scrollWidth = opts.scrollWidth ?? clientWidth;
  const clsEntries = opts.clsEntries ?? [];
  const geometry = opts.geometry ?? [];

  let evalCallCount = 0;

  return {
    goto: opts.gotoReject
      ? vi.fn().mockRejectedValue(opts.gotoReject)
      : vi.fn().mockResolvedValue({ status: () => 200 }),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockImplementation(() => {
      evalCallCount++;
      // Call 1: dimensions { scrollWidth, clientWidth }
      // Call 2: CLS entries array
      // Call 3: geometry array
      if (evalCallCount === 1) return Promise.resolve({ scrollWidth, clientWidth });
      if (evalCallCount === 2) return Promise.resolve(clsEntries);
      return Promise.resolve(geometry);
    }),
    addInitScript: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
}

function setupMockBrowser(pages: ReturnType<typeof makeMockPage>[]) {
  let pageIndex = 0;
  const mockContext = {
    newPage: vi.fn().mockImplementation(() => {
      const page = pages[pageIndex % pages.length];
      pageIndex++;
      return Promise.resolve(page);
    }),
    route: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const browser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn().mockResolvedValue(undefined),
  };
  mockChromium.launch.mockResolvedValue(browser);
  return browser;
}

describe("mobile.layout.check", () => {
  let workspaceRoot: string;
  let appDir: string;
  let distClient: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "mob-layout-"));
    appDir = join(workspaceRoot, "apps", "test-app");
    distClient = join(appDir, "dist", "client");
    await mkdir(distClient, { recursive: true });
    mockChromium.launch.mockReset();
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("skips when dist/client does not exist", async () => {
    await rm(distClient, { recursive: true, force: true });

    const result = await runMobileLayoutCheck(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    const data = unwrapData(result);
    expect(data.status).toBe("pass");
    expect(data.routesChecked).toBe(0);
    expect(result.summary).toContain("skipped");
  });

  it("passes with zero routes when dist/client is empty", async () => {
    const result = await runMobileLayoutCheck(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    const data = unwrapData(result);
    expect(data.routesChecked).toBe(0);
    expect(data.status).toBe("pass");
  });

  it("discovers HTML routes and skips non-HTML files", async () => {
    await writeFile(
      join(distClient, "index.html"),
      "<!DOCTYPE html><html><body>Home</body></html>",
    );
    await mkdir(join(distClient, "about"), { recursive: true });
    await writeFile(
      join(distClient, "about", "index.html"),
      "<!DOCTYPE html><html><body>About</body></html>",
    );
    await writeFile(join(distClient, "sitemap.xml"), "<urlset></urlset>");

    // 2 routes × 2 orientations = 4 pages needed
    setupMockBrowser([makeMockPage({}), makeMockPage({}), makeMockPage({}), makeMockPage({})]);

    const result = await runMobileLayoutCheck(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    const data = unwrapData(result);
    expect(data.routesChecked).toBe(2);
    expect(data.routesPassed).toBe(4);
    expect(data.routesFailed).toBe(0);
  });

  it("emits MOBILE-GEO-01 when horizontal overflow is detected", async () => {
    await writeFile(
      join(distClient, "index.html"),
      "<!DOCTYPE html><html><body>Home</body></html>",
    );

    setupMockBrowser([
      makeMockPage({ scrollWidth: 500, clientWidth: 390 }),
      makeMockPage({ scrollWidth: 500, clientWidth: 390 }),
    ]);

    const result = await runMobileLayoutCheck(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const data = unwrapData(result);
    expect(data.status).toBe("fail");
    expect(data.diagnostics.some((d) => d.ruleId === "MOBILE-GEO-01")).toBe(true);
  });

  it("returns exit code 0 in warning mode even with violations", async () => {
    await writeFile(
      join(distClient, "index.html"),
      "<!DOCTYPE html><html><body>Home</body></html>",
    );

    setupMockBrowser([
      makeMockPage({ scrollWidth: 500, clientWidth: 390 }),
      makeMockPage({ scrollWidth: 500, clientWidth: 390 }),
    ]);

    const result = await runMobileLayoutCheck(
      { flags: { mode: "warning" }, argv: [] },
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(0);
    const data = unwrapData(result);
    expect(data.status).toBe("fail");
    expect(data.diagnostics.length).toBeGreaterThan(0);
  });

  it("emits MOBILE-GEO-04 on route timeout", async () => {
    await writeFile(
      join(distClient, "index.html"),
      "<!DOCTYPE html><html><body>Home</body></html>",
    );

    setupMockBrowser([
      makeMockPage({ gotoReject: new Error("Timeout 1000ms exceeded") }),
      makeMockPage({ gotoReject: new Error("Timeout 1000ms exceeded") }),
    ]);

    const result = await runMobileLayoutCheck(
      { flags: { "route-timeout": "1000" }, argv: [] },
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const data = unwrapData(result);
    expect(data.diagnostics.some((d) => d.ruleId === "MOBILE-GEO-04")).toBe(true);
  });

  it("emits MOBILE-GEO-03 when CLS exceeds threshold", async () => {
    await writeFile(
      join(distClient, "index.html"),
      "<!DOCTYPE html><html><body>Home</body></html>",
    );

    const clsEntries = [{ startTime: 100, value: 0.15 }];
    setupMockBrowser([makeMockPage({ clsEntries }), makeMockPage({ clsEntries })]);

    const result = await runMobileLayoutCheck(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const data = unwrapData(result);
    expect(data.diagnostics.some((d) => d.ruleId === "MOBILE-GEO-03")).toBe(true);
  });

  it("emits MOBILE-GEO-02 when rotation stability delta exceeds threshold", async () => {
    await writeFile(
      join(distClient, "index.html"),
      "<!DOCTYPE html><html><body>Home</body></html>",
    );

    const portraitGeometry = [
      { tag: "header", x: 0, y: 0, width: 390, height: 60 },
      { tag: "main", x: 0, y: 60, width: 390, height: 400 },
    ];
    const landscapeGeometry = [
      { tag: "header", x: 50, y: 0, width: 844, height: 60 },
      { tag: "main", x: 0, y: 60, width: 844, height: 400 },
    ];

    setupMockBrowser([
      makeMockPage({ geometry: portraitGeometry }),
      makeMockPage({ geometry: landscapeGeometry }),
    ]);

    const result = await runMobileLayoutCheck(
      testInput(),
      makeTestSiteContext(workspaceRoot, appDir),
    );

    expect(result.exitCode).toBe(1);
    const data = unwrapData(result);
    expect(data.diagnostics.some((d) => d.ruleId === "MOBILE-GEO-02")).toBe(true);
  });

  it("sets up external request blocking via ctx.route() for each context", async () => {
    await writeFile(
      join(distClient, "index.html"),
      "<!DOCTYPE html><html><body>Home</body></html>",
    );

    const browser = setupMockBrowser([makeMockPage({}), makeMockPage({})]);

    await runMobileLayoutCheck(testInput(), makeTestSiteContext(workspaceRoot, appDir));

    // 1 route × 2 orientations = 2 contexts, each must have route() called
    const newContextCalls = browser.newContext.mock.results;
    expect(newContextCalls.length).toBe(2);
    for (const callResult of newContextCalls) {
      const ctx = await callResult.value;
      expect(ctx.route).toHaveBeenCalled();
    }
  });
});
