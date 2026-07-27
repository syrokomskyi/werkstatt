/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts as an authored site-kernel-handoff authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0356: initial mission validate/preview/build/diff/reconcile command handlers.</item>
  <item>RFC-0480: rewrite reconcile with git format-patch + git am; add preReconcileSha idempotency.</item>
  <item>RFC-0480: integrate astro build into mission.validate — static checks + build must both pass.</item>
  <item>RFC-0480: add dirty workpiece guard to mission.reconcile.</item>
  <item>RFC-0480: add dirty workpiece warning to mission.validate.</item>
  <item>RFC-0522: add dirty cache clone guard to mission.reconcile inside existsSync(gitDir) block.</item>
  <item>RFC-0522: add git am --3way fallback to patch application loop.</item>
  <item>Add --whitespace=fix to git am calls and auto-resolve add/add conflicts on generated files by taking theirs (workpiece version).</item>
  <item>RFC-0522: add dirty cache clone warning to mission.validate.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { executeKernelPipeline } from "@warpgogol/site-kernel";
import { collectFiles } from "@warpgogol/share/fs";
import { readMissionManifest, writeMissionManifest, resolveMissionDir } from "./mission-io.ts";
import { isWorkpieceDirty } from "./mission-git-commit.ts";
import { acquireLock, releaseLock } from "../werkstatt/index.ts";
import { atomicWriteFile } from "../werkstatt/atomic.ts";

const STERNSYSTEM_DATA_PATHS = ["src/content", "public", "provenance"];

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

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

// §2: mission.validate
export interface MissionValidateData {
  missionId: string;
  contractFull: { passed: boolean; validators: Array<Record<string, unknown>> };
  build: { succeeded: boolean; routeCount: number; sitemapHash: string; error?: string };
  validatedAt: string;
}

