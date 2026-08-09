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

import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { byteHash } from "@warpgogol/fingerprint";
import { executeKernelCommand } from "@warpgogol/site-kernel";
import { parse as yamlParse } from "yaml";

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
  await mkdir(join(root, "tools"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture-root" }), "utf8");
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");

  // Reference the real package sources by absolute file:// URL rather than the
  // bare specifier "@warpgogol/site-kernel-checks" — the fixture root lives outside
  // the monorepo's node_modules resolution chain (a real OS temp directory), so
  // bare-specifier resolution from tools/kernel.config.mjs would fail there.
  const checksIndexPath = join(import.meta.dirname, "..", "index.ts").replace(/\\/g, "/");
  await writeFile(
    join(root, "tools", "kernel.config.mjs"),
    `import { createStandardCheckModule } from "file:///${checksIndexPath}";
export default {
  name: "fixture",
  modules: [createStandardCheckModule()],
};
`,
    "utf8",
  );
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
