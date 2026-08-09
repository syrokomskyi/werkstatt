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
  <item>RFC-0580: auto-commit werkstatt side-effects (registry.yaml, mission.yaml) after writeRegistry.</item>
  <item>RFC-0593: add bordbuch.validate pre-flight gate before lock acquisition.</item>
  <item>ADR-0030: verify commitAndPushBordbuch succeeded — throw on commit failure (commitSha null) and push failure (pushed false) with distinct error messages.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import type { MissionManifest } from "@warpgogol/werkstatt/schemas";
import {
  readSystemConfig,
  readSystemState,
  writeSystemState,
  resolveCacheClonePath,
} from "../sternsystem/registry-io.ts";
import { createMissionDirectories, writeMissionManifest, missionExists } from "./mission-io.ts";
import {
  readBordbuch,
  deriveNextMissionNumberSafe,
  validateBordbuch,
  type BordbuchViolation,
} from "../bordbuch/bordbuch-io.ts";
import { appendAndCommitBordbuch } from "../bordbuch/bordbuch-commit-helper.ts";
import {
  acquireLock,
  releaseLock,
  generateOperationId,
  commitWerkstattSideEffects,
} from "../werkstatt/index.ts";
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

async function preflightBordbuch(
  workspaceRoot: string,
  systemId: string,
): Promise<{ passed: boolean; violations: BordbuchViolation[] }> {
  const { violations } = await validateBordbuch(workspaceRoot, systemId);
  return { passed: violations.length === 0, violations };
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

  // RFC-0593: pre-flight bordbuch validation gate — refuse to open a new mission
  // if the system's bordbuch has any violations. This runs before lock acquisition
  // to avoid holding locks during validation. Known TOCTOU limitation: bordbuch.repair
  // (operator-only) could change the bordbuch concurrently — low risk, failed attempt
  // exits with code 1 before any side effects.
  const bordbuchCheck = await preflightBordbuch(workspaceRoot, systemId);
  if (!bordbuchCheck.passed) {
    const violationLines = bordbuchCheck.violations
      .map((v) => `  ${v.rule}: ${v.message}`)
      .join("\n");
    throw new Error(
      `[mission.open] bordbuch for system '${systemId}' has ${bordbuchCheck.violations.length} violation(s) — run bordbuch.repair first\n${violationLines}`,
    );
  }

  const operationId = generateOperationId();

  await acquireLock(workspaceRoot, "registry", operationId, "mission.open", actor);
  await acquireLock(workspaceRoot, `system:${systemId}`, operationId, "mission.open", actor);

  try {
    const config = await readSystemConfig(workspaceRoot, systemId);
    const state = await readSystemState(workspaceRoot, systemId);

    if (config.status === "paused" || config.status === "archived") {
      throw new Error(
        `[mission.open] system '${systemId}' has status '${config.status}' — cannot open missions`,
      );
    }
    if (state.currentMission) {
      throw new Error(
        `[mission.open] system '${systemId}' already has open mission '${state.currentMission}'`,
      );
    }

    // Check pin file exists
    const cacheDir = resolveCacheClonePath(workspaceRoot, systemId);
    const pinPath = path.join(cacheDir, "system.pin.json");
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

    // Append Bordbuch entry and commit+push atomically (RFC-0750, ADR-0030)
    const { commitResult: pushResult } = await appendAndCommitBordbuch(
      workspaceRoot,
      systemId,
      "mission-open",
      brief,
      actor,
      {
        missionId,
        writerRole: "mission",
        metadata: { brief, pinAtOpen },
      },
      `Bordbuch: mission-open ${missionId}`,
    );
    if (pushResult.commitSha === null) {
      throw new Error(
        `[mission.open] bordbuch commit failed for system '${systemId}' — mission-open event was not committed. ` +
          `Check git state in the cache clone and re-run mission.open.`,
      );
    }
    if (!pushResult.pushed) {
      throw new Error(
        `[mission.open] bordbuch push failed for system '${systemId}' — mission-open event was committed but not persisted to the bare repo. ` +
          `Error: ${pushResult.error ?? "unknown"}. ` +
          `Check git remote connectivity and re-run mission.open.`,
      );
    }

    // Update state
    state.currentMission = missionId;
    await writeSystemState(workspaceRoot, systemId, state);

    // RFC-0580: auto-commit werkstatt side-effects
    await commitWerkstattSideEffects(
      workspaceRoot,
      [path.join("missions", missionId, "mission.yaml")],
      `werkstatt: mission.open ${missionId}`,
    );

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
