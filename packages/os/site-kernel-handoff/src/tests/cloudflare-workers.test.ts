/*
<MODULE_CONTRACT>
<purpose>RFC-0379: cloudflare-workers adapter tests — verify wrangler invocation, exit code handling, health verdict mapping, secret redaction.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0379: initial adapter tests with stubbed CommandRunner.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createCloudflareWorkersAdapter } from "../leitstand/adapters/cloudflare-workers.ts";
import type { CommandRunner } from "../leitstand/adapter.ts";

function stubRunner(exitCode: number, stdout: string, stderr: string = ""): CommandRunner {
  return vi.fn(async () => ({ exitCode, stdout, stderr })) as unknown as CommandRunner;
}

function optsCapturingRunner(exitCode: number, stdout: string): CommandRunner {
  return vi.fn(
    async (
      _cmd: string,
      _args: string[],
      opts?: { cwd?: string; env?: Record<string, string> },
    ) => ({
      exitCode,
      stdout,
      stderr: "",
      opts,
    }),
  ) as unknown as CommandRunner;
}

const basePropagateInput = {
  systemId: "test-system",
  releaseId: "test-system-r000001",
  channel: "alt" as const,
  distPath: "/tmp/dist",
  workerName: "alt-test-system",
  url: "https://alt.test.example.com",
  secretsFilePath: undefined as string | undefined,
  expectedBehaviorSnapshotHash: "",
};

test("adapter: propagate succeeds when wrangler exits 0", async () => {
  const runner = stubRunner(0, "Deployed to https://alt.test.example.com");
  const adapter = createCloudflareWorkersAdapter(runner);
  const result = await adapter.propagate(basePropagateInput);
  expect(result.state).toBe("succeeded");
  expect(result.deploymentUrl).toBe("https://alt.test.example.com");
});

test("adapter: propagate fails when wrangler exits non-zero", async () => {
  const runner = stubRunner(1, "", "wrangler error");
  const adapter = createCloudflareWorkersAdapter(runner);
  const result = await adapter.propagate(basePropagateInput);
  expect(result.state).toBe("failed");
});

test("adapter: rollback succeeds when wrangler exits 0", async () => {
  const runner = stubRunner(0, "Deployed to https://alt.test.example.com");
  const adapter = createCloudflareWorkersAdapter(runner);
  const result = await adapter.rollback({
    systemId: "test-system",
    toReleaseId: "test-system-r000002",
    channel: "main",
    distPath: "/tmp/dist",
    workerName: "test-system",
    url: "https://test.example.com",
    secretsFilePath: undefined,
  });
  expect(result.state).toBe("succeeded");
});

test("adapter: health returns unknown when no behavior snapshot routes", async () => {
  const adapter = createCloudflareWorkersAdapter(stubRunner(0, ""));
  const result = await adapter.health({
    systemId: "test-system",
    channel: "alt",
    deploymentUrl: "https://alt.test.example.com",
    releaseId: "nonexistent-release",
    expectedBehaviorSnapshotHash: "",
    workspaceRoot: "/tmp",
  });
  expect(result.state).toBe("unknown");
  expect(result.checks).toHaveLength(1);
});

test("adapter: name is cloudflare-workers", () => {
  const adapter = createCloudflareWorkersAdapter(stubRunner(0, ""));
  expect(adapter.name).toBe("cloudflare-workers");
});

test("adapter: secret values never appear in propagation result", async () => {
  process.env.TEST_SECRET_VALUE = "super-secret-123";
  const runner = stubRunner(0, "Deployed to https://alt.test.example.com");
  const adapter = createCloudflareWorkersAdapter(runner);
  const result = await adapter.propagate({
    ...basePropagateInput,
    secretsFilePath: undefined,
  });
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain("super-secret-123");
  delete process.env.TEST_SECRET_VALUE;
});

test("adapter: propagate passes dotenv vars via opts.env when secretsFilePath is set", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wg-test-"));
  const envFile = path.join(tmpDir, ".env");
  await fs.writeFile(envFile, "CLOUDFLARE_API_TOKEN=test-token-from-dotenv\n");

  const runner = optsCapturingRunner(0, "Deployed to https://alt.test.example.com");
  const adapter = createCloudflareWorkersAdapter(runner);
  await adapter.propagate({
    ...basePropagateInput,
    secretsFilePath: envFile,
  });

  const calls = (runner as unknown as ReturnType<typeof vi.fn>).mock.calls;
  const lastCall = calls[calls.length - 1];
  const opts = (lastCall[2] as { env?: Record<string, string> } | undefined)?.env;
  expect(opts?.CLOUDFLARE_API_TOKEN).toBe("test-token-from-dotenv");

  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("RFC-0618: health check route probe URLs do NOT include cache-buster query param", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wg-test-cb-"));
  const releaseId = "test-system-r000001";
  const snapshotDir = path.join(tmpDir, "releases", releaseId);
  await fs.mkdir(snapshotDir, { recursive: true });
  await fs.writeFile(
    path.join(snapshotDir, "behavior-snapshot.json"),
    JSON.stringify({
      schemaVersion: "1.0.0",
      releaseId,
      capturedAt: "2026-01-01T00:00:00.000Z",
      routes: [
        { path: "/", contentHash: null },
        { path: "/de", contentHash: null },
      ],
    }),
  );

  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => "<html></html>",
    headers: new Headers(),
  });
  vi.stubGlobal("fetch", mockFetch);

  const adapter = createCloudflareWorkersAdapter(stubRunner(0, ""));
  await adapter.health({
    systemId: "test-system",
    channel: "alt",
    deploymentUrl: "https://alt.example.com",
    releaseId,
    expectedBehaviorSnapshotHash: "",
    workspaceRoot: tmpDir,
  });

  expect(mockFetch.mock.calls.length).toBeGreaterThan(0);
  for (const call of mockFetch.mock.calls) {
    const url = call[0] as string;
    expect(url).not.toContain("?cb=");
  }

  vi.unstubAllGlobals();
  await fs.rm(tmpDir, { recursive: true, force: true });
});
