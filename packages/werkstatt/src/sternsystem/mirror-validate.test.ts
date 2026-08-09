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
import { stringify as stringifyYaml } from "yaml";
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

interface MirrorEntry {
  path: string;
  storageType: "non-bare" | "bare" | "bundle";
}

async function writeSystemConfig(root: string, mirrors: MirrorEntry[]): Promise<void> {
  const cacheDir = join(root, "..", "systems-cache", "test-site");
  await mkdir(cacheDir, { recursive: true });
  const config = {
    schemaVersion: "system-config/v1",
    id: "test-site",
    cosmicStar: "Vega",
    mirrors,
    pinnedPlatform: "4.5.0",
    status: "active",
    registeredAt: "2026-01-01T00:00:00Z",
    notes: "",
  };
  await writeFile(join(cacheDir, "system-config.yaml"), stringifyYaml(config) + "\n", "utf8");
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
  await writeSystemConfig(workspaceRoot, [
    { path: "./systems/test-site", storageType: "non-bare" },
  ]);
  await mkdir(join(workspaceRoot, "systems", "test-site"), { recursive: true });

  const result = await runSternsystemValidate(makeInput({}), makeContext(workspaceRoot));
  expect(result.data!.violations).toHaveLength(0);
});

test("validate passes with 3 mirrors (cache + bare + external)", async () => {
  await writeSystemConfig(workspaceRoot, [
    { path: "./systems/test-site", storageType: "non-bare" },
    { path: "../systems-git/test-site", storageType: "bare" },
    { path: "git@github.com:foo/test.git", storageType: "bare" },
  ]);
  await mkdir(join(workspaceRoot, "systems", "test-site"), { recursive: true });

  const result = await runSternsystemValidate(makeInput({}), makeContext(workspaceRoot));
  const mirrorViolations = result.data!.violations.filter((v) => v.rule.startsWith("mirror"));
  expect(mirrorViolations).toHaveLength(0);
});

test("validate detects embedded credentials in external mirror URL", async () => {
  await writeSystemConfig(workspaceRoot, [
    { path: "./systems/test-site", storageType: "non-bare" },
    { path: "../systems-git/test-site", storageType: "bare" },
    { path: "https://user:pass@github.com/foo/test.git", storageType: "bare" },
  ]);
  await mkdir(join(workspaceRoot, "systems", "test-site"), { recursive: true });

  const result = await runSternsystemValidate(makeInput({}), makeContext(workspaceRoot));
  const credViolations = result.data!.violations.filter((v) => v.rule === "mirror-credentials");
  expect(credViolations).toHaveLength(1);
  expect(credViolations[0].message).toContain("credentials");
});

test("validate does not flag credentials when no external mirror exists", async () => {
  await writeSystemConfig(workspaceRoot, [
    { path: "./systems/test-site", storageType: "non-bare" },
    { path: "../systems-git/test-site", storageType: "bare" },
  ]);
  await mkdir(join(workspaceRoot, "systems", "test-site"), { recursive: true });

  const result = await runSternsystemValidate(makeInput({}), makeContext(workspaceRoot));
  const credViolations = result.data!.violations.filter((v) => v.rule === "mirror-credentials");
  expect(credViolations).toHaveLength(0);
});

test("validate resolves cache dir from mirrors[0].path", async () => {
  await writeSystemConfig(workspaceRoot, [
    { path: "../systems-cache/test-site", storageType: "non-bare" },
  ]);
  // Cache dir already created by writeSystemConfig

  const result = await runSternsystemValidate(makeInput({}), makeContext(workspaceRoot));
  const _cacheViolations = result.data!.violations.filter(
    (v) => v.rule === "bundle-contract" || v.rule === "cache-missing",
  );
  expect(result.exitCode).toBe(0);

  // Cleanup
  await rm(join(workspaceRoot, "..", "systems-cache"), { recursive: true, force: true });
});

test("validate detects mirrors[0] with wrong storageType (bare instead of non-bare)", async () => {
  await writeSystemConfig(workspaceRoot, [{ path: "./systems/test-site", storageType: "bare" }]);
  await mkdir(join(workspaceRoot, "systems", "test-site"), { recursive: true });

  const result = await runSternsystemValidate(makeInput({}), makeContext(workspaceRoot));
  const cacheViolations = result.data!.violations.filter(
    (v) => v.rule === "cache-must-be-non-bare",
  );
  expect(cacheViolations).toHaveLength(1);
  expect(cacheViolations[0].message).toContain("non-bare");
});

test("validate detects bundle storageType with git-accessible protocol", async () => {
  await writeSystemConfig(workspaceRoot, [
    { path: "./systems/test-site", storageType: "non-bare" },
    { path: "../systems-git/test-site", storageType: "bare" },
    { path: "git@github.com:foo/test.git", storageType: "bundle" },
  ]);
  await mkdir(join(workspaceRoot, "systems", "test-site"), { recursive: true });

  const result = await runSternsystemValidate(makeInput({}), makeContext(workspaceRoot));
  const bundleViolations = result.data!.violations.filter(
    (v) => v.rule === "bundle-no-git-protocol",
  );
  expect(bundleViolations).toHaveLength(1);
  expect(bundleViolations[0].message).toContain("bundle");
  expect(bundleViolations[0].message).toContain("git");
});
