/*
<MODULE_CONTRACT>
<purpose>knowledge.extract.verify — verifies staged factual deltas from extractors.</purpose>
<keywords>extract, verify, deltas, knowledge</keywords>
<non-goals>
  <item>Does not write or mutate canonical data — verifies staged deltas only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial extract verify command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface ExtractVerifyData {
  command: string;
  status: "pass" | "fail" | "pending";
  deltasVerified: number;
  violations: string[];
  message: string;
}

export async function runExtractVerify(
  workspaceRoot: string,
): Promise<KernelCommandResult<ExtractVerifyData>> {
  return {
    data: {
      command: "knowledge.extract.verify",
      status: "pending",
      deltasVerified: 0,
      violations: [],
      message: `Extract verify not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.extract.verify: pending (stub)",
  };
}

export function createExtractVerifyCommand(): KernelCommandDefinition<ExtractVerifyData> {
  return {
    name: "knowledge.extract.verify",
    description: "Verify staged factual deltas from extractors",
    scope: "workspace",
    cacheable: false,
    reads: ["staging/**", "../*-source/**"],
    async execute(_input, context) {
      return runExtractVerify(context.workspaceRoot);
    },
  };
}
