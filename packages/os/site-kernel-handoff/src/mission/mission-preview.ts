/*
<MODULE_CONTRACT>
<purpose>RFC-0480: mission.preview — blocking dev server for any mission (open, closed, aborted).</purpose>
<non-goals>
  <item>Does not build — use mission.build for that.</item>
  <item>Does not validate — use mission.validate for that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0480: extracted mission.preview to its own file; blocking astro dev/preview server; works for closed/aborted missions.</item>
  <item>ADR-0007: run content.ref-index.generate before dev server start to ensure fresh content reference index.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import type {
  DiscoveredSiteWorkspace,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { runContentRefIndexGenerate } from "@warpgogol/site-kernel-codegen";
import { readMissionManifest, resolveMissionDir } from "./mission-io.ts";

export interface MissionPreviewData {
  missionId: string;
  systemId: string;
  workpiecePath: string;
  port: number;
  production: boolean;
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

function flagBool(input: KernelCommandInput, key: string): boolean {
  const v = input.flags[key];
  return v === true || v === "true";
}

export async function runMissionPreview(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<MissionPreviewData>> {
  const { workspaceRoot, logger } = context;
  const missionId = flagString(input, "mission");
  const port = parseInt(flagString(input, "port") ?? "4321", 10);
  const production = flagBool(input, "production");

  if (!missionId) throw new Error("[mission.preview] --mission is required");

  const manifest = await readMissionManifest(workspaceRoot, missionId);

  // RFC-0480: preview works for open, closed, and aborted missions
  const workpiecePath = path.join(resolveMissionDir(workspaceRoot, missionId), "workpiece");

  if (!existsSync(workpiecePath)) {
    throw new Error(
      `[mission.preview] workpiece not found for mission '${missionId}' — run mission.materialize first`,
    );
  }

  const cmd = production ? "preview" : "dev";

  // Stop any existing astro dev server on this port before starting a new one
  spawnSync("pnpm", ["exec", "astro", "dev", "stop"], {
    cwd: workpiecePath,
    stdio: "ignore",
  });

  // ADR-0007: regenerate content reference index before dev server start
  // so the resolver reads fresh frontmatter values from source files.
  // Call in-process with a synthetic site context pointing to the workpiece,
  // not via --site flag (which relies on registry currentMission and fails
  // for closed/aborted missions where currentMission is cleared).
  const workpieceSite: DiscoveredSiteWorkspace = {
    name: manifest.systemId,
    directory: workpiecePath,
    toolsDirectory: path.join(workpiecePath, "tools"),
  };
  try {
    await runContentRefIndexGenerate(
      { argv: [], args: [], flags: {} },
      { ...context, site: workpieceSite },
    );
  } catch (err) {
    logger.warn(
      `  [ADR-0007] content.ref-index.generate failed: ${err instanceof Error ? err.message : String(err)} — index may be stale`,
    );
  }

  logger.info(
    `  Starting astro ${cmd} on port ${port} for mission '${missionId}' (state: ${manifest.state})`,
  );
  logger.info(`  Workpiece: ${workpiecePath}`);
  logger.info(`  Press Ctrl+C to stop the server.`);

  return new Promise((resolve) => {
    const child = spawn("pnpm", ["exec", "astro", cmd, "--port", String(port)], {
      cwd: workpiecePath,
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      resolve({
        data: {
          missionId,
          systemId: manifest.systemId,
          workpiecePath,
          port,
          production,
        },
        summary: `[mission.preview] ${missionId} server stopped (exit code: ${code})`,
      });
    });

    child.on("error", (err) => {
      resolve({
        data: {
          missionId,
          systemId: manifest.systemId,
          workpiecePath,
          port,
          production,
        },
        summary: `[mission.preview] ${missionId} server error: ${err.message}`,
      });
    });
  });
}
