/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-handoff/src/mission/snapshot-auto-regen.ts as an authored site-kernel-handoff authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not add build pipeline orchestration logic — this helper only handles SNAP-01 detection, snapshot regeneration, and git commit.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0689: extract shared autoRegenerateSnapshotOnSnap01 helper from mission-materialization-commands.ts (RFC-0615) for reuse by leitstand.dev-deploy.</item>
</CHANGE_SUMMARY>
*/

import type { KernelRuntimeContext } from "@warpgogol/site-kernel";
import { executeKernelCommand } from "@warpgogol/site-kernel";

interface SnapshotDiagnostics {
  diagnostics?: { ruleId: string }[];
}

export interface AutoRegenerateOptions {
  workspaceRoot: string;
  systemId: string;
  missionId: string;
  logger: { info: (msg: string) => void; warn?: (msg: string) => void };
  context?: KernelRuntimeContext;
}

export interface AutoRegenerateResult {
  regenerated: boolean;
  error?: string;
}

export function detectSnap01(data: unknown): boolean {
  const diagnostics = (data as SnapshotDiagnostics | undefined)?.diagnostics;
  if (!diagnostics || !Array.isArray(diagnostics)) return false;
  return diagnostics.some((d) => d.ruleId === "SNAP-01");
}

export async function autoRegenerateSnapshotOnSnap01(
  opts: AutoRegenerateOptions,
): Promise<AutoRegenerateResult> {
  const { workspaceRoot, systemId, missionId, logger } = opts;

  logger.info(`  SNAP-01 detected — auto-regenerating behavior snapshot…`);
  try {
    await executeKernelCommand({
      workspaceRoot,
      commandName: "behavior.snapshot.generate",
      siteName: systemId,
    });

    await executeKernelCommand({
      workspaceRoot,
      commandName: "mission.git.commit",
      argv: [`--mission=${missionId}`, "--message=chore: auto-regenerate behavior snapshot"],
    });

    logger.info(`  Behavior snapshot regenerated and committed`);
    return { regenerated: true };
  } catch (regenErr) {
    const error = `snapshot auto-regeneration failed: ${regenErr instanceof Error ? regenErr.message : String(regenErr)}`;
    logger.info(`  ${error}`);
    return { regenerated: false, error };
  }
}
