/*
<MODULE_CONTRACT>
<purpose>RFC-0472: sternsystem.sync — synchronize a Sternsystem's local bare repo with an external mirror.</purpose>
<non-goals>
  <item>Do not automate sync after mission.reconcile — sync is a manual operator action.</item>
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
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { readRegistry, findEntry } from "./registry-io.ts";
import { appendBordbuchEntry, commitAndPushBordbuch } from "../bordbuch/bordbuch-io.ts";
import { ensureMirrorHook } from "./mirror-hook.ts";

export interface SternsystemSyncData {
  systemId: string;
  mirrorUrl: string;
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

function resolveRepoPath(workspaceRoot: string, repo: string): string {
  if (repo.startsWith("local:")) {
    return path.resolve(workspaceRoot, repo.slice("local:".length));
  }
  if (repo.startsWith("./") || repo.startsWith("../") || repo.startsWith("/")) {
    return path.resolve(workspaceRoot, repo);
  }
  return repo;
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

  if (!entry.mirror) {
    throw new Error(`[sternsystem.sync] system '${id}' has no mirror configured`);
  }

  const bareRepoPath = resolveRepoPath(workspaceRoot, entry.repo);
  if (!existsSync(bareRepoPath)) {
    throw new Error(`[sternsystem.sync] bare repo not found at ${bareRepoPath}`);
  }

  let branch: string;
  try {
    branch = git(bareRepoPath, "symbolic-ref HEAD");
  } catch {
    throw new Error(`[sternsystem.sync] bare repo has no commits — nothing to push`);
  }
  const branchName = branch.replace("refs/heads/", "");

  if (syncAll) {
    branch = "*";
  }

  const mirrorUrl = entry.mirror;

  const remoteArgs = `remote get-url mirror`;
  let currentRemoteUrl: string | null = null;
  try {
    currentRemoteUrl = git(bareRepoPath, remoteArgs);
  } catch {
    currentRemoteUrl = null;
  }

  if (currentRemoteUrl === null) {
    logger.info(`[sternsystem.sync] adding remote 'mirror' → ${mirrorUrl}`);
    git(bareRepoPath, `remote add mirror ${mirrorUrl}`);
  } else if (currentRemoteUrl !== mirrorUrl) {
    logger.info(
      `[sternsystem.sync] updating remote 'mirror' URL: ${currentRemoteUrl} → ${mirrorUrl}`,
    );
    git(bareRepoPath, `remote set-url mirror ${mirrorUrl}`);
  }

  const hookResult = ensureMirrorHook(bareRepoPath);
  if (hookResult.installed) {
    logger.info(`[sternsystem.sync] installed post-receive mirror auto-push hook`);
  } else if (hookResult.updated) {
    logger.info(`[sternsystem.sync] updated post-receive mirror auto-push hook`);
  }

  const refSpec = syncAll ? "--all" : branchName;
  const tagSpec = syncAll ? " --tags" : "";

  const errors: string[] = [];

  if (direction === "push") {
    logger.info(`[sternsystem.sync] pushing ${refSpec} to mirror…`);
    try {
      git(bareRepoPath, `push mirror ${refSpec}${tagSpec}`);
    } catch (err) {
      const stderr = (err as Error).message;
      if (stderr.includes("non-fast-forward") || stderr.includes("rejected")) {
        errors.push(
          `git push failed (non-fast-forward): ${stderr}. Mirror may have diverged — disaster recovery required.`,
        );
      } else {
        errors.push(`git push failed: ${stderr}`);
      }
    }
  }

  if (errors.length > 0) {
    const syncedAt = new Date().toISOString();
    const data: SternsystemSyncData = {
      systemId: id,
      mirrorUrl,
      direction: "push",
      branch: syncAll ? "*" : branchName,
      commitSha: null,
      syncedAt,
    };
    return {
      data,
      exitCode: 1,
      summary: `[sternsystem.sync] failed: ${errors.join("; ")}`,
    };
  }

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
          mirrorUrl,
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
  const systemDir = path.join(workspaceRoot, "systems", id);
  await commitAndPushBordbuch(systemDir, `Bordbuch: mirror-sync ${id}`);

  logger.success(
    `[sternsystem.sync] ${id} mirrored (${direction}, branch: ${syncAll ? "*" : branchName})`,
  );

  const data: SternsystemSyncData = {
    systemId: id,
    mirrorUrl,
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
