/*
<MODULE_CONTRACT>
<purpose>RFC-0356 §1: mission.materialize — populate Werkstück from pinned Sternsystem bundle.</purpose>
<non-goals>
  <item>Does not define mission lifecycle — that is RFC-0355.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0356: initial mission.materialize command handler.</item>
  <item>RFC-0389: replace minimal inline stubs with full boilerplate generation using @warpgogol/site-kernel-codegen generators and @warpgogol/site-kernel-onboarding templates.</item>
  <item>RFC-0388: generate .env.example via env.example.generate and copy to .env.main/.env.alt (DNA-40 env-and-deploy contract).</item>
  <item>RFC-0480: add paused status guard; init git in workpiece and commit materialized state.</item>
  <item>RFC-0517: add preflight content quality gate between atomicMoveDir and git init.</item>
  <item>Run build.prepare pipeline after atomicMoveDir to generate all derived artifacts (surface, sitemap, video/image variants, etc.) before git init.</item>
  <item>Set PUBLIC_IMAGE_PROVIDER=build-portable in workpiece .env files so image.variants.generate produces responsive variants.</item>
  <item>Auto-install Playwright Chromium during materialization (idempotent) — ensures build.post print.pdf.generate and independent-qa work without manual intervention.</item>
  <item>RFC-0568: replace git init with git clone from cache clone; stage only data paths in materialize commit (DNA-44 compliance).</item>
  <item>Run pnpm install after atomicMoveDir to link workpiece workspace deps before build.prepare (fixes workpiece.imports.validate failure on fresh workpiece).</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type {
  DiscoveredSiteWorkspace,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { runKernelWire, executeKernelCommand, executeKernelPipeline } from "@warpgogol/site-kernel";
import {
  readRegistry,
  findEntry,
  resolveCachePath,
  resolveMirrors,
  resolveMirrorPath,
} from "../sternsystem/registry-io.ts";
import {
  runGenerateAgentsDocs,
  runGenerateApiRoutes,
  runGenerateGlobalStyles,
  runGenerateI18nMiddleware,
  runGenerateOverlayPages,
  runGeneratePublicInfrastructure,
  runGenerateRoutes,
  runGenerateScriptsOrchestrator,
  runFontsImportsGenerate,
  runBiomeCssGenerate,
} from "@warpgogol/site-kernel-codegen";
import { applyTokens, readTemplate, readRuntimeTemplate } from "@warpgogol/site-kernel-onboarding";
import {
  runEnvExampleGenerate,
  MISSION_PREFLIGHT_CRITICAL,
  MISSION_PREFLIGHT_WARNING,
} from "@warpgogol/site-kernel-checks";
import { readMissionManifest, writeMissionManifest, resolveMissionDir } from "./mission-io.ts";
import { acquireLock, releaseLock, generateOperationId } from "../werkstatt/index.ts";
import { atomicMoveDir, atomicWriteFile, resolveStagingDir } from "../werkstatt/atomic.ts";
import { appendBordbuchEntry } from "../bordbuch/bordbuch-io.ts";
import type { KernelPipelineStep } from "@warpgogol/site-kernel";

export interface MissionMaterializeData {
  missionId: string;
  systemId: string;
  versionComparison: {
    verdict: "in-sync" | "catch-up" | "refuse-downgrade";
    pinVersion: string;
    platformVersion: string;
    packagesDrift: boolean;
    message: string;
  };
  migratorChain: Array<{ fromVersion: string; toVersion: string; rfc: string; applied: boolean }>;
  capabilityDiff: { tier: "green" | "yellow" | "red"; items: Array<Record<string, unknown>> };
  regeneration: { regeneratedFiles: string[]; success: boolean };
  materializedAt: string;
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

function flagBool(input: KernelCommandInput, key: string): boolean {
  const v = input.flags[key];
  return v === true || v === "true";
}

const STERNSYSTEM_DATA_PATHS = [
  "src/content",
  "public",
  "provenance",
  "behavior.snapshot.generated.yaml",
];

async function copyDir(src: string, dest: string): Promise<void> {
  if (!existsSync(src)) return;
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * RFC-0389: Generate full runtime boilerplate into the staging Werkstück using
 * onboarding templates and codegen generators, following the onboarding.scaffold pattern.
 * Returns the list of all generated file paths (relative to staging dir).
 */
