/*
<MODULE_CONTRACT>
<purpose>Phaser release evidence hook — generates bundle hash, asset manifest hash, scene registry hash.</purpose>
<keywords>release, evidence, phaser, hash</keywords>
<responsibilities>
  <item>Computes SHA-256 hash of the dist/ bundle (all files concatenated).</item>
  <item>Computes SHA-256 hash of the asset manifest (src/assets/manifest.yaml).</item>
  <item>Computes SHA-256 hash of the scene registry (phaser.config.ts).</item>
  <item>Returns evidence object with all three hashes.</item>
</responsibilities>
<non-goals>
  <item>Does not verify hashes — that is the integrity module's job.</item>
  <item>Does not modify files — read-only hook.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial release evidence hook — bundle hash, asset manifest hash, scene registry hash.</item>
  <item>Migration from werkstatt-game: renamed from game to phaser.</item>
  <item>DNA-53: replace node:crypto createHash with byteHashFile/byteHash from @warpgogol/werkstatt/fingerprint.</item>
</CHANGE_SUMMARY>
*/

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { byteHash, byteHashFile } from "@warpgogol/werkstatt/fingerprint";
import type { Dirent } from "node:fs";
import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";

export interface PhaserReleaseEvidence {
  bundleHash: string;
  assetManifestHash: string;
  sceneRegistryHash: string;
  bundleBytes: number;
  generatedAt: string;
}

export async function generatePhaserEvidence(ctx: PluginHookContext): Promise<HookResult> {
  const projectRoot = ctx.workpiecePath ?? ctx.workspaceRoot;

  const bundleHash = await hashDirectory(join(projectRoot, "dist"));
  const assetManifestHash = await hashFile(join(projectRoot, "src", "assets", "manifest.yaml"));
  const sceneRegistryHash = await hashFile(join(projectRoot, "phaser.config.ts"));
  const bundleBytes = await measureDirSize(join(projectRoot, "dist"));

  const evidence: PhaserReleaseEvidence = {
    bundleHash,
    assetManifestHash,
    sceneRegistryHash,
    bundleBytes,
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
    const digest = await byteHashFile(filePath);
    return digest.slice("sha256:".length);
  } catch {
    return "0000000000000000000000000000000000000000000000000000000000000000";
  }
}

async function hashDirectory(dirPath: string): Promise<string> {
  const files = await listFiles(dirPath);
  if (files.length === 0) {
    return "0000000000000000000000000000000000000000000000000000000000000000";
  }
  const chunks: Buffer[] = [];
  for (const filePath of files.sort()) {
    const content = await readFile(filePath);
    chunks.push(content);
  }
  return byteHash(Buffer.concat(chunks)).slice("sha256:".length);
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
