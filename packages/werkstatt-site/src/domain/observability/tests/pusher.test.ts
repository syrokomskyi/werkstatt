import { describe, it, expect } from "vitest";
import { createMetricsPusher } from "../pusher.ts";

describe("createMetricsPusher", () => {
  it("returns null when endpoint is missing", () => {
    const pusher = createMetricsPusher(
      { serviceName: "test", layer: "factory", environment: "ci" },
      { token: "abc" },
    );
    expect(pusher).toBeNull();
  });

  it("returns null when token is missing", () => {
    const pusher = createMetricsPusher(
      { serviceName: "test", layer: "factory", environment: "ci" },
      { endpoint: "https://ingest.example.com" },
    );
    expect(pusher).toBeNull();
  });

  it("returns null when both are missing", () => {
    const pusher = createMetricsPusher(
      { serviceName: "test", layer: "factory", environment: "ci" },
      {},
    );
    expect(pusher).toBeNull();
  });

  it("returns a pusher when both env vars are present", () => {
    const pusher = createMetricsPusher(
      { serviceName: "test", layer: "factory", environment: "ci" },
      { endpoint: "https://ingest.example.com", token: "abc" },
    );
    expect(pusher).not.toBeNull();
  });

  it("flush() resolves with delivered:true when no points accumulated", async () => {
    const pusher = createMetricsPusher(
      { serviceName: "test", layer: "factory", environment: "ci" },
      { endpoint: "https://ingest.example.com", token: "abc" },
    );
    const result = await pusher!.flush();
    expect(result.delivered).toBe(true);
  });

  it("flush() never throws even on network failure", async () => {
    const pusher = createMetricsPusher(
      { serviceName: "test", layer: "factory", environment: "ci" },
      { endpoint: "https://nonexistent.invalid.example", token: "abc" },
      { timeoutMs: 100 },
    );
    pusher!.counterAdd("warpgogol_factory_smoke_total", 1);
    const result = await pusher!.flush();
    expect(result.delivered).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("flush() honors timeout via AbortController", async () => {
    // Use a hanging endpoint — we can't easily mock fetch, but we can test
    // with a very short timeout against a real (slow) endpoint.
    const pusher = createMetricsPusher(
      { serviceName: "test", layer: "factory", environment: "ci" },
      { endpoint: "https://10.255.255.1", token: "abc" },
      { timeoutMs: 50 },
    );
    pusher!.counterAdd("warpgogol_factory_smoke_total", 1);
    const start = Date.now();
    const result = await pusher!.flush();
    const elapsed = Date.now() - start;
    expect(result.delivered).toBe(false);
    // Should abort within a reasonable window of the timeout
    expect(elapsed).toBeLessThan(5000);
  });
});
