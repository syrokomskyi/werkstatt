/*
<MODULE_CONTRACT>
<purpose>knowledge.materialize.verify — verifies materialization determinism and hash consistency.</purpose>
<keywords>materialize, verify, determinism, knowledge</keywords>
<non-goals>
  <item>Does not write or mutate — read-only verifier.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial materialize verify command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface MaterializeVerifyData {
  command: string;
  status: "pass" | "fail" | "pending";
  hashMatch: boolean;
  violations: string[];
  message: string;
}

export async function runMaterializeVerify(
  workspaceRoot: string,
): Promise<KernelCommandResult<MaterializeVerifyData>> {
  return {
    data: {
      command: "knowledge.materialize.verify",
      status: "pending",
      hashMatch: false,
      violations: [],
      message: `Materialize verify not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.materialize.verify: pending (stub)",
  };
}

export function createMaterializeVerifyCommand(): KernelCommandDefinition<MaterializeVerifyData> {
  return {
    name: "knowledge.materialize.verify",
    description: "Verify materialization determinism and hash consistency (KNO-019, KNO-027)",
    scope: "workspace",
    cacheable: false,
    reads: ["knowledge/**", ".generated/knowledge/**"],
    async execute(_input, context) {
      return runMaterializeVerify(context.workspaceRoot);
    },
  };
}
