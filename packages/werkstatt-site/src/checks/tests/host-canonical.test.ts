import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";
import { runHostCanonicalConfigValidate } from "../host-canonical.ts";

/*
<MODULE_CONTRACT>
<purpose>
  RFC-0908: Unit tests for host.canonical.config.validate — HOST-CANON-01..03
  rules covering apex canonical, www canonical, ambiguous host, and Worker
  source detection.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0908: initial test suite for host.canonical.config.validate.</item>
</CHANGE_SUMMARY>
*/

async function makeContext(root: string, siteName: string): Promise<KernelRuntimeContext> {
  return {
    workspaceRoot: root,
    io: {
      readFile: async (p: string) => {
        const { readFile: fsReadFile } = await import("node:fs/promises");
        return fsReadFile(p, "utf8");
      },
      glob: async (pattern: string, opts?: { cwd?: string }) => {
        const { glob: fsGlob } = await import("node:fs/promises");
        const cwd = opts?.cwd ?? root;
        const results: string[] = [];
        for await (const entry of fsGlob(pattern, { cwd })) {
          results.push(entry);
        }
        return results;
      },
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
    site: { name: siteName, directory: join(root, "app"), toolsDirectory: join(root, "app", "tools") },
  } as unknown as KernelRuntimeContext;
}

async function setupApp(root: string, files: Record<string, string>): Promise<void> {
  const appDir = join(root, "app");
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(appDir, relPath);
    await mkdir(join(fullPath, ".."), { recursive: true });
    await writeFile(fullPath, content);
  }
}

async function setupRegistry(root: string, adapter: string): Promise<void> {
  const systemsDir = join(root, "systems");
  await mkdir(systemsDir, { recursive: true });
  await writeFile(
    join(systemsDir, "registry.yaml"),
    `schemaVersion: 1.0.0\nsystems:\n  - id: warpgogol-com\n    deployment:\n      adapter: ${adapter}\n`,
  );
}

describe("host.canonical.config.validate (RFC-0908)", () => {
  it("HOST-CANON-01: apex canonical host, no www→apex redirect → error", async () => {
    const root = await mkdtemp(join(tmpdir(), "host-canon-01-"));
    try {
      await setupApp(root, {
        "astro.config.mjs": `export default { site: "https://warpgogol.com" };`,
      });
      await setupRegistry(root, "cloudflare-workers");
      const ctx = await makeContext(root, "warpgogol-com");
      const result = await runHostCanonicalConfigValidate({} as never, ctx);
      expect(result.exitCode).toBe(1);
      expect(result.data?.diagnostics).toHaveLength(1);
      expect(result.data?.diagnostics[0]?.ruleId).toBe("HOST-CANON-01");
      expect(result.data?.diagnostics[0]?.severity).toBe("error");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("HOST-CANON-01 pass: apex canonical host, www→apex redirect in wrangler routes", async () => {
    const root = await mkdtemp(join(tmpdir(), "host-canon-01-pass-"));
    try {
      await setupApp(root, {
        "astro.config.mjs": `export default { site: "https://warpgogol.com" };`,
        "wrangler.jsonc": JSON.stringify({
          routes: ["www.warpgogol.com/*"],
        }),
      });
      await setupRegistry(root, "cloudflare-workers");
      const ctx = await makeContext(root, "warpgogol-com");
      const result = await runHostCanonicalConfigValidate({} as never, ctx);
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("pass");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("HOST-CANON-02: www canonical host, no apex→www redirect → error", async () => {
    const root = await mkdtemp(join(tmpdir(), "host-canon-02-"));
    try {
      await setupApp(root, {
        "astro.config.mjs": `export default { site: "https://www.warpgogol.com" };`,
      });
      await setupRegistry(root, "cloudflare-workers");
      const ctx = await makeContext(root, "warpgogol-com");
      const result = await runHostCanonicalConfigValidate({} as never, ctx);
      expect(result.exitCode).toBe(1);
      expect(result.data?.diagnostics).toHaveLength(1);
      expect(result.data?.diagnostics[0]?.ruleId).toBe("HOST-CANON-02");
      expect(result.data?.diagnostics[0]?.severity).toBe("error");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("HOST-CANON-03: site URL missing → warning", async () => {
    const root = await mkdtemp(join(tmpdir(), "host-canon-03-missing-"));
    try {
      await setupApp(root, {
        "astro.config.mjs": `export default { };`,
      });
      await setupRegistry(root, "cloudflare-workers");
      const ctx = await makeContext(root, "warpgogol-com");
      const result = await runHostCanonicalConfigValidate({} as never, ctx);
      expect(result.data?.diagnostics).toHaveLength(1);
      expect(result.data?.diagnostics[0]?.ruleId).toBe("HOST-CANON-03");
      expect(result.data?.diagnostics[0]?.severity).toBe("warning");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("HOST-CANON-03: site URL is localhost → warning", async () => {
    const root = await mkdtemp(join(tmpdir(), "host-canon-03-localhost-"));
    try {
      await setupApp(root, {
        "astro.config.mjs": `export default { site: "http://localhost:4321" };`,
      });
      await setupRegistry(root, "cloudflare-workers");
      const ctx = await makeContext(root, "warpgogol-com");
      const result = await runHostCanonicalConfigValidate({} as never, ctx);
      expect(result.data?.diagnostics).toHaveLength(1);
      expect(result.data?.diagnostics[0]?.ruleId).toBe("HOST-CANON-03");
      expect(result.data?.diagnostics[0]?.severity).toBe("warning");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("no violations: Worker source with request.headers.get('host') → redirect detected", async () => {
    const root = await mkdtemp(join(tmpdir(), "host-canon-worker-"));
    try {
      await setupApp(root, {
        "astro.config.mjs": `export default { site: "https://warpgogol.com" };`,
        "src/middleware.ts": `
const host = request.headers.get("host");
if (host === "www.warpgogol.com") {
  return Response.redirect("https://warpgogol.com" + url.pathname, 301);
}
`,
      });
      await setupRegistry(root, "cloudflare-workers");
      const ctx = await makeContext(root, "warpgogol-com");
      const result = await runHostCanonicalConfigValidate({} as never, ctx);
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("pass");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("no violations: Worker source in src/middleware/ directory with host comparison", async () => {
    const root = await mkdtemp(join(tmpdir(), "host-canon-middleware-dir-"));
    try {
      await setupApp(root, {
        "astro.config.mjs": `export default { site: "https://warpgogol.com" };`,
        "src/middleware/host-redirect.ts": `
const url = new URL(request.url);
if (url.host !== "warpgogol.com") {
  return Response.redirect("https://warpgogol.com" + url.pathname, 301);
}
`,
      });
      await setupRegistry(root, "cloudflare-workers");
      const ctx = await makeContext(root, "warpgogol-com");
      const result = await runHostCanonicalConfigValidate({} as never, ctx);
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("pass");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("wrangler.toml routes: www route detected → pass", async () => {
    const root = await mkdtemp(join(tmpdir(), "host-canon-toml-"));
    try {
      await setupApp(root, {
        "astro.config.mjs": `export default { site: "https://warpgogol.com" };`,
        "wrangler.toml": `routes = ["www.warpgogol.com/*"]\n`,
      });
      await setupRegistry(root, "cloudflare-workers");
      const ctx = await makeContext(root, "warpgogol-com");
      const result = await runHostCanonicalConfigValidate({} as never, ctx);
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("pass");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
