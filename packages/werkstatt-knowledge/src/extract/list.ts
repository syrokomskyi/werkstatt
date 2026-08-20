/*
<MODULE_CONTRACT>
<purpose>knowledge.extract.list — lists registered trusted extractors.</purpose>
<keywords>extract, list, extractors, knowledge</keywords>
<non-goals>
  <item>Does not write or mutate — read-only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial extract list command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface ExtractListData {
  command: string;
  status: "pass" | "fail" | "pending";
  extractors: string[];
  message: string;
}

export async function runExtractList(
  workspaceRoot: string,
): Promise<KernelCommandResult<ExtractListData>> {
  return {
    data: {
      command: "knowledge.extract.list",
      status: "pending",
      extractors: [],
      message: `Extract list not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.extract.list: pending (stub)",
  };
}

export function createExtractListCommand(): KernelCommandDefinition<ExtractListData> {
  return {
    name: "knowledge.extract.list",
    description: "List registered trusted extractors",
    scope: "workspace",
    cacheable: false,
    reads: ["knowledge.config.yaml"],
    async execute(_input, context) {
      return runExtractList(context.workspaceRoot);
    },
  };
}
