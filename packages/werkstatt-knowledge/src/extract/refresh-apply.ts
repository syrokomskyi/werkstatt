/*
<MODULE_CONTRACT>
<purpose>knowledge.refresh.apply — applies verified refresh deltas through transaction.</purpose>
<keywords>refresh, apply, deltas, knowledge</keywords>
<non-goals>
  <item>Does not bypass transaction layer — all mutations go through staging.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial refresh apply command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface RefreshApplyData {
  command: string;
  status: "pass" | "fail" | "pending";
  recordsUpdated: number;
  transactionId: string | null;
  message: string;
}

export async function runRefreshApply(
  workspaceRoot: string,
): Promise<KernelCommandResult<RefreshApplyData>> {
  return {
    data: {
      command: "knowledge.refresh.apply",
      status: "pending",
      recordsUpdated: 0,
      transactionId: null,
      message: `Refresh apply not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.refresh.apply: pending (stub)",
  };
}

export function createRefreshApplyCommand(): KernelCommandDefinition<RefreshApplyData> {
  return {
    name: "knowledge.refresh.apply",
    description: "Apply verified refresh deltas through transaction",
    scope: "workspace",
    cacheable: false,
    reads: ["staging/**"],
    writes: ["knowledge/**", "staging/**"],
    async execute(_input, context) {
      return runRefreshApply(context.workspaceRoot);
    },
  };
}
