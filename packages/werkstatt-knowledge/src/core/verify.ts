/*
<MODULE_CONTRACT>
<purpose>knowledge.verify — full canonical structural, evidence, and governance validation.</purpose>
<keywords>verify, canonical, evidence, knowledge</keywords>
<non-goals>
  <item>Does not write or mutate canonical data — read-only validator.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial knowledge verify command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface KnowledgeVerifyData {
  command: string;
  status: "pass" | "fail" | "pending";
  violations: string[];
  recordCount: number;
  message: string;
}

export async function runKnowledgeVerify(
  workspaceRoot: string,
): Promise<KernelCommandResult<KnowledgeVerifyData>> {
  return {
    data: {
      command: "knowledge.verify",
      status: "pending",
      violations: [],
      recordCount: 0,
      message: `Knowledge verify not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.verify: pending (stub)",
  };
}

export function createVerifyCommand(): KernelCommandDefinition<KnowledgeVerifyData> {
  return {
    name: "knowledge.verify",
    description: "Full canonical verification: schema, ids, evidence, claims, relations, epistemic status (KNO-001, KNO-007..015, KNO-023..024)",
    scope: "workspace",
    cacheable: false,
    reads: ["knowledge/**", "staging/**", "laboratory/**"],
    async execute(_input, context) {
      return runKnowledgeVerify(context.workspaceRoot);
    },
  };
}
