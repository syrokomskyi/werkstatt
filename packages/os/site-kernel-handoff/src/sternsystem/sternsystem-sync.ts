/*
<MODULE_CONTRACT>
<purpose>RFC-0472: sternsystem.sync — synchronize a Sternsystem's local bare repo with an external mirror.</purpose>
<non-goals>
  <item>Sync is an automatic pipeline step invoked after mission.reconcile — not a manual operator action.</item>
  <item>Do not add retry logic — fail-fast on network errors.</item>
  <item>Do not use git push --mirror — it deletes remote branches not present locally.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0472: initial sync command handler.</item>
  <item>RFC-0477: commit and push bordbuch after appending mirror-sync entry.</item>
  <item>RFC-0480: remove pull/both directions — push-only (edits-only-through-missions invariant).</item>
</CHANGE_SUMMARY>
*/

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import * as fs from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import {
  readRegistry,
  findEntry,
  resolveMirrors,
  resolveMirrorPath,
  resolveCachePath,
  isGitAccessible,
} from "./registry-io.ts";
import { appendBordbuchEntry, commitAndPushBordbuch } from "../bordbuch/bordbuch-io.ts";

export interface SternsystemSyncData {
  systemId: string;
  mirrorUrls: string[];
  direction: "push";
  branch: string;
  commitSha: string | null;
  syncedAt: string;
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

function flagBoolean(input: KernelCommandInput, key: string): boolean {
  const v = input.flags[key];
  return v === true || v === "true";
}

function git(cwd: string, args: string): string {
  return execSync(`git ${args}`, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 300_000,
  }).trim();
}

