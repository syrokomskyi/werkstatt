/*
<MODULE_CONTRACT>
<purpose>knowledge.extract.run — runs registered extractors with static source read boundary.</purpose>
<keywords>extract, run, extractors, knowledge</keywords>
<non-goals>
  <item>Does not invoke untrusted source code by default (KNO-006).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial extract run command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface ExtractRunData {
  command: string;
  status: "pass" | "fail" | "pending";
  deltasProduced: number;
  message: string;
}

export async function runExtractRun(
  workspaceRoot: string,
): Promise<KernelCommandResult<ExtractRunData>> {
  return {
    data: {
      command: "knowledge.extract.run",
      status: "pending",
      deltasProduced: 0,
      message: `Extract run not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.extract.run: pending (stub)",
  };
}

export function createExtractRunCommand(): KernelCommandDefinition<ExtractRunData> {
  return {
    name: "knowledge.extract.run",
    description: "Run registered extractors with static source read boundary (KNO-006)",
    scope: "workspace",
    cacheable: false,
    reads: ["../*-source/**"],
    writes: ["staging/**"],
    async execute(_input, context) {
      return runExtractRun(context.workspaceRoot);
    },
  };
}
