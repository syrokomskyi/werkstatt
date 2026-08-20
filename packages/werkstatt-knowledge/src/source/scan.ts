/*
<MODULE_CONTRACT>
<purpose>knowledge.source.scan — resolves fixed sibling source root and lists source units.</purpose>
<keywords>source, scan, knowledge</keywords>
<non-goals>
  <item>Does not write or mutate source — read-only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial source scan command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface SourceScanData {
  command: string;
  status: "pass" | "fail" | "pending";
  sourceRoot: string | null;
  sourceUnits: string[];
  message: string;
}

export async function runSourceScan(
  workspaceRoot: string,
): Promise<KernelCommandResult<SourceScanData>> {
  return {
    data: {
      command: "knowledge.source.scan",
      status: "pending",
      sourceRoot: null,
      sourceUnits: [],
      message: `Source scan not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.source.scan: pending (stub)",
  };
}

export function createSourceScanCommand(): KernelCommandDefinition<SourceScanData> {
  return {
    name: "knowledge.source.scan",
    description: "Resolve fixed sibling source root and list source units (KNO-002, KNO-025)",
    scope: "workspace",
    cacheable: false,
    reads: ["../*-source/**"],
    async execute(_input, context) {
      return runSourceScan(context.workspaceRoot);
    },
  };
}
