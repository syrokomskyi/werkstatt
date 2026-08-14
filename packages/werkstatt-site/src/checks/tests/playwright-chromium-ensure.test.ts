import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ensureChromium, runPlaywrightChromiumEnsure } from "../playwright-chromium-ensure.ts";
import type { PlaywrightChromiumEnsureResult } from "../playwright-chromium-ensure.ts";
import { makeTestContext, testInput, testLogger } from "./helpers.ts";

const mockLaunch = vi.fn();
const mockClose = vi.fn();
const mockVersion = vi.fn(() => "131.0.6778.87");

vi.mock("playwright", () => ({
  chromium: {
    launch: (...args: unknown[]) => mockLaunch(...args),
  },
}));

const { mockPreflightChromium } = vi.hoisted(() => ({
  mockPreflightChromium: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@syrokomskyi/axiom-factory-app/run/axiom-cli", () => ({
  preflightChromium: mockPreflightChromium,
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
    vi.useFakeTimers();
    mockLaunch.mockReset();
    mockClose.mockReset();
    mockVersion.mockReset();
    mockVersion.mockReturnValue("131.0.6778.87");
    mockPreflightChromium.mockReset();
    mockPreflightChromium.mockResolvedValue(undefined);
    delete process.env["PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"];
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("installs via preflightChromium when launch fails (first attempt succeeds)", async () => {
    const browser = makeBrowser();
    mockLaunch
      .mockRejectedValueOnce(new Error("Executable not found"))
      .mockResolvedValueOnce(browser);

    const result = await ensureChromium(workspaceRoot, testLogger);

    expect(result.installed).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.chromiumRevision).toBe("131.0.6778.87");
  });

  it("retries preflightChromium and succeeds on second attempt", async () => {
    const browser = makeBrowser();
    mockLaunch
      .mockRejectedValueOnce(new Error("Executable not found"))
      .mockResolvedValueOnce(browser);
    mockPreflightChromium
      .mockRejectedValueOnce(new Error("Network timeout"))
      .mockResolvedValueOnce(undefined);

    const promise = ensureChromium(workspaceRoot, testLogger);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.installed).toBe(true);
    expect(result.skipped).toBe(false);
    expect(mockPreflightChromium).toHaveBeenCalledTimes(2);
  });

  it("retries preflightChromium and succeeds on third attempt", async () => {
    const browser = makeBrowser();
    mockLaunch
      .mockRejectedValueOnce(new Error("Executable not found"))
      .mockResolvedValueOnce(browser);
    mockPreflightChromium
      .mockRejectedValueOnce(new Error("Network timeout 1"))
      .mockRejectedValueOnce(new Error("Network timeout 2"))
      .mockResolvedValueOnce(undefined);

    const promise = ensureChromium(workspaceRoot, testLogger);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.installed).toBe(true);
    expect(result.skipped).toBe(false);
    expect(mockPreflightChromium).toHaveBeenCalledTimes(3);
  });

  it("throws after all 3 retry attempts fail", async () => {
    mockLaunch.mockRejectedValue(new Error("Executable not found"));
    mockPreflightChromium.mockRejectedValue(new Error("Network error"));

    const promise = ensureChromium(workspaceRoot, testLogger);
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(/Network error/);
    expect(mockPreflightChromium).toHaveBeenCalledTimes(3);
  });

  it("does not retry when Chromium is already installed", async () => {
    const browser = makeBrowser();
    mockLaunch.mockResolvedValueOnce(browser);

    await ensureChromium(workspaceRoot, testLogger);

    expect(mockPreflightChromium).not.toHaveBeenCalled();
  });

  it("throws when launch fails after preflightChromium succeeds on all attempts", async () => {
    mockLaunch.mockRejectedValue(new Error("Still broken"));

    const promise = ensureChromium(workspaceRoot, testLogger);
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(/Still broken/);
  });
});

describe("runPlaywrightChromiumEnsure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockLaunch.mockReset();
    mockClose.mockReset();
    mockVersion.mockReset();
    mockVersion.mockReturnValue("131.0.6778.87");
    mockPreflightChromium.mockReset();
    mockPreflightChromium.mockResolvedValue(undefined);
    delete process.env["PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"];
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("returns exitCode 1 on failure after all retries", async () => {
    mockLaunch.mockRejectedValue(new Error("Executable not found"));
    mockPreflightChromium.mockRejectedValue(new Error("Not installed"));

    const promise = runPlaywrightChromiumEnsure(testInput(), makeTestContext(workspaceRoot));
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.exitCode).toBe(1);
    expect(result.summary).toContain("Not installed");
  });
});
