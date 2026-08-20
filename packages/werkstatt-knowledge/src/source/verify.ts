/*
<MODULE_CONTRACT>
<purpose>knowledge.source.verify — verifies source metadata, write safety, and resolvable references.</purpose>
<keywords>source, verify, metadata, knowledge</keywords>
<non-goals>
  <item>Does not write or mutate source — read-only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial source verify command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface SourceVerifyData {
  command: string;
  status: "pass" | "fail" | "pending";
  violations: string[];
  message: string;
}

export async function runSourceVerify(
  workspaceRoot: string,
): Promise<KernelCommandResult<SourceVerifyData>> {
  return {
    data: {
      command: "knowledge.source.verify",
      status: "pending",
      violations: [],
      message: `Source verify not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.source.verify: pending (stub)",
  };
}

export function createSourceVerifyCommand(): KernelCommandDefinition<SourceVerifyData> {
  return {
    name: "knowledge.source.verify",
    description: "Verify source metadata, write safety, and resolvable references (KNO-003, KNO-004, KNO-028)",
    scope: "workspace",
    cacheable: false,
    reads: ["../*-source/**", "knowledge/**"],
    async execute(_input, context) {
      return runSourceVerify(context.workspaceRoot);
    },
  };
}
