/*
<MODULE_CONTRACT>
<purpose>knowledge.status — returns current canonical dataset status summary.</purpose>
<keywords>status, canonical, summary, knowledge</keywords>
<non-goals>
  <item>Does not write or mutate — read-only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial knowledge status command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface KnowledgeStatusData {
  command: string;
  status: "pass" | "fail" | "pending";
  datasetId: string | null;
  modelVersion: string | null;
  recordCount: number;
  message: string;
}

export async function runKnowledgeStatus(
  workspaceRoot: string,
): Promise<KernelCommandResult<KnowledgeStatusData>> {
  return {
    data: {
      command: "knowledge.status",
      status: "pending",
      datasetId: null,
      modelVersion: null,
      recordCount: 0,
      message: `Knowledge status not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.status: pending (stub)",
  };
}

export function createStatusCommand(): KernelCommandDefinition<KnowledgeStatusData> {
  return {
    name: "knowledge.status",
    description: "Return current canonical dataset status summary",
    scope: "workspace",
    cacheable: false,
    reads: ["knowledge/**"],
    async execute(_input, context) {
      return runKnowledgeStatus(context.workspaceRoot);
    },
  };
}
