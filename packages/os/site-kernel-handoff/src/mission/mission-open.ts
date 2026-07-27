/*
<MODULE_CONTRACT>
<purpose>RFC-0355 §5.1: mission.open — open a new mission for a Sternsystem.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0355: initial mission.open command handler.</item>
  <item>RFC-0477: commit and push bordbuch after appending mission-open entry.</item>
  <item>RFC-0560: use resolveActor(input) for actor resolution with --actor-from-auth flag.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import type { MissionManifest } from "@warpgogol/ontology/operations";
import { readRegistry, writeRegistry, findEntry } from "../sternsystem/registry-io.ts";
import { createMissionDirectories, writeMissionManifest, missionExists } from "./mission-io.ts";
import {
  readBordbuch,
  appendBordbuchEntry,
  deriveNextMissionNumberSafe,
  commitAndPushBordbuch,
} from "../bordbuch/bordbuch-io.ts";
import { acquireLock, releaseLock, generateOperationId } from "../werkstatt/index.ts";
import { resolveActor } from "./actor-identity.ts";

export interface MissionOpenData {
  missionId: string;
  systemId: string;
  state: "open";
  brief: string;
  openedAt: string;
  pinAtOpen: string;
  operationId: string;
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

export async function runMissionOpen(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<MissionOpenData>> {
  const { workspaceRoot } = context;
  const systemId = flagString(input, "system");
  const brief = flagString(input, "brief");
  const actor = resolveActor(input);

  if (!systemId) throw new Error("[mission.open] --system is required");
  if (!brief) throw new Error("[mission.open] --brief is required");

  const operationId = generateOperationId();

  await acquireLock(workspaceRoot, "registry", operationId, "mission.open", actor);
  await acquireLock(workspaceRoot, `system:${systemId}`, operationId, "mission.open", actor);

  try {
    const registry = await readRegistry(workspaceRoot);
    const entry = findEntry(registry, systemId);

    if (!entry) {
      throw new Error(`[mission.open] system '${systemId}' is not registered`);
    }
    if (entry.status === "paused" || entry.status === "archived") {
      throw new Error(
        `[mission.open] system '${systemId}' has status '${entry.status}' — cannot open missions`,
      );
    }
    if (entry.currentMission) {
      throw new Error(
        `[mission.open] system '${systemId}' already has open mission '${entry.currentMission}'`,
      );
    }

    // Check pin file exists
    const pinPath = path.join(workspaceRoot, "systems", systemId, "system.pin.json");
    if (!existsSync(pinPath)) {
      throw new Error(
        `[mission.open] system '${systemId}' has no system.pin.json — run sternsystem.pin first`,
      );
    }

    // Read pin to get platform version
    const pinRaw = await import("node:fs/promises").then((fs) => fs.readFile(pinPath, "utf8"));
    const pin = JSON.parse(pinRaw);
    const pinAtOpen = pin.platform?.version ?? "unknown";

    // Derive next mission number from Bordbuch + existing directories on disk
    const bordbuchEntries = await readBordbuch(workspaceRoot, systemId);
    const nextNum = await deriveNextMissionNumberSafe(bordbuchEntries, workspaceRoot, systemId);
    const missionId = `${systemId}-m${String(nextNum).padStart(6, "0")}`;

    // Belt-and-suspenders: deriveNextMissionNumberSafe already scans disk
    // directories, but this guard ensures we never overwrite an existing
    // mission manifest even if the directory scan missed it (e.g. race).
    if (await missionExists(workspaceRoot, missionId)) {
      throw new Error(
        `[mission.open] mission directory '${missionId}' already exists — remove it or renumber before opening a new mission`,
      );
    }

    // Create mission directories
    await createMissionDirectories(workspaceRoot, missionId);

    // Write mission manifest
    const now = new Date().toISOString();
    const manifest: MissionManifest = {
      schemaVersion: "1.0.0",
      missionId,
      systemId,
      state: "open",
      brief,
      openedAt: now,
      openedBy: actor,
      closedAt: null,
      closedBy: null,
      pinAtOpen,
      materializedAt: null,
      migratedAt: null,
      reconciledAt: null,
      releaseId: null,
      rfcId: null,
      operationId,
    };
    await writeMissionManifest(workspaceRoot, manifest);

    // Append Bordbuch entry
    await appendBordbuchEntry(workspaceRoot, systemId, "mission-open", brief, actor, {
      missionId,
      writerRole: "mission",
      metadata: { brief, pinAtOpen },
    });

    // Commit and push bordbuch to system git repo (RFC-0477)
    const systemDir = path.join(workspaceRoot, "systems", systemId);
    await commitAndPushBordbuch(systemDir, `Bordbuch: mission-open ${missionId}`);

    // Update registry
    entry.currentMission = missionId;
    await writeRegistry(workspaceRoot, registry);

    return {
      data: {
        missionId,
        systemId,
        state: "open",
        brief,
        openedAt: now,
        pinAtOpen,
        operationId,
      },
      summary: `[mission.open] opened mission ${missionId} for ${systemId}`,
    };
  } finally {
    await releaseLock(workspaceRoot, `system:${systemId}`);
    await releaseLock(workspaceRoot, "registry");
  }
}
