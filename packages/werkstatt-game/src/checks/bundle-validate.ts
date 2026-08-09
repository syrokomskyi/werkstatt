/*
<MODULE_CONTRACT>
<purpose>game.bundle.validate — measures gzipped bundle size against budget (GAME-03, RFC-0777).</purpose>
<keywords>validator, bundle, game, budget, gzip</keywords>
<non-goals>
  <item>Does not modify files — read-only validator.</item>
  <item>Does not run the build — measures existing dist/ output only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0777: initial bundle validator — gzip each file in dist/, sum sizes, compare to budget.</item>
</CHANGE_SUMMARY>
*/

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Dirent } from "node:fs";
import { gzipSync } from "node:zlib";
import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface BundleValidateViolation {
  ruleId: string;
  bundleBytes: number;
  budgetBytes: number;
  message: string;
}

export interface BundleValidateData {
  command: string;
  status: "pass" | "fail";
  bundleBytes: number;
  budgetBytes: number;
  violations: BundleValidateViolation[];
}

const DIST_DIR = "dist";
const PHASER_CONFIG = "phaser.config.ts";
const DEFAULT_BUDGET = 5 * 1024 * 1024; // 5 MB = 5242880 bytes

export async function validateBundle(
  projectRoot: string,
): Promise<KernelCommandResult<BundleValidateData>> {
  const budget = await readBundleBudget(projectRoot);
  const distPath = join(projectRoot, DIST_DIR);
  const bundleBytes = await measureGzippedSize(distPath);

  const violations: BundleValidateViolation[] = [];
  if (bundleBytes > budget) {
    violations.push({
      ruleId: "GAME-03",
      bundleBytes,
      budgetBytes: budget,
      message: `Bundle exceeds budget: ${bundleBytes} bytes > ${budget} bytes (${formatMB(bundleBytes)} > ${formatMB(budget)} MB gzipped)`,
    });
  }

  const status = violations.length === 0 ? "pass" : "fail";
  return {
    data: { command: "game.bundle.validate", status, bundleBytes, budgetBytes: budget, violations },
    exitCode: status === "pass" ? 0 : 1,
    summary: `game.bundle.validate: ${status} (${formatMB(bundleBytes)} / ${formatMB(budget)} MB)`,
  };
}

async function readBundleBudget(projectRoot: string): Promise<number> {
  try {
    const content = await readFile(join(projectRoot, PHASER_CONFIG), "utf-8");
    const match = content.match(/bundleBudget\s*:\s*(\d+)/);
    if (match) {
      return parseInt(match[1]!, 10);
    }
  } catch {
    // No phaser.config.ts → default budget
  }
  return DEFAULT_BUDGET;
}

async function measureGzippedSize(distPath: string): Promise<number> {
  const files = await listFiles(distPath);
  let totalGzipped = 0;
  for (const filePath of files) {
    try {
      const content = await readFile(filePath);
      const gzipped = gzipSync(content);
      totalGzipped += gzipped.length;
    } catch {
      // Skip unreadable files
    }
  }
  return totalGzipped;
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
      const sub = await listFiles(fullPath);
      results.push(...sub);
    } else if (entry.isFile()) {
      try {
        const s = await stat(fullPath);
        if (s.size > 0) {
          results.push(fullPath);
        }
      } catch {
        // Skip
      }
    }
  }
  return results;
}

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2);
}

export function createBundleValidateCommand(): KernelCommandDefinition<BundleValidateData> {
  return {
    name: "game.bundle.validate",
    description: "Validate bundle size against budget (GAME-03)",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      return validateBundle(context.workspaceRoot);
    },
  };
}
