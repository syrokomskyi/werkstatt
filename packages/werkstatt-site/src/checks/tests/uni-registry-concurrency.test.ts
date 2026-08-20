/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0258 concurrency proof: two parallel executeKernelCommand("uni.registry.build")
    invocations against a fixture workspace must both exit 0, and the resulting
    uni.registry.yaml must parse and match the expected deterministic content
    (excluding the generatedAt timestamp, which legitimately differs per run).
  </purpose>
  <responsibilities>
    <item>Build a minimal fixture workspace whose tools/kernel.config.mjs registers
    the real createStandardCheckModule() (so uni.registry.build runs the actual
    writeFileAtomic-backed writer, not a stub).</item>
    <item>Run two builds concurrently and assert both succeed and the final file
    is well-formed JSON with the expected (empty-registry) shape.</item>
  </responsibilities>
  <non-goals>
    <item>Do not exercise multi-app manifest scanning — an empty apps/ tree keeps
    the expected output deterministic and the test fast.</item>
  </non-goals>
</MODULE_CONTRACT>
*/

import { describe, it, expect, vi } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { byteHash } from "@warpgogol/werkstatt/fingerprint";
import { parse as yamlParse } from "yaml";
import { createStandardCheckModule } from "../module.ts";

// tsx's register hook conflicts with vitest's module system when tsImport is
// called inside vitest. Mock loadWorkspaceConfig to bypass tsImport and
// directly construct the config object using the already-imported module.
vi.mock("@warpgogol/werkstatt/kernel/discovery", async (importOriginal) => {
  const original = await importOriginal<typeof import("@warpgogol/werkstatt/kernel/discovery")>();
  return {
    ...original,
    loadWorkspaceConfig: async (workspaceRoot: string) => ({
      name: "fixture",
      modules: [createStandardCheckModule()],
    }),
  };
});

// Import after mock is set up
const { executeKernelCommand } = await import("@warpgogol/werkstatt/kernel");

interface UniRegistrySnapshot {
  schemaVersion: string;
  totalCount: number;
  entries: unknown[];
}

function digestHex(registry: UniRegistrySnapshot): string {
  return byteHash(JSON.stringify(registry)).slice(("sha" + "256:").length);
}

async function makeFixtureWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "uni-reg-concurrency-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture-root" }), "utf8");
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
  return root;
}

describe("uni.registry.build concurrency (RFC-0258)", () => {
  it("two parallel invocations both exit 0 and converge to identical content", async () => {
    const root = await makeFixtureWorkspace();
    try {
      const [report1, report2] = await Promise.all([
        executeKernelCommand({
          workspaceRoot: root,
          commandName: "uni.registry.build",
          outputFormat: "json",
          argv: [],
        }),
        executeKernelCommand({
          workspaceRoot: root,
          commandName: "uni.registry.build",
          outputFormat: "json",
          argv: [],
        }),
      ]);

      const reports = [report1, report2].flat();
      for (const report of reports) {
        expect(report.exitCode, JSON.stringify(report)).toBe(0);
      }

      const raw = await readFile(join(root, "uni.registry.yaml"), "utf8");
      const parsed = yamlParse(raw) as UniRegistrySnapshot & { generatedAt: string | null };

      expect(parsed.schemaVersion).toBe("1.0.0");
      expect(parsed.totalCount).toBe(0);
      expect(parsed.entries).toEqual([]);
      expect(parsed.generatedAt).toBeNull();

      // Content hash excludes generatedAt (the only field allowed to differ
      // between the two racing writers) — this proves convergent, non-torn output.
      const { generatedAt: _generatedAt, ...withoutTimestamp } = parsed;
      const expected: UniRegistrySnapshot = {
        schemaVersion: "1.0.0",
        totalCount: 0,
        entries: [],
      };
      expect(digestHex(withoutTimestamp)).toBe(digestHex(expected));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 120000);
});
