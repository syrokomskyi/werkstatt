/*
<MODULE_CONTRACT>
<purpose>Video release evidence hook — generates render hash, composition hash, asset manifest hash (RFC-0778).</purpose>
<keywords>release, evidence, video, editframe, hash</keywords>
<responsibilities>
  <item>Computes SHA-256 hash of the dist/ render output (all video files concatenated).</item>
  <item>Computes SHA-256 hash of the composition source (src/composition.tsx).</item>
  <item>Computes SHA-256 hash of the asset manifest (src/assets/manifest.yaml).</item>
  <item>Returns evidence object with all three hashes and render size.</item>
</responsibilities>
<non-goals>
  <item>Does not verify hashes — that is the integrity module's job.</item>
  <item>Does not modify files — read-only hook.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0778: release evidence hook — render hash, composition hash, asset manifest hash.</item>
</CHANGE_SUMMARY>
*/

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";

export interface VideoReleaseEvidence {
  renderHash: string;
  compositionHash: string;
  assetManifestHash: string;
  renderBytes: number;
  generatedAt: string;
}

export async function generateVideoEvidence(ctx: PluginHookContext): Promise<HookResult> {
  const projectRoot = ctx.workpiecePath ?? ctx.workspaceRoot;

  const renderHash = await hashDirectory(join(projectRoot, "dist"));
  const compositionHash = await hashFile(join(projectRoot, "src", "composition.tsx"));
  const assetManifestHash = await hashFile(join(projectRoot, "src", "assets", "manifest.yaml"));
  const renderBytes = await measureDirSize(join(projectRoot, "dist"));

  const evidence: VideoReleaseEvidence = {
    renderHash,
    compositionHash,
    assetManifestHash,
    renderBytes,
    generatedAt: new Date().toISOString(),
  };

  ctx.logger.info("release-evidence: generated", evidence);

  return {
    success: true,
    data: evidence,
  };
}

async function hashFile(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath);
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return "0000000000000000000000000000000000000000000000000000000000000000";
  }
}

async function hashDirectory(dirPath: string): Promise<string> {
  const files = await listFiles(dirPath);
  if (files.length === 0) {
    return "0000000000000000000000000000000000000000000000000000000000000000";
  }
  const hasher = createHash("sha256");
  for (const filePath of files.sort()) {
    const content = await readFile(filePath);
    hasher.update(content);
  }
  return hasher.digest("hex");
}

async function measureDirSize(dirPath: string): Promise<number> {
  const files = await listFiles(dirPath);
  let total = 0;
  for (const filePath of files) {
    try {
      const content = await readFile(filePath);
      total += content.length;
    } catch {
      // Skip
    }
  }
  return total;
}

async function listFiles(dir: string): Promise<string[]> {
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
      results.push(...(await listFiles(fullPath)));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}