async function generateFullBoilerplate(
  stagingDir: string,
  systemId: string,
  context: KernelRuntimeContext,
  logger: { info: (msg: string) => void },
): Promise<string[]> {
  const regeneratedFiles: string[] = [];

  // Resolve domain from system.md in the staging directory
  const systemMdPath = path.join(stagingDir, "src", "content", "system.md");
  let domain = "";
  if (existsSync(systemMdPath)) {
    try {
      const raw = readFileSync(systemMdPath, "utf8");
      const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const domainMatch = fmMatch[1].match(/^  domain:\s*"?([^"\s]+)"?/m);
        if (domainMatch) {
          domain = domainMatch[1];
        }
      }
    } catch (err) {
      logger.info(
        `  Warning: failed to read system.md for domain extraction: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const tokens: Record<string, string> = {
    CLIENT_ID: systemId,
    DOMAIN: domain,
    SITE_LINE: domain
      ? `  // [ALT-DEPLOY] PUBLIC_SITE_URL overrides the canonical domain for alt builds.\n  site: process.env.PUBLIC_SITE_URL || "https://${domain}",`
      : "  // site: omitted (no domain configured)",
  };

  // Step 1: Write template files into staging directory
  const templateFiles: Array<{ dest: string; content: string }> = [
    { dest: "package.json", content: applyTokens(readTemplate("package.template.json"), tokens) },
    {
      dest: "astro.config.mjs",
      content: applyTokens(readRuntimeTemplate("astro.config.template.mjs"), tokens),
    },
    {
      dest: "wrangler.jsonc",
      content: applyTokens(readTemplate("wrangler.template.jsonc"), tokens),
    },
    { dest: "tsconfig.json", content: readTemplate("tsconfig.template.json") },
    { dest: ".gitignore", content: applyTokens(readRuntimeTemplate("gitignore.template"), tokens) },
    { dest: "postcss.config.cjs", content: readRuntimeTemplate("postcss.config.template.cjs") },
    {
      dest: `.github/workflows/deploy-${systemId}.yml`,
      content: applyTokens(readRuntimeTemplate("github-deploy.template.yaml"), tokens),
    },
  ];

  for (const { dest, content } of templateFiles) {
    const fullPath = path.join(stagingDir, dest);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await atomicWriteFile(fullPath, content);
    regeneratedFiles.push(dest);
  }
  logger.info(`  Wrote ${templateFiles.length} template files`);

  // Validate system.md presence before running generators (RFC-0389 failure modes)
  if (!existsSync(systemMdPath)) {
    throw new Error(
      `[mission.materialize] system.md not found in staging directory — Sternsystem data set is incomplete`,
    );
  }

  // Step 2: Construct app-scoped context for the staging Werkstück
  const stagingSiteWorkspace: DiscoveredSiteWorkspace = {
    name: systemId,
    directory: stagingDir,
    toolsDirectory: path.join(stagingDir, "tools"),
    packageName: systemId,
  };

  const generatorInput: KernelCommandInput = {
    argv: [`--app=${systemId}`, `--domain=${domain}`],
    args: [],
    flags: { app: systemId, domain },
  };

  const appContext: KernelRuntimeContext = {
    ...context,
    site: stagingSiteWorkspace,
    siteExplicit: true,
  };

  // Step 3: Run kernel.wire to generate tools/ wiring
  const wireResult = await runKernelWire(generatorInput, appContext);
  const wireData = wireResult.data as Record<string, unknown>;
  const wireGenerated = wireData?.generated;
  if (Array.isArray(wireGenerated)) {
    for (const file of wireGenerated) {
      if (typeof file === "string") {
        regeneratedFiles.push(file);
      }
    }
  }
  logger.info(`  kernel.wire completed`);

  // Step 4: Run codegen generator sequence (same order as onboarding.scaffold)
  const generators: Array<{
    name: string;
    fn: (input: KernelCommandInput, ctx: KernelRuntimeContext) => Promise<KernelCommandResult>;
  }> = [
    { name: "agents.generate", fn: runGenerateAgentsDocs },
    { name: "overlay.pages.generate", fn: runGenerateOverlayPages },
    { name: "routes.generate", fn: runGenerateRoutes },
    { name: "api.routes.generate", fn: runGenerateApiRoutes },
    { name: "styles.global.generate", fn: runGenerateGlobalStyles },
    // biome.css.generate must run after styles.global.generate (which emits
    // global.css with @import "./biome.generated.css") and before dev server
    // launch — without this file PostCSS fails with ENOENT.
    { name: "biome.css.generate", fn: runBiomeCssGenerate },
    { name: "fonts.imports.generate", fn: runFontsImportsGenerate },
    { name: "scripts.orchestrator.generate", fn: runGenerateScriptsOrchestrator },
    { name: "public.infrastructure.generate", fn: runGeneratePublicInfrastructure },
    { name: "i18n.middleware.generate", fn: runGenerateI18nMiddleware },
    { name: "env.example.generate", fn: runEnvExampleGenerate },
  ];

  for (const { name, fn } of generators) {
    const result = await fn(generatorInput, appContext);
    if ((result.exitCode ?? 0) !== 0) {
      throw new Error(
        `[mission.materialize] codegen generator '${name}' failed: ${result.summary}`,
      );
    }
    // Collect generated files from the result
    const data = result.data as Record<string, unknown>;
    const generated = data?.generated;
    if (Array.isArray(generated)) {
      for (const file of generated) {
        if (typeof file === "string") {
          regeneratedFiles.push(file);
        }
      }
    }
    logger.info(`  ${name} completed`);
  }

  // Step 5: Copy .env.example to .env, .env.main and .env.alt (RFC-0388 / DNA-40)
  // .env.example has empty values with # How to obtain: instructions;
  // .env, .env.main and .env.alt are identical templates for the operator to fill in.
  const envExamplePath = path.join(stagingDir, ".env.example");
  if (existsSync(envExamplePath)) {
    const envExampleContent = await fs.readFile(envExamplePath, "utf8");
    await atomicWriteFile(path.join(stagingDir, ".env"), envExampleContent);
    await atomicWriteFile(path.join(stagingDir, ".env.main"), envExampleContent);
    await atomicWriteFile(path.join(stagingDir, ".env.alt"), envExampleContent);
    regeneratedFiles.push(".env.example", ".env", ".env.main", ".env.alt");
    logger.info(`  .env.example, .env, .env.main, .env.alt written`);
  }

  return regeneratedFiles;
}

