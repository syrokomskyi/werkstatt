/*
<MODULE_CONTRACT>
<purpose>RFC-0574: Unit tests for mirror topology validation rules in sternsystem.validate.</purpose>
<keywords>RFC-0574, mirrors, validate, validation rules, unit test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0574: initial unit tests for mirror validation rules.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSternsystemValidate } from "./sternsystem-validate.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

let workspaceRoot: string;

function makeInput(flags: Record<string, unknown>): KernelCommandInput {
  return {
    flags: flags as Record<string, import("@warpgogol/werkstatt/kernel").KernelFlagValue>,
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

async function writeRegistry(root: string, yaml: string): Promise<void> {
  await mkdir(join(root, "systems"), { recursive: true });
  await writeFile(join(root, "systems", "registry.yaml"), yaml, "utf8");
}

const BASE_SETUP = async (root: string) => {
  await mkdir(join(root, "docs", "rfcs"), { recursive: true });
  await writeFile(join(root, "docs", "rfcs", "RFC-0001-test.md"), "", "utf8");
  await writeFile(join(root, "package.json"), JSON.stringify({ version: "4.5.0" }), "utf8");
  await writeFile(
    join(root, "uni.registry.yaml"),
    JSON.stringify({ entries: [{ id: "test", semanticId: "test", version: "1.0.0", intent: [] }] }),
    "utf8",
  );
  await mkdir(join(root, "packages", "dummy"), { recursive: true });
  await writeFile(join(root, "packages", "dummy", "index.ts"), "export const x = 1;\n", "utf8");
};

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), "mirror-validate-test-"));
  await BASE_SETUP(workspaceRoot);
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

test("validate passes with single non-bare mirror (cache only)", async () => {
  await writeRegistry(
    workspaceRoot,
    'schemaVersion: "1.0.0"\nsystems:\n  - id: test-site\n    cosmicStar: Vega\n    mirrors:\n      - path: "./systems/test-site"\n        storageType: non-bare\n    pinnedPlatform: "4.5.0"\n    currentMission: null\n    lastRelease: null\n    status: registered\n    registeredAt: "2026-01-01T00:00:00Z"\n    notes: ""\n',
  );
  await mkdir(join(workspaceRoot, "systems", "test-site"), { recursive: true });

  const result = await runSternsystemValidate(makeInput({}), makeContext(workspaceRoot));
  expect(result.data!.violations).toHaveLength(0);
});

test("validate passes with 3 mirrors (cache + bare + external)", async () => {
  await writeRegistry(
    workspaceRoot,
    'schemaVersion: "1.0.0"\nsystems:\n  - id: test-site\n    cosmicStar: Vega\n    mirrors:\n      - path: "./systems/test-site"\n        storageType: non-bare\n      - path: "../systems-git/test-site"\n        storageType: bare\n      - path: "git@github.com:foo/test.git"\n        storageType: bare\n    pinnedPlatform: "4.5.0"\n    currentMission: null\n    lastRelease: null\n    status: registered\n    registeredAt: "2026-01-01T00:00:00Z"\n    notes: ""\n',
  );
  await mkdir(join(workspaceRoot, "systems", "test-site"), { recursive: true });

  const result = await runSternsystemValidate(makeInput({}), makeContext(workspaceRoot));
  const mirrorViolations = result.data!.violations.filter((v) => v.rule.startsWith("mirror"));
  expect(mirrorViolations).toHaveLength(0);
});

test("validate detects embedded credentials in external mirror URL", async () => {
  await writeRegistry(
    workspaceRoot,
    'schemaVersion: "1.0.0"\nsystems:\n  - id: test-site\n    cosmicStar: Vega\n    mirrors:\n      - path: "./systems/test-site"\n        storageType: non-bare\n      - path: "../systems-git/test-site"\n        storageType: bare\n      - path: "https://user:pass@github.com/foo/test.git"\n        storageType: bare\n    pinnedPlatform: "4.5.0"\n    currentMission: null\n    lastRelease: null\n    status: registered\n    registeredAt: "2026-01-01T00:00:00Z"\n    notes: ""\n',
  );
  await mkdir(join(workspaceRoot, "systems", "test-site"), { recursive: true });

  const result = await runSternsystemValidate(makeInput({}), makeContext(workspaceRoot));
  const credViolations = result.data!.violations.filter((v) => v.rule === "mirror-credentials");
  expect(credViolations).toHaveLength(1);
  expect(credViolations[0].message).toContain("credentials");
});

test("validate does not flag credentials when no external mirror exists", async () => {
  await writeRegistry(
    workspaceRoot,
    'schemaVersion: "1.0.0"\nsystems:\n  - id: test-site\n    cosmicStar: Vega\n    mirrors:\n      - path: "./systems/test-site"\n        storageType: non-bare\n      - path: "../systems-git/test-site"\n        storageType: bare\n    pinnedPlatform: "4.5.0"\n    currentMission: null\n    lastRelease: null\n    status: registered\n    registeredAt: "2026-01-01T00:00:00Z"\n    notes: ""\n',
  );
  await mkdir(join(workspaceRoot, "systems", "test-site"), { recursive: true });

  const result = await runSternsystemValidate(makeInput({}), makeContext(workspaceRoot));
  const credViolations = result.data!.violations.filter((v) => v.rule === "mirror-credentials");
  expect(credViolations).toHaveLength(0);
});

test("validate resolves cache dir from mirrors[0].path", async () => {
  await writeRegistry(
    workspaceRoot,
    'schemaVersion: "1.0.0"\nsystems:\n  - id: test-site\n    cosmicStar: Vega\n    mirrors:\n      - path: "../systems-cache/test-site"\n        storageType: non-bare\n    pinnedPlatform: "4.5.0"\n    currentMission: null\n    lastRelease: null\n    status: registered\n    registeredAt: "2026-01-01T00:00:00Z"\n    notes: ""\n',
  );
  // Create the cache dir at the resolved path (outside workspaceRoot)
  await mkdir(join(workspaceRoot, "..", "systems-cache", "test-site"), { recursive: true });

  const result = await runSternsystemValidate(makeInput({}), makeContext(workspaceRoot));
  const _cacheViolations = result.data!.violations.filter(
    (v) => v.rule === "bundle-contract" || v.rule === "cache-missing",
  );
  // Bundle contract check should find the cache dir at the resolved path
  expect(result.exitCode).toBe(0);

  // Cleanup
  await rm(join(workspaceRoot, "..", "systems-cache"), { recursive: true, force: true });
});

test("validate detects mirrors[0] with wrong storageType (bare instead of non-bare)", async () => {
  await writeRegistry(
    workspaceRoot,
    'schemaVersion: "1.0.0"\nsystems:\n  - id: test-site\n    cosmicStar: Vega\n    mirrors:\n      - path: "./systems/test-site"\n        storageType: bare\n    pinnedPlatform: "4.5.0"\n    currentMission: null\n    lastRelease: null\n    status: registered\n    registeredAt: "2026-01-01T00:00:00Z"\n    notes: ""\n',
  );
  await mkdir(join(workspaceRoot, "systems", "test-site"), { recursive: true });

  const result = await runSternsystemValidate(makeInput({}), makeContext(workspaceRoot));
  const cacheViolations = result.data!.violations.filter(
    (v) => v.rule === "cache-must-be-non-bare",
  );
  expect(cacheViolations).toHaveLength(1);
  expect(cacheViolations[0].message).toContain("non-bare");
});

test("validate detects bundle storageType with git-accessible protocol", async () => {
  await writeRegistry(
    workspaceRoot,
    'schemaVersion: "1.0.0"\nsystems:\n  - id: test-site\n    cosmicStar: Vega\n    mirrors:\n      - path: "./systems/test-site"\n        storageType: non-bare\n      - path: "../systems-git/test-site"\n        storageType: bare\n      - path: "git@github.com:foo/test.git"\n        storageType: bundle\n    pinnedPlatform: "4.5.0"\n    currentMission: null\n    lastRelease: null\n    status: registered\n    registeredAt: "2026-01-01T00:00:00Z"\n    notes: ""\n',
  );
  await mkdir(join(workspaceRoot, "systems", "test-site"), { recursive: true });

  const result = await runSternsystemValidate(makeInput({}), makeContext(workspaceRoot));
  const bundleViolations = result.data!.violations.filter(
    (v) => v.rule === "bundle-no-git-protocol",
  );
  expect(bundleViolations).toHaveLength(1);
  expect(bundleViolations[0].message).toContain("bundle");
  expect(bundleViolations[0].message).toContain("git");
});
