/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-handoff/src/sternsystem/sternsystem-list.ts as an authored site-kernel-handoff authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0354: initial list command handler.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { readRegistry } from "./registry-io.ts";

export interface SternsystemListData {
  systems: Array<{
    id: string;
    cosmicStar: string;
    mirrors: Array<{ path: string; storageType: string }>;
    pinnedPlatform: string;
    currentMission: string | null;
    lastRelease: string | null;
    status: string;
    registeredAt: string;
  }>;
  count: number;
}

export async function runSternsystemList(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<SternsystemListData>> {
  const { workspaceRoot, logger } = context;
  const registry = await readRegistry(workspaceRoot);

  const systems = registry.systems.map((s) => ({
    id: s.id,
    cosmicStar: s.cosmicStar,
    mirrors: s.mirrors,
    pinnedPlatform: s.pinnedPlatform,
    currentMission: s.currentMission,
    lastRelease: s.lastRelease,
    status: s.status,
    registeredAt: s.registeredAt,
  }));

  for (const s of systems) {
    logger.info(
      `  ${s.id.padEnd(24)} ${s.cosmicStar.padEnd(12)} ${s.status.padEnd(12)} ${s.pinnedPlatform}`,
    );
  }

  return {
    data: { systems, count: systems.length },
    summary: `[sternsystem.list] ${systems.length} system${systems.length === 1 ? "" : "s"} registered`,
  };
}
