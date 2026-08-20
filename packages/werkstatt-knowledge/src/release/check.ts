/*
<MODULE_CONTRACT>
<purpose>knowledge.release.check — checks open/private publication policy and license metadata.</purpose>
<keywords>release, check, license, publication, knowledge</keywords>
<non-goals>
  <item>Does not write or mutate — read-only checker.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial release check command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface ReleaseCheckData {
  command: string;
  status: "pass" | "fail" | "pending";
  violations: string[];
  message: string;
}

export async function runReleaseCheck(
  workspaceRoot: string,
): Promise<KernelCommandResult<ReleaseCheckData>> {
  return {
    data: {
      command: "knowledge.release.check",
      status: "pending",
      violations: [],
      message: `Release check not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.release.check: pending (stub)",
  };
}

export function createReleaseCheckCommand(): KernelCommandDefinition<ReleaseCheckData> {
  return {
    name: "knowledge.release.check",
    description: "Check publication policy, license metadata, and evidence excerpt policy (KNO-021, KNO-022)",
    scope: "workspace",
    cacheable: false,
    reads: ["knowledge/**", "knowledge.config.yaml"],
    async execute(_input, context) {
      return runReleaseCheck(context.workspaceRoot);
    },
  };
}
