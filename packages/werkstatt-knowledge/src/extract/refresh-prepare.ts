/*
<MODULE_CONTRACT>
<purpose>knowledge.refresh.prepare — prepares impact-aware refresh from source changes.</purpose>
<keywords>refresh, prepare, impact, knowledge</keywords>
<non-goals>
  <item>Does not apply changes — prepares staged deltas only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial refresh prepare command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface RefreshPrepareData {
  command: string;
  status: "pass" | "fail" | "pending";
  impactedRecords: number;
  message: string;
}

export async function runRefreshPrepare(
  workspaceRoot: string,
): Promise<KernelCommandResult<RefreshPrepareData>> {
  return {
    data: {
      command: "knowledge.refresh.prepare",
      status: "pending",
      impactedRecords: 0,
      message: `Refresh prepare not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.refresh.prepare: pending (stub)",
  };
}

export function createRefreshPrepareCommand(): KernelCommandDefinition<RefreshPrepareData> {
  return {
    name: "knowledge.refresh.prepare",
    description: "Prepare impact-aware refresh from source changes",
    scope: "workspace",
    cacheable: false,
    reads: ["../*-source/**", "knowledge/**"],
    writes: ["staging/**"],
    async execute(_input, context) {
      return runRefreshPrepare(context.workspaceRoot);
    },
  };
}
