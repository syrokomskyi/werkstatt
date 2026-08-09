import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDeploymentAdapter } from "../public-surface/managed-public.ts";
import type { KernelRuntimeContext } from "@warpgogol/site-kernel";

/*
<MODULE_CONTRACT>
<purpose>
  Verify RFC-0589: resolveDeploymentAdapter correctly loads systems/registry.yaml
  and returns the deployment adapter type for a given app id.
</purpose>
<responsibilities>
  <item>Assert cloudflare-workers adapter is returned for a matching system id.</item>
  <item>Assert null is returned when the system id is not found.</item>
  <item>Assert null is returned when the registry file is missing.</item>
  <item>Assert null is returned when the registry file is malformed.</item>
</responsibilities>
<non-goals>
  <item>Do not test the full runRedirectMapValidate — it requires a full kernel context with sitemap, public dir, etc.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="resolveDeploymentAdapter">Adapter type resolver from systems/registry.yaml (RFC-0589).</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0589: initial test suite for deployment adapter resolution from registry.yaml.</item>
</CHANGE_SUMMARY>
*/

async function makeContext(root: string): Promise<KernelRuntimeContext> {
  return {
    workspaceRoot: root,
    io: {
      readFile: async (p: string) => {
        const { readFile: fsReadFile } = await import("node:fs/promises");
        return fsReadFile(p, "utf8");
      },
      glob: async () => [],
      exists: async (p: string) => {
        const { access } = await import("node:fs/promises");
        try {
          await access(p);
          return true;
        } catch {
          return false;
        }
      },
    },
    dryRun: false,
    site: undefined,
  } as unknown as KernelRuntimeContext;
}

describe("resolveDeploymentAdapter (RFC-0589)", () => {
  it("returns cloudflare-workers for a matching system id", async () => {
    const root = await mkdtemp(join(tmpdir(), "redir-test-"));
    try {
      const systemsDir = join(root, "systems");
      await import("node:fs/promises").then((fs) => fs.mkdir(systemsDir, { recursive: true }));
      await writeFile(
        join(systemsDir, "registry.yaml"),
        "schemaVersion: 1.0.0\nsystems:\n  - id: warpgogol-com\n    deployment:\n      adapter: cloudflare-workers\n",
      );
      const ctx = await makeContext(root);
      const adapter = await resolveDeploymentAdapter(ctx, "warpgogol-com");
      expect(adapter).toBe("cloudflare-workers");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns null when system id is not found", async () => {
    const root = await mkdtemp(join(tmpdir(), "redir-test-"));
    try {
      const systemsDir = join(root, "systems");
      await import("node:fs/promises").then((fs) => fs.mkdir(systemsDir, { recursive: true }));
      await writeFile(
        join(systemsDir, "registry.yaml"),
        "schemaVersion: 1.0.0\nsystems:\n  - id: other-site\n    deployment:\n      adapter: null\n",
      );
      const ctx = await makeContext(root);
      const adapter = await resolveDeploymentAdapter(ctx, "warpgogol-com");
      expect(adapter).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns null when registry file is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "redir-test-"));
    try {
      const ctx = await makeContext(root);
      const adapter = await resolveDeploymentAdapter(ctx, "warpgogol-com");
      expect(adapter).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns null when registry file is malformed", async () => {
    const root = await mkdtemp(join(tmpdir(), "redir-test-"));
    try {
      const systemsDir = join(root, "systems");
      await import("node:fs/promises").then((fs) => fs.mkdir(systemsDir, { recursive: true }));
      await writeFile(join(systemsDir, "registry.yaml"), "this: is: not: valid: yaml: [");
      const ctx = await makeContext(root);
      const adapter = await resolveDeploymentAdapter(ctx, "warpgogol-com");
      expect(adapter).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
