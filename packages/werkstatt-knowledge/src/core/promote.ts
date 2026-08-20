/*
<MODULE_CONTRACT>
<purpose>knowledge.promote — promotes validated candidates to canonical through transaction.</purpose>
<keywords>promote, transaction, canonical, knowledge</keywords>
<non-goals>
  <item>Does not bypass transaction layer — all mutations go through staging.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial knowledge promote command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface PromoteData {
  command: string;
  status: "pass" | "fail" | "pending";
  promotedRecords: number;
  transactionId: string | null;
  message: string;
}

export async function runPromote(
  workspaceRoot: string,
): Promise<KernelCommandResult<PromoteData>> {
  return {
    data: {
      command: "knowledge.promote",
      status: "pending",
      promotedRecords: 0,
      transactionId: null,
      message: `Promote not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.promote: pending (stub)",
  };
}

export function createPromoteCommand(): KernelCommandDefinition<PromoteData> {
  return {
    name: "knowledge.promote",
    description: "Promote validated candidates to canonical through transaction (KNO-026)",
    scope: "workspace",
    cacheable: false,
    reads: ["staging/**", "laboratory/**"],
    writes: ["knowledge/**", "staging/**"],
    async execute(_input, context) {
      return runPromote(context.workspaceRoot);
    },
  };
}
