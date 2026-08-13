import { describe, expect, it, vi, afterEach } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { ensureChromiumInstalled, ChromiumNotInstalledError } from "./run-e2e-tests.ts";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn().mockReturnValue("/fake-home"),
}));

describe("ensureChromiumInstalled", () => {
  const mockedExistsSync = vi.mocked(existsSync);
  const mockedReaddirSync = vi.mocked(readdirSync);

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws ChromiumNotInstalledError when cache dir does not exist", () => {
    mockedExistsSync.mockReturnValue(false);

    expect(() => ensureChromiumInstalled()).toThrow(ChromiumNotInstalledError);
  });

  it("throws ChromiumNotInstalledError when no chromium directories exist", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(["firefox-1234", "webkit-5678"] as any);

    expect(() => ensureChromiumInstalled()).toThrow(ChromiumNotInstalledError);
  });

  it("does not throw when chromium directories exist", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(["chromium-1234", "chromium_headless_shell-5678"] as any);

    expect(() => ensureChromiumInstalled()).not.toThrow();
  });
});
