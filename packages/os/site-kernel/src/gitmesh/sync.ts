/*
<MODULE_CONTRACT>
<purpose>
RFC-0563: gitmesh.sync command handler. Fetches from all configured remotes,
converges on the latest signed commit using highest committer timestamp,
and advances HEAD via git merge --ff-only. Implements lock file for concurrent
execution prevention, auto-config bootstrap in Phase 1, and signature
verification when verifySignatures is true.
</purpose>
<non-goals>
  <item>Do not implement push operations — gitmesh.sync is pull-only.</item>
  <item>Do not implement peer discovery — that is RFC-0564 (SWIM).</item>
  <item>Do not implement conflict resolution — platform code conflicts are resolved by human review.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0563: initial implementation — gitmesh.sync handler with convergence algorithm.</item>
</CHANGE_SUMMARY>
*/

import { open, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "../types.ts";
import type { GitMeshSyncResult } from "./types.ts";
import { loadOrCreateConfig } from "./config.ts";
import {
  gitCommitTimestamp,
  gitFetch,
  gitFsck,
  gitHasUncommittedChanges,
  gitIsAncestor,
  gitLogSignatureStatus,
  gitMergeFfOnly,
  gitRevParseHead,
  gitRevParseRemote,
} from "./git-ops.ts";

const LOCK_FILE = ".git/gitmesh.lock";
const LAST_SYNC_FILE = ".git/gitmesh.last-sync";

async function acquireLock(workspaceRoot: string): Promise<() => Promise<void>> {
  const lockPath = join(workspaceRoot, LOCK_FILE);
  try {
    const handle = await open(lockPath, "wx");
    return async () => {
      await handle.close();
      await unlink(lockPath).catch(() => {});
    };
  } catch {
    throw new Error("sync-in-progress: another gitmesh.sync is already running");
  }
}

interface RemoteFetchResult {
  remote: string;
  success: boolean;
  sha: string;
  timestamp: number;
}

export async function runGitMeshSync(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<GitMeshSyncResult>> {
  const { workspaceRoot } = context;
  const releaseLock = await acquireLock(workspaceRoot);

  try {
    const config = await loadOrCreateConfig(workspaceRoot);

    if (config.remotes.length === 0) {
      return {
        data: {
          synced: false,
          fromRemote: "",
          commitsReceived: 0,
          currentSha: await gitRevParseHead(workspaceRoot).catch(() => ""),
          signaturesVerified: 0,
          signaturesFailed: 0,
        },
        exitCode: 1,
        summary: "gitmesh.sync: no remotes configured",
      };
    }

    // Integrity check
    const fsckOk = await gitFsck(workspaceRoot);
    if (!fsckOk) {
      return {
        data: {
          synced: false,
          fromRemote: "",
          commitsReceived: 0,
          currentSha: "",
          signaturesVerified: 0,
          signaturesFailed: 0,
        },
        exitCode: 1,
        summary: "gitmesh.sync: clone corruption detected (git fsck failed)",
      };
    }

    // Check for uncommitted changes
    const hasUncommitted = await gitHasUncommittedChanges(workspaceRoot);
    if (hasUncommitted) {
      return {
        data: {
          synced: false,
          fromRemote: "",
          commitsReceived: 0,
          currentSha: await gitRevParseHead(workspaceRoot),
          signaturesVerified: 0,
          signaturesFailed: 0,
        },
        exitCode: 1,
        summary: "gitmesh.sync: uncommitted local changes — commit or stash before sync",
      };
    }

    // Fetch from all remotes
    const fetchResults: RemoteFetchResult[] = [];
    const warnings: string[] = [];

    for (const remote of config.remotes) {
      try {
        await gitFetch(remote.name, config.trackedBranch, workspaceRoot);
        const sha = await gitRevParseRemote(remote.name, config.trackedBranch, workspaceRoot);
        const timestamp = await gitCommitTimestamp(sha, workspaceRoot);
        fetchResults.push({ remote: remote.name, success: true, sha, timestamp });
      } catch {
        warnings.push(`remote ${remote.name} unreachable`);
        fetchResults.push({ remote: remote.name, success: false, sha: "", timestamp: 0 });
      }
    }

    const successfulFetches = fetchResults.filter((r) => r.success);
    if (successfulFetches.length === 0) {
      return {
        data: {
          synced: false,
          fromRemote: "",
          commitsReceived: 0,
          currentSha: await gitRevParseHead(workspaceRoot),
          signaturesVerified: 0,
          signaturesFailed: 0,
        },
        exitCode: 1,
        summary: `gitmesh.sync: all remotes unreachable (${warnings.join(", ")})`,
      };
    }

    // Convergence: highest committer timestamp
    const latest = successfulFetches.reduce((best, current) =>
      current.timestamp > best.timestamp ? current : best,
    );

    const currentHead = await gitRevParseHead(workspaceRoot);

    // Check for non-fast-forward
    const isFastForward = await gitIsAncestor(currentHead, latest.sha, workspaceRoot);
    if (!isFastForward) {
      return {
        data: {
          synced: false,
          fromRemote: latest.remote,
          commitsReceived: 0,
          currentSha: currentHead,
          signaturesVerified: 0,
          signaturesFailed: 0,
        },
        exitCode: 1,
        summary: `gitmesh.sync: non-fast-forward detected (force-push on ${latest.remote}?) — manual reset required`,
      };
    }

    // Signature verification
    let signaturesVerified = 0;
    let signaturesFailed = 0;

    if (config.verifySignatures) {
      const commits = await gitLogSignatureStatus(`${currentHead}..${latest.sha}`, workspaceRoot);
      for (const commit of commits) {
        if (commit.signatureStatus === "G") {
          signaturesVerified++;
        } else if (commit.signatureStatus === "U" || commit.signatureStatus === "N") {
          // Unsigned — counts as failure in verify mode
          signaturesFailed++;
        } else {
          // B (bad), X (expired), Y (key missing), E (expired key), R (revoked)
          signaturesFailed++;
        }
      }

      if (signaturesFailed > 0) {
        return {
          data: {
            synced: false,
            fromRemote: latest.remote,
            commitsReceived: commits.length,
            currentSha: currentHead,
            signaturesVerified,
            signaturesFailed,
          },
          exitCode: 1,
          summary: `gitmesh.sync: signature verification failed (${signaturesFailed} invalid) — HEAD not advanced`,
        };
      }
    }

    // Count commits to receive
    const commitsToReceive = await gitLogSignatureStatus(
      `${currentHead}..${latest.sha}`,
      workspaceRoot,
    );

    // Advance HEAD
    await gitMergeFfOnly(latest.sha, workspaceRoot);

    // Write last-sync timestamp
    const lastSyncPath = join(workspaceRoot, LAST_SYNC_FILE);
    await writeFile(lastSyncPath, new Date().toISOString(), "utf8");

    return {
      data: {
        synced: true,
        fromRemote: latest.remote,
        commitsReceived: commitsToReceive.length,
        currentSha: latest.sha,
        signaturesVerified,
        signaturesFailed,
      },
      exitCode: 0,
      summary: `gitmesh.sync: received ${commitsToReceive.length} commit(s) from ${latest.remote}` +
        (warnings.length > 0 ? `, warnings: ${warnings.join(", ")}` : ""),
    };
  } finally {
    await releaseLock();
  }
}
