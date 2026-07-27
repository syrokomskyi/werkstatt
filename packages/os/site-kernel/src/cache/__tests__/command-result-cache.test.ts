import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect, describe } from "vitest";
import {
  COMMAND_RESULT_CACHE_NAMESPACE,
  COMMAND_RESULT_CACHE_SCHEMA_VERSION,
  buildCommandResultCacheKey,
  computeInputsHash,
  computeModuleHash,
  getCachedCommandResult,
  setCachedCommandResult,
  type CommandResultCacheKey,
} from "../command-result-cache.ts";
import { NoopCacheLayer } from "../noop-cache-layer.ts";
import type { KernelExecutionReport } from "../../types.ts";

function makeReport(overrides: Partial<KernelExecutionReport> = {}): KernelExecutionReport {
  return {
    commandName: "test.command",
    exitCode: 0,
    ok: true,
    metadata: {
      name: "test.command",
      description: "test",
      scope: "workspace",
      execute: () => undefined,
    },
    logs: [],
    timing: { durationMs: 10, exceededTimeout: false },
    ...overrides,
  };
}

function makeKey(overrides: Partial<CommandResultCacheKey> = {}): CommandResultCacheKey {
  return {
    schemaVersion: COMMAND_RESULT_CACHE_SCHEMA_VERSION,
    commandName: "test.command",
    siteName: null,
    inputsHash: "abc",
    moduleHash: "def",
    ...overrides,
  };
}

describe("buildCommandResultCacheKey", () => {
  test("includes schema version, command name, site name, hashes", () => {
    const key1 = buildCommandResultCacheKey(makeKey({ inputsHash: "aaa" }));
    const key2 = buildCommandResultCacheKey(makeKey({ inputsHash: "bbb" }));
    expect(key1).not.toBe(key2);
  });

  test("schema version bump changes key", () => {
    const key1 = buildCommandResultCacheKey(makeKey());
    const key2 = buildCommandResultCacheKey(
      makeKey({ schemaVersion: COMMAND_RESULT_CACHE_SCHEMA_VERSION + 1 }),
    );
    expect(key1).not.toBe(key2);
  });

  test("site name affects key", () => {
    const key1 = buildCommandResultCacheKey(makeKey({ siteName: null }));
    const key2 = buildCommandResultCacheKey(makeKey({ siteName: "webgogol-com" }));
    expect(key1).not.toBe(key2);
  });
});

describe("computeInputsHash", () => {
  test("empty reads returns stable hash", async () => {
    const ws = await fs.mkdtemp(path.join(os.tmpdir(), "cache-test-"));
    const h1 = await computeInputsHash([], ws, ws);
    const h2 = await computeInputsHash([], ws, ws);
    expect(h1).toBe(h2);
  });

  test("hash changes when file content changes", async () => {
    const ws = await fs.mkdtemp(path.join(os.tmpdir(), "cache-test-"));
    const filePath = path.join(ws, "input.md");
    await fs.writeFile(filePath, "content v1");
    const h1 = await computeInputsHash(["input.md"], ws, ws);
    await fs.writeFile(filePath, "content v2");
    const h2 = await computeInputsHash(["input.md"], ws, ws);
    expect(h1).not.toBe(h2);
  });

  test("hash is stable for unchanged content", async () => {
    const ws = await fs.mkdtemp(path.join(os.tmpdir(), "cache-test-"));
    const filePath = path.join(ws, "input.md");
    await fs.writeFile(filePath, "stable content");
    const h1 = await computeInputsHash(["input.md"], ws, ws);
    const h2 = await computeInputsHash(["input.md"], ws, ws);
    expect(h1).toBe(h2);
  });

  test("glob patterns match multiple files", async () => {
    const ws = await fs.mkdtemp(path.join(os.tmpdir(), "cache-test-"));
    await fs.writeFile(path.join(ws, "a.md"), "a");
    await fs.writeFile(path.join(ws, "b.md"), "b");
    const h1 = await computeInputsHash(["*.md"], ws, ws);
    expect(h1).toBeTruthy();
    await fs.writeFile(path.join(ws, "c.md"), "c");
    const h2 = await computeInputsHash(["*.md"], ws, ws);
    expect(h1).not.toBe(h2);
  });
});

describe("computeModuleHash", () => {
  test("directory hash changes when a file changes", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mod-hash-"));
    await fs.writeFile(path.join(dir, "a.ts"), "export const x = 1;");
    const h1 = await computeModuleHash(dir);
    await fs.writeFile(path.join(dir, "a.ts"), "export const x = 2;");
    const h2 = await computeModuleHash(dir);
    expect(h1).not.toBe(h2);
  });

  test("returns fallback for nonexistent directory", async () => {
    const h = await computeModuleHash(path.join(os.tmpdir(), "nonexistent-dir-xyz"));
    expect(h).toBeTruthy();
  });
});

describe("getCachedCommandResult / setCachedCommandResult", () => {
  test("miss returns null on noop cache", async () => {
    const cache = new NoopCacheLayer("/tmp/test.db", "test");
    const result = await getCachedCommandResult(cache, makeKey());
    expect(result).toBeNull();
  });

  test("noop cache does not store", async () => {
    const cache = new NoopCacheLayer("/tmp/test.db", "test");
    await setCachedCommandResult(cache, makeKey(), makeReport());
    const result = await getCachedCommandResult(cache, makeKey());
    expect(result).toBeNull();
  });
});

describe("COMMAND_RESULT_CACHE_NAMESPACE", () => {
  test("is command_results", () => {
    expect(COMMAND_RESULT_CACHE_NAMESPACE).toBe("command_results");
  });
});

describe("COMMAND_RESULT_CACHE_SCHEMA_VERSION", () => {
  test("is 1", () => {
    expect(COMMAND_RESULT_CACHE_SCHEMA_VERSION).toBe(1);
  });
});
