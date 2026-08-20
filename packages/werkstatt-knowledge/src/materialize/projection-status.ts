/*
<MODULE_CONTRACT>
<purpose>knowledge.projection.status — checks projection freshness against current materialization.</purpose>
<keywords>projection, status, freshness, knowledge</keywords>
<non-goals>
  <item>Does not write or mutate — read-only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial projection status command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface ProjectionStatusData {
  command: string;
  status: "pass" | "fail" | "pending";
  projections: string[];
  staleProjections: string[];
  message: string;
}

export async function runProjectionStatus(
  workspaceRoot: string,
): Promise<KernelCommandResult<ProjectionStatusData>> {
  return {
    data: {
      command: "knowledge.projection.status",
      status: "pending",
      projections: [],
      staleProjections: [],
      message: `Projection status not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.projection.status: pending (stub)",
  };
}

export function createProjectionStatusCommand(): KernelCommandDefinition<ProjectionStatusData> {
  return {
    name: "knowledge.projection.status",
    description: "Check projection freshness against current materialization",
    scope: "workspace",
    cacheable: false,
    reads: [".generated/knowledge/**", "projections/**"],
    async execute(_input, context) {
      return runProjectionStatus(context.workspaceRoot);
    },
  };
}
