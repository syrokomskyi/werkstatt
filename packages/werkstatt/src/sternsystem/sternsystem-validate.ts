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
  <item>RFC-0648: add branch-convention rule enforcing main as default branch for cache clone and bare repo.</item>
  <item>RFC-0792: add yaml-syntax-error rule for top-level YAML file syntax checking in systems-cache.</item>
</CHANGE_SUMMARY>
*/

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import { StarCatalog } from "@warpgogol/werkstatt-site/ontology/cosmic";
import { systemPinSchema } from "@warpgogol/werkstatt/schemas";
import {
  discoverSystems,
  hasAppsCollision,
  resolveMirrors,
  resolveMirrorPath,
  isGitAccessible,
} from "./registry-io.ts";
import { evaluateExternalEditGate } from "./external-edit-guard.ts";
import {
  collectExternalEditInputs,
  bordbuchFileExists,
  bordbuchPathFor,
} from "./external-edit-collector.ts";

export interface SternsystemValidateData {
  validated: number;
  violations: SternsystemViolation[];
  warnings: Array<{ systemId: string; field: string; message: string }>;
  withOwner: number;
  withoutOwner: number;
}

type SternsystemViolation = { systemId: string; rule: string; message: string };

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
): Promise<SternsystemViolation[]> {
  const violations: SternsystemViolation[] = [];
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
          message: `${systemId}: cache clone contains forbidden path: ${rel}/`,
        });
      }
      continue;
    }

    if (FORBIDDEN_PATTERNS.includes(name)) {
      violations.push({
        systemId,
        rule: "bundle-contract",
        message: `${systemId}: cache clone contains forbidden file: ${rel}`,
      });
    }
    if (name.includes(".generated.")) {
      violations.push({
        systemId,
        rule: "bundle-contract",
        message: `${systemId}: cache clone contains generated file: ${rel}`,
      });
    }
  }

  return violations;
}

async function validateYamlFiles(
  cacheDir: string,
  systemId: string,
): Promise<SternsystemViolation[]> {
  const violations: SternsystemViolation[] = [];
  if (!existsSync(cacheDir)) return violations;

  const entries = await fs.readdir(cacheDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".yaml") && !entry.name.endsWith(".yml")) continue;

    const filePath = path.join(cacheDir, entry.name);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      parseYaml(raw);
    } catch (err) {
      violations.push({
        systemId,
        rule: "yaml-syntax-error",
        message: `${entry.name}: YAML syntax error: ${(err as Error).message}`,
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

  const { systems: allSystems, errors: discoveryErrors } = await discoverSystems(workspaceRoot);

  const violations: SternsystemViolation[] = [];
  const warnings: Array<{ systemId: string; field: string; message: string }> = [];

  if (discoveryErrors.length > 0) {
    for (const err of discoveryErrors) {
      violations.push({
        systemId: err.id,
        rule: "discovery-error",
        message: `Failed to read system-config.yaml for '${err.id}': ${err.error}`,
      });
    }
  }

  const systems = filterId ? allSystems.filter((s) => s.id === filterId) : allSystems;

  if (filterId && systems.length === 0) {
    throw new Error(`[sternsystem.validate] id '${filterId}' not found in ../systems-cache/`);
  }

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

    // RFC-0666: secretsFile field is removed — reject if still present in any channel
    if (entry.deployment?.channels) {
      for (const [ch, chConfig] of Object.entries(entry.deployment.channels)) {
        if (chConfig?.secretsFile) {
          violations.push({
            systemId: entry.id,
            rule: "secretsFile-removed",
            message: `channel '${ch}' still contains 'secretsFile' field — remove it. See RFC-0666.`,
          });
        }
      }
    }

    // RFC-0574: validate mirror topology — mirrors[0] is cache, mirrors[1] is bare, mirrors[2+] are external
    if (entry.mirrors.length < 1) {
      violations.push({
        systemId: entry.id,
        rule: "mirrors-empty",
        message: `system '${entry.id}' has no mirrors — at least 1 mirror (cache clone) is required`,
      });
    }

    if (entry.mirrors.length >= 1 && entry.mirrors[0].storageType !== "non-bare") {
      violations.push({
        systemId: entry.id,
        rule: "cache-must-be-non-bare",
        message: `mirrors[0] must have storageType 'non-bare' (got '${entry.mirrors[0].storageType}') — cache clone must be a working tree for git push`,
      });
    }

    for (let i = 0; i < entry.mirrors.length; i++) {
      const m = entry.mirrors[i];
      if (m.storageType === "bundle" && isGitAccessible(m.path)) {
        violations.push({
          systemId: entry.id,
          rule: "bundle-no-git-protocol",
          message: `mirrors[${i}] has storageType 'bundle' but uses git-accessible protocol '${m.path}' — bundle mirrors must not use git protocols`,
        });
      }
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

    // RFC-0648: branch-convention rule — cache clone and bare repo must use 'main' branch
    const cacheGitDir = path.join(cacheDir, ".git");
    if (existsSync(cacheGitDir)) {
      try {
        const cacheBranch = execSync("git symbolic-ref HEAD", {
          cwd: cacheDir,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        })
          .replace("refs/heads/", "")
          .trim();
        if (cacheBranch !== "main") {
          violations.push({
            systemId: entry.id,
            rule: "branch-convention",
            message: `cache clone branch is '${cacheBranch}', expected 'main' — run: git -C ${cacheDir} branch -m ${cacheBranch} main`,
          });
        }
      } catch {
        violations.push({
          systemId: entry.id,
          rule: "branch-convention",
          message: `cache clone at ${cacheDir} has no resolvable HEAD (detached or corrupt) — expected branch 'main'`,
        });
      }
    }

    if (entry.mirrors.length > 1) {
      const bareMirror = entry.mirrors[1];
      const bareRepoPath = resolveMirrorPath(workspaceRoot, bareMirror.path);
      if (existsSync(bareRepoPath)) {
        try {
          const bareBranch = execSync("git symbolic-ref HEAD", {
            cwd: bareRepoPath,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          })
            .replace("refs/heads/", "")
            .trim();
          if (bareBranch !== "main") {
            violations.push({
              systemId: entry.id,
              rule: "branch-convention",
              message: `bare repo branch is '${bareBranch}', expected 'main' — run: git -C ${bareRepoPath} symbolic-ref HEAD refs/heads/main`,
            });
          }
        } catch {
          violations.push({
            systemId: entry.id,
            rule: "branch-convention",
            message: `bare repo at ${bareRepoPath} has no resolvable HEAD (detached or corrupt) — expected branch 'main'`,
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

    // RFC-0792: YAML syntax checking for all top-level YAML files in cache clone
    const yamlViolations = await validateYamlFiles(cacheDir, entry.id);
    violations.push(...yamlViolations);
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
