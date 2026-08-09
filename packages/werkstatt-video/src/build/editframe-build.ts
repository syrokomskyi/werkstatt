/*
<MODULE_CONTRACT>
<purpose>Editframe build hook — renders the composition via Editframe CLI (RFC-0778).</purpose>
<keywords>build, editframe, render, video</keywords>
<responsibilities>
  <item>Shells out to `editframe render` via execFileSync — same pattern as game plugin's vite build.</item>
  <item>Outputs rendered video to dist/.</item>
  <item>After successful render, writes dist/.render-hash.json with sha256 of rendered output.</item>
  <item>This hash is the baseline for WV-03 determinism validation.</item>
</responsibilities>
<non-goals>
  <item>Does not manage deploy — that is the deploy adapter's job.</item>
  <item>Does not run checkGate — that is a separate hook.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0778: Editframe build hook — runs editframe render via child_process, writes render hash baseline.</item>
</CHANGE_SUMMARY>
*/

import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";

interface RenderHashManifest {
  hash: string;
  generatedAt: string;
}

export async function runEditframeBuild(ctx: PluginHookContext): Promise<HookResult> {
  const cwd = ctx.workpiecePath ?? ctx.workspaceRoot;
  ctx.logger.info(`editframe-build: running editframe render in ${cwd}`);

  try {
    const output = execFileSync("npx", ["editframe", "render"], {
      cwd,
      encoding: "utf-8",
      timeout: 300_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    ctx.logger.info("editframe-build: render completed", { output: output.slice(-200) });

    // Write render hash baseline for WV-03 determinism validation
    const distPath = join(cwd, "dist");
    const renderFiles = await listRenderFiles(distPath);
    if (renderFiles.length > 0) {
      const hash = await hashFiles(renderFiles);
      const manifest: RenderHashManifest = {
        hash,
        generatedAt: new Date().toISOString(),
      };
      await mkdir(distPath, { recursive: true });
      await writeFile(join(distPath, ".render-hash.json"), JSON.stringify(manifest, null, 2));
      ctx.logger.info(`editframe-build: render hash baseline written (${hash.slice(0, 12)})`);
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error("editframe-build: render failed", { error: message });
    return {
      success: false,
      errors: [`editframe render failed: ${message}`],
    };
  }
}

async function listRenderFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listRenderFiles(fullPath)));
    } else if (entry.isFile() && entry.name !== ".render-hash.json") {
      results.push(fullPath);
    }
  }
  return results;
}

async function hashFiles(files: string[]): Promise<string> {
  const hasher = createHash("sha256");
  for (const filePath of files.sort()) {
    const content = await readFile(filePath);
    hasher.update(content);
  }
  return hasher.digest("hex");
}
