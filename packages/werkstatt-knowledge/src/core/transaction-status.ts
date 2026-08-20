/*
<MODULE_CONTRACT>
<purpose>knowledge.transaction.status — returns status of canonical mutation transactions.</purpose>
<keywords>transaction, status, knowledge</keywords>
<non-goals>
  <item>Does not write or mutate — read-only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial knowledge transaction status command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface TransactionStatusData {
  command: string;
  status: "pass" | "fail" | "pending";
  activeTransactions: number;
  message: string;
}

export async function runTransactionStatus(
  workspaceRoot: string,
): Promise<KernelCommandResult<TransactionStatusData>> {
  return {
    data: {
      command: "knowledge.transaction.status",
      status: "pending",
      activeTransactions: 0,
      message: `Transaction status not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.transaction.status: pending (stub)",
  };
}

export function createTransactionStatusCommand(): KernelCommandDefinition<TransactionStatusData> {
  return {
    name: "knowledge.transaction.status",
    description: "Return status of canonical mutation transactions",
    scope: "workspace",
    cacheable: false,
    reads: ["staging/**"],
    async execute(_input, context) {
      return runTransactionStatus(context.workspaceRoot);
    },
  };
}