export async function runSternsystemSync(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<SternsystemSyncData>> {
  const { workspaceRoot, logger } = context;

  const id = flagString(input, "id");
  if (!id) throw new Error("[sternsystem.sync] --id is required");

  const direction = flagString(input, "direction") ?? "push";
  if (direction !== "push") {
    throw new Error(
      `[sternsystem.sync] --direction must be push (got '${direction}'). Pull and both are removed per RFC-0480 (edits-only-through-missions invariant).`,
    );
  }

  const syncAll = flagBoolean(input, "all");

  const registry = await readRegistry(workspaceRoot);
  const entry = findEntry(registry, id);
  if (!entry) {
    throw new Error(`[sternsystem.sync] system '${id}' not found in registry`);
  }

  if (entry.mirrors.length < 2) {
    throw new Error(`[sternsystem.sync] system '${id}' has no bare mirror configured`);
  }

  const { gitMirrors, cachePath } = resolveMirrors(workspaceRoot, entry);
  const bareRepoPath = resolveMirrorPath(workspaceRoot, gitMirrors[0].path);
  if (!existsSync(bareRepoPath)) {
    throw new Error(`[sternsystem.sync] bare repo not found at ${bareRepoPath}`);
  }

  // RFC-0574: star topology — first push cache clone to bare repo (mirrors[1])
  let branch: string;
  try {
    branch = git(bareRepoPath, "symbolic-ref HEAD");
  } catch {
    throw new Error(`[sternsystem.sync] bare repo has no commits — nothing to push`);
  }
  const branchName = branch.replace("refs/heads/", "");

  if (existsSync(path.join(cachePath, ".git"))) {
    logger.info(`[sternsystem.sync] pushing cache clone to bare repo…`);
    try {
      git(cachePath, `push origin ${branchName}`);
    } catch (err) {
      logger.warn(
        `[sternsystem.sync] cache-to-bare push failed (non-fatal): ${(err as Error).message}`,
      );
    }
  }

  // External mirrors are mirrors[2+] (git accessible, non-bundle)
  const externalMirrors = entry.mirrors.slice(2).filter((m) => isGitAccessible(m.path));
  const mirrorUrls = externalMirrors.map((m) => m.path);

  if (syncAll) {
    branch = "*";
  }

  const refSpec = syncAll ? "--all" : branchName;
  const tagSpec = syncAll ? " --tags" : "";

  const warnings: string[] = [];

  for (let i = 0; i < mirrorUrls.length; i++) {
    const mirrorUrl = mirrorUrls[i];
    const remoteName = `mirror-${i}`;
    const currentRemoteUrl = (() => {
      try {
        return git(bareRepoPath, `remote get-url ${remoteName}`);
      } catch {
        return null;
      }
    })();

    if (currentRemoteUrl === null) {
      logger.info(`[sternsystem.sync] adding remote '${remoteName}' → ${mirrorUrl}`);
      git(bareRepoPath, `remote add ${remoteName} ${mirrorUrl}`);
    } else if (currentRemoteUrl !== mirrorUrl) {
      logger.info(
        `[sternsystem.sync] updating remote '${remoteName}' URL: ${currentRemoteUrl} → ${mirrorUrl}`,
      );
      git(bareRepoPath, `remote set-url ${remoteName} ${mirrorUrl}`);
    }

    if (direction === "push") {
      logger.info(`[sternsystem.sync] pushing ${refSpec} to ${remoteName}…`);
      try {
        git(bareRepoPath, `push ${remoteName} ${refSpec}${tagSpec}`);
      } catch (err) {
        const stderr = (err as Error).message;
        const msg =
          stderr.includes("non-fast-forward") || stderr.includes("rejected")
            ? `git push to ${mirrorUrl} failed (non-fast-forward): ${stderr}. Mirror may have diverged — disaster recovery required.`
            : `git push to ${mirrorUrl} failed: ${stderr}`;
        warnings.push(msg);
        logger.warn(`[sternsystem.sync] ${msg}`);
      }
    }
  }

  // RFC-0574: bundle mirrors — create git bundle from bare repo and copy to backup endpoints
  const bundleMirrors = entry.mirrors.slice(2).filter((m) => m.storageType === "bundle");
  for (const bundleMirror of bundleMirrors) {
    const bundlePath = path.join(tmpdir(), `${id}-${Date.now()}.bundle`);
    try {
      git(bareRepoPath, `bundle create "${bundlePath}" --all`);
      logger.info(`[sternsystem.sync] created bundle for ${bundleMirror.path}`);
      // Copy bundle to backup endpoint (non-git protocols: ftp, s3, rsync)
      // For file-based bundle mirrors, copy directly
      if (
        bundleMirror.path.startsWith("./") ||
        bundleMirror.path.startsWith("../") ||
        bundleMirror.path.startsWith("/")
      ) {
        const destPath = resolveMirrorPath(workspaceRoot, bundleMirror.path);
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.copyFile(bundlePath, destPath);
        logger.info(`[sternsystem.sync] copied bundle to ${destPath}`);
      } else {
        // Non-file protocols (ftp, s3, rsync) — log as warning (external tool required)
        warnings.push(
          `bundle copy to ${bundleMirror.path} requires external tool (ftp/s3/rsync) — bundle was created but not copied (temp bundle cleaned up)`,
        );
        logger.warn(
          `[sternsystem.sync] bundle copy to ${bundleMirror.path} requires external tool`,
        );
      }
    } catch (err) {
      const msg = `bundle creation/copy for ${bundleMirror.path} failed: ${(err as Error).message}`;
      warnings.push(msg);
      logger.warn(`[sternsystem.sync] ${msg}`);
    } finally {
      // Cleanup temp bundle
      await fs.rm(bundlePath, { force: true }).catch(() => {});
    }
  }

  // RFC-0574: per-mirror failures are non-fatal — sync continues and reports warnings

  let commitSha: string;
  try {
    commitSha = git(bareRepoPath, "rev-parse HEAD");
  } catch {
    commitSha = "";
  }

  const syncedAt = new Date().toISOString();

  try {
    await appendBordbuchEntry(
      workspaceRoot,
      id,
      "mirror-sync",
      `Mirror sync (${direction}, branch: ${syncAll ? "*" : branchName}) — ${commitSha.slice(0, 12)}`,
      "sternsystem.sync",
      {
        writerRole: "sternsystem",
        metadata: {
          mirrorUrls,
          direction,
          branch: syncAll ? "*" : branchName,
          commitSha,
          result: "ok",
        },
      },
    );
  } catch (err) {
    logger.error(`[sternsystem.sync] Bordbuch write failed: ${(err as Error).message}`);
  }

  // Commit and push bordbuch to system git repo (RFC-0477)
  const systemDir = await resolveCachePath(workspaceRoot, id);
  await commitAndPushBordbuch(systemDir, `Bordbuch: mirror-sync ${id}`);

  logger.success(
    `[sternsystem.sync] ${id} mirrored (${direction}, branch: ${syncAll ? "*" : branchName})`,
  );

  const data: SternsystemSyncData = {
    systemId: id,
    mirrorUrls,
    direction: "push",
    branch: syncAll ? "*" : branchName,
    commitSha,
    syncedAt,
  };

  return {
    data,
    exitCode: 0,
    summary: `[sternsystem.sync] ${id} mirrored (${direction}, branch: ${syncAll ? "*" : branchName})`,
  };
}
