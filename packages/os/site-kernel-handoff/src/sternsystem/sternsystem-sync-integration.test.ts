/*
<MODULE_CONTRACT>
<purpose>RFC-0574: Integration tests for star-topology sync with real git operations.</purpose>
<keywords>RFC-0574, sync, star topology, git, integration test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0574: initial integration tests for sternsystem.sync star-topology.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSternsystemSync } from "./sternsystem-sync.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

function git(cwd: string, args: string): string {
  return execSync(`git ${args}`, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

let tmpDir: string;
let workspaceRoot: string;
let cacheDir: string;
let bareDir: string;
let externalDir: string;

function makeInput(flags: Record<string, unknown>): KernelCommandInput {
  return {
    flags: flags as Record<string, import("@warpgogol/site-kernel").KernelFlagValue>,
    args: [],
    argv: [],
  };
}

function makeContext(root: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    logger: {
      section: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      success: () => {},
    },
    dryRun: false,
  } as unknown as KernelRuntimeContext;
}

async function setupRegistry(yaml: string): Promise<void> {
  await mkdir(join(workspaceRoot, "systems"), { recursive: true });
  await writeFile(join(workspaceRoot, "systems", "registry.yaml"), yaml, "utf8");
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "sync-integration-"));
  workspaceRoot = tmpDir;
  cacheDir = join(tmpDir, "cache");
  bareDir = join(tmpDir, "bare.git");
  externalDir = join(tmpDir, "external.git");

  // Create bare repos
  git(tmpDir, `init --bare "${bareDir}"`);
  git(tmpDir, `init --bare "${externalDir}"`);

  // Create cache clone with initial content
  git(tmpDir, `clone "${bareDir}" "${cacheDir}"`);
  git(cacheDir, 'config user.email "test@example.com"');
  git(cacheDir, 'config user.name "Test"');
  await mkdir(join(cacheDir, "src/content"), { recursive: true });
  await writeFile(join(cacheDir, "src/content/system.md"), "# System\n");
  await mkdir(join(cacheDir, "bordbuch"), { recursive: true });
  await writeFile(join(cacheDir, "bordbuch/events.ndjson"), "");
  git(cacheDir, "add -A");
  git(cacheDir, 'commit -m "initial"');
  git(cacheDir, "push origin master");

  // Minimal workspace setup for validate
  await mkdir(join(workspaceRoot, "docs", "rfcs"), { recursive: true });
  await writeFile(join(workspaceRoot, "docs", "rfcs", "RFC-0001-test.md"), "", "utf8");
  await writeFile(
    join(workspaceRoot, "package.json"),
    JSON.stringify({ version: "4.5.0" }),
    "utf8",
  );
  await writeFile(
    join(workspaceRoot, "uni.registry.yaml"),
    JSON.stringify({ entries: [{ id: "test", semanticId: "test", version: "1.0.0", intent: [] }] }),
    "utf8",
  );
  await mkdir(join(workspaceRoot, "packages", "dummy"), { recursive: true });
  await writeFile(
    join(workspaceRoot, "packages", "dummy", "index.ts"),
    "export const x = 1;\n",
    "utf8",
  );
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

test("sync pushes from cache clone to bare mirror", async () => {
  await setupRegistry(
    `schemaVersion: "1.0.0"
systems:
  - id: test-site
    cosmicStar: Vega
    mirrors:
      - path: "${cacheDir}"
        storageType: non-bare
      - path: "${bareDir}"
        storageType: bare
    pinnedPlatform: "4.5.0"
    currentMission: null
    lastRelease: null
    status: registered
    registeredAt: "2026-01-01T00:00:00Z"
    notes: ""
`,
  );

  // Make a new commit in cache
  await writeFile(join(cacheDir, "src/content/system.md"), "# Updated\n");
  git(cacheDir, "add -A");
  git(cacheDir, 'commit -m "update"');

  const result = await runSternsystemSync(
    makeInput({ id: "test-site", direction: "push" }),
    makeContext(workspaceRoot),
  );

  expect(result.exitCode).toBe(0);

  // Verify bare repo received the commit
  const bareLog = git(bareDir, "log --oneline");
  expect(bareLog).toContain("update");
});

test("sync pushes to multiple external mirrors", async () => {
  await setupRegistry(
    `schemaVersion: "1.0.0"
systems:
  - id: test-site
    cosmicStar: Vega
    mirrors:
      - path: "${cacheDir}"
        storageType: non-bare
      - path: "${bareDir}"
        storageType: bare
      - path: "${externalDir}"
        storageType: bare
    pinnedPlatform: "4.5.0"
    currentMission: null
    lastRelease: null
    status: registered
    registeredAt: "2026-01-01T00:00:00Z"
    notes: ""
`,
  );

  // Make a new commit in cache
  await writeFile(join(cacheDir, "src/content/system.md"), "# Multi-sync\n");
  git(cacheDir, "add -A");
  git(cacheDir, 'commit -m "multi-sync"');

  const result = await runSternsystemSync(
    makeInput({ id: "test-site", direction: "push" }),
    makeContext(workspaceRoot),
  );

  expect(result.exitCode).toBe(0);

  // Both bare and external should have the commit
  const bareLog = git(bareDir, "log --oneline");
  const externalLog = git(externalDir, "log --oneline");
  expect(bareLog).toContain("multi-sync");
  expect(externalLog).toContain("multi-sync");
});

test("sync handles per-mirror failure non-fatally", async () => {
  const nonExistentMirror = join(tmpDir, "nonexistent.git");
  await setupRegistry(
    `schemaVersion: "1.0.0"
systems:
  - id: test-site
    cosmicStar: Vega
    mirrors:
      - path: "${cacheDir}"
        storageType: non-bare
      - path: "${bareDir}"
        storageType: bare
      - path: "${nonExistentMirror}"
        storageType: bare
    pinnedPlatform: "4.5.0"
    currentMission: null
    lastRelease: null
    status: registered
    registeredAt: "2026-01-01T00:00:00Z"
    notes: ""
`,
  );

  // Make a new commit in cache
  await writeFile(join(cacheDir, "src/content/system.md"), "# Failure test\n");
  git(cacheDir, "add -A");
  git(cacheDir, 'commit -m "failure-test"');

  const result = await runSternsystemSync(
    makeInput({ id: "test-site", direction: "push" }),
    makeContext(workspaceRoot),
  );

  // Should succeed overall (non-fatal mirror failure)
  expect(result.exitCode).toBe(0);

  // Bare repo should still receive the commit
  const bareLog = git(bareDir, "log --oneline");
  expect(bareLog).toContain("failure-test");
});

test("sync with single mirror (cache only) throws — no bare mirror", async () => {
  await setupRegistry(
    `schemaVersion: "1.0.0"
systems:
  - id: test-site
    cosmicStar: Vega
    mirrors:
      - path: "${cacheDir}"
        storageType: non-bare
    pinnedPlatform: "4.5.0"
    currentMission: null
    lastRelease: null
    status: registered
    registeredAt: "2026-01-01T00:00:00Z"
    notes: ""
`,
  );

  await expect(
    runSternsystemSync(
      makeInput({ id: "test-site", direction: "push" }),
      makeContext(workspaceRoot),
    ),
  ).rejects.toThrow(/no bare mirror configured/);
});
