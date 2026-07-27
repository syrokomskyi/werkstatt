/*
<MODULE_CONTRACT>
<purpose>RFC-0480: mission.cleanup — explicit workpiece cleanup with age-based option.</purpose>
<non-goals>
  <item>Does not remove evidence bundles — those are permanent audit artifacts.</item>
  <item>Does not abort missions — use mission.abort for that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0480: initial mission.cleanup command handler.</item>
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
import { readMissionManifest, writeMissionManifest, resolveMissionDir } from "./mission-io.ts";

export interface MissionCleanupData {
  missionId: string;
  removedPaths: string[];
  skipped: string[];
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

function parseOlderThan(value: string): number | null {
  const match = value.match(/^(\d+)d$/);
  if (!match) return null;
  return parseInt(match[1], 10) * 24 * 60 * 60 * 1000;
}

export async function runMissionCleanup(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<MissionCleanupData>> {
  const { workspaceRoot, logger } = context;
  const missionId = flagString(input, "mission");
  const olderThan = flagString(input, "older-than");

  if (!missionId && !olderThan) {
    throw new Error("[mission.cleanup] either --mission or --older-than is required");
  }

  const removedPaths: string[] = [];
  const skipped: string[] = [];

  if (missionId) {
    const manifest = await readMissionManifest(workspaceRoot, missionId);

    if (manifest.state === "open") {
      throw new Error(`[mission.cleanup] mission '${missionId}' is open — abort or close it first`);
    }

    const missionDir = resolveMissionDir(workspaceRoot, missionId);
    const workpieceDir = path.join(missionDir, "workpiece");
    const distributionDir = path.join(missionDir, "distribution");

    if (existsSync(workpieceDir)) {
      await fs.rm(workpieceDir, { recursive: true, force: true });
      removedPaths.push("workpiece");
      logger.info(`  Removed workpiece for mission '${missionId}'`);
    }

    if (existsSync(distributionDir)) {
      await fs.rm(distributionDir, { recursive: true, force: true });
      removedPaths.push("distribution");
      logger.info(`  Removed distribution for mission '${missionId}'`);
    }

    // Evidence directory is preserved — git bundles and reports are permanent audit artifacts
    skipped.push("evidence (preserved)");

    return {
      data: { missionId, removedPaths, skipped },
      summary: `[mission.cleanup] ${missionId} removed: ${removedPaths.join(", ") || "nothing"}`,
    };
  }

  // --older-than mode: clean workpieces for closed/aborted missions older than threshold
  if (olderThan) {
    const thresholdMs = parseOlderThan(olderThan);
    if (thresholdMs === null) {
      throw new Error(`[mission.cleanup] --older-than must be in format '<N>d' (e.g. '30d')`);
    }

    const missionsDir = path.join(workspaceRoot, "missions");
    if (!existsSync(missionsDir)) {
      return {
        data: { missionId: "*", removedPaths, skipped },
        summary: `[mission.cleanup] no missions directory found`,
      };
    }

    const entries = await fs.readdir(missionsDir, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const missionDir = path.join(missionsDir, entry.name);

      try {
        const manifest = await readMissionManifest(workspaceRoot, entry.name);
        if (manifest.state === "open") {
          skipped.push(`${entry.name} (open)`);
          continue;
        }

        const closedAt = manifest.closedAt;
        if (!closedAt) {
          skipped.push(`${entry.name} (no closedAt)`);
          continue;
        }

        const ageMs = now - new Date(closedAt).getTime();
        if (ageMs < thresholdMs) {
          skipped.push(`${entry.name} (age: ${Math.floor(ageMs / (24 * 60 * 60 * 1000))}d)`);
          continue;
        }

        const workpieceDir = path.join(missionDir, "workpiece");
        const distributionDir = path.join(missionDir, "distribution");

        if (existsSync(workpieceDir)) {
          await fs.rm(workpieceDir, { recursive: true, force: true });
          removedPaths.push(`${entry.name}/workpiece`);
        }
        if (existsSync(distributionDir)) {
          await fs.rm(distributionDir, { recursive: true, force: true });
          removedPaths.push(`${entry.name}/distribution`);
        }
      } catch {
        skipped.push(`${entry.name} (no manifest)`);
      }
    }

    logger.info(`  Cleaned ${removedPaths.length} path(s), skipped ${skipped.length}`);
  }

  return {
    data: { missionId: "*", removedPaths, skipped },
    summary: `[mission.cleanup] removed: ${removedPaths.length}, skipped: ${skipped.length}`,
  };
}
