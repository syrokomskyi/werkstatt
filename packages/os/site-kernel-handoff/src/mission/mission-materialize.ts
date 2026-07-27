/*
<MODULE_CONTRACT>
<purpose>RFC-0356 §1: mission.materialize — populate Werkstück from pinned Sternsystem bundle.</purpose>
<non-goals>
  <item>Does not define mission lifecycle — that is RFC-0355.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0356: initial mission.materialize command handler.</item>
  <item>RFC-0389: replace minimal inline stubs with full boilerplate generation using @gogol/site-kernel-codegen generators and @gogol/site-kernel-onboarding templates.</item>
  <item>RFC-0388: generate .env.example via env.example.generate and copy to .env.main/.env.alt (DNA-40 env-and-deploy contract).</item>
  <item>RFC-0480: add paused status guard; init git in workpiece and commit materialized state.</item>
  <item>RFC-0517: add preflight content quality gate between atomicMoveDir and git init.</item>
  <item>Run build.prepare pipeline after atomicMoveDir to generate all derived artifacts (surface, sitemap, video/image variants, etc.) before git init.</item>
  <item>Set PUBLIC_IMAGE_PROVIDER=build-portable in workpiece .env files so image.variants.generate produces responsive variants.</item>
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
} from "@gogol/site-kernel";
import { runKernelWire, executeKernelCommand, executeKernelPipeline } from "@gogol/site-kernel";
import { readRegistry, findEntry } from "../sternsystem/registry-io.ts";
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
} from "@gogol/site-kernel-codegen";
import { applyTokens, readTemplate, readRuntimeTemplate } from "@gogol/site-kernel-onboarding";
import {
  runEnvExampleGenerate,
  MISSION_PREFLIGHT_CRITICAL,
  MISSION_PREFLIGHT_WARNING,
} from "@gogol/site-kernel-checks";
import { readMissionManifest, writeMissionManifest, resolveMissionDir } from "./mission-io.ts";
import { acquireLock, releaseLock, generateOperationId } from "../werkstatt/index.ts";
import { atomicMoveDir, atomicWriteFile, resolveStagingDir } from "../werkstatt/atomic.ts";
import { appendBordbuchEntry } from "../bordbuch/bordbuch-io.ts";
import type { KernelPipelineStep } from "@gogol/site-kernel";

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
 * RFC-0356 §1.1 step 2: sync the cache clone at systems/<id>/ from the Sternsystem's
 * remote repo. If the cache clone has a .git directory, fetch + reset to origin/master.
 * If not but the registry has a repo URL, clone it. If no repo URL, skip (offline mode).
 */
async function syncCacheClone(
  workspaceRoot: string,
  systemId: string,
  logger: { info: (msg: string) => void },
): Promise<void> {
  const systemDir = path.join(workspaceRoot, "systems", systemId);
  const gitDir = path.join(systemDir, ".git");

  const registry = await readRegistry(workspaceRoot);
  const entry = findEntry(registry, systemId);
  if (!entry?.repo) {
    logger.info(`  No repo URL for system '${systemId}' — skipping cache clone sync`);
    return;
  }

  const repoUrl = entry.repo.startsWith("local:")
    ? path.resolve(workspaceRoot, entry.repo.slice("local:".length))
    : entry.repo;

  if (existsSync(gitDir)) {
    // Cache clone exists — fetch and reset to origin/master
    logger.info(`  Fetching latest from ${repoUrl}…`);
    try {
      execSync("git fetch origin", { cwd: systemDir, stdio: "pipe", timeout: 30_000 });
      const branch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: systemDir,
        encoding: "utf-8",
      }).trim();
      execSync(`git reset --hard origin/${branch}`, {
        cwd: systemDir,
        stdio: "pipe",
        timeout: 30_000,
      });
      logger.info(`  Cache clone synced to origin/${branch}`);
    } catch (err) {
      throw new Error(
        `[mission.materialize] failed to sync cache clone for system '${systemId}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else if (existsSync(systemDir)) {
    // Directory exists but is not a git clone — clone into a temp dir and replace
    logger.info(`  Cloning ${repoUrl} into cache clone…`);
    const tmpDir = `${systemDir}.clone-${process.pid}-${Date.now()}`;
    try {
      execSync(`git clone "${repoUrl}" "${tmpDir}"`, {
        stdio: "pipe",
        timeout: 60_000,
      });
      // Preserve .env and other untracked files from the old directory
      const oldEntries = await fs.readdir(systemDir, { withFileTypes: true });
      for (const entry of oldEntries) {
        if (entry.name === ".git") continue;
        const src = path.join(systemDir, entry.name);
        const dest = path.join(tmpDir, entry.name);
        if (!existsSync(dest)) {
          if (entry.isDirectory()) {
            await copyDir(src, dest);
          } else {
            await fs.copyFile(src, dest);
          }
        }
      }
      // Replace old directory with the clone
      await fs.rm(systemDir, { recursive: true, force: true });
      await fs.rename(tmpDir, systemDir);
      logger.info(`  Cache clone populated from ${repoUrl}`);
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
    logger.info(`  Cloning ${repoUrl} into cache clone…`);
    await fs.mkdir(path.dirname(systemDir), { recursive: true });
    try {
      execSync(`git clone "${repoUrl}" "${systemDir}"`, {
        stdio: "pipe",
        timeout: 60_000,
      });
      logger.info(`  Cache clone populated from ${repoUrl}`);
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

    const systemDir = path.join(workspaceRoot, "systems", manifest.systemId);

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

    // RFC-0480: init git in workpiece and commit materialized state
    execSync("git init", { cwd: workpieceDir, stdio: ["pipe", "pipe", "pipe"] });
    execSync("git add -A", { cwd: workpieceDir, stdio: ["pipe", "pipe", "pipe"] });
    execSync(`git commit -m "materialize from pin ${pinVersion}"`, {
      cwd: workpieceDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "mission.materialize",
        GIT_AUTHOR_EMAIL: "mission@wgogol.local",
        GIT_COMMITTER_NAME: "mission.materialize",
        GIT_COMMITTER_EMAIL: "mission@wgogol.local",
      },
    });
    logger.info(`  Git initialized in workpiece with initial commit`);

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
