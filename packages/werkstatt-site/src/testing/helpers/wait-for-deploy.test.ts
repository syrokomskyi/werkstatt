import { describe, it, expect, vi, afterEach } from "vitest";
import { waitForDeploy } from "./wait-for-deploy.ts";

describe("waitForDeploy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves when fetch returns ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await waitForDeploy("https://example.com", { intervalMs: 10 });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("rejects when fetch never returns ok within timeout", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      waitForDeploy("https://example.com", { timeoutMs: 50, intervalMs: 10 }),
    ).rejects.toThrow(/did not respond within 50ms/);
  });

  it("rejects when fetch throws network errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      waitForDeploy("https://example.com", { timeoutMs: 50, intervalMs: 10 }),
    ).rejects.toThrow(/did not respond within 50ms/);
  });

  it("uses custom timeout and interval defaults", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await waitForDeploy("https://example.com");
    expect(fetchMock).toHaveBeenCalled();
  });
});