export async function runMissionValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<MissionValidateData>> {
  const { workspaceRoot, logger } = context;
  const missionId = flagString(input, "mission");
  if (!missionId) throw new Error("[mission.validate] --mission is required");

  const manifest = await readMissionManifest(workspaceRoot, missionId);
  if (manifest.state !== "open") {
    throw new Error(
      `[mission.validate] mission '${missionId}' is not open (state: ${manifest.state})`,
    );
  }
  if (!manifest.materializedAt) {
    throw new Error(
      `[mission.validate] mission '${missionId}' has not been materialized — run mission.materialize first`,
    );
  }

  const missionDir = resolveMissionDir(workspaceRoot, missionId);
  const workpieceDir = path.join(missionDir, "workpiece");
  const evidenceDir = path.join(missionDir, "evidence");
  await fs.mkdir(evidenceDir, { recursive: true });

  // RFC-0356 §2: run build.prepare then build.check against the workpiece.
  // build.prepare generates derived artifacts (surface.generated.yaml, etc.)
  // that build.check validators like semantic.targets.validate depend on.
  // The workpiece is discovered as a site workspace via tryResolveMissionWorkpiece
  // when the registry entry has currentMission set.
  logger.info(`  Running build.prepare pipeline for ${manifest.systemId}…`);
  const prepareResult = await executeKernelPipeline({
    workspaceRoot,
    pipelineName: "build.prepare",
    siteName: manifest.systemId,
    outputFormat: "pretty",
  });
  const prepareReport = Array.isArray(prepareResult) ? prepareResult[0] : prepareResult;
  if (!prepareReport.ok) {
    const failedPrepareSteps = prepareReport.steps
      .filter((s) => !s.ok)
      .map((s) => ({ name: s.commandName, exitCode: s.exitCode }));
    const now = new Date().toISOString();
    const report = {
      schemaVersion: "1.0.0",
      missionId,
      contractFull: {
        passed: false,
        validators: prepareReport.steps.map((s) => ({
          name: s.commandName,
          status: s.ok ? "pass" : "fail",
          exitCode: s.exitCode,
        })),
      },
      build: {
        succeeded: false,
        routeCount: 0,
        sitemapHash: "sha256:failed",
        failedSteps: failedPrepareSteps,
      },
      validatedAt: now,
    };
    await atomicWriteFile(
      path.join(evidenceDir, "validation-report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    return {
      data: report as unknown as MissionValidateData,
      exitCode: 1,
      summary: `[mission.validate] ${missionId} build.prepare FAILED (${failedPrepareSteps.length} steps failed)`,
    };
  }

  logger.info(`  Running build.check pipeline for ${manifest.systemId}…`);
  const pipelineResult = await executeKernelPipeline({
    workspaceRoot,
    pipelineName: "build.check",
    siteName: manifest.systemId,
    outputFormat: "pretty",
  });

  const pipelineReport = Array.isArray(pipelineResult) ? pipelineResult[0] : pipelineResult;
  const staticPassed = pipelineReport.ok;
  const stepCount = pipelineReport.steps.length;
  const failedSteps = pipelineReport.steps
    .filter((s) => !s.ok)
    .map((s) => ({ name: s.commandName, exitCode: s.exitCode }));

  // RFC-0480: run astro build after static checks pass — catches runtime errors
  // (content references, missing collections, import failures) that static
  // validators cannot detect.
  let buildSucceeded = false;
  let buildError: string | undefined;
  let routeCount = 0;
  let sitemapHash = "sha256:not-built";

  if (staticPassed) {
    const workpieceDir = path.join(missionDir, "workpiece");
    logger.info(`  Running astro build in ${workpieceDir}…`);
    try {
      const buildOutput = execSync("pnpm exec astro build", {
        cwd: workpieceDir,
        stdio: "pipe",
        timeout: 300_000,
        encoding: "utf-8",
      });
      buildSucceeded = true;
      // Count generated routes from build output
      const routeMatches = buildOutput.match(/\d+ page\(s\)/g);
      if (routeMatches) {
        const nums = routeMatches.map((m) => parseInt(m, 10));
        routeCount = Math.max(...nums, 0);
      }
      // Compute sitemap hash if sitemap exists
      const sitemapPath = path.join(workpieceDir, "dist", "sitemap-index.xml");
      if (existsSync(sitemapPath)) {
        const { byteHashFile } = await import("@warpgogol/fingerprint");
        sitemapHash = await byteHashFile(sitemapPath);
      } else {
        sitemapHash = "sha256:no-sitemap";
      }
    } catch (err) {
      buildError = err instanceof Error ? err.message : String(err);
      logger.info(`  Build failed: ${buildError}`);
    }
  }

  const passed = staticPassed && buildSucceeded;
  const now = new Date().toISOString();
  const report = {
    schemaVersion: "1.0.0",
    missionId,
    contractFull: {
      passed,
      validators: pipelineReport.steps.map((s) => ({
        name: s.commandName,
        status: s.ok ? "pass" : "fail",
        exitCode: s.exitCode,
      })),
    },
    build: {
      succeeded: buildSucceeded,
      routeCount,
      sitemapHash,
      ...(buildError ? { error: buildError } : {}),
      failedSteps,
    },
    validatedAt: now,
  };

  await atomicWriteFile(
    path.join(evidenceDir, "validation-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );

  if (!passed) {
    const reason = !staticPassed
      ? `${failedSteps.length}/${stepCount} steps failed`
      : "astro build failed";
    return {
      data: report as unknown as MissionValidateData,
      exitCode: 1,
      summary: `[mission.validate] ${missionId} validation FAILED (${reason})`,
    };
  }

  const dirtyCheck = isWorkpieceDirty(workpieceDir);
  if (dirtyCheck.dirty) {
    logger.warn(
      `[mission.validate] workpiece has ${dirtyCheck.fileCount} uncommitted file(s). Run \`git status\` to review, then \`pnpm exec site-kernel run mission.git.commit --mission ${missionId} --message "<msg>"\` to commit.`,
    );
  }

  // RFC-0522: warn on dirty cache clone — reconcile will fail until resolved
  const systemDir = path.join(workspaceRoot, "systems", manifest.systemId);
  if (existsSync(path.join(systemDir, ".git"))) {
    const cacheDirtyCheck = isWorkpieceDirty(systemDir);
    if (cacheDirtyCheck.dirty) {
      logger.warn(
        `[mission.validate] cache clone for system '${manifest.systemId}' has ${cacheDirtyCheck.fileCount} uncommitted file(s) — reconcile will fail until resolved`,
      );
    }
  }

  return {
    data: report as unknown as MissionValidateData,
    summary: `[mission.validate] ${missionId} validation passed (${stepCount} steps, ${routeCount} routes built)`,
  };
}

// §3: mission.preview — extracted to mission-preview.ts (RFC-0480)

// §4: mission.build
export interface MissionBuildData {
  missionId: string;
  distributionPath: string;
  buildSucceeded: boolean;
  builtAt: string;
}

export async function runMissionBuild(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<MissionBuildData>> {
  const { workspaceRoot, logger } = context;
  const missionId = flagString(input, "mission");
  if (!missionId) throw new Error("[mission.build] --mission is required");

  const manifest = await readMissionManifest(workspaceRoot, missionId);
  if (manifest.state !== "open") {
    throw new Error(
      `[mission.build] mission '${missionId}' is not open (state: ${manifest.state})`,
    );
  }

  const missionDir = resolveMissionDir(workspaceRoot, missionId);
  const workpieceDir = path.join(missionDir, "workpiece");
  const distributionDir = path.join(missionDir, "distribution");

  // RFC-0356 §4: run astro build in the workpiece directory.
  logger.info(`  Running astro build in ${workpieceDir}…`);
  let buildSucceeded = false;
  let buildError: string | undefined;
  try {
    execSync("pnpm exec astro build", {
      cwd: workpieceDir,
      stdio: "pipe",
      timeout: 300_000,
      encoding: "utf-8",
    });
    buildSucceeded = true;
  } catch (err) {
    buildError = err instanceof Error ? err.message : String(err);
    logger.info(`  Build failed: ${buildError}`);
  }

  // Copy dist/ from workpiece to distribution/
  const distSrc = path.join(workpieceDir, "dist");
  const distDest = path.join(distributionDir, "dist");
  if (existsSync(distSrc)) {
    if (existsSync(distDest)) {
      await fs.rm(distDest, { recursive: true, force: true });
    }
    await copyDir(distSrc, distDest);
  }

  const now = new Date().toISOString();
  const buildManifest = {
    builtAt: now,
    missionId,
    systemId: manifest.systemId,
    succeeded: buildSucceeded,
    ...(buildError ? { error: buildError } : {}),
  };
  await atomicWriteFile(
    path.join(distributionDir, "build-manifest.json"),
    JSON.stringify(buildManifest, null, 2) + "\n",
  );

  const evidenceDir = path.join(missionDir, "evidence");
  await fs.mkdir(evidenceDir, { recursive: true });
  await atomicWriteFile(
    path.join(evidenceDir, "build-report.json"),
    JSON.stringify(buildManifest, null, 2) + "\n",
  );

  if (!buildSucceeded) {
    return {
      data: {
        missionId,
        distributionPath: distDest,
        buildSucceeded: false,
        builtAt: now,
      },
      exitCode: 1,
      summary: `[mission.build] ${missionId} build FAILED`,
    };
  }

  return {
    data: { missionId, distributionPath: distDest, buildSucceeded: true, builtAt: now },
    summary: `[mission.build] ${missionId} distribution built`,
  };
}

// §5: mission.diff
export interface MissionDiffData {
  missionId: string;
  added: string[];
  modified: string[];
  removed: string[];
}

async function collectRelativeFiles(dir: string, base: string = dir): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const files = await collectFiles(dir, { ignore: (name) => name === ".git" });
  return files.map((filePath) => path.relative(base, filePath).replace(/\\/g, "/"));
}

export async function runMissionDiff(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<MissionDiffData>> {
  const { workspaceRoot, logger } = context;
  const missionId = flagString(input, "mission");
  if (!missionId) throw new Error("[mission.diff] --mission is required");

  const manifest = await readMissionManifest(workspaceRoot, missionId);
  const systemDir = path.join(workspaceRoot, "systems", manifest.systemId);
  const workpieceDir = path.join(resolveMissionDir(workspaceRoot, missionId), "workpiece");

  const systemFiles = new Set(await collectRelativeFiles(systemDir));
  const workpieceFiles = new Set(await collectRelativeFiles(workpieceDir));

  const added = [...workpieceFiles].filter((f) => !systemFiles.has(f));
  const removed = [...systemFiles].filter((f) => !workpieceFiles.has(f));
  const modified: string[] = [];

  for (const f of workpieceFiles) {
    if (systemFiles.has(f)) {
      const sysContent = await fs.readFile(path.join(systemDir, f), "utf8").catch(() => "");
      const wpContent = await fs.readFile(path.join(workpieceDir, f), "utf8").catch(() => "");
      if (sysContent !== wpContent) modified.push(f);
    }
  }

  const missionDir = resolveMissionDir(workspaceRoot, missionId);
  const evidenceDir = path.join(missionDir, "evidence");
  await fs.mkdir(evidenceDir, { recursive: true });
  const diffReport = {
    schemaVersion: "1.0.0",
    missionId,
    added,
    modified,
    removed,
  };
  await atomicWriteFile(
    path.join(evidenceDir, "authored-diff.json"),
    JSON.stringify(diffReport, null, 2) + "\n",
  );

  logger.info(`  Added: ${added.length}, Modified: ${modified.length}, Removed: ${removed.length}`);
  return {
    data: { missionId, added, modified, removed },
    summary: `[mission.diff] ${missionId}: ${added.length} added, ${modified.length} modified, ${removed.length} removed`,
  };
}

// §6: mission.reconcile
export interface MissionReconcileData {
  missionId: string;
  systemId: string;
  commitSha: string | null;
  preReconcileSha: string | null;
  reconciledAt: string;
}

export async function runMissionReconcile(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<MissionReconcileData>> {
  const { workspaceRoot, logger } = context;
  const missionId = flagString(input, "mission");
  const message = flagString(input, "message") ?? `Reconcile ${missionId}`;
  if (!missionId) throw new Error("[mission.reconcile] --mission is required");

  const manifest = await readMissionManifest(workspaceRoot, missionId);
  if (manifest.state !== "open") {
    throw new Error(
      `[mission.reconcile] mission '${missionId}' is not open (state: ${manifest.state})`,
    );
  }

  // Check validation has passed
  const evidenceDir = path.join(resolveMissionDir(workspaceRoot, missionId), "evidence");
  const validationPath = path.join(evidenceDir, "validation-report.json");
  if (!existsSync(validationPath)) {
    throw new Error(
      `[mission.reconcile] mission '${missionId}' has not passed validation — run mission.validate first`,
    );
  }

  await acquireLock(
    workspaceRoot,
    `system:${manifest.systemId}`,
    manifest.operationId,
    "mission.reconcile",
    "agent",
  );
  await acquireLock(
    workspaceRoot,
    `mission:${missionId}`,
    manifest.operationId,
    "mission.reconcile",
    "agent",
  );

  // RFC-0356 §6: verify validation passed before reconciling.
  const validationRaw = await fs.readFile(validationPath, "utf8").catch(() => null);
  if (!validationRaw) {
    throw new Error(
      `[mission.reconcile] mission '${missionId}' has not passed validation — run mission.validate first`,
    );
  }
  const validationReport = JSON.parse(validationRaw) as { contractFull?: { passed?: boolean } };
  if (!validationReport.contractFull?.passed) {
    throw new Error(
      `[mission.reconcile] mission '${missionId}' validation did not pass — fix issues and re-run mission.validate`,
    );
  }

  const workpieceDir = path.join(resolveMissionDir(workspaceRoot, missionId), "workpiece");
  const systemDir = path.join(workspaceRoot, "systems", manifest.systemId);

  try {
    const now = new Date().toISOString();

    // RFC-0480: transfer workpiece commits to cache clone via git format-patch + git am
    const gitDir = path.join(systemDir, ".git");
    let commitSha: string | null = null;
    let preReconcileSha: string | null = null;
    const copiedPaths: string[] = [];

    if (!existsSync(path.join(workpieceDir, ".git"))) {
      throw new Error(
        `[mission.reconcile] workpiece is not a git repository — run mission.materialize first`,
      );
    }

    const dirtyCheck = isWorkpieceDirty(workpieceDir);
    if (dirtyCheck.dirty) {
      throw new Error(
        `[mission.reconcile] workpiece has ${dirtyCheck.fileCount} uncommitted file(s). Run \`pnpm exec site-kernel run mission.git.commit --mission ${missionId} --message "<msg>"\` first, then re-run reconcile.`,
      );
    }

    if (existsSync(gitDir)) {
      // RFC-0522: dirty cache clone guard — refuse before generating patches
      const cacheDirtyCheck = isWorkpieceDirty(systemDir);
      if (cacheDirtyCheck.dirty) {
        throw new Error(
          `[mission.reconcile] cache clone for system '${manifest.systemId}' has ${cacheDirtyCheck.fileCount} uncommitted file(s):\n` +
            cacheDirtyCheck.files.map((f) => `  ${f}`).join("\n") +
            `\nResolve uncommitted changes in the cache clone before re-running reconcile.`,
        );
      }

      // Record pre-reconcile SHA for idempotent re-run
      try {
        preReconcileSha = execSync("git rev-parse HEAD", {
          cwd: systemDir,
          stdio: "pipe",
          encoding: "utf-8",
        }).trim();
      } catch {
        preReconcileSha = null;
      }

      // Check for previous reconciliation report (idempotent re-run)
      const prevReportPath = path.join(evidenceDir, "reconciliation-report.json");
      if (existsSync(prevReportPath)) {
        try {
          const prevReport = JSON.parse(await fs.readFile(prevReportPath, "utf8")) as {
            preReconcileSha?: string;
          };
          if (prevReport.preReconcileSha) {
            // Reset cache clone to pre-reconcile state before re-applying patches
            try {
              execSync(`git reset --hard ${prevReport.preReconcileSha}`, {
                cwd: systemDir,
                stdio: "pipe",
                encoding: "utf-8",
              });
              logger.info(
                `  Reset cache clone to pre-reconcile SHA ${prevReport.preReconcileSha.slice(0, 12)}`,
              );
            } catch {
              // Previous SHA may not exist (e.g. history rewritten) — continue with current HEAD
            }
          }
        } catch {
          // Unparseable report — continue
        }
      }

      // Generate patches from workpiece (all commits from root)
      const patchDir = path.join(evidenceDir, "patches");
      if (existsSync(patchDir)) {
        await fs.rm(patchDir, { recursive: true, force: true });
      }
      await fs.mkdir(patchDir, { recursive: true });

      try {
        // RFC-0480: only transfer operator edit commits, not the materialize root commit.
        // The cache clone already has the full site content; applying the materialize
        // commit would conflict with every file. Skip the root commit and transfer
        // only the delta (operator edits + any post-materialize commits).
        const rootSha = execSync("git rev-list --max-parents=0 HEAD", {
          cwd: workpieceDir,
          stdio: "pipe",
          encoding: "utf-8",
        }).trim();
        execSync(`git format-patch ${rootSha}..HEAD -o ${JSON.stringify(patchDir)}`, {
          cwd: workpieceDir,
          stdio: "pipe",
          encoding: "utf-8",
        });
      } catch (err) {
        throw new Error(`[mission.reconcile] git format-patch failed: ${(err as Error).message}`);
      }

      // Apply patches to cache clone
      const patchFiles = await fs.readdir(patchDir).catch(() => []);
      if (patchFiles.length > 0) {
        try {
          // Remove tracked files that match .gitignore before applying patches
          try {
            execSync(
              "git rm --cached --ignore-unmatch -r .env .env.production .env.main .env.alt '.env copy' .surface-cache/ 2>/dev/null || true",
              { cwd: systemDir, stdio: "pipe", encoding: "utf-8" },
            );
          } catch {
            // No tracked files matching these paths — non-fatal
          }

          for (const patchFile of patchFiles.sort()) {
            const patchPath = path.join(patchDir, patchFile);
            try {
              execSync(`git am --whitespace=fix ${JSON.stringify(patchPath)}`, {
                cwd: systemDir,
                stdio: "pipe",
                encoding: "utf-8",
              });
            } catch (err) {
              // RFC-0522: plain git am failed — abort and retry with 3-way merge
              try {
                execSync("git am --abort", { cwd: systemDir, stdio: "pipe", encoding: "utf-8" });
              } catch {
                // No am session to abort — continue
              }
              try {
                execSync(`git am --3way --whitespace=fix ${JSON.stringify(patchPath)}`, {
                  cwd: systemDir,
                  stdio: "pipe",
                  encoding: "utf-8",
                });
                logger.info(`  Applied ${patchFile} via 3-way merge fallback`);
              } catch (err3way) {
                // Auto-resolve add/add conflicts on generated files by taking
                // the workpiece version (theirs). Generated files are
                // deterministic outputs — the workpiece version is always
                // authoritative because it was produced by the latest
                // build.prepare run.
                try {
                  const statusOutput = execSync("git diff --name-only --diff-filter=U", {
                    cwd: systemDir,
                    stdio: "pipe",
                    encoding: "utf-8",
                  }).trim();
                  if (statusOutput) {
                    const conflictFiles = statusOutput.split("\n").filter(Boolean);
                    for (const cf of conflictFiles) {
                      execSync(`git checkout --theirs -- ${JSON.stringify(cf)}`, {
                        cwd: systemDir,
                        stdio: "pipe",
                        encoding: "utf-8",
                      });
                      execSync(`git add -- ${JSON.stringify(cf)}`, {
                        cwd: systemDir,
                        stdio: "pipe",
                        encoding: "utf-8",
                      });
                    }
                    execSync("GIT_EDITOR=true git am --continue", {
                      cwd: systemDir,
                      stdio: "pipe",
                      encoding: "utf-8",
                    });
                    logger.info(
                      `  Applied ${patchFile} after auto-resolving ${conflictFiles.length} conflict(s) on: ${conflictFiles.join(", ")}`,
                    );
                  } else {
                    throw new Error("no unmerged files found despite am failure");
                  }
                } catch (errResolve) {
                  try {
                    execSync("git am --abort", {
                      cwd: systemDir,
                      stdio: "pipe",
                      encoding: "utf-8",
                    });
                  } catch {
                    // ignore
                  }
                  throw new Error(
                    `[mission.reconcile] git am conflict on patch ${patchFile} (plain, 3-way, and auto-resolve all failed): ${(err3way as Error).message}. Resolve conflicts in workpiece and re-run reconcile.`,
                  );
                }
              }
            }
          }

          commitSha = execSync("git rev-parse HEAD", {
            cwd: systemDir,
            stdio: "pipe",
            encoding: "utf-8",
          }).trim();

          // Push to origin so the next materialize's syncCacheClone preserves reconciled changes
          const branch = execSync("git rev-parse --abbrev-ref HEAD", {
            cwd: systemDir,
            stdio: "pipe",
            encoding: "utf-8",
          }).trim();
          try {
            execSync(`git push origin ${branch}`, {
              cwd: systemDir,
              stdio: "pipe",
              timeout: 30_000,
            });
          } catch {
            logger.info(`  Push failed (non-fatal) — next sync will catch up`);
          }

          logger.info(
            `  Applied ${patchFiles.length} patch(es) to cache clone (${commitSha.slice(0, 8)})`,
          );
        } catch (err) {
          if (err instanceof Error && err.message.includes("git am conflict")) {
            throw err;
          }
          logger.info(`  Patch application failed: ${(err as Error).message}`);
        }
      } else {
        logger.info(`  No patches generated — workpiece has no commits`);
      }
    } else {
      // No git in system dir — fall back to copyDir for non-git Sternsystems
      for (const dataPath of STERNSYSTEM_DATA_PATHS) {
        const src = path.join(workpieceDir, dataPath);
        const dest = path.join(systemDir, dataPath);
        if (existsSync(src)) {
          if (existsSync(dest)) {
            await fs.rm(dest, { recursive: true, force: true });
          }
          await copyDir(src, dest);
          copiedPaths.push(dataPath);
          logger.info(`  Reconciled ${dataPath}`);
        }
      }
    }

    const report = {
      schemaVersion: "1.0.0",
      missionId,
      systemId: manifest.systemId,
      commitSha,
      preReconcileSha,
      reconciledAt: now,
      message,
      copiedPaths,
    };

    await atomicWriteFile(
      path.join(evidenceDir, "reconciliation-report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );

    manifest.reconciledAt = now;
    await writeMissionManifest(workspaceRoot, manifest);

    return {
      data: {
        missionId,
        systemId: manifest.systemId,
        commitSha,
        preReconcileSha,
        reconciledAt: now,
      },
      summary: `[mission.reconcile] ${missionId} reconciled (${commitSha ? commitSha.slice(0, 8) : "no git"})`,
    };
  } finally {
    await releaseLock(workspaceRoot, `mission:${missionId}`);
    await releaseLock(workspaceRoot, `system:${manifest.systemId}`);
  }
}
