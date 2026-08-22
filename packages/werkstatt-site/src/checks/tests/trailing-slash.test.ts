import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";
import { runTrailingSlashConfigValidate } from "../trailing-slash.ts";

/*
<MODULE_CONTRACT>
<purpose>
  RFC-0908: Unit tests for trailing.slash.config.validate — SLASH-01..03
  rules covering build.format consistency, normalization redirect presence,
  and edge cases.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0908: initial test suite for trailing.slash.config.validate.</item>
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
    site: {
      name: "warpgogol-com",
      directory: join(root, "app"),
      toolsDirectory: join(root, "app", "tools"),
    },
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

describe("trailing.slash.config.validate (RFC-0908)", () => {
  it("SLASH-01: build.format directory, no normalization redirects → error", async () => {
    const root = await mkdtemp(join(tmpdir(), "slash-01-"));
    try {
      await setupApp(root, {
        "astro.config.mjs": `export default { site: "https://warpgogol.com", build: { format: "directory" } };`,
        "public/_redirects": `/old /new 301\n`,
      });
      const ctx = await makeContext(root);
      const result = await runTrailingSlashConfigValidate({} as never, ctx);
      expect(result.exitCode).toBe(1);
      const diags = result.data?.diagnostics ?? [];
      expect(diags.some((d) => d.ruleId === "SLASH-01")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("SLASH-01 pass: normalization rules present in _redirects", async () => {
    const root = await mkdtemp(join(tmpdir(), "slash-01-pass-"));
    try {
      await setupApp(root, {
        "astro.config.mjs": `export default { site: "https://warpgogol.com", build: { format: "directory" } };`,
        "public/_redirects": `/leistungen /leistungen/ 308\n`,
      });
      const ctx = await makeContext(root);
      const result = await runTrailingSlashConfigValidate({} as never, ctx);
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("pass");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("SLASH-02: build.format file → error", async () => {
    const root = await mkdtemp(join(tmpdir(), "slash-02-"));
    try {
      await setupApp(root, {
        "astro.config.mjs": `export default { site: "https://warpgogol.com", build: { format: "file" } };`,
        "public/_redirects": `/leistungen /leistungen/ 308\n`,
      });
      const ctx = await makeContext(root);
      const result = await runTrailingSlashConfigValidate({} as never, ctx);
      expect(result.exitCode).toBe(1);
      const diags = result.data?.diagnostics ?? [];
      expect(diags.some((d) => d.ruleId === "SLASH-02")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("SLASH-02 pass: build.format directory → no SLASH-02 error", async () => {
    const root = await mkdtemp(join(tmpdir(), "slash-02-pass-"));
    try {
      await setupApp(root, {
        "astro.config.mjs": `export default { site: "https://warpgogol.com", build: { format: "directory" } };`,
        "public/_redirects": `/leistungen /leistungen/ 308\n`,
      });
      const ctx = await makeContext(root);
      const result = await runTrailingSlashConfigValidate({} as never, ctx);
      const diags = result.data?.diagnostics ?? [];
      expect(diags.some((d) => d.ruleId === "SLASH-02")).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("SLASH-03: build.format not set → warning about missing explicit declaration", async () => {
    const root = await mkdtemp(join(tmpdir(), "slash-default-format-"));
    try {
      await setupApp(root, {
        "astro.config.mjs": `export default { site: "https://warpgogol.com" };`,
        "public/_redirects": `/leistungen /leistungen/ 308\n`,
      });
      const ctx = await makeContext(root);
      const result = await runTrailingSlashConfigValidate({} as never, ctx);
      const diags = result.data?.diagnostics ?? [];
      expect(diags.some((d) => d.ruleId === "SLASH-02")).toBe(false);
      expect(diags.some((d) => d.ruleId === "SLASH-03")).toBe(true);
      expect(diags.find((d) => d.ruleId === "SLASH-03")?.severity).toBe("warning");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("_redirects missing → SLASH-01 error", async () => {
    const root = await mkdtemp(join(tmpdir(), "slash-no-redirects-"));
    try {
      await setupApp(root, {
        "astro.config.mjs": `export default { site: "https://warpgogol.com", build: { format: "directory" } };`,
      });
      const ctx = await makeContext(root);
      const result = await runTrailingSlashConfigValidate({} as never, ctx);
      expect(result.exitCode).toBe(1);
      const diags = result.data?.diagnostics ?? [];
      expect(diags.some((d) => d.ruleId === "SLASH-01")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("no violations → exitCode 0, pass status (with explicit build.format)", async () => {
    const root = await mkdtemp(join(tmpdir(), "slash-clean-"));
    try {
      await setupApp(root, {
        "astro.config.mjs": `export default { site: "https://warpgogol.com", build: { format: "directory" } };`,
        "public/_redirects": `/leistungen /leistungen/ 308\n/kontakt /kontakt/ 308\n`,
      });
      const ctx = await makeContext(root);
      const result = await runTrailingSlashConfigValidate({} as never, ctx);
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("pass");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("wildcard normalization rule detected", async () => {
    const root = await mkdtemp(join(tmpdir(), "slash-wildcard-"));
    try {
      await setupApp(root, {
        "astro.config.mjs": `export default { site: "https://warpgogol.com", build: { format: "directory" } };`,
        "public/_redirects": `/* /*/ 308\n`,
      });
      const ctx = await makeContext(root);
      const result = await runTrailingSlashConfigValidate({} as never, ctx);
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("pass");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
