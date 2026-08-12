import { describe, expect, it, vi, beforeEach } from "vitest";
import { runPlaywrightPreflightCheck } from "../playwright-preflight.ts";
import type { PlaywrightPreflightCheckResult } from "../playwright-preflight.ts";
import { makeTestContext, testInput } from "./helpers.ts";

const mockLaunch = vi.fn();
const mockClose = vi.fn();
const mockVersion = vi.fn(() => "131.0.6778.87");

vi.mock("playwright", () => ({
  chromium: {
    launch: (...args: unknown[]) => mockLaunch(...args),
  },
}));

function makeBrowser() {
  return {
    version: mockVersion,
    close: mockClose,
  };
}

const workspaceRoot = "/test-workspace";

describe("runPlaywrightPreflightCheck", () => {
  beforeEach(() => {
    mockLaunch.mockReset();
    mockClose.mockReset();
    mockVersion.mockReset();
    mockVersion.mockReturnValue("131.0.6778.87");
  });

  it("returns exitCode 0 when Chromium is already installed", async () => {
    mockLaunch.mockResolvedValueOnce(makeBrowser());

    const result = await runPlaywrightPreflightCheck(
      testInput(),
      makeTestContext(workspaceRoot),
    );

    expect(result.exitCode).toBe(0);
    const data = result.data as PlaywrightPreflightCheckResult;
    expect(data.status).toBe("pass");
    expect(data.command).toBe("playwright.preflight.check");
  });

  it("returns exitCode 1 when Chromium is not installed", async () => {
    mockLaunch.mockRejectedValueOnce(new Error("Executable not found"));

    const result = await runPlaywrightPreflightCheck(
      testInput(),
      makeTestContext(workspaceRoot),
    );

    expect(result.exitCode).toBe(1);
    const data = result.data as PlaywrightPreflightCheckResult;
    expect(data.status).toBe("fail");
    expect(result.summary).toContain("playwright install chromium");
  });

  it("includes original launch error in the output", async () => {
    mockLaunch.mockRejectedValueOnce(
      new Error("Executable doesn't exist at /path/to/chromium"),
    );

    const result = await runPlaywrightPreflightCheck(
      testInput(),
      makeTestContext(workspaceRoot),
    );

    expect(result.exitCode).toBe(1);
    const data = result.data as PlaywrightPreflightCheckResult;
    expect(data.error).toContain("Executable doesn't exist at /path/to/chromium");
    expect(result.summary).toContain("Executable doesn't exist at /path/to/chromium");
  });
});
