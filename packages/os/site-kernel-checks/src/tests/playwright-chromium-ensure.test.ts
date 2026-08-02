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

// Mock child_process.execSync
const mockExecSync = vi.fn();
vi.mock("node:child_process", () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
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
    mockExecSync.mockReset();
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
    expect(mockExecSync).not.toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it("installs when Chromium launch fails and env var is not set", async () => {
    const browser = makeBrowser();
    mockLaunch
      .mockRejectedValueOnce(new Error("Executable not found"))
      .mockResolvedValueOnce(browser);
    mockExecSync.mockReturnValueOnce(undefined);

    const result = await ensureChromium(workspaceRoot, testLogger);

    expect(result.installed).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.chromiumRevision).toBe("131.0.6778.87");
    expect(mockExecSync).toHaveBeenCalledWith(
      "pnpm exec playwright install chromium",
      expect.objectContaining({ cwd: workspaceRoot, timeout: 120_000 }),
    );
  });

  it("throws on install failure", async () => {
    mockLaunch.mockRejectedValueOnce(new Error("Executable not found"));
    mockExecSync.mockImplementationOnce(() => {
      throw new Error("Network error");
    });

    await expect(ensureChromium(workspaceRoot, testLogger)).rejects.toThrow(
      /install failed.*Network error/,
    );
  });

  it("throws when launch fails and PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is set", async () => {
    process.env["PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"] = "1";
    mockLaunch.mockRejectedValueOnce(new Error("Executable not found"));

    await expect(ensureChromium(workspaceRoot, testLogger)).rejects.toThrow(
      /PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD/,
    );
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("throws when launch fails after install", async () => {
    mockLaunch
      .mockRejectedValueOnce(new Error("Executable not found"))
      .mockRejectedValueOnce(new Error("Still broken"));
    mockExecSync.mockReturnValueOnce(undefined);

    await expect(ensureChromium(workspaceRoot, testLogger)).rejects.toThrow(
      /launch failed after install/,
    );
  });
});

describe("runPlaywrightChromiumEnsure", () => {
  beforeEach(() => {
    mockLaunch.mockReset();
    mockClose.mockReset();
    mockExecSync.mockReset();
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
    process.env["PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"] = "1";
    mockLaunch.mockRejectedValueOnce(new Error("Not installed"));

    const result = await runPlaywrightChromiumEnsure(testInput(), makeTestContext(workspaceRoot));

    expect(result.exitCode).toBe(1);
    expect(result.summary).toContain("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD");
  });
});
