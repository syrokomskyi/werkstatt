/*
<MODULE_CONTRACT>
<purpose>RFC-0354: tests for sternsystem.register, .list, .validate, .pin commands.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0354: initial sternsystem command tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { runSternsystemRegister } from "../sternsystem/sternsystem-register.ts";
import { runSternsystemList } from "../sternsystem/sternsystem-list.ts";
import { runSternsystemValidate } from "../sternsystem/sternsystem-validate.ts";
import { runSternsystemPin } from "../sternsystem/sternsystem-pin.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

let workspaceRoot: string;

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

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), "sternsystem-test-"));
  await mkdir(join(workspaceRoot, "systems"), { recursive: true });
  await writeFile(
    join(workspaceRoot, "systems", "registry.yaml"),
    'schemaVersion: "1.0.0"\nsystems: []\n',
    "utf8",
  );
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
  // Minimal packages/ dir so resolvePlatformSemanticHash can fingerprint it
  await mkdir(join(workspaceRoot, "packages", "dummy"), { recursive: true });
  await writeFile(
    join(workspaceRoot, "packages", "dummy", "index.ts"),
    "export const x = 1;\n",
    "utf8",
  );
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

test("register fails on duplicate id", async () => {
  // Pre-create a registry entry to simulate an existing Sternsystem
  const registryPath = join(workspaceRoot, "systems", "registry.yaml");
  await writeFile(
    registryPath,
    'schemaVersion: "1.0.0"\nsystems:\n  - id: test-site\n    cosmicStar: Vega\n    repo: "git@github.com:foo/test.git"\n    pinnedPlatform: "4.5.0"\n    currentMission: null\n    lastRelease: null\n    status: registered\n    registeredAt: "2026-01-01T00:00:00Z"\n    notes: ""\n',
    "utf8",
  );
  await expect(
    runSternsystemRegister(
      makeInput({ id: "test-site", cosmicStar: "Sirius", repo: "git@github.com:foo/test2.git" }),
      makeContext(workspaceRoot),
    ),
  ).rejects.toThrow(/already exists/);
});

test("register fails on invalid cosmicStar", async () => {
  await expect(
    runSternsystemRegister(
      makeInput({ id: "test-site", cosmicStar: "NotAStar", repo: "git@github.com:foo/test.git" }),
      makeContext(workspaceRoot),
    ),
  ).rejects.toThrow(/not in StarCatalog/);
});

test("register fails on apps/ collision", async () => {
  await mkdir(join(workspaceRoot, "apps", "test-site"), { recursive: true });
  await expect(
    runSternsystemRegister(
      makeInput({ id: "test-site", cosmicStar: "Vega", repo: "git@github.com:foo/test.git" }),
      makeContext(workspaceRoot),
    ),
  ).rejects.toThrow(/extract first/);
});

test("validate passes for a system with a local path repo", async () => {
  // Create a registry entry directly for validate testing
  const registryPath = join(workspaceRoot, "systems", "registry.yaml");
  await writeFile(
    registryPath,
    'schemaVersion: "1.0.0"\nsystems:\n  - id: test-site\n    cosmicStar: Vega\n    repo: "../systems-git/test-site"\n    pinnedPlatform: "4.5.0"\n    currentMission: null\n    lastRelease: null\n    status: registered\n    registeredAt: "2026-01-01T00:00:00Z"\n    notes: ""\n',
    "utf8",
  );
  await mkdir(join(workspaceRoot, "systems", "test-site"), { recursive: true });

  const result = await runSternsystemValidate(makeInput({}), makeContext(workspaceRoot));
  expect(result.data!.violations).toHaveLength(0);
});

test("list returns all registered systems", async () => {
  // Create registry entries directly for list testing
  const registryPath = join(workspaceRoot, "systems", "registry.yaml");
  await writeFile(
    registryPath,
    'schemaVersion: "1.0.0"\nsystems:\n  - id: site-a\n    cosmicStar: Vega\n    repo: "git@github.com:foo/a.git"\n    pinnedPlatform: "4.5.0"\n    currentMission: null\n    lastRelease: null\n    status: registered\n    registeredAt: "2026-01-01T00:00:00Z"\n    notes: ""\n  - id: site-b\n    cosmicStar: Sirius\n    repo: "git@github.com:foo/b.git"\n    pinnedPlatform: "4.5.0"\n    currentMission: null\n    lastRelease: null\n    status: registered\n    registeredAt: "2026-01-01T00:00:00Z"\n    notes: ""\n',
    "utf8",
  );

  const result = await runSternsystemList(makeInput({}), makeContext(workspaceRoot));
  expect(result.data!.count).toBe(2);
  expect(result.data!.systems.map((s) => s.id)).toEqual(["site-a", "site-b"]);
});

test("validate passes on a clean registry", async () => {
  // Create a registry entry directly for validate testing
  const registryPath = join(workspaceRoot, "systems", "registry.yaml");
  await writeFile(
    registryPath,
    'schemaVersion: "1.0.0"\nsystems:\n  - id: test-site\n    cosmicStar: Vega\n    repo: "git@github.com:foo/test.git"\n    pinnedPlatform: "4.5.0"\n    currentMission: null\n    lastRelease: null\n    status: registered\n    registeredAt: "2026-01-01T00:00:00Z"\n    notes: ""\n',
    "utf8",
  );
  await mkdir(join(workspaceRoot, "systems", "test-site"), { recursive: true });

  const result = await runSternsystemValidate(makeInput({}), makeContext(workspaceRoot));
  expect(result.data!.validated).toBe(1);
  expect(result.data!.violations).toHaveLength(0);
  expect(result.exitCode).toBe(0);
});

test("validate detects apps/ collision", async () => {
  // Create a registry entry directly for validate testing
  const registryPath = join(workspaceRoot, "systems", "registry.yaml");
  await writeFile(
    registryPath,
    'schemaVersion: "1.0.0"\nsystems:\n  - id: test-site\n    cosmicStar: Vega\n    repo: "git@github.com:foo/test.git"\n    pinnedPlatform: "4.5.0"\n    currentMission: null\n    lastRelease: null\n    status: registered\n    registeredAt: "2026-01-01T00:00:00Z"\n    notes: ""\n',
    "utf8",
  );
  await mkdir(join(workspaceRoot, "systems", "test-site"), { recursive: true });
  await mkdir(join(workspaceRoot, "apps", "test-site"), { recursive: true });

  const result = await runSternsystemValidate(makeInput({}), makeContext(workspaceRoot));
  expect(result.data!.violations).toHaveLength(1);
  expect(result.data!.violations[0].rule).toBe("apps-collision");
  expect(result.exitCode).toBe(1);
});

test("pin writes system.pin.json and activates the system", async () => {
  // Create a registry entry directly for pin testing
  const registryPath = join(workspaceRoot, "systems", "registry.yaml");
  await writeFile(
    registryPath,
    'schemaVersion: "1.0.0"\nsystems:\n  - id: test-site\n    cosmicStar: Vega\n    repo: "git@github.com:foo/test.git"\n    pinnedPlatform: "4.5.0"\n    currentMission: null\n    lastRelease: null\n    status: registered\n    registeredAt: "2026-01-01T00:00:00Z"\n    notes: ""\n',
    "utf8",
  );
  await mkdir(join(workspaceRoot, "systems", "test-site"), { recursive: true });

  const result = await runSternsystemPin(
    makeInput({ id: "test-site", platform: "4.5.0" }),
    makeContext(workspaceRoot),
  );
  expect(result.data!.systemId).toBe("test-site");
  expect(result.data!.platform).toBe("4.5.0");

  const pinPath = join(workspaceRoot, "systems", "test-site", "system.pin.json");
  expect(existsSync(pinPath)).toBe(true);

  const pin = JSON.parse(await readFile(pinPath, "utf8"));
  expect(pin.systemId).toBe("test-site");
  expect(pin.cosmicStar).toBe("Vega");
  expect(pin.platform.version).toBe("4.5.0");
  expect(pin.platform.platformSemanticHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(pin.migratorCursor).toEqual([
    "rfc-0479",
    "rfc-0481",
    "rfc-0483",
    "rfc-0488",
    "rfc-0492",
    "rfc-0495",
    "rfc-0496",
    "rfc-0497",
    "rfc-0498",
    "rfc-0500",
    "rfc-0501",
    "rfc-0502",
    "rfc-0504",
    "rfc-0505",
    "rfc-0506",
    "rfc-0508",
    "rfc-0512",
    "rfc-0514",
    "rfc-0529",
    "rfc-0548",
  ]);

  // Registry should have been updated to active
  const raw = await readFile(join(workspaceRoot, "systems", "registry.yaml"), "utf8");
  const parsed = parseYaml(raw);
  expect(parsed.systems[0].status).toBe("active");
});

test("pin refuses downgrade", async () => {
  // Create a registry entry directly for pin testing
  const registryPath = join(workspaceRoot, "systems", "registry.yaml");
  await writeFile(
    registryPath,
    'schemaVersion: "1.0.0"\nsystems:\n  - id: test-site\n    cosmicStar: Vega\n    repo: "git@github.com:foo/test.git"\n    pinnedPlatform: "4.5.0"\n    currentMission: null\n    lastRelease: null\n    status: registered\n    registeredAt: "2026-01-01T00:00:00Z"\n    notes: ""\n',
    "utf8",
  );
  const cacheDir = join(workspaceRoot, "systems", "test-site");
  await mkdir(cacheDir, { recursive: true });

  // Write an initial pin at 4.5.0
  await runSternsystemPin(
    makeInput({ id: "test-site", platform: "4.5.0" }),
    makeContext(workspaceRoot),
  );

  // Attempt to pin to an older version
  await expect(
    runSternsystemPin(
      makeInput({ id: "test-site", platform: "4.4.0" }),
      makeContext(workspaceRoot),
    ),
  ).rejects.toThrow(/never downgraded/);
});
