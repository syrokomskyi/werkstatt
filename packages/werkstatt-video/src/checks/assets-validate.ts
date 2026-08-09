/*
<MODULE_CONTRACT>
<purpose>video.assets.validate — checks asset manifest completeness (WV-02, WV-07, RFC-0778).</purpose>
<keywords>validator, assets, video, editframe, manifest</keywords>
<non-goals>
  <item>Does not modify files — read-only validator.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0778: initial assets validator — reads manifest, checks referenced assets exist, detects orphans.</item>
</CHANGE_SUMMARY>
*/

import { readFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";
import type { Dirent } from "node:fs";
import { parse as parseYaml } from "yaml";
import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface AssetManifestEntry {
  path: string;
  type?: string;
}

export interface AssetManifest {
  assets: AssetManifestEntry[];
}

export interface AssetsValidateViolation {
  ruleId: string;
  file: string;
  message: string;
}

export interface AssetsValidateData {
  command: string;
  status: "pass" | "fail";
  violations: AssetsValidateViolation[];
}

const ASSETS_DIR = "src/assets";
const MANIFEST_PATH = "src/assets/manifest.yaml";

export async function validateAssets(
  projectRoot: string,
): Promise<KernelCommandResult<AssetsValidateData>> {
  const violations: AssetsValidateViolation[] = [];
  const manifestPath = join(projectRoot, MANIFEST_PATH);

  let manifest: AssetManifest = { assets: [] };
  try {
    const raw = await readFile(manifestPath, "utf-8");
    const parsed = parseYaml(raw) as AssetManifest | undefined;
    if (parsed && Array.isArray(parsed.assets)) {
      manifest = parsed;
    }
  } catch {
    // No manifest = empty manifest (valid for freshly scaffolded projects)
  }

  // WV-02: Check each manifest entry exists on disk
  for (const entry of manifest.assets) {
    const fullPath = join(projectRoot, ASSETS_DIR, entry.path);
    try {
      await access(fullPath);
    } catch {
      violations.push({
        ruleId: "WV-02",
        file: join(ASSETS_DIR, entry.path),
        message: `Asset listed in manifest but not found on disk: ${entry.path}`,
      });
    }
  }

  // WV-07: Check for files in src/assets/ not listed in manifest
  const manifestPaths = new Set(manifest.assets.map((a) => a.path));
  const assetFiles = await listAssetFiles(join(projectRoot, ASSETS_DIR));
  for (const relPath of assetFiles) {
    if (relPath !== "manifest.yaml" && !manifestPaths.has(relPath)) {
      violations.push({
        ruleId: "WV-07",
        file: join(ASSETS_DIR, relPath),
        message: `Asset file exists but is not listed in manifest: ${relPath}`,
      });
    }
  }

  const status = violations.length === 0 ? "pass" : "fail";
  return {
    data: { command: "video.assets.validate", status, violations },
    exitCode: status === "pass" ? 0 : 1,
    summary: `video.assets.validate: ${status} (${violations.length} violations)`,
  };
}

async function listAssetFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const sub = await listAssetFiles(join(dir, entry.name));
      for (const s of sub) {
        results.push(`${entry.name}/${s}`);
      }
    } else {
      results.push(entry.name);
    }
  }
  return results;
}

export function createAssetsValidateCommand(): KernelCommandDefinition<AssetsValidateData> {
  return {
    name: "video.assets.validate",
    description: "Validate video asset manifest completeness (WV-02, WV-07)",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      return validateAssets(context.workspaceRoot);
    },
  };
}
