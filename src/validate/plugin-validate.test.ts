/*
<MODULE_CONTRACT>
<purpose>Unit tests for werkstatt.plugin.validate (RFC-0770). Covers PLUGIN-01..05
failure modes, warn-only transition behavior, and the pass case.</purpose>
<non-goals>
  <item>Does not test the kernel module registration — that is integration-level.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0770: initial unit tests for PLUGIN-01..05 and warn-only transition.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stringify as stringifyYaml } from "yaml";

const mockTsImport = vi.fn();

vi.mock("tsx/esm/api", () => ({
  tsImport: (...args: unknown[]) => mockTsImport(...args),
}));

// Import after mock is set up
const { validatePlugin } = await import("./plugin-validate.ts");

const noopLogger = {
  info() {},
  warn() {},
  error() {},
};

function createTempWorkspace(): string {
  const testRoot = mkdtempSync(join(tmpdir(), "werkstatt-plugin-test-"));
  const dir = join(testRoot, "workspace");
  mkdirSync(join(dir, "tools"), { recursive: true });
  mkdirSync(join(dir, "systems"), { recursive: true });
  return dir;
}

function writeForgeYaml(workspaceRoot: string, profile?: string): void {
  const content = profile
    ? `schema: forge/config@1\nproject:\n  name: test\n  stack:\n    - typescript\nprofile: ${profile}\n`
    : `schema: forge/config@1\nproject:\n  name: test\n  stack:\n    - typescript\n`;
  writeFileSync(join(workspaceRoot, "forge.yaml"), content, "utf8");
}

function writeRegistryYaml(workspaceRoot: string, adapters: string[]): void {
  if (adapters.length === 0) {
    // No systems — ensure systems-cache dir doesn't exist or is empty
    return;
  }
  const cacheDir = join(workspaceRoot, "..", "systems-cache", "test-system");
  mkdirSync(cacheDir, { recursive: true });
  const channels = {
    dev: { workerName: "test-dev", url: "https://dev.example.com" },
    alt: { workerName: "test-alt", url: "https://alt.example.com" },
    main: { workerName: "test-main", url: "https://main.example.com" },
  };
  const config = {
    schemaVersion: "system-config/v1",
    id: "test-system",
    cosmicStar: "Vega",
    mirrors: [{ path: "./test-system", storageType: "non-bare" }],
    pinnedPlatform: "4.5.0",
    status: "active",
    registeredAt: "2026-01-01T00:00:00Z",
    notes: "",
    deployment: { adapter: adapters[0], channels },
  };
  writeFileSync(join(cacheDir, "system-config.yaml"), stringifyYaml(config) + "\n", "utf8");
}

function makePlugin(
  pluginId: string,
  profileId: string,
  deployAdapters?: string[],
  moduleLoaders?: Record<string, () => Promise<unknown>>,
) {
  return {
    name: "test-plugin",
    version: "0.1.0",
    register() {},
    schema: "werkstatt/plugin@1",
    id: pluginId,
    profileId,
    moduleLoaders: moduleLoaders ?? {},
    deployAdapters: deployAdapters
      ? Object.fromEntries(deployAdapters.map((a) => [a, {}]))
      : undefined,
    paths: { contentDir: "src/content", distDir: "dist", entryPoints: [] },
  };
}

function setKernelConfig(
  workspaceRoot: string,
  moduleLoaders: Record<string, () => Promise<unknown>>,
): void {
  mockTsImport.mockResolvedValue({
    default: {
      name: "test-workspace",
      description: "Test workspace",
      moduleLoaders,
    },
  });
}

describe("werkstatt.plugin.validate", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = createTempWorkspace();
    mockTsImport.mockReset();
  });

  afterEach(() => {
    // Remove the testRoot (parent of workspaceRoot) which contains systems-cache
    rmSync(join(workspaceRoot, ".."), { recursive: true, force: true });
  });

  it("PLUGIN-05: tools/kernel.config.ts missing → error, exit 1", async () => {
    mockTsImport.mockRejectedValue(new Error("ENOENT: file not found"));
    writeForgeYaml(workspaceRoot);
    writeRegistryYaml(workspaceRoot, []);

    const result = await validatePlugin(workspaceRoot, noopLogger);

    expect(result.exitCode).toBe(1);
    expect(result.data.status).toBe("fail");
    expect(result.data.violations).toHaveLength(1);
    expect(result.data.violations[0]!.ruleId).toBe("PLUGIN-05");
    expect(result.data.violations[0]!.severity).toBe("error");
  });

  it("PLUGIN-01 (warn-only): no plugin, no forge.yaml profile → warning, exit 0", async () => {
    setKernelConfig(workspaceRoot, {});
    writeForgeYaml(workspaceRoot); // no profile field
    writeRegistryYaml(workspaceRoot, []);

    const result = await validatePlugin(workspaceRoot, noopLogger);

    expect(result.exitCode).toBe(0);
    expect(result.data.status).toBe("warn");
    expect(result.data.violations).toHaveLength(1);
    expect(result.data.violations[0]!.ruleId).toBe("PLUGIN-01");
    expect(result.data.violations[0]!.severity).toBe("warning");
  });

  it("PLUGIN-01 (enforce): no plugin, forge.yaml has profile → error, exit 1", async () => {
    setKernelConfig(workspaceRoot, {});
    writeForgeYaml(workspaceRoot, "astro-typescript-turborepo");
    writeRegistryYaml(workspaceRoot, []);

    const result = await validatePlugin(workspaceRoot, noopLogger);

    expect(result.exitCode).toBe(1);
    expect(result.data.status).toBe("fail");
    expect(result.data.violations).toHaveLength(1);
    expect(result.data.violations[0]!.ruleId).toBe("PLUGIN-01");
    expect(result.data.violations[0]!.severity).toBe("error");
  });

  it("PLUGIN-01 (multiple): two plugins → error, exit 1", async () => {
    setKernelConfig(workspaceRoot, {
      "plugin-a": async () => makePlugin("werkstatt-site", "astro-typescript-turborepo"),
      "plugin-b": async () => makePlugin("werkstatt-game", "phaser-turborepo"),
    });
    writeForgeYaml(workspaceRoot, "astro-typescript-turborepo");
    writeRegistryYaml(workspaceRoot, []);

    const result = await validatePlugin(workspaceRoot, noopLogger);

    expect(result.exitCode).toBe(1);
    expect(result.data.status).toBe("fail");
    const plugin01 = result.data.violations.filter((v) => v.ruleId === "PLUGIN-01");
    expect(plugin01).toHaveLength(1);
    expect(plugin01[0]!.severity).toBe("error");
    expect(plugin01[0]!.message).toContain("Multiple");
  });

  it("PLUGIN-02: plugin profileId ≠ forge.yaml profile → error, exit 1", async () => {
    setKernelConfig(workspaceRoot, {
      plugin: async () => makePlugin("werkstatt-site", "astro-typescript-turborepo"),
    });
    writeForgeYaml(workspaceRoot, "phaser-turborepo"); // mismatch
    writeRegistryYaml(workspaceRoot, []);

    const result = await validatePlugin(workspaceRoot, noopLogger);

    expect(result.exitCode).toBe(1);
    expect(result.data.status).toBe("fail");
    const plugin02 = result.data.violations.filter((v) => v.ruleId === "PLUGIN-02");
    expect(plugin02).toHaveLength(1);
    expect(plugin02[0]!.severity).toBe("error");
    expect(plugin02[0]!.message).toContain("profileId");
  });

  it("PLUGIN-03: plugin moduleLoader throws → error, exit 1", async () => {
    setKernelConfig(workspaceRoot, {
      "test-plugin": async () =>
        makePlugin("werkstatt-site", "astro-typescript-turborepo", undefined, {
          "failing-loader": async () => {
            throw new Error("import failed");
          },
        }),
    });
    writeForgeYaml(workspaceRoot, "astro-typescript-turborepo");
    writeRegistryYaml(workspaceRoot, []);

    const result = await validatePlugin(workspaceRoot, noopLogger);

    expect(result.exitCode).toBe(1);
    expect(result.data.status).toBe("fail");
    const plugin03 = result.data.violations.filter((v) => v.ruleId === "PLUGIN-03");
    expect(plugin03).toHaveLength(1);
    expect(plugin03[0]!.severity).toBe("error");
    expect(plugin03[0]!.message).toContain("failing-loader");
  });

  it("PLUGIN-04: registry references adapter not provided by plugin → error, exit 1", async () => {
    setKernelConfig(workspaceRoot, {
      plugin: async () =>
        makePlugin("werkstatt-site", "astro-typescript-turborepo", ["cloudflare-workers"]),
    });
    writeForgeYaml(workspaceRoot, "astro-typescript-turborepo");
    writeRegistryYaml(workspaceRoot, ["netlify"]); // not in plugin

    const result = await validatePlugin(workspaceRoot, noopLogger);

    expect(result.exitCode).toBe(1);
    expect(result.data.status).toBe("fail");
    const plugin04 = result.data.violations.filter((v) => v.ruleId === "PLUGIN-04");
    expect(plugin04).toHaveLength(1);
    expect(plugin04[0]!.severity).toBe("error");
    expect(plugin04[0]!.message).toContain("netlify");
  });

  it("Pass case: one plugin, matching profileId, all loaders resolve, adapters present → exit 0", async () => {
    setKernelConfig(workspaceRoot, {
      plugin: async () =>
        makePlugin("werkstatt-site", "astro-typescript-turborepo", ["cloudflare-workers"]),
    });
    writeForgeYaml(workspaceRoot, "astro-typescript-turborepo");
    writeRegistryYaml(workspaceRoot, ["cloudflare-workers"]);

    const result = await validatePlugin(workspaceRoot, noopLogger);

    expect(result.exitCode).toBe(0);
    expect(result.data.status).toBe("pass");
    expect(result.data.violations).toHaveLength(0);
    expect(result.data.plugin).toEqual({
      id: "werkstatt-site",
      profileId: "astro-typescript-turborepo",
    });
  });

  it("Pass case: one plugin, no forge.yaml profile field (transition) → pass, exit 0", async () => {
    setKernelConfig(workspaceRoot, {
      plugin: async () =>
        makePlugin("werkstatt-site", "astro-typescript-turborepo", ["cloudflare-workers"]),
    });
    writeForgeYaml(workspaceRoot); // no profile
    writeRegistryYaml(workspaceRoot, ["cloudflare-workers"]);

    const result = await validatePlugin(workspaceRoot, noopLogger);

    expect(result.exitCode).toBe(0);
    expect(result.data.status).toBe("pass");
    expect(result.data.violations).toHaveLength(0);
  });
});
