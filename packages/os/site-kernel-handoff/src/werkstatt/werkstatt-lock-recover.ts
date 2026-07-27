/*
<MODULE_CONTRACT>
<purpose>RFC-0362 §8: werkstatt.lock.recover — classify and clean stale locks and staging artifacts.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0362: initial lock.recover command handler.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { readAllLocks, removeStaleLock, acquireLock, releaseLock } from "./lock.ts";

export interface WerkstattLockRecoverData {
  recovered: Array<{ scope?: string; artifact?: string; action: string }>;
  failed: Array<{ scope?: string; artifact?: string; error: string }>;
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

async function classifyArtifacts(
  workspaceRoot: string,
  purge: boolean,
): Promise<{
  recovered: Array<{ artifact: string; action: string }>;
  failed: Array<{ artifact: string; error: string }>;
}> {
  const recovered: Array<{ artifact: string; action: string }> = [];
  const failed: Array<{ artifact: string; error: string }> = [];

  // Scan for .tmp files, .staging-* dirs, .incomplete dirs in systems/, missions/, releases/
  const scanRoots = ["systems", "missions", "releases"];
  for (const root of scanRoots) {
    const rootPath = path.join(workspaceRoot, root);
    if (!existsSync(rootPath)) continue;

    let entries: string[];
    try {
      entries = await fs.readdir(rootPath);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(rootPath, entry);
      const relPath = path.relative(workspaceRoot, entryPath).replace(/\\/g, "/");

      if (entry.endsWith(".tmp")) {
        if (purge) {
          try {
            await fs.unlink(entryPath);
            recovered.push({ artifact: relPath, action: "removed-tmp" });
          } catch (err) {
            failed.push({ artifact: relPath, error: (err as Error).message });
          }
        } else {
          recovered.push({ artifact: relPath, action: "classified-tmp (use --purge to remove)" });
        }
      } else if (entry.includes(".staging-")) {
        if (purge) {
          try {
            await fs.rm(entryPath, { recursive: true, force: true });
            recovered.push({ artifact: relPath, action: "removed-staging" });
          } catch (err) {
            failed.push({ artifact: relPath, error: (err as Error).message });
          }
        } else {
          recovered.push({
            artifact: relPath,
            action: "classified-staging (use --purge to remove)",
          });
        }
      } else if (entry.includes(".incomplete")) {
        if (purge) {
          const failedDir = entryPath.replace(".incomplete", `.failed-${Date.now()}`);
          try {
            await fs.rename(entryPath, failedDir);
            recovered.push({ artifact: relPath, action: "renamed-to-failed" });
          } catch (err) {
            failed.push({ artifact: relPath, error: (err as Error).message });
          }
        } else {
          recovered.push({
            artifact: relPath,
            action: "classified-incomplete (use --purge to rename)",
          });
        }
      }
    }
  }

  return { recovered, failed };
}

export async function runWerkstattLockRecover(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<WerkstattLockRecoverData>> {
  const { workspaceRoot, logger } = context;
  const scopeFilter = flagString(input, "scope");
  const purge = input.flags["purge"] === true;

  // Acquire meta-lock for recovery
  const metaOperationId = `recover-${Date.now()}`;
  try {
    await acquireLock(
      workspaceRoot,
      "werkstatt-recovery",
      metaOperationId,
      "werkstatt.lock.recover",
      "system",
    );
  } catch {
    throw new Error("[werkstatt.lock.recover] another recovery operation is in progress");
  }

  try {
    const locks = await readAllLocks(workspaceRoot);
    const staleLocks = locks.filter((l) => l.stale && (!scopeFilter || l.scope === scopeFilter));

    const recovered: Array<{ scope?: string; artifact?: string; action: string }> = [];
    const failed: Array<{ scope?: string; artifact?: string; error: string }> = [];

    for (const lock of staleLocks) {
      try {
        await removeStaleLock(workspaceRoot, lock.scope);
        recovered.push({ scope: lock.scope, action: "removed-stale-lock" });
        logger.info(`  [removed] lock '${lock.scope}'`);
      } catch (err) {
        failed.push({ scope: lock.scope, error: (err as Error).message });
      }
    }

    // Classify and optionally clean artifacts
    const { recovered: artifactRecovered, failed: artifactFailed } = await classifyArtifacts(
      workspaceRoot,
      purge,
    );
    for (const r of artifactRecovered) {
      recovered.push({ artifact: r.artifact, action: r.action });
    }
    for (const f of artifactFailed) {
      failed.push({ artifact: f.artifact, error: f.error });
    }

    if (recovered.length === 0 && failed.length === 0) {
      logger.success("[werkstatt.lock.recover] no stale locks or artifacts found");
    } else {
      logger.success(
        `[werkstatt.lock.recover] ${recovered.length} recovered, ${failed.length} failed`,
      );
    }

    return {
      data: { recovered, failed },
      summary: `[werkstatt.lock.recover] ${recovered.length} artifact${recovered.length === 1 ? "" : "s"} recovered, ${failed.length} failure${failed.length === 1 ? "" : "s"}`,
    };
  } finally {
    await releaseLock(workspaceRoot, "werkstatt-recovery");
  }
}
