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
  <item>RFC-0560: use resolveActor(input) in mission.reconcile for actor resolution with --actor-from-auth flag.</item>
  <item>RFC-0568: replace git format-patch + git am with git merge --no-ff; remove 3-way fallback and auto-resolve; add untracked file investigation; use dynamic branch name; add push retry with exponential backoff.</item>
  <item>RFC-0578: add structured BUILD-01 diagnostic with pattern matching for common Astro build failures in mission.validate.</item>
  <item>RFC-0579: populate nextSteps in mission.validate for pass, fail, and dirty-workpiece states.</item>
  <item>RFC-0580: auto-commit werkstatt side-effects (mission.yaml) after writeMissionManifest in mission.reconcile.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelNextStep,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { executeKernelPipeline } from "@warpgogol/site-kernel";
import { collectFiles } from "@warpgogol/share/fs";
import { readMissionManifest, writeMissionManifest, resolveMissionDir } from "./mission-io.ts";
import { isWorkpieceDirty, investigateUntrackedFiles } from "./mission-git-commit.ts";
import { acquireLock, releaseLock, commitWerkstattSideEffects } from "../werkstatt/index.ts";
import { atomicWriteFile } from "../werkstatt/atomic.ts";
import { resolveActor } from "./actor-identity.ts";
import { resolveCachePath } from "../sternsystem/registry-io.ts";

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
  diagnostics?: Diagnostic[];
  validatedAt: string;
}

interface BuildFailurePattern {
  id: string;
  test: (errorOutput: string) => boolean;
  fixHint: string;
  excerpt: (errorOutput: string) => string;
}

function extractErrorLine(output: string, pattern: RegExp): string {
  const lines = output.split("\n");
  const matchLine = lines.find((l) => pattern.test(l));
  return (matchLine ?? lines[0] ?? "").trim().slice(0, 200);
}

const BUILD_FAILURE_PATTERNS: BuildFailurePattern[] = [
  {
    id: "enoent-system-manifest",
    test: (out) => /ENOENT.*system\.md|loadSystemManifestSync.*not found/i.test(out),
    fixHint:
      "Guard loadSystemManifestSync with import.meta.env.DEV — it resolves __dirname differently during prerender. See middleware.template.ts.",
    excerpt: (out) => extractErrorLine(out, /ENOENT|loadSystemManifestSync/i),
  },
  {
    id: "module-not-found",
    test: (out) => /Cannot find module|Module not found|ERR_MODULE_NOT_FOUND/i.test(out),
    fixHint:
      "Check the import path in the file shown above. If it's a workspace package, run pnpm install. If it's a relative path, verify the file exists.",
    excerpt: (out) => extractErrorLine(out, /Cannot find module|Module not found/i),
  },
  {
    id: "content-schema-error",
    test: (out) => /schema|frontmatter|collection.*error|ZodError/i.test(out),
    fixHint:
      "Check the frontmatter of the file shown above against its content collection schema. Look for missing required fields or type mismatches.",
    excerpt: (out) => extractErrorLine(out, /schema|frontmatter|ZodError/i),
  },
  {
    id: "typescript-error",
    test: (out) => /error TS\d+:|Type .* is not assignable/i.test(out),
    fixHint:
      "Fix the TypeScript type mismatch in the file shown above. Check the component props schema or the type declaration.",
    excerpt: (out) => extractErrorLine(out, /error TS\d+/i),
  },
];

function matchBuildFailure(errorOutput: string): BuildFailurePattern | undefined {
  return BUILD_FAILURE_PATTERNS.find((p) => p.test(errorOutput));
}

