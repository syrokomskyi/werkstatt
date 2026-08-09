/*
<MODULE_CONTRACT>
<purpose>
RFC-0605: tests for passport.key.ensure — idempotent pipeline-safe key creation.
Tests no-op when key exists, key creation when missing, private key output via
--private-key-out with 0600 permissions, and failure modes PKE-01..04.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
<item>RFC-0605: initial passport.key.ensure tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { runPassportKeyEnsure } from "../passport.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";
import { PassportPublicKeyFileSchema } from "@warpgogol/werkstatt-site/passport/schema";

async function writeFile(dir: string, rel: string, content: string): Promise<void> {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf-8");
}

function makeContext(workspaceRoot: string, appDir: string): KernelRuntimeContext {
  return {
    workspaceRoot,
    site: { name: "test-site", directory: appDir },
    commandName: "passport.key.ensure",
    flags: {},
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  } as unknown as KernelRuntimeContext;
}

const SYSTEM_MD = `---
cosmicStar: Vega
app: test-site
i18n:
  default: de
  languages:
    - de
---
`;

let tmpDir: string;
let appDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pke-test-"));
  appDir = path.join(tmpDir, "test-site");
  await fs.mkdir(appDir, { recursive: true });
  await writeFile(appDir, "src/content/system.md", SYSTEM_MD);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function keyFilePath(appDir: string): string {
  return path.join(appDir, "public", ".well-known", "cosmic-passport-key.json");
}

test("creates key when file is missing", async () => {
  const input: KernelCommandInput = { flags: {} } as unknown as KernelCommandInput;
  const result = await runPassportKeyEnsure(input, makeContext(tmpDir, appDir));
  const data = result.data as Record<string, unknown>;

  expect(result.exitCode).toBe(0);
  expect(data.created).toBe(true);
  expect(data.version).toBe("v1");
  expect(existsSync(keyFilePath(appDir))).toBe(true);

  const raw = await fs.readFile(keyFilePath(appDir), "utf8");
  const parsed = PassportPublicKeyFileSchema.parse(JSON.parse(raw));
  expect(parsed.keys).toHaveLength(1);
  expect(parsed.keys[0].active).toBe(true);
  expect(parsed.keys[0].version).toBe("v1");
});

test("no-op when key file already exists", async () => {
  const existingKey = {
    schemaVersion: "1.0",
    appId: "test-site",
    keys: [
      {
        version: "v3",
        active: true,
        type: "Ed25519VerificationKey2020",
        publicKeyMultibase: "z6MkhaXgEzGqYhQ1nJQ8m6ZBmJtQYrYwQKvQYqYqYqYq",
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    ],
  };
  await writeFile(
    appDir,
    "public/.well-known/cosmic-passport-key.json",
    JSON.stringify(existingKey, null, 2),
  );

  const input: KernelCommandInput = { flags: {} } as unknown as KernelCommandInput;
  const result = await runPassportKeyEnsure(input, makeContext(tmpDir, appDir));
  const data = result.data as Record<string, unknown>;

  expect(result.exitCode).toBe(0);
  expect(data.created).toBe(false);
  expect(data.version).toBe("v3");

  const raw = await fs.readFile(keyFilePath(appDir), "utf8");
  expect(JSON.parse(raw)).toEqual(existingKey);
});

test("never prints private key to stdout", async () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  const input: KernelCommandInput = { flags: {} } as unknown as KernelCommandInput;
  const result = await runPassportKeyEnsure(input, makeContext(tmpDir, appDir));
  const data = result.data as Record<string, unknown>;

  expect(result.exitCode).toBe(0);
  expect(data.created).toBe(true);

  for (const call of logSpy.mock.calls) {
    const arg = String(call[0]);
    // No call argument should be a 64-char hex string (private key)
    expect(arg).not.toMatch(/^[a-f0-9]{64}$/);
  }

  logSpy.mockRestore();
});

test("--private-key-out writes private key with 0600 permissions", async () => {
  const privKeyPath = path.join(tmpDir, "private-key.txt");
  const input: KernelCommandInput = {
    flags: { "private-key-out": privKeyPath },
  } as unknown as KernelCommandInput;

  const result = await runPassportKeyEnsure(input, makeContext(tmpDir, appDir));
  const data = result.data as Record<string, unknown>;

  expect(result.exitCode).toBe(0);
  expect(data.created).toBe(true);
  expect(data.privateKeyWrittenTo).toBe(privKeyPath);
  expect(existsSync(privKeyPath)).toBe(true);

  const content = await fs.readFile(privKeyPath, "utf8");
  expect(content).toMatch(/^[a-f0-9]{64}$/);

  const stat = await fs.stat(privKeyPath);
  const mode = stat.mode & 0o777;
  expect(mode).toBe(0o600);
});

test("PKE-01: manifest missing → fail", async () => {
  const emptyDir = path.join(tmpDir, "empty-site");
  await fs.mkdir(emptyDir, { recursive: true });

  const input: KernelCommandInput = { flags: {} } as unknown as KernelCommandInput;
  const result = await runPassportKeyEnsure(input, makeContext(tmpDir, emptyDir));
  const data = result.data as Record<string, unknown>;
  const violations = data.violations as string[];

  expect(result.exitCode).toBe(1);
  expect(violations[0]).toMatch(/PKE-01/);
});

test("PKE-03: all keys inactive → fail", async () => {
  const allInactive = {
    schemaVersion: "1.0",
    appId: "test-site",
    keys: [
      {
        version: "v1",
        active: false,
        type: "Ed25519VerificationKey2020",
        publicKeyMultibase: "z6MkhaXgEzGqYhQ1nJQ8m6ZBmJtQYrYwQKvQYqYqYqYq",
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    ],
  };
  await writeFile(
    appDir,
    "public/.well-known/cosmic-passport-key.json",
    JSON.stringify(allInactive, null, 2),
  );

  const input: KernelCommandInput = { flags: {} } as unknown as KernelCommandInput;
  const result = await runPassportKeyEnsure(input, makeContext(tmpDir, appDir));
  const data = result.data as Record<string, unknown>;
  const violations = data.violations as string[];

  expect(result.exitCode).toBe(1);
  expect(violations[0]).toMatch(/PKE-03/);
});

test("PKE-03: corrupt key file → fail", async () => {
  await writeFile(appDir, "public/.well-known/cosmic-passport-key.json", "not valid json {{{");

  const input: KernelCommandInput = { flags: {} } as unknown as KernelCommandInput;
  const result = await runPassportKeyEnsure(input, makeContext(tmpDir, appDir));
  const data = result.data as Record<string, unknown>;
  const violations = data.violations as string[];

  expect(result.exitCode).toBe(1);
  expect(violations[0]).toMatch(/PKE-03/);
});

test("PKE-04: private key output path unwritable → fail", async () => {
  const _badPath = path.join(tmpDir, "nonexistent-deep-dir", "nested", "private-key.txt");
  // Don't create the parent directory — but mkdir recursive should handle it...
  // Use a path that will fail: a path under a file (not a directory)
  const blockingFile = path.join(tmpDir, "blocking-file");
  await fs.writeFile(blockingFile, "blocker", "utf8");
  const impossiblePath = path.join(blockingFile, "private-key.txt");

  const input: KernelCommandInput = {
    flags: { "private-key-out": impossiblePath },
  } as unknown as KernelCommandInput;

  const result = await runPassportKeyEnsure(input, makeContext(tmpDir, appDir));
  const data = result.data as Record<string, unknown>;
  const violations = data.violations as string[];

  expect(result.exitCode).toBe(1);
  expect(violations[0]).toMatch(/PKE-04/);
});
