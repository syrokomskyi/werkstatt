/*
<MODULE_CONTRACT>
<purpose>knowledge.materialize — compiles verified canonical knowledge into materialized dataset.</purpose>
<keywords>materialize, compile, dataset, knowledge</keywords>
<non-goals>
  <item>Does not write canonical data — writes only .generated/ outputs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial materialize command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface MaterializeData {
  command: string;
  status: "pass" | "fail" | "pending";
  canonicalHash: string | null;
  modelVersion: string | null;
  recordCount: number;
  message: string;
}

export async function runMaterialize(
  workspaceRoot: string,
): Promise<KernelCommandResult<MaterializeData>> {
  return {
    data: {
      command: "knowledge.materialize",
      status: "pending",
      canonicalHash: null,
      modelVersion: null,
      recordCount: 0,
      message: `Materialize not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.materialize: pending (stub)",
  };
}

export function createMaterializeCommand(): KernelCommandDefinition<MaterializeData> {
  return {
    name: "knowledge.materialize",
    description: "Compile verified canonical knowledge into materialized dataset",
    scope: "workspace",
    cacheable: false,
    reads: ["knowledge/**"],
    writes: [".generated/knowledge/**"],
    async execute(_input, context) {
      return runMaterialize(context.workspaceRoot);
    },
  };
}
