import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runSmokeChecks,
  runSmokeChecksOrSkip,
  SmokeConfigNotFoundError,
  SmokeEntryNotFoundError,
} from "./smoke-runner.ts";

const sampleServiceYaml = `
services:
  test-service:
    endpoints:
      - path: /health
        method: GET
        expectStatus: 200
        expectBodyContains: ok
        timeoutMs: 5000
      - path: /api/status
        method: GET
        expectStatus: 200
        timeoutMs: 5000
`;

const sampleServiceYamlShortTimeout = `
services:
  test-service:
    endpoints:
      - path: /health
        method: GET
        expectStatus: 200
        expectBodyContains: ok
        timeoutMs: 200
      - path: /api/status
        method: GET
        expectStatus: 200
        timeoutMs: 200
`;

const sampleSiteYaml = `
sites:
  test-site:
    paths:
      - path: /
        method: GET
        expectStatus: 200
        expectBodyContains: <!DOCTYPE html
        timeoutMs: 10000
`;

async function makeTempYaml(content: string, filename: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "smoke-test-"));
  const filePath = join(dir, filename);
  await writeFile(filePath, content, "utf8");
  return filePath;
}

describe("smoke-runner", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("runSmokeChecks returns pass when all endpoints return expected status", async () => {
    const yamlPath = await makeTempYaml(sampleServiceYaml, "service-smoke.yaml");

    const mockFetch = vi.fn().mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    const result = await runSmokeChecks({
      service: "test-service",
      url: "https://example.workers.dev",
      yamlPath,
      command: "service.smoke.run",
    });

    expect(result.status).toBe("pass");
    expect(result.checks).toHaveLength(2);
    expect(result.checks.every((c) => c.passed)).toBe(true);
    expect(result.targetId).toBe("test-service");
    expect(result.url).toBe("https://example.workers.dev");
  });

  it("runSmokeChecks returns fail when status code mismatches", async () => {
    const yamlPath = await makeTempYaml(sampleServiceYaml, "service-smoke.yaml");

    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response("Internal Server Error", { status: 500 }));
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    const result = await runSmokeChecks({
      service: "test-service",
      url: "https://example.workers.dev",
      yamlPath,
      command: "service.smoke.run",
    });

    expect(result.status).toBe("fail");
    expect(result.checks.every((c) => !c.passed)).toBe(true);
    expect(result.checks[0].error).toContain("expected 200, got 500");
  });

  it("runSmokeChecks returns fail when body does not contain expected string", async () => {
    const yamlPath = await makeTempYaml(sampleServiceYaml, "service-smoke.yaml");

    const mockFetch = vi.fn().mockResolvedValue(new Response('{"status":"down"}', { status: 200 }));
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    const result = await runSmokeChecks({
      service: "test-service",
      url: "https://example.workers.dev",
      yamlPath,
      command: "service.smoke.run",
    });

    expect(result.status).toBe("fail");
    const healthCheck = result.checks.find((c) => c.path === "/health");
    expect(healthCheck?.passed).toBe(false);
    expect(healthCheck?.error).toContain("expected body to contain");
  });

  it("runSmokeChecks handles fetch timeout via AbortController", async () => {
    const yamlPath = await makeTempYaml(sampleServiceYamlShortTimeout, "service-smoke.yaml");

    const mockFetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        if (signal) {
          signal.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    const result = await runSmokeChecks({
      service: "test-service",
      url: "https://example.workers.dev",
      yamlPath,
      command: "service.smoke.run",
    });

    expect(result.status).toBe("fail");
    expect(result.checks[0].error).toContain("timeout");
    expect(result.checks[0].status).toBeNull();
  });

  it("runSmokeChecks handles network errors", async () => {
    const yamlPath = await makeTempYaml(sampleServiceYaml, "service-smoke.yaml");

    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    const result = await runSmokeChecks({
      service: "test-service",
      url: "https://example.workers.dev",
      yamlPath,
      command: "service.smoke.run",
    });

    expect(result.status).toBe("fail");
    expect(result.checks[0].error).toContain("fetch failed");
    expect(result.checks[0].error).toContain("ECONNREFUSED");
  });

  it("runSmokeChecks throws SmokeConfigNotFoundError when YAML file is missing", async () => {
    await expect(
      runSmokeChecks({
        service: "test-service",
        url: "https://example.workers.dev",
        yamlPath: "/nonexistent/path/service-smoke.yaml",
        command: "service.smoke.run",
      }),
    ).rejects.toThrow(SmokeConfigNotFoundError);
  });

  it("runSmokeChecks throws SmokeEntryNotFoundError when service id is not in YAML", async () => {
    const yamlPath = await makeTempYaml(sampleServiceYaml, "service-smoke.yaml");

    await expect(
      runSmokeChecks({
        service: "nonexistent-service",
        url: "https://example.workers.dev",
        yamlPath,
        command: "service.smoke.run",
      }),
    ).rejects.toThrow(SmokeEntryNotFoundError);
  });

  it("runSmokeChecks works with site-smoke.yaml format", async () => {
    const yamlPath = await makeTempYaml(sampleSiteYaml, "site-smoke.yaml");

    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response("<!DOCTYPE html><html></html>", { status: 200 }));
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    const result = await runSmokeChecks({
      site: "test-site",
      url: "https://example.com",
      yamlPath,
      command: "site.smoke.run",
    });

    expect(result.status).toBe("pass");
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].passed).toBe(true);
    expect(result.targetId).toBe("test-site");
  });

  it("runSmokeChecksOrSkip returns skipped when YAML file is missing", async () => {
    const result = await runSmokeChecksOrSkip({
      service: "test-service",
      url: "https://example.workers.dev",
      yamlPath: "/nonexistent/path/service-smoke.yaml",
      command: "service.smoke.run",
    });

    expect(result.status).toBe("skipped");
  });

  it("runSmokeChecksOrSkip runs checks when YAML file exists", async () => {
    const yamlPath = await makeTempYaml(sampleServiceYaml, "service-smoke.yaml");

    const mockFetch = vi.fn().mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    const result = await runSmokeChecksOrSkip({
      service: "test-service",
      url: "https://example.workers.dev",
      yamlPath,
      command: "service.smoke.run",
    });

    expect(result.status).toBe("pass");
  });

  it("runSmokeChecks strips trailing slash from base URL", async () => {
    const yamlPath = await makeTempYaml(sampleServiceYaml, "service-smoke.yaml");

    const mockFetch = vi.fn().mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    await runSmokeChecks({
      service: "test-service",
      url: "https://example.workers.dev/",
      yamlPath,
      command: "service.smoke.run",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.workers.dev/health",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
