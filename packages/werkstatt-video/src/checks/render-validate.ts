/*
<MODULE_CONTRACT>
<purpose>video.render.validate — checks render determinism (WV-03), format declaration (WV-06), and artifact storage (WV-09) (RFC-0778).</purpose>
<keywords>validator, render, video, editframe, determinism</keywords>
<non-goals>
  <item>Does not modify files — read-only validator.</item>
  <item>Does not re-render — compares against stored baseline hash from build hook.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0778: initial render validator — WV-03 baseline hash comparison, WV-06 format check, WV-09 artifact storage check.</item>
</CHANGE_SUMMARY>
*/

import { readFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface RenderValidateViolation {
  ruleId: string;
  file: string;
  message: string;
}

export interface RenderValidateData {
  command: string;
  status: "pass" | "fail";
  violations: RenderValidateViolation[];
  renderHash?: string;
  baselineHash?: string;
}

const DIST_DIR = "dist";
const RENDER_HASH_FILE = "dist/.render-hash.json";
const EDITFRAME_CONFIG = "editframe.config.ts";

interface RenderHashManifest {
  hash: string;
  generatedAt: string;
}

export async function validateRender(
  projectRoot: string,
): Promise<KernelCommandResult<RenderValidateData>> {
  const violations: RenderValidateViolation[] = [];
  const distPath = join(projectRoot, DIST_DIR);

  // Check dist/ exists and has rendered content
  const renderFiles = await listRenderFiles(distPath);
  if (renderFiles.length === 0) {
    violations.push({
      ruleId: "WV-03",
      file: DIST_DIR,
      message: "No render output found — run build first",
    });
    return {
      data: { command: "video.render.validate", status: "fail", violations },
      exitCode: 1,
      summary: `video.render.validate: fail (${violations.length} violations)`,
    };
  }

  // WV-03: Compare current dist/ hash against stored baseline
  const currentHash = await hashFiles(renderFiles);
  let baselineHash: string | undefined;

  try {
    const raw = await readFile(join(projectRoot, RENDER_HASH_FILE), "utf-8");
    const manifest = JSON.parse(raw) as RenderHashManifest;
    baselineHash = manifest.hash;
  } catch {
    violations.push({
      ruleId: "WV-03",
      file: RENDER_HASH_FILE,
      message: "No baseline hash found — run build first to generate render hash",
    });
  }

  if (baselineHash && currentHash !== baselineHash) {
    violations.push({
      ruleId: "WV-03",
      file: DIST_DIR,
      message: `Render output differs from baseline (current: ${currentHash.slice(0, 12)}, baseline: ${baselineHash.slice(0, 12)}) — non-deterministic render`,
    });
  }

  // WV-06: Check render format declared in editframe.config.ts
  try {
    const configContent = await readFile(join(projectRoot, EDITFRAME_CONFIG), "utf-8");
    const hasCodec = /codec\s*[:=]/i.test(configContent);
    const hasContainer = /container\s*[:=]/i.test(configContent);
    const hasResolution = /resolution\s*[:=]/i.test(configContent);

    if (!hasCodec || !hasContainer || !hasResolution) {
      const missing: string[] = [];
      if (!hasCodec) missing.push("codec");
      if (!hasContainer) missing.push("container");
      if (!hasResolution) missing.push("resolution");
      violations.push({
        ruleId: "WV-06",
        file: EDITFRAME_CONFIG,
        message: `Render format not fully declared — missing: ${missing.join(", ")}`,
      });
    }
  } catch {
    violations.push({
      ruleId: "WV-06",
      file: EDITFRAME_CONFIG,
      message: `Editframe config not found: ${EDITFRAME_CONFIG}`,
    });
  }

  // WV-09: Check for content-addressed hash file in dist/
  const hasHashNamedFile = renderFiles.some((f) => {
    const name = f.split("/").pop() ?? "";
    return /^[0-9a-f]{64}\.(mp4|webm|mov)$/.test(name);
  });

  if (!hasHashNamedFile) {
    violations.push({
      ruleId: "WV-09",
      file: DIST_DIR,
      message:
        "Rendered video not stored with content-addressed hash filename (expected: <sha256>.mp4)",
    });
  }

  const status = violations.length === 0 ? "pass" : "fail";
  return {
    data: {
      command: "video.render.validate",
      status,
      violations,
      renderHash: currentHash,
      baselineHash,
    },
    exitCode: status === "pass" ? 0 : 1,
    summary: `video.render.validate: ${status} (${violations.length} violations)`,
  };
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

export function createRenderValidateCommand(): KernelCommandDefinition<RenderValidateData> {
  return {
    name: "video.render.validate",
    description: "Validate render determinism, format, and artifact storage (WV-03, WV-06, WV-09)",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      return validateRender(context.workspaceRoot);
    },
  };
}