export function buildFailureDiagnostics(buildError: string): Diagnostic[] {
  const pattern = matchBuildFailure(buildError);
  return [
    {
      ruleId: "BUILD-01",
      severity: "error",
      message: pattern
        ? `Astro build failed (${pattern.id}): ${pattern.excerpt(buildError)}`
        : `Astro build failed: ${buildError.slice(0, 200)}`,
      fixHint: pattern?.fixHint ?? "Read the full build output above for the error details.",
      data: {
        patternId: pattern?.id ?? "unknown",
        buildErrorLength: buildError.length,
      },
    },
  ];
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
  const buildDiagnostics = buildError ? buildFailureDiagnostics(buildError) : [];
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
    ...(buildDiagnostics.length > 0 ? { diagnostics: buildDiagnostics } : {}),
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
    const failNextSteps: KernelNextStep[] = [
      {
        action: `Fix the failing validators above, then re-run: pnpm exec site-kernel run mission.validate --mission ${missionId}`,
        kind: "required",
      },
    ];
    return {
      data: report as unknown as MissionValidateData,
      exitCode: 1,
      summary: `[mission.validate] ${missionId} validation FAILED (${reason})`,
      nextSteps: failNextSteps,
    };
  }

  const dirtyCheck = isWorkpieceDirty(workpieceDir);
  if (dirtyCheck.dirty) {
    logger.warn(
      `[mission.validate] workpiece has ${dirtyCheck.fileCount} uncommitted file(s). Run \`git status\` to review, then \`pnpm exec site-kernel run mission.git.commit --mission ${missionId} --message "<msg>"\` to commit.`,
    );
  }

  // RFC-0522: warn on dirty cache clone — reconcile will fail until resolved
  const systemDir = await resolveCachePath(workspaceRoot, manifest.systemId);
  if (existsSync(path.join(systemDir, ".git"))) {
    const cacheDirtyCheck = isWorkpieceDirty(systemDir);
    if (cacheDirtyCheck.dirty) {
      logger.warn(
        `[mission.validate] cache clone for system '${manifest.systemId}' has ${cacheDirtyCheck.fileCount} uncommitted file(s) — reconcile will fail until resolved`,
      );
    }
  }

  // RFC-0579: populate nextSteps based on workpiece dirty state
  const passNextSteps: KernelNextStep[] = dirtyCheck.dirty
    ? [
        {
          action: `Commit uncommitted changes: pnpm exec site-kernel run mission.git.commit --mission ${missionId} --message "<msg>"`,
          kind: "required",
        },
        {
          action: `Then run: pnpm exec site-kernel run mission.reconcile --mission ${missionId}`,
          kind: "optional",
        },
      ]
    : [
        {
          action: `Run: pnpm exec site-kernel run mission.reconcile --mission ${missionId}`,
          kind: "optional",
        },
        {
          action: `Then run: pnpm exec site-kernel run mission.close --mission ${missionId}`,
          kind: "optional",
        },
      ];

  return {
    data: report as unknown as MissionValidateData,
    summary: `[mission.validate] ${missionId} validation passed (${stepCount} steps, ${routeCount} routes built)`,
    nextSteps: passNextSteps,
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
  const systemDir = await resolveCachePath(workspaceRoot, manifest.systemId);
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
  const actor = resolveActor(input);
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
    actor,
  );
  await acquireLock(
    workspaceRoot,
    `mission:${missionId}`,
    manifest.operationId,
    "mission.reconcile",
    actor,
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
  const systemDir = await resolveCachePath(workspaceRoot, manifest.systemId);

  try {
    const now = new Date().toISOString();

    // RFC-0568: transfer workpiece commits to cache clone via git merge --no-ff
    const gitDir = path.join(systemDir, ".git");
    let commitSha: string | null = null;
    let preReconcileSha: string | null = null;
    let mergeCommitSha: string | null = null;
    let transferredCommits = 0;
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
      // RFC-0522/RFC-0568: dirty cache clone guard with untracked file investigation
      const cacheDirtyCheck = isWorkpieceDirty(systemDir);
      if (cacheDirtyCheck.dirty) {
        // RFC-0568: investigate origin of untracked files and write report
        const untrackedReport = await investigateUntrackedFiles(
          workspaceRoot,
          manifest.systemId,
          systemDir,
          cacheDirtyCheck.files,
        );

        await atomicWriteFile(
          path.join(evidenceDir, "untracked-files-report.json"),
          JSON.stringify(untrackedReport, null, 2) + "\n",
        );

        const reportSummary = untrackedReport
          .map((r) => `  ${r.path} — ${r.likelyOrigin}${r.originHint ? ` (${r.originHint})` : ""}`)
          .join("\n");

        throw new Error(
          `[mission.reconcile] cache clone for system '${manifest.systemId}' has ${cacheDirtyCheck.fileCount} uncommitted/untracked file(s):\n` +
            reportSummary +
            `\n\nEvidence written to evidence/untracked-files-report.json.\nResolve uncommitted changes in the cache clone before re-running reconcile.`,
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
            // RFC-0568: Reset cache clone to pre-reconcile state before re-merging
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

      // RFC-0568: Determine workpiece branch dynamically (not hardcoded "master")
      const workpieceBranch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: workpieceDir,
        stdio: "pipe",
        encoding: "utf-8",
      }).trim();

      // Fetch workpiece commits into cache clone's object database
      execSync(`git fetch ${JSON.stringify(workpieceDir)} ${JSON.stringify(workpieceBranch)}`, {
        cwd: systemDir,
        stdio: "pipe",
        encoding: "utf-8",
      });

      // Merge with --no-ff to preserve all individual commits and create an explicit merge commit
      const mergeMessage = `reconcile mission ${missionId}`;
      try {
        execSync(`git merge --no-ff FETCH_HEAD -m ${JSON.stringify(mergeMessage)}`, {
          cwd: systemDir,
          stdio: "pipe",
          encoding: "utf-8",
        });
      } catch (err) {
        throw new Error(
          `[mission.reconcile] git merge --no-ff failed: ${(err as Error).message}.\n` +
            `Resolve conflicts in the workpiece (not the cache clone), commit via mission.git.commit, then re-run reconcile.\n` +
            `Reconcile is idempotent — it will reset the cache clone to preReconcileSha and re-merge.`,
        );
      }

      commitSha = execSync("git rev-parse HEAD", {
        cwd: systemDir,
        stdio: "pipe",
        encoding: "utf-8",
      }).trim();

      mergeCommitSha = execSync("git rev-parse HEAD^1", {
        cwd: systemDir,
        stdio: "pipe",
        encoding: "utf-8",
      }).trim();

      // Count transferred commits (commits in FETCH_HEAD not in preReconcileSha)
      if (preReconcileSha) {
        try {
          const countOutput = execSync(`git rev-list --count ${preReconcileSha}..FETCH_HEAD`, {
            cwd: systemDir,
            stdio: "pipe",
            encoding: "utf-8",
          }).trim();
          transferredCommits = parseInt(countOutput, 10);
        } catch {
          transferredCommits = 0;
        }
      }

      logger.info(
        `  Merged ${transferredCommits} commit(s) from workpiece to cache clone (${commitSha.slice(0, 8)})`,
      );

      // RFC-0568: Push to origin with retry (non-fatal, 3 attempts, exponential backoff)
      const branch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: systemDir,
        stdio: "pipe",
        encoding: "utf-8",
      }).trim();

      const pushBackoffMs = [1000, 2000, 4000];
      let pushSucceeded = false;
      for (let attempt = 0; attempt < pushBackoffMs.length; attempt++) {
        try {
          execSync(`git push origin ${JSON.stringify(branch)}`, {
            cwd: systemDir,
            stdio: "pipe",
            timeout: 30_000,
          });
          pushSucceeded = true;
          break;
        } catch {
          if (attempt < pushBackoffMs.length - 1) {
            logger.info(
              `  Push attempt ${attempt + 1} failed — retrying in ${pushBackoffMs[attempt]}ms…`,
            );
            await new Promise((resolve) => setTimeout(resolve, pushBackoffMs[attempt]));
          }
        }
      }
      if (!pushSucceeded) {
        logger.info(
          `  Push failed after ${pushBackoffMs.length} attempts (non-fatal) — next sync will catch up`,
        );
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
      mergeCommitSha,
      transferredCommits,
      message,
      copiedPaths,
    };

    await atomicWriteFile(
      path.join(evidenceDir, "reconciliation-report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );

    manifest.reconciledAt = now;
    await writeMissionManifest(workspaceRoot, manifest);

    // RFC-0580: auto-commit werkstatt side-effects
    await commitWerkstattSideEffects(
      workspaceRoot,
      [path.join("missions", missionId, "mission.yaml")],
      `werkstatt: mission.reconcile ${missionId}`,
    );

    return {
      data: {
        missionId,
        systemId: manifest.systemId,
        commitSha,
        preReconcileSha,
        reconciledAt: now,
      },
      summary: `[mission.reconcile] ${missionId} reconciled (${commitSha ? `${commitSha.slice(0, 8)}, ${transferredCommits} commits merged` : "no git"})`,
    };
  } finally {
    await releaseLock(workspaceRoot, `mission:${missionId}`);
    await releaseLock(workspaceRoot, `system:${manifest.systemId}`);
  }
}
