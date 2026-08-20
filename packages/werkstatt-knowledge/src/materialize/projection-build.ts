/*
<MODULE_CONTRACT>
<purpose>knowledge.projection.build — builds configured projection packages from materialization.</purpose>
<keywords>projection, build, knowledge</keywords>
<non-goals>
  <item>Does not write canonical data — writes only projection outputs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial projection build command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface ProjectionBuildData {
  command: string;
  status: "pass" | "fail" | "pending";
  projectionsBuilt: number;
  message: string;
}

export async function runProjectionBuild(
  workspaceRoot: string,
): Promise<KernelCommandResult<ProjectionBuildData>> {
  return {
    data: {
      command: "knowledge.projection.build",
      status: "pending",
      projectionsBuilt: 0,
      message: `Projection build not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.projection.build: pending (stub)",
  };
}

export function createProjectionBuildCommand(): KernelCommandDefinition<ProjectionBuildData> {
  return {
    name: "knowledge.projection.build",
    description: "Build configured projection packages from materialization",
    scope: "workspace",
    cacheable: false,
    reads: [".generated/knowledge/**"],
    writes: ["projections/**"],
    async execute(_input, context) {
      return runProjectionBuild(context.workspaceRoot);
    },
  };
}
