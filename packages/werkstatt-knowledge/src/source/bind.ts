/*
<MODULE_CONTRACT>
<purpose>knowledge.source.bind — binds source unit fingerprints to canonical records.</purpose>
<keywords>source, bind, fingerprint, knowledge</keywords>
<non-goals>
  <item>Does not write or mutate source — writes only knowledge/ bindings.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial source bind command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface SourceBindData {
  command: string;
  status: "pass" | "fail" | "pending";
  bindingsCreated: number;
  message: string;
}

export async function runSourceBind(
  workspaceRoot: string,
): Promise<KernelCommandResult<SourceBindData>> {
  return {
    data: {
      command: "knowledge.source.bind",
      status: "pending",
      bindingsCreated: 0,
      message: `Source bind not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.source.bind: pending (stub)",
  };
}

export function createSourceBindCommand(): KernelCommandDefinition<SourceBindData> {
  return {
    name: "knowledge.source.bind",
    description: "Bind source unit fingerprints to canonical records",
    scope: "workspace",
    cacheable: false,
    reads: ["../*-source/**"],
    writes: ["knowledge/**"],
    async execute(_input, context) {
      return runSourceBind(context.workspaceRoot);
    },
  };
}
