/*
<MODULE_CONTRACT>
<purpose>knowledge.candidate.validate — validates staging/laboratory candidates before promotion.</purpose>
<keywords>candidate, validate, staging, knowledge</keywords>
<non-goals>
  <item>Does not write or mutate canonical data — validates candidates only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial knowledge candidate validate command stub per SPEC-v1.0 section 4.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface CandidateValidateData {
  command: string;
  status: "pass" | "fail" | "pending";
  candidates: number;
  violations: string[];
  message: string;
}

export async function runCandidateValidate(
  workspaceRoot: string,
): Promise<KernelCommandResult<CandidateValidateData>> {
  return {
    data: {
      command: "knowledge.candidate.validate",
      status: "pending",
      candidates: 0,
      violations: [],
      message: `Candidate validate not yet implemented — workspace: ${workspaceRoot}`,
    },
    exitCode: 0,
    summary: "knowledge.candidate.validate: pending (stub)",
  };
}

export function createCandidateValidateCommand(): KernelCommandDefinition<CandidateValidateData> {
  return {
    name: "knowledge.candidate.validate",
    description: "Validate staging/laboratory candidates before promotion",
    scope: "workspace",
    cacheable: false,
    reads: ["staging/**", "laboratory/**", "knowledge/**"],
    async execute(_input, context) {
      return runCandidateValidate(context.workspaceRoot);
    },
  };
}
