import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ensureChromium, runPlaywrightChromiumEnsure } from "../playwright-chromium-ensure.ts";
import type { PlaywrightChromiumEnsureResult } from "../playwright-chromium-ensure.ts";
import { makeTestContext, testInput, testLogger } from "./helpers.ts";

// Mock playwright module — we control chromium.launch behavior per test
const mockLaunch = vi.fn();
const mockClose = vi.fn();
const mockVersion = vi.fn(() => "131.0.6778.87");

vi.mock("playwright", () => ({
  chromium: {
    launch: (...args: unknown[]) => mockLaunch(...args),
  },
}));

// Mock preflightChromium from axiom-factory-app
vi.mock("@syrokomskyi/axiom-factory-app/run/axiom-cli", () => ({
  preflightChromium: vi.fn().mockResolvedValue(undefined),
}));

function makeBrowser() {
  return {
    version: mockVersion,
    close: mockClose,
  };
}

const workspaceRoot = "/test-workspace";

describe("ensureChromium", () => {
  beforeEach(() => {
    mockLaunch.mockReset();
    mockClose.mockReset();
    mockVersion.mockReset();
    mockVersion.mockReturnValue("131.0.6778.87");
    delete process.env["PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"];
  });

  afterEach(() => {
    delete process.env["PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"];
  });

  it("skips when Chromium is already launchable", async () => {
    const browser = makeBrowser();
    mockLaunch.mockResolvedValueOnce(browser);

    const result = await ensureChromium(workspaceRoot, testLogger);

    expect(result.installed).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.chromiumRevision).toBe("131.0.6778.87");
    expect(mockClose).toHaveBeenCalled();
  });

  it("installs via preflightChromium when launch fails", async () => {
    const browser = makeBrowser();
    mockLaunch
      .mockRejectedValueOnce(new Error("Executable not found"))
      .mockResolvedValueOnce(browser);

    const result = await ensureChromium(workspaceRoot, testLogger);

    expect(result.installed).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.chromiumRevision).toBe("131.0.6778.87");
  });

  it("throws when preflightChromium fails", async () => {
    const { preflightChromium } = await import("@syrokomskyi/axiom-factory-app/run/axiom-cli");
    vi.mocked(preflightChromium).mockRejectedValueOnce(new Error("Network error"));
    mockLaunch.mockRejectedValueOnce(new Error("Executable not found"));

    await expect(ensureChromium(workspaceRoot, testLogger)).rejects.toThrow(/Network error/);
  });

  it("throws when launch fails after preflightChromium", async () => {
    mockLaunch
      .mockRejectedValueOnce(new Error("Executable not found"))
      .mockRejectedValueOnce(new Error("Still broken"));

    await expect(ensureChromium(workspaceRoot, testLogger)).rejects.toThrow(/Still broken/);
  });
});

describe("runPlaywrightChromiumEnsure", () => {
  beforeEach(() => {
    mockLaunch.mockReset();
    mockClose.mockReset();
    mockVersion.mockReset();
    mockVersion.mockReturnValue("131.0.6778.87");
    delete process.env["PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"];
  });

  afterEach(() => {
    delete process.env["PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"];
  });

  it("returns exitCode 0 when Chromium is already present", async () => {
    const browser = makeBrowser();
    mockLaunch.mockResolvedValueOnce(browser);

    const result = await runPlaywrightChromiumEnsure(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(0);
    const data = result.data as PlaywrightChromiumEnsureResult;
    expect(data.installed).toBe(true);
    expect(data.skipped).toBe(true);
  });

  it("returns exitCode 1 on failure", async () => {
    const { preflightChromium } = await import("@syrokomskyi/axiom-factory-app/run/axiom-cli");
    vi.mocked(preflightChromium).mockRejectedValueOnce(new Error("Not installed"));
    mockLaunch.mockRejectedValueOnce(new Error("Executable not found"));

    const result = await runPlaywrightChromiumEnsure(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(1);
    expect(result.summary).toContain("Not installed");
  });
});