/**
 * RFC-0356 §1.1 step 2: sync the cache clone (mirrors[0]) from the bare repo (mirrors[1]).
 * If the cache clone has a .git directory, fetch + reset to origin/master.
 * If not but a bare mirror exists, clone it. If no bare mirror, skip (offline mode).
 */
async function syncCacheClone(
  workspaceRoot: string,
  systemId: string,
  logger: { info: (msg: string) => void },
): Promise<void> {
  const registry = await readRegistry(workspaceRoot);
  const entry = findEntry(registry, systemId);
  if (!entry) {
    logger.info(`  No registry entry for system '${systemId}' — skipping cache clone sync`);
    return;
  }

  const { cachePath, gitMirrors } = resolveMirrors(workspaceRoot, entry);
  const gitDir = path.join(cachePath, ".git");

  if (gitMirrors.length === 0) {
    logger.info(`  No bare mirror for system '${systemId}' — skipping cache clone sync`);
    return;
  }

  const bareRepoPath = resolveMirrorPath(workspaceRoot, gitMirrors[0].path);

  if (existsSync(gitDir)) {
    // Cache clone exists — fetch and reset to origin/master
    logger.info(`  Fetching latest from ${bareRepoPath}…`);
    try {
      execSync("git fetch origin", { cwd: cachePath, stdio: "pipe", timeout: 30_000 });
      const branch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: cachePath,
        encoding: "utf-8",
      }).trim();
      execSync(`git reset --hard origin/${branch}`, {
        cwd: cachePath,
        stdio: "pipe",
        timeout: 30_000,
      });
      logger.info(`  Cache clone synced to origin/${branch}`);
    } catch (err) {
      throw new Error(
        `[mission.materialize] failed to sync cache clone for system '${systemId}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else if (existsSync(cachePath)) {
    // Directory exists but is not a git clone — clone into a temp dir and replace
    logger.info(`  Cloning ${bareRepoPath} into cache clone…`);
    const tmpDir = `${cachePath}.clone-${process.pid}-${Date.now()}`;
    try {
      execSync(`git clone "${bareRepoPath}" "${tmpDir}"`, {
        stdio: "pipe",
        timeout: 60_000,
      });
      // Preserve .env and other untracked files from the old directory
      const oldEntries = await fs.readdir(cachePath, { withFileTypes: true });
      for (const e of oldEntries) {
        if (e.name === ".git") continue;
        const src = path.join(cachePath, e.name);
        const dest = path.join(tmpDir, e.name);
        if (!existsSync(dest)) {
          if (e.isDirectory()) {
            await copyDir(src, dest);
          } else {
            await fs.copyFile(src, dest);
          }
        }
      }
      // Replace old directory with the clone
      await fs.rm(cachePath, { recursive: true, force: true });
      await fs.rename(tmpDir, cachePath);
      logger.info(`  Cache clone populated from ${bareRepoPath}`);
    } catch (err) {
      if (existsSync(tmpDir)) {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
      throw new Error(
        `[mission.materialize] failed to clone cache clone for system '${systemId}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    // Directory doesn't exist — clone directly
    logger.info(`  Cloning ${bareRepoPath} into cache clone…`);
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    try {
      execSync(`git clone "${bareRepoPath}" "${cachePath}"`, {
        stdio: "pipe",
        timeout: 60_000,
      });
      logger.info(`  Cache clone populated from ${bareRepoPath}`);
    } catch (err) {
      throw new Error(
        `[mission.materialize] failed to clone cache clone for system '${systemId}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

interface PreflightValidatorResult {
  command: string;
  ok: boolean;
  exitCode: number;
  summary?: string;
}

interface PreflightReport {
  schemaVersion: "1.0.0";
  missionId: string;
  systemId: string;
  criticalPassed: boolean;
  criticalResults: PreflightValidatorResult[];
  warningResults: PreflightValidatorResult[];
  skipped: boolean;
  ranAt: string;
}

async function runPreflightGate(
  workspaceRoot: string,
  workpieceDir: string,
  systemId: string,
  missionId: string,
  skipPreflight: boolean,
  logger: { info: (msg: string) => void },
): Promise<PreflightReport> {
  const ranAt = new Date().toISOString();
  const evidenceDir = path.join(resolveMissionDir(workspaceRoot, missionId), "evidence");
  await fs.mkdir(evidenceDir, { recursive: true });
  const reportPath = path.join(evidenceDir, "preflight-report.json");

  if (skipPreflight) {
    logger.info(`  Preflight skipped (--skip-preflight)`);
    const report: PreflightReport = {
      schemaVersion: "1.0.0",
      missionId,
      systemId,
      criticalPassed: true,
      criticalResults: [],
      warningResults: [],
      skipped: true,
      ranAt,
    };
    await atomicWriteFile(reportPath, JSON.stringify(report, null, 2) + "\n");
    return report;
  }

  async function runSteps(
    steps: KernelPipelineStep[],
    siteName: string,
  ): Promise<PreflightValidatorResult[]> {
    const results: PreflightValidatorResult[] = [];
    for (const step of steps) {
      logger.info(`  Preflight: ${step.command}…`);
      try {
        const execResult = await executeKernelCommand({
          workspaceRoot,
          commandName: step.command,
          siteName,
          siteExplicit: true,
        });
        const single = Array.isArray(execResult) ? execResult[0] : execResult;
        const ok = single?.ok ?? false;
        const exitCode = single?.exitCode ?? 1;
        const summary = single?.summary ?? "";
        results.push({ command: step.command, ok, exitCode, summary });
        if (!ok) {
          logger.info(`    ${step.command}: FAIL (exit ${exitCode})`);
        } else {
          logger.info(`    ${step.command}: pass`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        results.push({
          command: step.command,
          ok: false,
          exitCode: 1,
          summary: `error: ${errMsg}`,
        });
        logger.info(`    ${step.command}: ERROR — ${errMsg}`);
      }
    }
    return results;
  }

  const criticalResults = await runSteps(MISSION_PREFLIGHT_CRITICAL, systemId);
  const warningResults = await runSteps(MISSION_PREFLIGHT_WARNING, systemId);
  const criticalPassed = criticalResults.every((r) => r.ok);

  const report: PreflightReport = {
    schemaVersion: "1.0.0",
    missionId,
    systemId,
    criticalPassed,
    criticalResults,
    warningResults,
    skipped: false,
    ranAt,
  };
  await atomicWriteFile(reportPath, JSON.stringify(report, null, 2) + "\n");

  if (!criticalPassed) {
    const failures = criticalResults
      .filter((r) => !r.ok)
      .map((r) => `  ${r.command}: ${r.summary ?? "failed"}`)
      .join("\n");
    throw new Error(
      `[mission.materialize] preflight content quality gate FAILED — critical validators did not pass:\n${failures}\n\n` +
        `Workpiece preserved at ${workpieceDir} (no git init). ` +
        `See evidence/preflight-report.json for details. ` +
        `Fix the Sternsystem data set (systems/${systemId}/) and re-run mission.materialize, ` +
        `or use --skip-preflight to bypass (Bordbuch-audited).`,
    );
  }

  const warningFailures = warningResults.filter((r) => !r.ok);
  if (warningFailures.length > 0) {
    logger.info(
      `  Preflight: ${warningFailures.length} warning(s) — see evidence/preflight-report.json`,
    );
  }

  return report;
}

async function ensurePlaywrightChromium(
  workspaceRoot: string,
  logger: { info: (msg: string) => void },
): Promise<void> {
  const home = process.env["HOME"] ?? "/tmp";
  const playwrightCache = path.join(home, ".cache", "ms-playwright");
  let chromiumFound = false;
  if (existsSync(playwrightCache)) {
    try {
      const entries = await fs.readdir(playwrightCache);
      chromiumFound = entries.some((e) => e.startsWith("chromium"));
    } catch {
      chromiumFound = false;
    }
  }
  if (chromiumFound) {
    logger.info(`  Playwright Chromium: already installed`);
    return;
  }
  logger.info(`  Playwright Chromium: not found — installing…`);
  try {
    execSync("pnpm exec playwright install chromium", {
      cwd: workspaceRoot,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000,
    });
    logger.info(`  Playwright Chromium: installed`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.info(
      `  Playwright Chromium: install failed (non-fatal) — ${msg}. ` +
        `Run 'pnpm exec playwright install chromium' manually before build:check.`,
    );
  }
}

export async function runMissionMaterialize(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<MissionMaterializeData>> {
  const { workspaceRoot, logger } = context;
  const missionId = flagString(input, "mission");
  const reportOnly = flagBool(input, "report-only");
  const skipPreflight = flagBool(input, "skip-preflight");

  if (!missionId) throw new Error("[mission.materialize] --mission is required");

  const manifest = await readMissionManifest(workspaceRoot, missionId);

  if (manifest.state !== "open") {
    throw new Error(
      `[mission.materialize] mission '${missionId}' is not open (state: ${manifest.state})`,
    );
  }

  const operationId = manifest.operationId;
  await acquireLock(
    workspaceRoot,
    `system:${manifest.systemId}`,
    operationId,
    "mission.materialize",
    "agent",
  );
  await acquireLock(
    workspaceRoot,
    `mission:${missionId}`,
    operationId,
    "mission.materialize",
    "agent",
  );

  try {
    // RFC-0480: refuse materialization on paused Sternsystem (external edit detection)
    const registry = await readRegistry(workspaceRoot);
    const entry = findEntry(registry, manifest.systemId);
    if (entry?.status === "paused") {
      throw new Error(
        `[mission.materialize] system '${manifest.systemId}' is paused due to external edit detection. Run sternsystem.validate for details.`,
      );
    }

    const systemDir = await resolveCachePath(workspaceRoot, manifest.systemId);

    // RFC-0356 §1.1 step 2: fetch the latest remote state into the cache clone.
    await syncCacheClone(workspaceRoot, manifest.systemId, logger);

    const pinPath = path.join(systemDir, "system.pin.json");

    if (!existsSync(pinPath)) {
      throw new Error(`[mission.materialize] system '${manifest.systemId}' has no system.pin.json`);
    }

    const pinRaw = await fs.readFile(pinPath, "utf8");
    const pin = JSON.parse(pinRaw);
    const pinVersion = pin.platform?.version ?? "unknown";

    // Read current platform version from workspace root package.json
    const workspacePkgPath = path.join(workspaceRoot, "package.json");
    const workspacePkg = JSON.parse(await fs.readFile(workspacePkgPath, "utf8"));
    const platformVersion = workspacePkg.version ?? "unknown";

    // Version comparison (simplified — full implementation would use compareEcosystem)
    let verdict: "in-sync" | "catch-up" | "refuse-downgrade" = "in-sync";
    let message = `in sync at ${pinVersion}; no migration needed.`;

    if (pinVersion > platformVersion) {
      verdict = "refuse-downgrade";
      message = `platform (${platformVersion}) is older than pin (${pinVersion}) — update the platform and retry`;
    } else if (pinVersion < platformVersion) {
      verdict = "catch-up";
      message = `catch-up from ${pinVersion} to ${platformVersion} required`;
    }

    logger.info(`  Version comparison: ${verdict}`);
    logger.info(`  Pin: ${pinVersion}, Platform: ${platformVersion}`);

    if (verdict === "refuse-downgrade") {
      throw new Error(`[mission.materialize] ${message}`);
    }

    if (reportOnly) {
      return {
        data: {
          missionId,
          systemId: manifest.systemId,
          versionComparison: {
            verdict,
            pinVersion,
            platformVersion,
            packagesDrift: false,
            message,
          },
          migratorChain: [],
          capabilityDiff: { tier: "green", items: [] },
          regeneration: { regeneratedFiles: [], success: true },
          materializedAt: new Date().toISOString(),
        },
        summary: `[mission.materialize] ${missionId} report-only: ${verdict}`,
      };
    }

    // Stage Werkstück
    const missionDir = resolveMissionDir(workspaceRoot, missionId);
    const workpieceDir = path.join(missionDir, "workpiece");
    const stagingDir = resolveStagingDir(missionDir, workpieceDir, operationId);

    // Clean any existing staging
    if (existsSync(stagingDir)) {
      await fs.rm(stagingDir, { recursive: true, force: true });
    }
    await fs.mkdir(stagingDir, { recursive: true });

    // RFC-0568: Clone cache clone into staging dir instead of git init.
    // This creates a shared git object database between workpiece and cache clone,
    // enabling git merge --no-ff during reconcile instead of fragile git am patches.
    // Only clone if the cache clone has a .git directory; otherwise fall through to
    // the existing copyDir flow for non-git Sternsystems.
    const hasGitCacheClone = existsSync(path.join(systemDir, ".git"));
    let clonedGitDir: string | null = null;

    if (hasGitCacheClone) {
      // Clone into a temporary directory first, then move .git into staging
      const tempCloneDir = path.join(missionDir, `.clone-${operationId}`);
      if (existsSync(tempCloneDir)) {
        await fs.rm(tempCloneDir, { recursive: true, force: true });
      }
      execSync(`git clone ${JSON.stringify(systemDir)} ${JSON.stringify(tempCloneDir)}`, {
        stdio: ["pipe", "pipe", "pipe"],
      });
      // Move .git from temp clone into staging
      clonedGitDir = path.join(stagingDir, ".git");
      await fs.rename(path.join(tempCloneDir, ".git"), clonedGitDir);
      // Clean up temp clone (everything except .git was moved)
      await fs.rm(tempCloneDir, { recursive: true, force: true });
      logger.info(`  Cloned cache clone git history into staging`);
    }

    // Copy data set from Sternsystem
    for (const dataPath of STERNSYSTEM_DATA_PATHS) {
      const src = path.join(systemDir, dataPath);
      const dest = path.join(stagingDir, dataPath);
      if (!existsSync(src)) continue;
      const stat = await fs.stat(src);
      if (stat.isDirectory()) {
        await copyDir(src, dest);
      } else {
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(src, dest);
      }
      logger.info(`  Copied ${dataPath}`);
    }

    // RFC-0479: copy system.pin.json to workpiece root so mission.migrate can read migratorCursor
    const pinFileSrc = path.join(systemDir, "system.pin.json");
    if (existsSync(pinFileSrc)) {
      await fs.copyFile(pinFileSrc, path.join(stagingDir, "system.pin.json"));
      logger.info(`  Copied system.pin.json`);
    }

    // RFC-0568: After clone, remove ALL non-data-path files from the working tree.
    // The clone brought cache-clone-local files (bordbuch/, etc.) that must not
    // enter the workpiece. Only keep STERNSYSTEM_DATA_PATHS + system.pin.json.
    // The .git directory is preserved (it's in .git/, not in the working tree).
    if (clonedGitDir) {
      const keepPaths = new Set([...STERNSYSTEM_DATA_PATHS, "system.pin.json", ".git"]);
      const stagingEntries = await fs.readdir(stagingDir, { withFileTypes: true });
      for (const entry of stagingEntries) {
        // Check if entry name is an exact match OR a parent directory of any keep path
        // (e.g. "src" is the parent of "src/content")
        const isKeepPath =
          keepPaths.has(entry.name) || [...keepPaths].some((kp) => kp.startsWith(`${entry.name}/`));
        if (!isKeepPath) {
          const entryPath = path.join(stagingDir, entry.name);
          await fs.rm(entryPath, { recursive: true, force: true });
        }
      }
    }

    // Generate full runtime boilerplate from onboarding templates and codegen generators (RFC-0389)
    const regeneratedFiles = await generateFullBoilerplate(
      stagingDir,
      manifest.systemId,
      context,
      logger,
    );

    // Commit staging → workpiece via atomic rename (replace: true handles
    // the old workpiece via rename-to-trash, avoiding EBUSY on Windows).
    await atomicMoveDir(stagingDir, workpieceDir, { replace: true });

    // Set PUBLIC_IMAGE_PROVIDER=build-portable in workpiece .env files so
    // image.variants.generate produces responsive variants during build.prepare.
    // Also set process.env so the kernel command sees it without Astro's dotenv.
    const envFiles = [".env", ".env.main", ".env.alt"];
    for (const envFile of envFiles) {
      const envPath = path.join(workpieceDir, envFile);
      if (existsSync(envPath)) {
        let envContent = await fs.readFile(envPath, "utf8");
        envContent = envContent.replace(
          /^PUBLIC_IMAGE_PROVIDER=.*$/m,
          "PUBLIC_IMAGE_PROVIDER=build-portable",
        );
        await fs.writeFile(envPath, envContent, "utf8");
      }
    }
    process.env["PUBLIC_IMAGE_PROVIDER"] = "build-portable";
    logger.info(`  PUBLIC_IMAGE_PROVIDER set to build-portable in .env files`);

    // Link workpiece into pnpm workspace before build.prepare runs.
    // The fresh workpiece has no node_modules — without this step, workpiece.imports.validate
    // (first step of build.prepare) fails because @warpgogol/* symlinks don't exist yet.
    logger.info(`  Linking workpiece workspace dependencies…`);
    try {
      execSync("pnpm install", {
        cwd: workspaceRoot,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 120_000,
      });
      logger.info(`  Workpiece workspace dependencies linked`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `[mission.materialize] pnpm install failed — workpiece cannot be linked into workspace.\n` +
          `  Error: ${msg}\n` +
          `  Run 'pnpm install' manually at the workspace root, then re-run mission.materialize.`,
      );
    }

    // Ensure Playwright Chromium is installed (needed by build.post → print.pdf.generate
    // and independent-qa). Idempotent — skips if browsers are already present.
    await ensurePlaywrightChromium(workspaceRoot, logger);

    // Run build.prepare pipeline to generate all derived artifacts
    // (surface, sitemap, video/image variants, llms, feed, etc.)
    logger.info(`  Running build.prepare pipeline for ${manifest.systemId}…`);
    const prepareResult = await executeKernelPipeline({
      workspaceRoot,
      pipelineName: "build.prepare",
      siteName: manifest.systemId,
      outputFormat: "pretty",
    });
    const prepareReport = Array.isArray(prepareResult) ? prepareResult[0] : prepareResult;
    if (!prepareReport.ok) {
      const failedSteps = prepareReport.steps
        .filter((s) => !s.ok)
        .map((s) => `${s.commandName} (exit ${s.exitCode})`);
      throw new Error(
        `[mission.materialize] build.prepare pipeline FAILED — ${failedSteps.length} step(s) failed:\n` +
          failedSteps.map((s) => `  - ${s}`).join("\n") +
          `\n\nWorkpiece preserved at ${workpieceDir} (no git init).`,
      );
    }
    logger.info(
      `  build.prepare completed (${prepareReport.steps.length} steps, ${prepareReport.steps.filter((s) => s.ok).length} OK)`,
    );

    // RFC-0517: preflight content quality gate — runs after atomicMoveDir, before git init
    const preflightReport = await runPreflightGate(
      workspaceRoot,
      workpieceDir,
      manifest.systemId,
      missionId,
      skipPreflight,
      logger,
    );

    // RFC-0517: append Bordbuch entry when preflight is skipped
    if (skipPreflight) {
      await appendBordbuchEntry(
        workspaceRoot,
        manifest.systemId,
        "preflight-skipped",
        `Preflight content quality gate skipped via --skip-preflight flag for mission ${missionId}`,
        "agent",
        {
          writerRole: "mission",
          missionId,
          metadata: { reason: "operator override via --skip-preflight flag" },
        },
      );
      logger.info(`  Bordbuch: preflight-skipped entry appended`);
    }

    // RFC-0568: Clone-based materialization — git commit with data-only staging.
    // Only stage STERNSYSTEM_DATA_PATHS + system.pin.json. Boilerplate files remain
    // untracked, ensuring git merge --no-ff during reconcile transfers only data-path
    // changes into the cache clone (DNA-44 Sternsystem data-only contract compliance).
    if (existsSync(path.join(workpieceDir, ".git"))) {
      const dataPathsToAdd = [...STERNSYSTEM_DATA_PATHS, "system.pin.json"];
      for (const dataPath of dataPathsToAdd) {
        const fullPath = path.join(workpieceDir, dataPath);
        if (existsSync(fullPath)) {
          execSync(`git add -- ${JSON.stringify(dataPath)}`, {
            cwd: workpieceDir,
            stdio: ["pipe", "pipe", "pipe"],
          });
        }
      }
      execSync(`git commit -m "materialize from pin ${pinVersion}"`, {
        cwd: workpieceDir,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "mission.materialize",
          GIT_AUTHOR_EMAIL: "mission@warpgogol.local",
          GIT_COMMITTER_NAME: "mission.materialize",
          GIT_COMMITTER_EMAIL: "mission@warpgogol.local",
        },
      });
      logger.info(`  Git commit created in workpiece (data-only, on top of cloned history)`);
    } else {
      // RFC-0568: Non-git cache clone fallback — use git init (no shared history)
      execSync("git init", { cwd: workpieceDir, stdio: ["pipe", "pipe", "pipe"] });
      const dataPathsToAdd = [...STERNSYSTEM_DATA_PATHS, "system.pin.json"];
      for (const dataPath of dataPathsToAdd) {
        const fullPath = path.join(workpieceDir, dataPath);
        if (existsSync(fullPath)) {
          execSync(`git add -- ${JSON.stringify(dataPath)}`, {
            cwd: workpieceDir,
            stdio: ["pipe", "pipe", "pipe"],
          });
        }
      }
      execSync(`git commit -m "materialize from pin ${pinVersion}"`, {
        cwd: workpieceDir,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "mission.materialize",
          GIT_AUTHOR_EMAIL: "mission@warpgogol.local",
          GIT_COMMITTER_NAME: "mission.materialize",
          GIT_COMMITTER_EMAIL: "mission@warpgogol.local",
        },
      });
      logger.info(
        `  Git initialized in workpiece with initial commit (non-git cache clone fallback)`,
      );
    }

    // Write materialization report
    const evidenceDir = path.join(missionDir, "evidence");
    await fs.mkdir(evidenceDir, { recursive: true });
    const now = new Date().toISOString();
    const report = {
      schemaVersion: "1.0.0",
      missionId,
      systemId: manifest.systemId,
      versionComparison: { verdict, pinVersion, platformVersion, packagesDrift: false, message },
      migratorChain: [],
      capabilityDiff: { tier: "green" as const, items: [] },
      regeneration: { regeneratedFiles, success: true },
      buildPrepare: {
        steps: prepareReport.steps.length,
        passed: prepareReport.steps.filter((s) => s.ok).length,
        failed: prepareReport.steps.filter((s) => !s.ok).length,
      },
      materializedAt: now,
    };
    await atomicWriteFile(
      path.join(evidenceDir, "materialization-report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );

    // Update mission manifest
    manifest.materializedAt = now;
    await writeMissionManifest(workspaceRoot, manifest);

    return {
      data: report,
      summary: `[mission.materialize] ${missionId} materialized (${verdict}, green)`,
    };
  } finally {
    await releaseLock(workspaceRoot, `mission:${missionId}`);
    await releaseLock(workspaceRoot, `system:${manifest.systemId}`);
  }
}
