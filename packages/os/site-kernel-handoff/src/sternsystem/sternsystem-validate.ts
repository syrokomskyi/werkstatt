/*
<MODULE_CONTRACT>
<purpose>RFC-0354 §7.3: sternsystem.validate — validate registry invariants and bundle contract.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0354: initial validate command handler.</item>
  <item>RFC-0480: add Bordbuch-vs-git-log consistency check for external edit detection.</item>
  <item>RFC-0520: extract Bordbuch-vs-git-log check into evaluateExternalEditGate pure function.</item>
  <item>RFC-0561: add owner-format-invalid check and missing-owner notice warning.</item>
</CHANGE_SUMMARY>
*/

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { collectFiles } from "@warpgogol/share/fs";
import { StarCatalog } from "@warpgogol/ontology/cosmic";
import { systemPinSchema } from "@warpgogol/ontology/operations";
import {
  readRegistry,
  findEntry,
  hasAppsCollision,
  resolveMirrors,
  resolveMirrorPath,
} from "./registry-io.ts";
import { evaluateExternalEditGate } from "./external-edit-guard.ts";
import {
  collectExternalEditInputs,
  bordbuchFileExists,
  bordbuchPathFor,
} from "./external-edit-collector.ts";

export interface SternsystemValidateData {
  validated: number;
  violations: Array<{ systemId: string; rule: string; message: string }>;
  warnings: Array<{ systemId: string; field: string; message: string }>;
  withOwner: number;
  withoutOwner: number;
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

const FORBIDDEN_PATTERNS = [
  "dist",
  "node_modules",
  "packages",
  "package.json",
  "pnpm-lock.yaml",
  "astro.config.mjs",
  "astro.config.ts",
  "tsconfig.json",
  "wrangler.toml",
  "wrangler.jsonc",
];

async function checkBundleContract(
  cacheDir: string,
  systemId: string,
): Promise<Array<{ systemId: string; rule: string; message: string }>> {
  const violations: Array<{ systemId: string; rule: string; message: string }> = [];
  if (!existsSync(cacheDir)) return violations;

  const entries = await collectFiles(cacheDir, {
    withDirs: true,
    ignore: (name) => name === ".git",
  });

  for (const abs of entries) {
    const rel = path.relative(cacheDir, abs);
    const name = path.basename(abs);
    const stat = await fs.stat(abs).catch(() => undefined);
    if (!stat) continue;

    if (stat.isDirectory()) {
      if (FORBIDDEN_PATTERNS.includes(name)) {
        violations.push({
          systemId,
          rule: "bundle-contract",
          message: `systems/${systemId}/ contains forbidden path: ${rel}/`,
        });
      }
      continue;
    }

    if (FORBIDDEN_PATTERNS.includes(name)) {
      violations.push({
        systemId,
        rule: "bundle-contract",
        message: `systems/${systemId}/ contains forbidden file: ${rel}`,
      });
    }
    if (name.includes(".generated.")) {
      violations.push({
        systemId,
        rule: "bundle-contract",
        message: `systems/${systemId}/ contains generated file: ${rel}`,
      });
    }
  }

  return violations;
}

export async function runSternsystemValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<SternsystemValidateData>> {
  const { workspaceRoot, logger } = context;
  const filterId = flagString(input, "id");

  const registry = await readRegistry(workspaceRoot);
  const systems = filterId ? registry.systems.filter((s) => s.id === filterId) : registry.systems;

  if (filterId && systems.length === 0) {
    throw new Error(`[sternsystem.validate] id '${filterId}' not found in registry`);
  }

  const violations: Array<{ systemId: string; rule: string; message: string }> = [];
  const warnings: Array<{ systemId: string; field: string; message: string }> = [];
  const seenIds = new Set<string>();
  const seenStars = new Set<string>();
  let withOwner = 0;
  let withoutOwner = 0;

  for (const entry of systems) {
    // Registry invariants
    if (seenIds.has(entry.id)) {
      violations.push({
        systemId: entry.id,
        rule: "unique-id",
        message: `duplicate id '${entry.id}' in registry`,
      });
    }
    seenIds.add(entry.id);

    if (entry.owner) {
      withOwner++;
    } else {
      withoutOwner++;
      warnings.push({
        systemId: entry.id,
        field: "owner",
        message: "owner field not set; Studio Gate cannot verify ownership for this site",
      });
    }

    if (entry.status !== "archived" && seenStars.has(entry.cosmicStar)) {
      violations.push({
        systemId: entry.id,
        rule: "unique-cosmicStar",
        message: `cosmicStar '${entry.cosmicStar}' is used by multiple active/registered systems`,
      });
    }
    seenStars.add(entry.cosmicStar);

    if (!(StarCatalog as readonly string[]).includes(entry.cosmicStar)) {
      violations.push({
        systemId: entry.id,
        rule: "valid-cosmicStar",
        message: `cosmicStar '${entry.cosmicStar}' is not in StarCatalog`,
      });
    }

    // apps/ collision
    if (hasAppsCollision(workspaceRoot, entry.id)) {
      violations.push({
        systemId: entry.id,
        rule: "apps-collision",
        message: `id '${entry.id}' matches existing apps/${entry.id}/ — extraction incomplete`,
      });
    }

    // Bundle contract (if cache clone exists)
    const cacheDir = resolveMirrors(workspaceRoot, entry).cachePath;
    const bundleViolations = await checkBundleContract(cacheDir, entry.id);
    violations.push(...bundleViolations);

    // Pin file validation (if cache clone exists)
    const pinPath = path.join(cacheDir, "system.pin.json");
    if (existsSync(pinPath)) {
      try {
        const raw = await fs.readFile(pinPath, "utf8");
        const parsed = JSON.parse(raw);
        systemPinSchema.parse(parsed);
        const pin = parsed as { platform: { version: string }; systemId: string };
        if (pin.platform.version !== entry.pinnedPlatform) {
          violations.push({
            systemId: entry.id,
            rule: "pin-version-mismatch",
            message: `system.pin.json platform.version '${pin.platform.version}' does not match registry pinnedPlatform '${entry.pinnedPlatform}'`,
          });
        }
        if (pin.systemId !== entry.id) {
          violations.push({
            systemId: entry.id,
            rule: "pin-id-mismatch",
            message: `system.pin.json systemId '${pin.systemId}' does not match registry id '${entry.id}'`,
          });
        }
      } catch (err) {
        violations.push({
          systemId: entry.id,
          rule: "pin-parse",
          message: `system.pin.json parse failed: ${(err as Error).message}`,
        });
      }
    } else if (entry.status === "active") {
      violations.push({
        systemId: entry.id,
        rule: "pin-missing",
        message: `active system '${entry.id}' has no system.pin.json in cache clone`,
      });
    }

    // RFC-0574: validate mirror topology — mirrors[0] is cache, mirrors[1] is bare, mirrors[2+] are external
    if (entry.mirrors.length < 1) {
      violations.push({
        systemId: entry.id,
        rule: "mirrors-empty",
        message: `system '${entry.id}' has no mirrors — at least 1 mirror (cache clone) is required`,
      });
    }

    if (entry.mirrors.length > 1) {
      const bareMirror = entry.mirrors[1];
      const bareRepoPath = resolveMirrorPath(workspaceRoot, bareMirror.path);

      if (existsSync(bareRepoPath)) {
        try {
          const remoteUrl = execSync("git remote get-url mirror", {
            cwd: bareRepoPath,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          }).trim();
          if (entry.mirrors.length > 2 && remoteUrl !== entry.mirrors[2].path) {
            violations.push({
              systemId: entry.id,
              rule: "mirror-remote-mismatch",
              message: `mirror remote URL '${remoteUrl}' does not match registry mirrors[2] '${entry.mirrors[2].path}'`,
            });
          }
        } catch {
          violations.push({
            systemId: entry.id,
            rule: "mirror-remote-missing",
            message: `mirror remote not configured in bare repo at ${bareRepoPath}`,
          });
        }
      }

      if (entry.mirrors.length > 2) {
        const externalMirror = entry.mirrors[2].path;
        if (/https:\/\/[^:]+:[^@]+@/.test(externalMirror)) {
          violations.push({
            systemId: entry.id,
            rule: "mirror-credentials",
            message: `external mirror URL contains embedded credentials — use SSH URL instead`,
          });
        }
      }
    }

    // RFC-0520: Bordbuch-vs-git-log check delegated to evaluateExternalEditGate
    if (bordbuchFileExists(cacheDir)) {
      try {
        const bordbuchPath = bordbuchPathFor(cacheDir);
        const { bordbuchEntries, rangeShas, gitLogShas } = await collectExternalEditInputs(
          cacheDir,
          bordbuchPath,
        );
        const guardResult = evaluateExternalEditGate({
          systemId: entry.id,
          bordbuchEntries,
          gitLogShas,
          rangeShas,
        });
        if (guardResult.verdict === "fail") {
          for (const v of guardResult.violations) {
            violations.push({ systemId: v.systemId!, rule: v.rule, message: v.message });
          }
        }
      } catch {
        // Bordbuch read failed — skip
      }
    }
  }

  const validated = systems.length;
  if (violations.length === 0) {
    logger.success(
      `[sternsystem.validate] ${validated} system${validated === 1 ? "" : "s"} validated, 0 violations`,
    );
  } else {
    logger.error(
      `[sternsystem.validate] ${validated} system${validated === 1 ? "" : "s"} validated, ${violations.length} violation(s)`,
    );
    for (const v of violations) {
      logger.error(`  [${v.rule}] ${v.systemId}: ${v.message}`);
    }
  }
  for (const w of warnings) {
    logger.warn(`  [${w.field}] ${w.systemId}: ${w.message}`);
  }

  return {
    data: { validated, violations, warnings, withOwner, withoutOwner },
    exitCode: violations.length > 0 ? 1 : 0,
    summary: `[sternsystem.validate] ${validated} system${validated === 1 ? "" : "s"} validated, ${violations.length} violation(s), ${withOwner} with owner, ${withoutOwner} without owner`,
  };
}
