/*
<MODULE_CONTRACT>
<purpose>knowledge.source.status — compares current source fingerprints with canonical bindings.</purpose>
<keywords>source, status, drift, knowledge</keywords>
<non-goals>
  <item>Does not write or mutate source — read-only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial source status command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface SourceStatusData {
  command: string;
  status: "pass" | "fail" | "pending";
  driftDetected: boolean;
  bindings: number;
  message: string;
}

export async function runSourceStatus(
  workspaceRoot: string,
): Promise<KernelCommandResult<SourceStatusData>> {
  return {
    data: {
      command: "knowledge.source.status",
      status: "pending",
      driftDetected: false,
      bindings: 0,
      message: `Source status not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.source.status: pending (stub)",
  };
}

export function createSourceStatusCommand(): KernelCommandDefinition<SourceStatusData> {
  return {
    name: "knowledge.source.status",
    description: "Compare current source fingerprints with canonical bindings (KNO-005)",
    scope: "workspace",
    cacheable: false,
    reads: ["../*-source/**", "knowledge/**"],
    async execute(_input, context) {
      return runSourceStatus(context.workspaceRoot);
    },
  };
}
