import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runServiceIntegrationTests,
  resolveIntegrationTestDir,
  IntegrationTestDirNotFoundError,
} from "./integration-runner.ts";

// Mock child_process.spawn to avoid actually running vitest
const mockSpawn = vi.fn();

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: (...args: unknown[]) => mockSpawn(...args),
    default: { ...actual, spawn: (...args: unknown[]) => mockSpawn(...args) },
  };
});

describe("integration-runner", () => {
  let tmpWorkspace: string;

  beforeEach(() => {
    tmpWorkspace = "";
    mockSpawn.mockReset();
  });

  afterEach(async () => {
    if (tmpWorkspace) {
      // tmp dir is auto-cleaned by OS; nothing to do here
    }
  });

  it("resolveIntegrationTestDir returns the expected path", () => {
    const dir = resolveIntegrationTestDir("my-service", "/fake/workspace");
    expect(dir).toBe(
      "/fake/workspace/packages/werkstatt-site/src/testing/integration/services/my-service",
    );
  });

  it("returns skipped status when no integration test directory exists", async () => {
    tmpWorkspace = await mkdtemp(join(tmpdir(), "tmp-integration-"));
    const logger = { info: vi.fn(), warn: vi.fn() };

    const result = await runServiceIntegrationTests(
      "nonexistent-service",
      tmpWorkspace,
      "https://example.workers.dev",
      logger,
    );

    expect(result.status).toBe("skipped");
    expect(result.summary.total).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(logger.warn).toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("runs vitest and returns pass when all tests pass", async () => {
    tmpWorkspace = await mkdtemp(join(tmpdir(), "tmp-integration-"));
    const testDir = resolveIntegrationTestDir("test-service", tmpWorkspace);
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, "health.test.ts"), "// dummy test file", "utf8");

    // Create a minimal .env.dev for the service
    const serviceEnvDir = join(tmpWorkspace, "services", "test-service");
    await mkdir(serviceEnvDir, { recursive: true });
    await writeFile(join(serviceEnvDir, ".env.dev"), "TEST_KEY=test-value\n", "utf8");

    const fakeJsonOutput = JSON.stringify({
      numTotalTests: 3,
      numPassedTests: 3,
      numFailedTests: 0,
      numPendingTests: 0,
      numTodoTests: 0,
    });

    mockSpawn.mockImplementation((_cmd, _args, _opts) => {
      const child = {
        stdout: {
          on: (event: string, cb: (d: Buffer) => void) => {
            if (event === "data") cb(Buffer.from(fakeJsonOutput));
          },
        },
        stderr: { on: () => {} },
        on: (event: string, cb: (code?: number) => void) => {
          if (event === "exit") cb(0);
        },
      };
      return child;
    });

    const logger = { info: vi.fn(), warn: vi.fn() };
    const result = await runServiceIntegrationTests(
      "test-service",
      tmpWorkspace,
      "https://example.workers.dev",
      logger,
    );

    expect(result.status).toBe("pass");
    expect(result.summary.total).toBe(3);
    expect(result.summary.passed).toBe(3);
    expect(result.summary.failed).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(mockSpawn).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
  });

  it("runs vitest and returns fail when some tests fail", async () => {
    tmpWorkspace = await mkdtemp(join(tmpdir(), "tmp-integration-"));
    const testDir = resolveIntegrationTestDir("test-service", tmpWorkspace);
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, "health.test.ts"), "// dummy test file", "utf8");

    const fakeJsonOutput = JSON.stringify({
      numTotalTests: 5,
      numPassedTests: 3,
      numFailedTests: 2,
      numPendingTests: 0,
      numTodoTests: 0,
    });

    mockSpawn.mockImplementation((_cmd, _args, _opts) => {
      const child = {
        stdout: {
          on: (event: string, cb: (d: Buffer) => void) => {
            if (event === "data") cb(Buffer.from(fakeJsonOutput));
          },
        },
        stderr: { on: () => {} },
        on: (event: string, cb: (code?: number) => void) => {
          if (event === "exit") cb(1);
        },
      };
      return child;
    });

    const logger = { info: vi.fn(), warn: vi.fn() };
    const result = await runServiceIntegrationTests(
      "test-service",
      tmpWorkspace,
      "https://example.workers.dev",
      logger,
    );

    expect(result.status).toBe("fail");
    expect(result.summary.total).toBe(5);
    expect(result.summary.passed).toBe(3);
    expect(result.summary.failed).toBe(2);
    expect(result.exitCode).toBe(1);
  });

  it("passes RUN_INTEGRATION_TESTS=1 and INTEGRATION_TEST_URL to vitest env", async () => {
    tmpWorkspace = await mkdtemp(join(tmpdir(), "tmp-integration-"));
    const testDir = resolveIntegrationTestDir("test-service", tmpWorkspace);
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, "health.test.ts"), "// dummy", "utf8");

    let capturedEnv: Record<string, string> | undefined;

    mockSpawn.mockImplementation((_cmd, _args, opts: { env: Record<string, string> }) => {
      capturedEnv = opts.env;
      const child = {
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on: (event: string, cb: (code?: number) => void) => {
          if (event === "exit") cb(0);
        },
      };
      return child;
    });

    const logger = { info: vi.fn(), warn: vi.fn() };
    await runServiceIntegrationTests(
      "test-service",
      tmpWorkspace,
      "https://my-dev.workers.dev",
      logger,
    );

    expect(capturedEnv).toBeDefined();
    expect(capturedEnv!.RUN_INTEGRATION_TESTS).toBe("1");
    expect(capturedEnv!.INTEGRATION_TEST_URL).toBe("https://my-dev.workers.dev");
    expect(capturedEnv!.INTEGRATION_TEST_SERVICE).toBe("test-service");
  });

  it("IntegrationTestDirNotFoundError has correct message", () => {
    const err = new IntegrationTestDirNotFoundError("my-service", "/fake/path");
    expect(err.message).toContain("my-service");
    expect(err.message).toContain("/fake/path");
    expect(err.name).toBe("IntegrationTestDirNotFoundError");
  });
});
